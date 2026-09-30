import type { RenderTreeFrame } from "../render-tree/render-tree.js";
import { attributeMap, computeDiff, type DiffOptions, type RenderTreeDiff } from "../render-tree/diff.js";
import { ParameterView } from "../components/parameter-view.js";
import { toComponentDefinition, type ComponentDefinition } from "../components/component-definition.js";
import type { ComponentBase } from "../components/component-base.js";
import { ServiceCollection, ServiceProvider, type Token } from "../di/service-collection.js";
import { withServices } from "../di/service-provider.js";
import { isCascadingValueSupplier } from "./cascading-value.js";
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

/** Where a component error surfaced (the stage of Blazor's pipeline). */
export type RenderErrorPhase =
  | "render" // buildRenderTree / shouldRender
  | "diff" // computeDiff (e.g. duplicate keys), child instantiation
  | "apply" // DOM application of the edits
  | "lifecycle" // setParametersAsync / onInitialized / onParametersSet
  | "afterRender"
  | "event" // DOM event handler
  | "dispose"
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

/** One completed render batch (the unit B3's applier and B4's OnAfterRender work on). */
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
 * pass runs. The edits reference frames of the component's new tree by index
 * (B1), and the diff of a repeat render in the same batch reads the tree the
 * previous pass committed — so no pass's edits can outlive the builder that
 * holds their frames. (A batch-end applier (B3) would have to copy the
 * referenced frames into the batch instead, as Blazor's reference-frame
 * array does.)
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
    container.appendChild(state.startMarker);
    container.appendChild(state.endMarker);
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
   */
  private updateChildren(state: ComponentState, newFrames: RenderTreeFrame[], diff: RenderTreeDiff, disposed: ComponentState[]): void {
    const { components } = diff;
    for (let i = 0; i < components.length; i += 2) {
      const newIndex = components[i + 1]!;
      this.setComponentParameters(state.slotChildren.get(newIndex)!, attributeMap(newFrames, newIndex));
    }
    // The DOM of these is already gone: removed directly or with an ancestor element.
    for (const child of disposed) {
      this.disposeComponent(child);
    }
  }

  /**
   * Undoes the bookkeeping of a pass that failed before it was committed:
   * children it created are disposed (their markers removed), the slot map
   * stays that of the live tree. DOM edits already applied by a failed
   * application are not rolled back.
   */
  private abortPass(state: ComponentState, created: ComponentState[]): void {
    state.newSlotChildren.clear();
    for (const child of created) {
      child.startMarker.remove();
      child.endMarker.remove();
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
    let lifecycle: Promise<void>;
    try {
      const view = this.buildParameterView(state, attributes);
      // A synchronous lifecycle requests its render right here, i.e. into
      // the running batch; only async hooks continue after it.
      lifecycle = state.component.setParametersAsync(view);
    } catch (error) {
      this.handleComponentError(error, state, "lifecycle");
      return;
    }
    this.track(lifecycle.catch((error) => this.handleComponentError(error, state, "lifecycle")));
  }

  /** Tracks an in-flight async operation so waitUntilIdle can await it. */
  track<T>(promise: Promise<T>): Promise<T> {
    this.inFlight.add(promise);
    void promise.finally(() => this.inFlight.delete(promise)).catch(() => undefined);
    return promise;
  }

  private readonly inFlight = new Set<Promise<unknown>>();

  private buildParameterView(state: ComponentState, attributes: Map<string, { frame: RenderTreeFrame }>): ParameterView {
    const values = new Map<string, unknown>();
    for (const [name, { frame }] of attributes) {
      let value = frame.attributeValue;
      // Blazor's EventCallbackFactory conversion: a plain function passed to
      // an on*-named event parameter is bound to the declaring component so
      // the parent re-renders after the handler ran. Already-bound callbacks
      // pass through untouched.
      if (EVENT_PARAM_PATTERN.test(name) && typeof value === "function" && !(value instanceof EventCallback)) {
        value = EventCallback.bind(state.parent?.component ?? state.component, value as never);
      }
      values.set(name, value);
    }
    const metadata = state.component.getAllParameterMetadata();
    for (const [propertyName, meta] of metadata) {
      if (!meta.cascading) continue;
      const value = this.resolveCascade(state, meta);
      if (value !== undefined) {
        values.set(propertyName, value);
      }
    }
    return ParameterView.fromAttributes(values.entries());
  }

  /** Nearest matching cascading value from the ancestor chain wins. */
  private resolveCascade(state: ComponentState, meta: { cascadingName?: string; cascadingType?: abstract new (...args: never[]) => unknown }): unknown {
    let current = state.parent;
    while (current !== null) {
      if (isCascadingValueSupplier(current.component)) {
        const supplierName = current.component.cascadeName;
        const value = current.component.cascadeValue;
        if (meta.cascadingName !== undefined) {
          if (supplierName === meta.cascadingName) return value;
        } else if (meta.cascadingType !== undefined) {
          if (value !== null && value !== undefined) {
            const token = meta.cascadingType as abstract new (...args: never[]) => unknown;
            if (value instanceof (token as unknown as new () => unknown)) return value;
            if ((value as object).constructor === (token as unknown as object)) return value;
          }
        } else {
          // Untyped, unnamed cascade parameter: match the nearest unnamed supplier.
          if (supplierName === undefined) return value;
        }
      }
      current = current.parent;
    }
    return undefined;
  }

  /** Removes a component (recursively) and its DOM output. */
  disposeComponent(state: ComponentState): void {
    if (state.disposed) return;
    state.disposed = true;
    for (const child of state.slotChildren.values()) {
      this.disposeComponent(child);
    }
    this.states.delete(state.id);
    const disposable = state.component as unknown as { dispose?: () => void };
    if (typeof disposable.dispose === "function") {
      try {
        disposable.dispose();
      } catch (error) {
        this.handleComponentError(error, state, "dispose");
      }
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
    // After the batch flag is cleared: renders requested by listeners start
    // the next batch.
    this.notifyBatchCompleted({ renderedComponents: rendered });
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
    const firstRender = !component.firstRenderCompleted;
    if (!firstRender && !component.pendingRender) return false;
    component.clearPendingRender();
    try {
      if (!component.shouldRenderInternal()) return false;
    } catch (error) {
      this.handleComponentError(error, state, "render");
      return false;
    }
    if (state.batchRenderCount++ === 0) this.batchStates.push(state);
    if (state.batchRenderCount > MAX_RENDERS_PER_BATCH) {
      this.handleComponentError(
        new Error(`Component rendered more than ${MAX_RENDERS_PER_BATCH} times in one batch (render loop?); the pending render was dropped.`),
        state,
        "render",
      );
      return false;
    }

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
    // The diff has consumed the previous tree: free its frames now so the
    // idle state holds only the live tree, not the pass before it.
    state.renderBuilders[state.renderPass ^ 1]!.clear();
    component.markFirstRenderCompleted();
    this.updateChildren(state, newFrames, diff, disposed);

    this.track(
      Promise.resolve(component.notifyAfterRender(firstRender)).catch((error) =>
        this.handleComponentError(error, state, "afterRender"),
      ),
    );
    return true;
  }

  /**
   * @internal The defined batch end: `listener` runs after every batch, once
   * its queue is empty (B3's batch applier and B4's OnAfterRender hook in
   * here). Returns an unsubscribe function.
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
   * async work (lifecycle hooks, after-render, event handlers) in flight.
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
    component.stateHasChangedInternal();
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