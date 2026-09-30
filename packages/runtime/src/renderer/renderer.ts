import type { RenderTreeFrame } from "../render-tree/render-tree.js";
import { ParameterView } from "../components/parameter-view.js";
import { toComponentDefinition, type ComponentDefinition } from "../components/component-definition.js";
import type { ComponentBase } from "../components/component-base.js";
import { ServiceCollection, ServiceProvider, type Token } from "../di/service-collection.js";
import { withServices } from "../di/service-provider.js";
import { isCascadingValueSupplier } from "./cascading-value.js";
import { ComponentState } from "./component-state.js";
import { Dispatcher } from "./dispatcher.js";
import { DomRenderer } from "./dom-renderer.js";
import { EventCallback } from "../components/event-callback.js";

/** Component attributes matching this name pattern carry event callbacks. */
const EVENT_PARAM_PATTERN = /^on/i;

/**
 * Blazor's Renderer: owns component states, orchestrates lifecycle and
 * batching, and delegates DOM patching to the DomRenderer.
 */
export class Renderer {
  readonly dispatcher = new Dispatcher();
  private readonly dom: DomRenderer;
  private readonly states = new Map<number, ComponentState>();
  private nextComponentId = 1;
  private readonly pendingRenders = new Set<number>();
  private flushPromise: Promise<void> | null = null;
  private flushResolve: (() => void) | null = null;
  private readonly services: ServiceProvider;

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
    (state.renderHandle as { render: () => void }).render = () => this.enqueueRender(state.id);
    (state.renderHandle as { track?: unknown }).track = (promise: Promise<unknown>) => this.track(promise);
    component.renderHandle = state.renderHandle;
    this.states.set(id, state);
    return state;
  }

  /** Instantiates a child component inside the parent's DOM at the walk position. */
  attachComponent(
    parentState: ComponentState,
    frame: RenderTreeFrame,
    attributes: Map<string, { frame: RenderTreeFrame }>,
    ctx: { parentDom: Node; boundary: Node | null; lastNode: Node | null },
  ): ComponentState {
    const definition = toComponentDefinition(frame.componentType as unknown as ComponentDefinition | (abstract new () => ComponentBase));
    const child = this.createComponentState(definition, parentState, frame.sequence);
    const reference = ctx.lastNode ? ctx.lastNode.nextSibling : ctx.parentDom.firstChild;
    const insertRef = reference ?? ctx.boundary;
    ctx.parentDom.insertBefore(child.startMarker, insertRef);
    ctx.parentDom.insertBefore(child.endMarker, child.startMarker.nextSibling);
    this.setComponentParameters(child, attributes);
    return child;
  }

  /** Applies attributes (plus resolved cascading values) and runs the lifecycle. */
  setComponentParameters(state: ComponentState, attributes: Map<string, { frame: RenderTreeFrame }>): void {
    const view = this.buildParameterView(state, attributes);
    this.track(
      state.component.setParametersAsync(view).catch((error) => reportError(error, `Lifecycle of component #${state.id} failed`)),
    );
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
        reportError(error, `Dispose of component #${state.id} failed`);
      }
    }
  }

  private enqueueRender(componentId: number): void {
    this.pendingRenders.add(componentId);
    if (this.flushPromise === null) {
      const promise = new Promise<void>((resolve) => {
        this.flushResolve = resolve;
      });
      this.flushPromise = promise;
      queueMicrotask(() => {
        const resolve = this.flushResolve;
        this.flushPromise = null;
        this.flushResolve = null;
        try {
          this.flush();
        } finally {
          resolve?.();
        }
      });
    }
  }

  private flush(): void {
    const ids = [...this.pendingRenders];
    this.pendingRenders.clear();
    for (const id of ids) {
      const state = this.states.get(id);
      if (!state || state.disposed) continue;
      const firstRender = !state.component.firstRenderCompleted;
      if (!firstRender && !state.component.pendingRender) continue;
      state.component.clearPendingRender();
      if (!state.component.shouldRenderInternal()) continue;

      // Ping-pong the state's two builders: this pass builds into one while
      // the previous tree lives in the other (the diff source). The spent
      // builder is cleared at the END of the pass, so the idle state holds
      // only the live tree, not the pass before it.
      state.renderPass ^= 1;
      const builder = state.renderBuilders[state.renderPass]!;
      builder.clear();
      state.component.renderCurrentOutput(builder);
      const newFrames = builder.getFrames();

      if (firstRender) {
        this.dom.renderInitial(state, newFrames);
      } else {
        this.dom.renderUpdate(state, state.currentRenderTree, newFrames);
      }
      this.dom.commitSlotChildren(state);
      state.currentRenderTree = newFrames;
      // The diff has consumed the previous tree: free its frames now so the
      // idle state holds only the live tree, not the pass before it.
      state.renderBuilders[state.renderPass ^ 1]!.clear();
      state.component.markFirstRenderCompleted();

      this.track(
        Promise.resolve(state.component.notifyAfterRender(firstRender)).catch((error) =>
          reportError(error, `OnAfterRender of component #${state.id} failed`),
        ),
      );
    }
  }

  /** Resolves once all queued renders (including cascading ones) have flushed. */
  async waitUntilIdle(): Promise<void> {
    let guard = 0;
    while (guard < 1000) {
      guard++;
      if (this.flushPromise !== null) {
        const promise = this.flushPromise;
        await promise;
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

function reportError(error: unknown, context: string): void {
  // eslint-disable-next-line no-console
  console.error(`[tsazor] ${context}:`, error);
}