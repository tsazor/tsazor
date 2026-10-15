import { componentInternals } from "../components/component-internals.js";
import { parameterInfoOf } from "../components/parameter-metadata.js";
import { getFrameSubtreeLength, type RenderFragment, type RenderTreeFrame } from "../render-tree/render-tree.js";
import { FrameType } from "../render-tree/frame-type.js";
import { attributeMap, computeDiff, type DiffOptions, type RenderTreeDiff } from "../render-tree/diff.js";
import { ParameterView } from "../components/parameter-view.js";
import { toComponentDefinition, type ComponentDefinition } from "../components/component-definition.js";
import { completedLifecycle, isPromiseLike, type ComponentBase } from "../components/component-base.js";
import { isIErrorBoundary } from "../components/error-boundary-contract.js";
import { SectionRegistry } from "../sections/section-registry.js";
import { ServiceCollection, ServiceProvider, type Token } from "../di/service-collection.js";
import { withServices } from "../di/service-provider.js";
import { mayHaveChanged } from "../components/change-detection.js";
import { canSupplyValue, isCascadingValueSupplier, type CascadingValueSupplier } from "./cascading-value.js";
import { DEV } from "../components/observe.js";
import { NavigationManager } from "../navigation/navigation-manager.js";
import { queryParameterValue } from "../routing/supply-parameter-from-query.js";
import type { ParameterMeta } from "../components/parameter-metadata.js";
import { ComponentState } from "./component-state.js";
import { Dispatcher } from "./dispatcher.js";
import { DomRenderer } from "./dom-renderer.js";
import { attachmentHost } from "./attachment-host.js";
import { motionHost } from "./motion-host.js";
import { RenderQueue } from "./render-queue.js";

/**
 * Render passes one component may run within a single batch before the
 * renderer reports a render loop (e.g. stateHasChanged in every render) and
 * drops its pending render instead of freezing the page.
 */
const MAX_RENDERS_PER_BATCH = 100;

const EMPTY_PARAMETERS: ReadonlyMap<string, unknown> = new Map();

/** Query values compare by content: an array (`multiple`) or a Date is a fresh object on every read. */
function sameQueryValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => sameQueryValue(item, b[i]));
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return Object.is(a, b);
}

/** Blazor's AddToRenderQueue(boundary, empty) — an empty render tree. */
const emptyRenderFragment: RenderFragment = () => {};

/**
 * Blazor's ParameterView.DefinitelyEquals over the attribute frames of a
 * retained component frame: true only when both have the same attribute
 * names in the same order (reorderings count as changes, as in Blazor) and
 * no value may have changed (mayHaveChanged). A plain function is a value
 * like any other (Blazor: a delegate may have changed); the EventCallbacks of
 * EventCallback parameters come from the compiler (2.2, B8).
 */
function parametersDefinitelyEqual(oldFrames: RenderTreeFrame[], oldIndex: number, newFrames: RenderTreeFrame[], newIndex: number): boolean {
  const oldEnd = oldIndex + getFrameSubtreeLength(oldFrames[oldIndex]!);
  const newEnd = newIndex + getFrameSubtreeLength(newFrames[newIndex]!);
  for (;;) {
    oldIndex++;
    newIndex++;
    const oldFrame = oldIndex < oldEnd ? oldFrames[oldIndex]! : undefined;
    const newFrame = newIndex < newEnd ? newFrames[newIndex]! : undefined;
    const oldFinished = oldFrame === undefined || oldFrame.frameType !== FrameType.Attribute;
    const newFinished = newFrame === undefined || newFrame.frameType !== FrameType.Attribute;
    if (oldFinished || newFinished) return oldFinished === newFinished;
    if (oldFrame.attributeName !== newFrame.attributeName) return false;
    if (mayHaveChanged(oldFrame.attributeValue, newFrame.attributeValue)) return false;
  }
}

/** Where a component error surfaced (the stage of Blazor's pipeline). */
export type RenderErrorPhase =
  | "render" // buildRenderTree
  | "diff" // computeDiff (e.g. duplicate keys), child instantiation
  | "apply" // DOM application of the edits
  | "lifecycle" // setParametersAsync (incl. unknown parameters) / onInitialized / onParametersSet / shouldRender
  | "afterRender"
  | "event" // DOM event handler
  | "dispose" // dispose / disposeAsync
  | "batch"; // batch-completed listeners and renderer internals

/** A failure routed to the renderer's error handler. */
export interface RenderError {
  /** The thrown value. */
  readonly error: unknown;
  /** The component the failure is attributed to, or null (not attributable). */
  readonly component: ComponentState | null;
  /** The pipeline stage the failure surfaced in. */
  readonly phase: RenderErrorPhase;
}

/** Receives component failures; the batch continues after it returns. */
export type RenderErrorHandler = (error: RenderError) => void;

/** One completed render batch (the unit OnAfterRender works on). */
export interface RenderBatch {
  /** One entry per render pass of the batch, in render order (a component may appear repeatedly). */
  readonly renderedComponents: readonly ComponentState[];
}

/**
 * Blazor's Renderer: owns component states, orchestrates lifecycle and
 * batching, and delegates DOM patching to the DomRenderer.
 *
 * Rendering is batched as in Blazor: render requests go into one render
 * queue per renderer; the first request schedules a batch (a microtask via
 * the Dispatcher), and the batch renders until the queue is empty — renders
 * requested while it runs (stateHasChanged during render or a sync lifecycle
 * hook, children the diff instantiates) join the same batch. The queue is
 * ordered parent-first. The batch ends at one defined point
 * (`onBatchCompleted`). Failures are isolated per component and routed to
 * `errorHandler`; the rest of the batch still renders.
 *
 * Each render pass applies its edits to the DOM right away, before any other
 * pass runs (decided in B3, deliberately unlike Blazor's one-shot batch
 * application). The edits reference frames of the component's new tree by
 * index (B1), and the diff of a repeat render in the same batch reads the
 * tree the previous pass committed — so no pass's edits can outlive the
 * builder that holds their frames. Blazor ships the whole batch at once
 * because every application crosses the WASM→JS boundary; here the applier
 * is a direct call, and the batch runs synchronously (nothing paints or
 * observes the DOM between passes), so deferring would only cost copying the
 * referenced frames (or keeping builders alive) with no observable gain.
 * Per-pass application also keeps failures per component: a pass's DOM
 * application is all-or-nothing (rolled back on error) before the pass is
 * committed, so the next pass never sees half-applied DOM.
 */
export class Renderer {
  /** Schedules this renderer's render batches (Blazor's Dispatcher). */
  readonly dispatcher = new Dispatcher();
  private readonly dom: DomRenderer;
  private readonly states = new Map<number, ComponentState>();
  private nextComponentId = 1;
  private readonly renderQueue = new RenderQueue();
  /** The scheduled (not yet started) batch; null while none is scheduled. */
  private scheduledBatch: Promise<void> | null = null;
  private batchInProgress = false;
  /** F4: whether a batch has completed (the first one plays no intros). */
  private firstBatchDone = false;
  /** Components that ran a render pass in the current batch (loop-guard reset). */
  private readonly batchStates: ComponentState[] = [];
  private readonly batchCompletedListeners = new Set<(batch: RenderBatch) => void>();
  private readonly services: ServiceProvider;
  /** Blazor's Renderer.SectionRegistry (3.4): one per renderer. */
  readonly sectionRegistry = new SectionRegistry();

  /**
   * Receives every component failure (render, diff, DOM application,
   * lifecycle, after-render, event handlers, dispose). Default: console.error
   * with the component's id and type. Failures never abort a batch.
   */
  errorHandler: RenderErrorHandler = defaultErrorHandler;

  /** @param services — the provider components resolve `@inject` services from; defaults to an empty one. */
  constructor(services?: ServiceProvider) {
    this.services = services ?? new ServiceCollection().build();
    this.dom = new DomRenderer(this);
  }

  /** The service provider this renderer's components resolve their services from. */
  get serviceScope(): ServiceProvider {
    return this.services;
  }

  /** The state of the live component with renderer-wide id `id`, or `undefined` when there is none. */
  getComponentState(id: number): ComponentState | undefined {
    return this.states.get(id);
  }

  /** Renders a root component into a DOM container (Blazor's root render). */
  renderInContainer(component: ComponentDefinition | (abstract new () => ComponentBase), container: Element): ComponentState {
    const definition = toComponentDefinition(component);
    const state = this.createComponentState(definition, null, -1);
    state.range.insertBefore(container, null);
    this.setComponentParameters(state, new Map());
    return state;
  }

  private createComponentState(definition: ComponentDefinition, parent: ComponentState | null, slotSequence: number): ComponentState {
    const id = this.nextComponentId++;
    void slotSequence;
    // E8 auto-render: marked services resolved during construction (the
    // `@inject` field initializers) are collected and observed after —
    // injecting a culture-aware service re-renders the component on its
    // notifications (design-localization.md §3).
    const autoObserve: unknown[] = [];
    const component = withServices(this.services, () => Reflect.construct(definition.type as unknown as new () => ComponentBase, []), autoObserve);
    for (const service of autoObserve) componentInternals.autoObserve(component, service);
    const state = new ComponentState(id, component, definition, parent);
    (state.renderHandle as { render: () => void }).render = () => this.enqueueRender(state);
    (state.renderHandle as { track?: unknown }).track = (promise: Promise<unknown>) => this.trackFor(state, promise, `${componentName(state)}: tracked work`);
    (state.renderHandle as { reportError?: unknown }).reportError = (error: unknown, phase: RenderErrorPhase) => this.handleComponentError(error, state, phase);
    (state.renderHandle as { sectionRegistry?: unknown }).sectionRegistry = this.sectionRegistry;
    Object.defineProperty(state.renderHandle, "isRenderingInProgress", { get: () => this.batchInProgress });
    componentInternals.attach(component, state.renderHandle, this.services);
    this.states.set(id, state);
    return state;
  }

  /**
   * Instantiates/retains the child components the diff lists (into
   * `newSlotChildren`), collecting the ones this pass creates. Blazor does
   * this inside the diff, so failures here count as diff failures.
   */
  private instantiateChildren(state: ComponentState, oldFrames: RenderTreeFrame[], newFrames: RenderTreeFrame[], diff: RenderTreeDiff, created: ComponentState[]): void {
    const { components } = diff;
    for (let i = 0; i < components.length; i += 2) {
      const oldIndex = components[i]!;
      const newIndex = components[i + 1]!;
      const frame = newFrames[newIndex]!;
      let child: ComponentState;
      if (oldIndex < 0) {
        const definition = toComponentDefinition(frame.componentType as unknown as ComponentDefinition | (abstract new () => ComponentBase));
        child = this.createComponentState(definition, state, frame.sequence);
        // 2.4: `@ref` on a component tag captures the child's instance —
        // Blazor's ComponentReferenceCapture, fired like the element variant
        // at creation time (element captures fire when the DOM inserts).
        this.fireComponentCaptures(newFrames, newIndex, child.component);
        created.push(child);
      } else {
        child = state.slotChildren.get(oldIndex)!;
        const oldType = oldFrames[oldIndex]!.componentType;
        if (oldType !== frame.componentType) {
          // Hot-swapped module: adopt the new definition in place, keep state.
          this.hmrSwap(oldType, frame.componentType);
        }
      }
      state.newSlotChildren.set(newIndex, child);
    }
  }

  /** Fires the component reference captures in a freshly created component
   *  frame's own child range (Blazor's ComponentReferenceCapture). Content
   *  regions and nested subtrees are skipped: their captures belong to the
   *  inner component's own tree or to DOM insertion. */
  private fireComponentCaptures(frames: RenderTreeFrame[], componentIndex: number, component: ComponentBase): void {
    const end = componentIndex + getFrameSubtreeLength(frames[componentIndex]!);
    for (let i = componentIndex + 1; i < end; i++) {
      const frame = frames[i]!;
      if (frame.frameType === FrameType.ComponentReferenceCapture) {
        frame.componentReferenceCaptureAction?.(component);
      }
    }
  }

  /**
   * Completes a committed render pass of `state`: sets child parameters (diff
   * order) and disposes removed children — Blazor's order: the diff
   * instantiates and updates children, disposal runs after the edits.
   * A retained child only gets its parameters set when one may have changed
   * (Blazor's UpdateRetainedChildComponent + ParameterView.DefinitelyEquals);
   * cascading values reach it through its subscription instead.
   */
  private updateChildren(state: ComponentState, oldFrames: RenderTreeFrame[], newFrames: RenderTreeFrame[], diff: RenderTreeDiff, disposed: ComponentState[]): void {
    const { components } = diff;
    for (let i = 0; i < components.length; i += 2) {
      const oldIndex = components[i]!;
      const newIndex = components[i + 1]!;
      if (
        oldIndex >= 0 &&
        oldFrames[oldIndex]!.componentType === newFrames[newIndex]!.componentType &&
        parametersDefinitelyEqual(oldFrames, oldIndex, newFrames, newIndex)
      ) {
        continue;
      }
      this.setComponentParameters(state.slotChildren.get(newIndex)!, attributeMap(newFrames, newIndex));
    }
    // The DOM of these is already gone: removed directly or with an ancestor element.
    for (const child of disposed) {
      this.disposeComponent(child);
    }
  }

  /**
   * Undoes the bookkeeping of a pass that failed before it was committed:
   * children it created are disposed, the slot map stays that of the live
   * tree. The DOM needs nothing here: a failed application has already
   * rolled back its edits (DomRenderer.applyEdits), which also takes out the
   * new children's (still empty) ranges.
   */
  private abortPass(state: ComponentState, created: ComponentState[]): void {
    state.newSlotChildren.clear();
    for (const child of created) {
      child.range.remove();
      this.disposeComponent(child);
    }
  }

  /** Identity match, or a hot-swapped module reusing the same class name. */
  private isSameComponentType(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    const name = (a as { name?: string } | null)?.name;
    const otherName = (b as { name?: string } | null)?.name;
    return name !== undefined && name !== "" && name === otherName && this.wasHmrSwapped(name);
  }

  private readonly diffOptions: DiffOptions = { isSameComponentType: (a, b) => this.isSameComponentType(a, b) };

  /** Applies attributes (plus resolved cascading values) and runs the lifecycle. */
  setComponentParameters(state: ComponentState, attributes: Map<string, { frame: RenderTreeFrame }>): void {
    const direct = new Map<string, unknown>();
    // Values pass through as given (B8): Blazor's EventCallbackFactory
    // conversion happens at compile time — the compiler creates the
    // EventCallbacks of EventCallback parameters; a plain function is a plain
    // value, whatever its parameter's name.
    for (const [name, { frame }] of attributes) direct.set(name, frame.attributeValue);
    this.supplyParameters(state, direct);
  }

  /**
   * Blazor's ComponentState.SetDirectParameters + WithCascadingParameters:
   * adds the cascading values (resolved fresh, subscribing to their
   * suppliers) to the parent-supplied parameters and runs setParametersAsync.
   */
  private supplyParameters(state: ComponentState, direct: ReadonlyMap<string, unknown>): void {
    let lifecycle: Promise<void>;
    try {
      const view = this.buildParameterView(state, direct);
      // A synchronous lifecycle requests its render right here, i.e. into
      // the running batch; only async hooks continue after it.
      lifecycle = state.component.setParametersAsync(view);
    } catch (error) {
      this.handleComponentError(error, state, "lifecycle");
      return;
    }
    if (lifecycle === completedLifecycle) return;
    this.trackFor(
      state,
      lifecycle.catch((error) => this.handleComponentError(error, state, "lifecycle")),
      `${componentName(state)}: onInitialized / onParametersSet`,
    );
  }

  /**
   * Tracks an in-flight async operation so waitUntilIdle can await it. `label` says what it is,
   * for waitUntilIdle's timeout.
   */
  track<T>(promise: Promise<T>, label = "tracked work"): Promise<T> {
    return this.trackFor(undefined, promise, label);
  }

  /** `track` for work of a component (`owner`): once it is disposed, a navigation no longer waits for the work. */
  trackFor<T>(owner: ComponentState | undefined, promise: Promise<T>, label: string): Promise<T> {
    this.inFlight.set(promise, { label, seq: this.trackedCount++, owner });
    void promise.finally(() => this.inFlight.delete(promise)).catch(() => undefined);
    return promise;
  }

  /** The async work in flight: what it is (`Autocomplete: input handler`), when it was tracked, whose it is. */
  private readonly inFlight = new Map<Promise<unknown>, { label: string; seq: number; owner: ComponentState | undefined }>();
  /** How much work was tracked so far: the next work's `seq`. */
  private trackedCount = 0;

  /** The navigation hold (createTsazorApp): marks the work tracked so far; `settledSince` doesn't wait for it. */
  markWork(): number {
    return this.trackedCount;
  }

  /**
   * The navigation hold: resolves once `navigationWork` (the Router's OnNavigateAsync) is
   * done, no batch is scheduled and the work tracked since `mark` is done — but for the work of
   * components disposed meanwhile (a page navigated away from) — or at `deadline` (a `Date.now()`
   * time) with work still running. Never rejects.
   */
  async settledSince(mark: number, deadline: number, navigationWork: readonly Promise<unknown>[] = []): Promise<void> {
    if (navigationWork.length > 0 && !(await settlesBefore(Promise.allSettled(navigationWork), deadline))) return;
    for (;;) {
      const pending = [...this.inFlight].filter(([, work]) => work.seq >= mark && work.owner?.disposed !== true).map(([promise]) => promise);
      const work = this.scheduledBatch ?? (pending.length > 0 ? Promise.allSettled(pending) : undefined);
      if (work === undefined || Date.now() >= deadline) return;
      // Looked at again every 50 ms at most: the work of a component disposed meanwhile no longer counts.
      await settlesBefore(work, Math.min(deadline, Date.now() + 50));
    }
  }

  private buildParameterView(state: ComponentState, direct: ReadonlyMap<string, unknown>): ParameterView {
    const { cascading } = parameterInfoOf(state.component);
    if (cascading.length === 0) return ParameterView.fromAttributes(direct.entries());
    const values = new Map(direct);
    const subscriptions: ComponentState[] = [];
    const queryFields: ParameterMeta[] = [];
    for (const meta of cascading) {
      if (meta.query !== undefined) {
        queryFields.push(meta);
        continue;
      }
      const supplier = this.resolveCascade(state, meta, subscriptions);
      if (supplier !== null) values.set(meta.propertyName, supplier.cascadeValue);
    }
    if (queryFields.length > 0) {
      const queryValues = this.queryValues(state, queryFields, direct);
      for (const [field, value] of queryValues) values.set(field, value);
      state.lastQueryValues = queryValues.size > 0 ? queryValues : null;
    }
    // Only components with cascading parameters keep the snapshot (Blazor).
    state.directParameters = direct;
    this.updateCascadingSubscriptions(state, subscriptions);
    return ParameterView.fromAttributes(values.entries());
  }

  /**
   * Blazor 8's SupplyParameterFromQueryValueProvider: the `@SupplyParameterFromQuery` fields'
   * values from the current URL's query (keys case-insensitive, a repeated key an array for
   * `multiple`, an absent key null). A field the parent passes directly keeps that value (a page's
   * route value wins over the query). The first such component subscribes the renderer to
   * navigations.
   */
  private queryValues(state: ComponentState, fields: readonly ParameterMeta[], direct: ReadonlyMap<string, unknown>): Map<string, unknown> {
    const values = new Map<string, unknown>();
    const passed = new Set([...direct.keys()].map((name) => name.toLowerCase()));
    const supplied = fields.filter((meta) => !passed.has(meta.propertyName.toLowerCase()));
    if (supplied.length === 0) return values;
    const services = componentInternals.services(state.component) as ServiceProvider | undefined;
    const navigation = services?.tryGet(NavigationManager as unknown as Token<NavigationManager>);
    if (navigation === undefined || navigation === null) {
      throw new Error("@SupplyParameterFromQuery() needs a NavigationManager service to read the query from.");
    }
    if (this.queryNavigation !== navigation) {
      this.queryNavigationUnsubscribe?.();
      this.queryNavigation = navigation;
      // After the navigation's own renders (the Router re-renders the page): a component its parent
      // already gave the new values to has nothing left to change, so it isn't set twice.
      this.queryNavigationUnsubscribe = navigation.addLocationChanged(() => {
        this.track(Promise.resolve().then(() => this.notifyQuerySubscribers()), "the query parameters' subscribers");
      });
    }
    const byLowerKey = new Map<string, string[]>();
    for (const [key, value] of new URL(navigation.uri).searchParams) {
      const list = byLowerKey.get(key.toLowerCase());
      if (list) list.push(value);
      else byLowerKey.set(key.toLowerCase(), [value]);
    }
    for (const meta of supplied) {
      const query = meta.query!;
      const name = query.queryName ?? meta.propertyName;
      values.set(meta.propertyName, queryParameterValue(byLowerKey.get(name.toLowerCase()) ?? [], query, name));
    }
    this.querySubscribers.add(state);
    return values;
  }

  private readonly querySubscribers = new Set<ComponentState>();
  private queryNavigation: NavigationManager | null = null;
  private queryNavigationUnsubscribe: (() => void) | null = null;

  /**
   * After a navigation: every component whose query values changed gets its last direct
   * parameters and the fresh values set again (Blazor's provider notifies its subscribers).
   */
  private notifyQuerySubscribers(): void {
    for (const state of [...this.querySubscribers]) {
      const previous = state.lastQueryValues;
      if (state.disposed || previous === null) {
        this.querySubscribers.delete(state);
        continue;
      }
      let current: Map<string, unknown>;
      try {
        const fields = parameterInfoOf(state.component).cascading.filter((meta) => meta.query !== undefined);
        current = this.queryValues(state, fields, state.directParameters ?? EMPTY_PARAMETERS);
      } catch (error) {
        this.handleComponentError(error, state, "lifecycle");
        continue;
      }
      const changed = [...current].some(([field, value]) => !sameQueryValue(previous.get(field), value));
      if (changed) this.supplyParameters(state, state.directParameters ?? EMPTY_PARAMETERS);
    }
  }

  /**
   * Blazor's CascadingParameterState.FindCascadingParameters for one
   * parameter: the nearest ancestor supplier that can supply it wins (by
   * name, case-insensitive, or by type — see canSupplyValue). The non-fixed
   * supplier it resolves to, and "pending" by-type candidates it passes (no
   * value yet), are added to `subscriptions`.
   */
  private resolveCascade(state: ComponentState, meta: ParameterMeta, subscriptions: ComponentState[]): CascadingValueSupplier | null {
    let plainObject = false;
    for (let current = state.parent; current !== null; current = current.parent) {
      const supplier = current.component;
      if (!isCascadingValueSupplier(supplier)) continue;
      const match = canSupplyValue(supplier, meta);
      if (match === "no") {
        plainObject ||= DEV && meta.cascadingType !== undefined && isPlainObjectCascade(supplier);
        continue;
      }
      if (!supplier.isFixed && !subscriptions.includes(current)) subscriptions.push(current);
      if (match === "yes") return supplier;
    }
    // `DEV &&` again: a production build folds it away, the warning's text with it.
    if (DEV && plainObject) warnPlainObjectCascade(state.component, meta);
    return null;
  }

  /** Blazor's Add/RemoveCascadingParameterSubscriptions, diffed against the previous set. */
  private updateCascadingSubscriptions(state: ComponentState, suppliers: ComponentState[]): void {
    const previous = state.cascadingSuppliers;
    if (previous !== null) {
      if (previous.length === suppliers.length && previous.every((supplier, i) => supplier === suppliers[i])) return;
      for (const supplier of previous) {
        if (!suppliers.includes(supplier)) supplier.subscribers?.delete(state);
      }
    }
    for (const supplier of suppliers) {
      (supplier.subscribers ??= new Set()).add(state);
    }
    state.cascadingSuppliers = suppliers.length > 0 ? suppliers : null;
  }

  private removeCascadingSubscriptions(state: ComponentState): void {
    if (state.cascadingSuppliers === null) return;
    for (const supplier of state.cascadingSuppliers) supplier.subscribers?.delete(state);
    state.cascadingSuppliers = null;
  }

  /**
   * Supplier side (Blazor's CascadingValue.NotifySubscribers →
   * ComponentState.NotifyCascadingValueChanged): runs before each render
   * pass of a supplier. When its cascadeValue may have changed since the
   * previous pass (mayHaveChanged), every subscriber gets its last direct
   * parameters plus the fresh cascading values re-set — directly, so an
   * intermediate component that does not re-render cannot stop the update.
   * As in Blazor's CascadingValue this happens before the supplier renders
   * (a subscriber the render then removes is disposed with its queued render).
   */
  private notifyCascadingSubscribers(state: ComponentState, supplier: CascadingValueSupplier): void {
    const value = supplier.cascadeValue;
    const previous = state.lastCascadeValue;
    state.lastCascadeValue = value;
    const subscribers = state.subscribers;
    if (subscribers === null || subscribers.size === 0 || !mayHaveChanged(previous, value)) return;
    for (const subscriber of [...subscribers]) {
      if (!subscriber.disposed) this.supplyParameters(subscriber, subscriber.directParameters ?? EMPTY_PARAMETERS);
    }
  }

  /**
   * Disposes a component and its descendants (their DOM is already gone or
   * goes with it). Blazor's disposal queue: a component is disposed before
   * the components in its render tree — parent first, breadth-first. Each
   * instance gets disposeAsync (IAsyncDisposable) if it has one, otherwise
   * dispose — as in Blazor, never both. A pending disposeAsync is tracked
   * (waitUntilIdle); failures of either go to the error handler and do not
   * stop the remaining disposals.
   */
  disposeComponent(root: ComponentState): void {
    if (root.disposed) return;
    const queue = [root];
    for (let i = 0; i < queue.length; i++) {
      const state = queue[i]!;
      state.disposed = true;
      this.states.delete(state.id);
      // Blazor's RemoveCascadingParameterSubscriptions (subscribers are descendants, disposed below).
      this.removeCascadingSubscriptions(state);
      this.querySubscribers.delete(state);
      state.subscribers = null;
      this.disposeInstance(state);
      for (const child of state.slotChildren.values()) {
        if (!child.disposed) queue.push(child);
      }
    }
  }

  private disposeInstance(state: ComponentState): void {
    const component = state.component as unknown as { dispose?: () => void; disposeAsync?: () => unknown };
    // disposeSignal / track teardown first: the user's dispose already sees
    // an aborted disposeSignal. Never throws (subscription errors are routed).
    componentInternals.dispose(state.component);
    // F2: the component's attachments are cleaned up before its own dispose.
    attachmentHost?.dispose(state, this.attachmentFailed);
    try {
      if (typeof component.disposeAsync === "function") {
        const pending = component.disposeAsync();
        if (isPromiseLike(pending)) {
          this.trackFor(state, Promise.resolve(pending).then(undefined, (error) => this.handleComponentError(error, state, "dispose")), `${componentName(state)}: disposeAsync`);
        }
      } else if (typeof component.dispose === "function") {
        component.dispose();
      }
    } catch (error) {
      this.handleComponentError(error, state, "dispose");
    }
  }

  /**
   * Blazor's AddToRenderQueue: queues `state` (parent-first). Outside a batch
   * the first request schedules one; during a batch the running batch picks
   * the request up.
   */
  private enqueueRender(state: ComponentState): void {
    if (state.disposed) return;
    this.renderQueue.enqueue(state);
    if (this.batchInProgress || this.scheduledBatch !== null) return;
    this.scheduledBatch = this.dispatcher
      .invoke(() => this.processRenderQueue())
      .catch((error) => this.handleComponentError(error, null, "batch"));
  }

  /**
   * Blazor's ProcessRenderQueue: one batch. Renders until the queue is empty
   * (renders requested meanwhile join), then signals the batch end.
   */
  private processRenderQueue(): void {
    this.scheduledBatch = null;
    this.batchInProgress = true;
    const rendered: ComponentState[] = [];
    try {
      let state: ComponentState | undefined;
      while ((state = this.renderQueue.dequeue()) !== undefined) {
        if (this.renderComponent(state)) rendered.push(state);
      }
    } finally {
      this.batchInProgress = false;
      for (const state of this.batchStates) state.batchRenderCount = 0;
      this.batchStates.length = 0;
    }
    // After the batch flag is cleared: renders requested by attachments,
    // after-render hooks or listeners start the next batch.
    const attachmentWork = this.dom.takeAttachmentWork();
    if (attachmentWork !== null) attachmentHost?.run(attachmentWork, this.attachmentFailed);
    // F4/F5: transitions and animations start after the attachments.
    const motionWork = this.dom.takeMotionWork();
    if (motionWork !== null) motionHost?.run(motionWork, { initial: !this.firstBatchDone, fail: this.attachmentFailed, removed: this.leftDom });
    this.firstBatchDone = true;
    this.invokeAfterRender(rendered);
    this.notifyBatchCompleted({ renderedComponents: rendered });
  }

  /** F4: a leaving child left the DOM after its outros — the attachments in it are cleaned up. */
  private readonly leftDom = (states: readonly ComponentState[]): void => {
    if (attachmentHost === null) return;
    const work: unknown[] = [];
    for (const state of states) work.push(state, null, null, null);
    attachmentHost.run(work, this.attachmentFailed);
  };

  /** F2: an attachment or its cleanup threw — a failure of its component, routed like onAfterRender's. */
  private readonly attachmentFailed = (error: unknown, state: ComponentState): void => {
    this.handleComponentError(error, state, "afterRender");
  };

  /**
   * Blazor's InvokeRenderCompletedCalls: once the whole batch is rendered
   * and applied, every component with a committed render pass in it gets
   * onAfterRender — once per batch, children before parents (deepest first,
   * render order among equal depths), skipping components the batch
   * disposed. Deviation: Blazor calls it once per render entry in render
   * order, i.e. parents first for a new subtree; children-first lets a
   * parent's callback rely on its children's after-render work. A pending
   * (async) callback is tracked for waitUntilIdle and does not render
   * afterwards; failures go to the error handler.
   */
  private invokeAfterRender(rendered: readonly ComponentState[]): void {
    if (rendered.length === 0) return;
    let states: ComponentState[];
    if (rendered.length === 1) {
      states = [rendered[0]!];
    } else {
      states = [...new Set(rendered)];
      states.sort((a, b) => b.depth - a.depth);
    }
    for (const state of states) {
      if (state.disposed) continue;
      try {
        const pending = componentInternals.notifyAfterRender(state.component);
        if (isPromiseLike(pending)) {
          this.trackFor(state, Promise.resolve(pending).then(undefined, (error) => this.handleComponentError(error, state, "afterRender")), `${componentName(state)}: onAfterRender`);
        }
      } catch (error) {
        this.handleComponentError(error, state, "afterRender");
      }
    }
  }

  /**
   * One render pass of `state`, isolated: a failure in render, diff or DOM
   * application is routed to the error handler and leaves the component's
   * live tree (and its previous builder) intact. Returns whether the pass
   * was committed.
   */
  private renderComponent(state: ComponentState): boolean {
    if (state.disposed) return false;
    const component = state.component;
    // shouldRender was consulted when the render was requested
    // (stateHasChanged, Blazor semantics); the first render always happens.
    if (componentInternals.firstRenderCompleted(component) && !componentInternals.hasPendingRender(component)) return false;
    componentInternals.clearPendingRender(component);
    if (state.batchRenderCount++ === 0) this.batchStates.push(state);
    if (state.batchRenderCount > MAX_RENDERS_PER_BATCH) {
      this.handleComponentError(
        new Error(`Component rendered more than ${MAX_RENDERS_PER_BATCH} times in one batch (render loop?); the pending render was dropped.`),
        state,
        "render",
      );
      return false;
    }
    if (isCascadingValueSupplier(component)) this.notifyCascadingSubscribers(state, component);

    // Ping-pong the state's two builders: this pass builds into one while
    // the previous tree lives in the other (the diff source). The spent
    // builder is cleared at the END of the pass, so the idle state holds
    // only the live tree, not the pass before it.
    state.renderPass ^= 1;
    const builder = state.renderBuilders[state.renderPass]!;
    builder.clear();
    const created: ComponentState[] = [];
    let phase: RenderErrorPhase = "render";
    let diff: RenderTreeDiff;
    const oldFrames = state.currentRenderTree;
    // Blazor's error-boundary empty render: this pass builds the forced
    // fragment instead of the component's output.
    const forcedFragment = state.forcedRenderFragment;
    state.forcedRenderFragment = null;
    let newFrames: RenderTreeFrame[];
    try {
      if (forcedFragment !== null) {
        forcedFragment(builder);
      } else {
        componentInternals.renderOutput(component, builder);
      }
      newFrames = builder.getFrames();
      phase = "diff";
      // The initial render is a diff against the empty tree (as in Blazor),
      // so duplicate keys are rejected there too.
      diff = computeDiff(oldFrames, newFrames, this.diffOptions);
      this.instantiateChildren(state, oldFrames, newFrames, diff, created);
      phase = "apply";
      this.dom.applyEdits(state, newFrames, diff.edits);
    } catch (error) {
      // Not committed: keep the live tree's builder for the next pass.
      this.abortPass(state, created);
      builder.clear();
      state.renderPass ^= 1;
      this.handleComponentError(error, state, phase);
      return false;
    }

    const disposed: ComponentState[] = [];
    for (const oldIndex of diff.disposedComponents) {
      const child = state.slotChildren.get(oldIndex);
      if (child) disposed.push(child);
    }
    this.dom.commitSlotChildren(state);
    state.currentRenderTree = newFrames;
    componentInternals.markFirstRenderCompleted(component);
    try {
      // Change detection compares against the previous tree's frames.
      this.updateChildren(state, oldFrames, newFrames, diff, disposed);
    } finally {
      // The diff and change detection have consumed the previous tree: free
      // its frames now so the idle state holds only the live tree.
      state.renderBuilders[state.renderPass ^ 1]!.clear();
    }
    if (forcedFragment !== null) {
      // The forced pass was Blazor's separate queue entry; the error content
      // (the component's own output) renders again, as in Blazor's next
      // StateHasChanged entry.
      componentInternals.requestRender(component);
    }
    return true;
  }

  /**
   * The defined batch end: `listener` runs after every batch, once
   * its queue is empty, after the components' onAfterRender calls. Returns an
   * unsubscribe function.
   */
  onBatchCompleted(listener: (batch: RenderBatch) => void): () => void {
    this.batchCompletedListeners.add(listener);
    return () => this.batchCompletedListeners.delete(listener);
  }

  private notifyBatchCompleted(batch: RenderBatch): void {
    for (const listener of this.batchCompletedListeners) {
      try {
        listener(batch);
      } catch (error) {
        this.handleComponentError(error, null, "batch");
      }
    }
  }

  /**
   * Routes a component failure to its handler. Blazor's
   * HandleExceptionViaErrorBoundary: a failure with an identified component
   * (everything but dispose and batch-internal failures) is offered to the
   * nearest error boundary along the logical parent chain; without one,
   * `errorHandler` receives it (Blazor's HandleException, i.e. fatal). Never
   * throws to the failure's origin (a boundary over its MaximumErrorCount is
   * fatal here, not by unwinding).
   */
  handleComponentError(error: unknown, component: ComponentState | null, phase: RenderErrorPhase): void {
    if (
      component !== null &&
      phase !== "dispose" && // Blazor: disposal errors are always fatal
      phase !== "batch" && // … so are batch-loop listeners and renderer internals
      this.routeToErrorBoundary(error, component, phase)
    ) {
      return;
    }
    try {
      this.errorHandler({ error, component, phase });
    } catch (handlerError) {
      defaultErrorHandler({ error: handlerError, component, phase });
      defaultErrorHandler({ error, component, phase });
    }
  }

  /**
   * Blazor's HandleExceptionViaErrorBoundary: walks the parent chain (self
   * included — an error inside a boundary's own error content is caught by it
   * again, bounded by MaximumErrorCount) and hands the first error boundary
   * the failure. Returns whether one took it.
   */
  private routeToErrorBoundary(error: unknown, source: ComponentState, phase: RenderErrorPhase): boolean {
    for (let candidate: ComponentState | null = source; candidate !== null; candidate = candidate.parent) {
      if (candidate.disposed || !isIErrorBoundary(candidate.component)) continue;
      // Blazor's AddToRenderQueue(boundary, empty): the failed subtree is
      // unmounted even when a custom boundary's output would not change.
      candidate.forcedRenderFragment = emptyRenderFragment;
      try {
        candidate.component.handleException(error);
      } catch {
        // Over MaximumErrorCount or an onError fault: fatal (Blazor's
        // HandleException). The empty render stays queued.
        this.errorHandler({ error, component: candidate, phase });
      }
      return true;
    }
    return false;
  }

  /**
   * Resolves once this renderer is idle: no batch scheduled and no tracked
   * async work (lifecycle hooks, after-render, event handlers, disposeAsync)
   * in flight. With `timeout` (ms) it rejects when it isn't idle by then,
   * naming the work still pending: a test that waits on a handler it never
   * lets finish fails with the handler's name instead of hanging.
   */
  async waitUntilIdle(options: { timeout?: number } = {}): Promise<void> {
    const deadline = options.timeout === undefined ? undefined : Date.now() + options.timeout;
    let guard = 0;
    while (guard < 1000) {
      guard++;
      if (this.scheduledBatch !== null) {
        await this.beforeDeadline(this.scheduledBatch, deadline, options.timeout);
        continue;
      }
      if (this.inFlight.size > 0) {
        await this.beforeDeadline(Promise.all([...this.inFlight.keys()]), deadline, options.timeout);
        continue;
      }
      break;
    }
  }

  private beforeDeadline(work: Promise<unknown>, deadline: number | undefined, timeout: number | undefined): Promise<unknown> {
    if (deadline === undefined) return work;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = [...new Set([...this.inFlight.values()].map((work) => work.label))];
        reject(new Error(`waitUntilIdle: not idle after ${timeout} ms. Still pending: ${pending.length > 0 ? pending.join("; ") : "a render batch"}.`));
      }, Math.max(0, deadline - Date.now()));
      work.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  // #region HMR (Blazor's hot-reload analogue)

  /** Class names whose modules were hot-swapped (diff-tolerance scope). */
  private readonly hmrSwappedNames = new Set<string>();

  /**
   * Hot-reload support: replaces `oldType` with the new definition in every
   * live component state. Instances are kept (state retention): their
   * prototype is swapped to the new class and fields the new constructor
   * initializes but the old instance lacks are seeded from a fresh probe.
   */
  hmrSwap(oldType: unknown, newComponentType: unknown): number {
    const newDefinition = toComponentDefinition(newComponentType as ComponentDefinition);
    let swapped = 0;
    for (const state of [...this.states.values()]) {
      if (state.definition.type !== oldType || state.disposed) continue;
      this.swapState(state, newDefinition);
      swapped++;
    }
    const name = (newDefinition.type as { name?: string }).name;
    if (swapped > 0 && name) this.hmrSwappedNames.add(name);
    return swapped;
  }

  /** True if a class with this name was hot-swapped (diff-tolerance scope). */
  wasHmrSwapped(className: string): boolean {
    return this.hmrSwappedNames.has(className);
  }

  private swapState(state: ComponentState, newDefinition: ComponentDefinition): void {
    state.definition = newDefinition;
    const component = state.component;
    // A fresh probe supplies defaults for fields added in the new version.
    const probe = withServices(this.services, () =>
      Reflect.construct(newDefinition.type as unknown as new () => ComponentBase, []),
    );
    Object.setPrototypeOf(component, newDefinition.type.prototype);
    for (const [key, value] of Object.entries(probe)) {
      if (!(key in component)) {
        (component as unknown as Record<string, unknown>)[key] = value;
      }
    }
    // [[Define]] class fields are own properties of every instance (also
    // those without an initializer): a field the new version turned into an
    // accessor would shadow it. Drop own data properties the new class no
    // longer defines as a field when its prototype chain has an accessor.
    for (const key of Object.keys(component)) {
      if (!Object.hasOwn(probe, key) && hasAccessor(newDefinition.type.prototype, key)) {
        delete (component as unknown as Record<string, unknown>)[key];
      }
    }
    componentInternals.forceRender(component);
  }

  // #endregion
}

/** Whether `work` settles (either way) before `deadline`, a `Date.now()` time. */
function settlesBefore(work: Promise<unknown>, deadline: number): Promise<boolean> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), remaining);
    const settled = () => {
      clearTimeout(timer);
      resolve(true);
    };
    work.then(settled, settled);
  });
}

/** Whether `key` is a getter/setter somewhere on the prototype chain from `proto`. */
function hasAccessor(proto: object | null, key: string): boolean {
  for (; proto !== null; proto = Object.getPrototypeOf(proto) as object | null) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (descriptor) return descriptor.get !== undefined || descriptor.set !== undefined;
  }
  return false;
}

const PHASE_LABELS: Record<RenderErrorPhase, string> = {
  render: "Render",
  diff: "Diff",
  apply: "DOM update",
  lifecycle: "Lifecycle",
  afterRender: "OnAfterRender",
  event: "Event handler",
  dispose: "Dispose",
  batch: "Render batch",
};

/** The renderer's default error handler: logs with the component's id and type. */
/** An unnamed supplier without a declared type whose value is a plain object (parsed JSON, a literal). */
function isPlainObjectCascade(supplier: CascadingValueSupplier): boolean {
  if (supplier.cascadeName !== undefined && supplier.cascadeName !== null) return false;
  if (supplier.cascadeType !== undefined) return false;
  const value = supplier.cascadeValue;
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

const warnedPlainObjectCascades = new Set<string>();

/**
 * Dev only: a by-type cascading parameter passed a plain object. It matches with `instanceof`, and API
 * data (parsed JSON) is never an instance of its model class, even when the generated model is a class:
 * the parameter stays unset without a word. Once per component and parameter.
 */
function warnPlainObjectCascade(component: ComponentBase, meta: ParameterMeta): void {
  const type = meta.cascadingType?.name ?? "the type";
  const key = `${component.constructor.name}.${meta.propertyName}`;
  if (warnedPlainObjectCascades.has(key)) return;
  warnedPlainObjectCascades.add(key);
  console.warn(
    `[tsazor] ${key}: @CascadingParameter({ type: ${type} }) found no ${type}, but passed a cascade whose value is a plain object. ` +
      `By type matches instances (instanceof), and API data (parsed JSON) is never an instance of its model class. ` +
      `Cascade it by name: <CascadingValue Value="…" Name="…"> and @CascadingParameter({ name: "…" }).`,
  );
}

function defaultErrorHandler({ error, component, phase }: RenderError): void {
  const name = (component?.definition.type as { name?: string } | undefined)?.name;
  const target = component === null ? "" : ` of component #${component.id}${name ? ` (${name})` : ""}`;
  // eslint-disable-next-line no-console
  console.error(`[tsazor] ${PHASE_LABELS[phase]}${target} failed:`, error);
}

/** A component's class name, for messages. */
function componentName(state: ComponentState): string {
  return state.component.constructor.name || "a component";
}
