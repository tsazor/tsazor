import { getFrameSubtreeLength, type RenderTreeFrame } from "../render-tree/render-tree.js";
import { FrameType } from "../render-tree/frame-type.js";
import { attributeMap, computeDiff, type DiffOptions, type RenderTreeDiff } from "../render-tree/diff.js";
import { ParameterView } from "../components/parameter-view.js";
import { toComponentDefinition, type ComponentDefinition } from "../components/component-definition.js";
import { completedLifecycle, isPromiseLike, type ComponentBase } from "../components/component-base.js";
import { ServiceCollection, ServiceProvider, type Token } from "../di/service-collection.js";
import { withServices } from "../di/service-provider.js";
import { mayHaveChanged } from "../components/change-detection.js";
import { canSupplyValue, isCascadingValueSupplier, type CascadingParameterRequest, type CascadingValueSupplier } from "./cascading-value.js";
import { ComponentState } from "./component-state.js";
import { Dispatcher } from "./dispatcher.js";
import { DomRenderer } from "./dom-renderer.js";
import { RenderQueue } from "./render-queue.js";
import { EventCallback } from "../components/event-callback.js";

/** Component attributes matching this name pattern carry event callbacks. */
const EVENT_PARAM_PATTERN = /^on/i;

/**
 * Render passes one component may run within a single batch before the
 * renderer reports a render loop (e.g. stateHasChanged in every render) and
 * drops its pending render instead of freezing the page.
 */
const MAX_RENDERS_PER_BATCH = 100;

const EMPTY_PARAMETERS: ReadonlyMap<string, unknown> = new Map();

/**
 * Blazor's ParameterView.DefinitelyEquals over the attribute frames of a
 * retained component frame: true only when both have the same attribute
 * names in the same order (reorderings count as changes, as in Blazor) and
 * no value may have changed (mayHaveChanged). A plain function on an
 * on*-named parameter becomes an EventCallback bound to the same parent in
 * setComponentParameters, so the same function counts as the same
 * EventCallback (Blazor compares the converted EventCallbacks).
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
    const name = newFrame.attributeName!;
    if (oldFrame.attributeName !== name) return false;
    const oldValue = oldFrame.attributeValue;
    const newValue = newFrame.attributeValue;
    if (oldValue === newValue && typeof newValue === "function" && EVENT_PARAM_PATTERN.test(name)) continue;
    if (mayHaveChanged(oldValue, newValue)) return false;
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
  readonly error: unknown;
  /** The component the failure is attributed to, or null (not attributable). */
  readonly component: ComponentState | null;
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
  readonly dispatcher = new Dispatcher();
  private readonly dom: DomRenderer;
  private readonly states = new Map<number, ComponentState>();
  private nextComponentId = 1;
  private readonly renderQueue = new RenderQueue();
  /** The scheduled (not yet started) batch; null while none is scheduled. */
  private scheduledBatch: Promise<void> | null = null;
  private batchInProgress = false;
  /** Components that ran a render pass in the current batch (loop-guard reset). */
  private readonly batchStates: ComponentState[] = [];
  private readonly batchCompletedListeners = new Set<(batch: RenderBatch) => void>();
  private readonly services: ServiceProvider;

  /**
   * Receives every component failure (render, diff, DOM application,
   * lifecycle, after-render, event handlers, dispose). Default: console.error
   * with the component's id and type. Failures never abort a batch.
   */
  errorHandler: RenderErrorHandler = defaultErrorHandler;

  constructor(services?: ServiceProvider) {
    this.services = services ?? new ServiceCollection().build();
    this.dom = new DomRenderer(this);
  }

  get serviceScope(): ServiceProvider {
    return this.services;
  }

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
    const component = withServices(this.services, () => Reflect.construct(definition.type as unknown as new () => ComponentBase, []));
    component.componentServices = this.services;
    const state = new ComponentState(id, component, definition, parent);
    (state.renderHandle as { render: () => void }).render = () => this.enqueueRender(state);
    (state.renderHandle as { track?: unknown }).track = (promise: Promise<unknown>) => this.track(promise);
    Object.defineProperty(state.renderHandle, "isRenderingInProgress", { get: () => this.batchInProgress });
    component.renderHandle = state.renderHandle;
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
    for (const [name, { frame }] of attributes) {
      let value = frame.attributeValue;
      // Blazor's EventCallbackFactory conversion: a plain function passed to
      // an on*-named event parameter is bound to the declaring component so
      // the parent re-renders after the handler ran. Already-bound callbacks
      // pass through untouched.
      if (EVENT_PARAM_PATTERN.test(name) && typeof value === "function" && !(value instanceof EventCallback)) {
        value = EventCallback.bind(state.parent?.component ?? state.component, value as never);
      }
      direct.set(name, value);
    }
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
    this.track(lifecycle.catch((error) => this.handleComponentError(error, state, "lifecycle")));
  }

  /** Tracks an in-flight async operation so waitUntilIdle can await it. */
  track<T>(promise: Promise<T>): Promise<T> {
    this.inFlight.add(promise);
    void promise.finally(() => this.inFlight.delete(promise)).catch(() => undefined);
    return promise;
  }

  private readonly inFlight = new Set<Promise<unknown>>();

  private buildParameterView(state: ComponentState, direct: ReadonlyMap<string, unknown>): ParameterView {
    const { cascading } = state.component.getParameterInfo();
    if (cascading.length === 0) return ParameterView.fromAttributes(direct.entries());
    const values = new Map(direct);
    const subscriptions: ComponentState[] = [];
    for (const meta of cascading) {
      const supplier = this.resolveCascade(state, meta, subscriptions);
      if (supplier !== null) values.set(meta.propertyName, supplier.cascadeValue);
    }
    // Only components with cascading parameters keep the snapshot (Blazor).
    state.directParameters = direct;
    this.updateCascadingSubscriptions(state, subscriptions);
    return ParameterView.fromAttributes(values.entries());
  }

  /**
   * Blazor's CascadingParameterState.FindCascadingParameters for one
   * parameter: the nearest ancestor supplier that can supply it wins (by
   * name, case-insensitive, or by type — see canSupplyValue). The non-fixed
   * supplier it resolves to, and "pending" by-type candidates it passes (no
   * value yet), are added to `subscriptions`.
   */
  private resolveCascade(state: ComponentState, meta: CascadingParameterRequest, subscriptions: ComponentState[]): CascadingValueSupplier | null {
    for (let current = state.parent; current !== null; current = current.parent) {
      const supplier = current.component;
      if (!isCascadingValueSupplier(supplier)) continue;
      const match = canSupplyValue(supplier, meta);
      if (match === "no") continue;
      if (!supplier.isFixed && !subscriptions.includes(current)) subscriptions.push(current);
      if (match === "yes") return supplier;
    }
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
      state.subscribers = null;
      this.disposeInstance(state);
      for (const child of state.slotChildren.values()) {
        if (!child.disposed) queue.push(child);
      }
    }
  }

  private disposeInstance(state: ComponentState): void {
    const component = state.component as unknown as { dispose?: () => void; disposeAsync?: () => unknown };
    try {
      if (typeof component.disposeAsync === "function") {
        const pending = component.disposeAsync();
        if (isPromiseLike(pending)) {
          this.track(Promise.resolve(pending).then(undefined, (error) => this.handleComponentError(error, state, "dispose")));
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
    // After the batch flag is cleared: renders requested by after-render
    // hooks or listeners start the next batch.
    this.invokeAfterRender(rendered);
    this.notifyBatchCompleted({ renderedComponents: rendered });
  }

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
        const pending = state.component.notifyAfterRender();
        if (isPromiseLike(pending)) {
          this.track(Promise.resolve(pending).then(undefined, (error) => this.handleComponentError(error, state, "afterRender")));
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
    if (component.firstRenderCompleted && !component.pendingRender) return false;
    component.clearPendingRender();
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
    let newFrames: RenderTreeFrame[];
    try {
      component.renderCurrentOutput(builder);
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
    component.markFirstRenderCompleted();
    try {
      // Change detection compares against the previous tree's frames.
      this.updateChildren(state, oldFrames, newFrames, diff, disposed);
    } finally {
      // The diff and change detection have consumed the previous tree: free
      // its frames now so the idle state holds only the live tree.
      state.renderBuilders[state.renderPass ^ 1]!.clear();
    }
    return true;
  }

  /**
   * @internal The defined batch end: `listener` runs after every batch, once
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
   * @internal Routes a component failure to its handler. Blazor's
   * HandleExceptionViaErrorBoundary: an ErrorBoundary (Phase 3) will be looked
   * up along `component`'s parent chain here; without one, `errorHandler`
   * receives it. Never throws.
   */
  handleComponentError(error: unknown, component: ComponentState | null, phase: RenderErrorPhase): void {
    try {
      this.errorHandler({ error, component, phase });
    } catch (handlerError) {
      defaultErrorHandler({ error: handlerError, component, phase });
      defaultErrorHandler({ error, component, phase });
    }
  }

  /**
   * Resolves once this renderer is idle: no batch scheduled and no tracked
   * async work (lifecycle hooks, after-render, event handlers, disposeAsync)
   * in flight.
   */
  async waitUntilIdle(): Promise<void> {
    let guard = 0;
    while (guard < 1000) {
      guard++;
      if (this.scheduledBatch !== null) {
        await this.scheduledBatch;
        continue;
      }
      if (this.inFlight.size > 0) {
        await Promise.all([...this.inFlight]);
        continue;
      }
      break;
    }
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
    component.forceRenderInternal();
  }

  // #endregion
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
function defaultErrorHandler({ error, component, phase }: RenderError): void {
  const name = (component?.definition.type as { name?: string } | undefined)?.name;
  const target = component === null ? "" : ` of component #${component.id}${name ? ` (${name})` : ""}`;
  // eslint-disable-next-line no-console
  console.error(`[tsazor] ${PHASE_LABELS[phase]}${target} failed:`, error);
}