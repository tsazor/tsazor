import type { ParameterView } from "./parameter-view.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { RenderHandle } from "../renderer/render-handle.js";
import type { RenderErrorPhase } from "../renderer/renderer.js";
import { parameterInfoOf } from "./parameter-metadata.js";
import { componentInternals } from "./component-internals.js";
import { EventCallbackWorkItem } from "./event-callback.js";
import { collectAutoObserve, getCurrentServices, isAutoRender } from "../di/service-provider.js";
import { DEV, release, type ObserveListener, type ObserveSource, type ObserveTeardown } from "./observe.js";

/**
 * The settled promise a lifecycle returns when it completed synchronously;
 * the renderer does not track it (nothing is in flight).
 * @internal
 */
export const completedLifecycle: Promise<void> = Promise.resolve();

/**
 * Blazor's ComponentBase. Sync-first lifecycle: hooks may return a Promise;
 * when they do, the component renders around the awaits exactly like
 * Blazor's async lifecycle orchestration (see setParametersAsync).
 */
export abstract class ComponentBase {
  /** Assigned by the renderer at instantiation time (componentInternals.attach). */
  #renderHandle: RenderHandle | undefined;
  /** The DI scope the renderer used to construct this component. */
  #services: unknown;
  #initialized = false;
  #hasPendingRender = false;
  #firstRenderDone = false;
  /** F6: buildRenderTree is running (a `@State` assignment there schedules nothing). */
  #building = false;
  #hasCalledOnAfterRender = false;
  #disposed = false;
  /** Created on first use of disposeSignal (most components never ask). */
  #disposeController: AbortController | null = null;
  /** Active `observe` subscriptions: source → stop (null until the first observe). */
  #observed: Set<{ source: unknown; stop: () => void }> | null = null;
  /** The culture-aware services this component already re-renders on (E8 auto-render): one subscription each. */
  #autoObserved: Set<unknown> | null = null;

  /**
   * Blazor's SetParametersAsync: parameter values are applied first (an
   * unknown parameter throws, as in Blazor), then the first call runs
   * RunInitAndSetParametersAsync, later calls CallOnParametersSetAsync.
   *
   * Hooks that complete synchronously continue synchronously, so a sync
   * lifecycle requests its render while the caller (the parent's render pass)
   * runs — the child renders in the same batch, exactly once. A hook that
   * returns a Promise renders the state its synchronous part produced right
   * away (loading state) and continues after the Promise settled. Deviation:
   * Blazor skips that intermediate render when the Task already completed
   * synchronously; a JS Promise's state cannot be inspected synchronously, so
   * an `async` hook without a real await renders once more here.
   */
  setParametersAsync(parameters: ParameterView): Promise<void> {
    this.applyParameterValues(parameters);
    if (!this.#initialized) {
      this.#initialized = true;
      return this.#runInitAndSetParameters();
    }
    return this.#callOnParametersSet();
  }

  /** Blazor's RunInitAndSetParametersAsync. */
  #runInitAndSetParameters(): Promise<void> {
    const initialized = this.onInitialized();
    if (isPromiseLike(initialized)) {
      // Render after the synchronous part of onInitialized (loading state);
      // callOnParametersSet renders again once it completed.
      this.stateHasChanged();
      return Promise.resolve(initialized).then(() => this.#callOnParametersSet());
    }
    return this.#callOnParametersSet();
  }

  /**
   * Blazor's CallOnParametersSetAsync: always renders after (the synchronous
   * part of) onParametersSet; a returned Promise renders again on completion
   * (CallStateHasChangedOnAsyncCompletion).
   */
  #callOnParametersSet(): Promise<void> {
    const parametersSet = this.onParametersSet();
    this.stateHasChanged();
    if (isPromiseLike(parametersSet)) {
      return Promise.resolve(parametersSet).then(() => this.stateHasChanged());
    }
    return completedLifecycle;
  }

  /**
   * Writes decorated parameter properties (normal + resolved cascading ones).
   * A parameter the component does not declare (case-insensitive) goes to
   * the captureUnmatchedValues property, or throws like Blazor's
   * ParameterView.SetParameterProperties when there is none.
   */
  protected applyParameterValues(parameters: ParameterView): void {
    // Cached per class (B6); Blazor matches attribute names case-insensitively.
    const { all: metadata, caseFolded, captureUnmatchedProperty: captureProperty } = parameterInfoOf(this);
    // Blazor's [Parameter(CaptureUnmatchedValues = true)] (ComponentProperties.
    // SetProperties): the unmatched attributes of THIS parameter set form a
    // fresh dictionary — attributes the parent stopped passing disappear. With
    // no unmatched attribute the property is left as is (Blazor quirk, kept).
    // Passing the capture property explicitly AND unmatched attributes throws.
    let unmatched: Record<string, unknown> | null = null;
    let captureSetExplicitly = false;
    for (const [name, value] of parameters.entries()) {
      const propertyName = metadata.has(name) ? name : caseFolded.get(name.toLowerCase());
      const meta = propertyName ? metadata.get(propertyName) : undefined;
      if (meta) {
        if (meta.captureUnmatchedValues) captureSetExplicitly = true;
        // @Bindable: the backing slot, so the parent's value never echoes back.
        (this as unknown as Record<PropertyKey, unknown>)[meta.store ?? meta.propertyName] = value;
      } else if (captureProperty !== null) {
        (unmatched ??= {})[name] = value;
      } else {
        throw unknownParameterError(this, name);
      }
    }
    if (unmatched !== null) {
      if (captureSetExplicitly) {
        throw new Error(
          `The property '${captureProperty}' on component type '${this.constructor.name}' cannot be set explicitly when ` +
            `also used to capture unmatched values. Unmatched values:\n${Object.keys(unmatched).join("\n")}`,
        );
      }
      (this as unknown as Record<string, unknown>)[captureProperty!] = unmatched;
    }
  }

  /** Blazor's OnInitialized / OnInitializedAsync. */
  protected onInitialized(): void | Promise<void> {}

  /** Blazor's OnParametersSet / OnParametersSetAsync. */
  protected onParametersSet(): void | Promise<void> {}

  /** Blazor's OnAfterRender / OnAfterRenderAsync. */
  protected onAfterRender(firstRender: boolean): void | Promise<void> {}

  /**
   * Blazor's IHandleEvent.HandleEventAsync: how the component handles an event of its own — an `@onclick` in its
   * markup, an EventCallback bound to it. The handler runs, and the component renders: after the handler's
   * synchronous part (so `busy = true; await …` shows its intermediate state) and, for an async handler, once more when
   * it completes; a failed async handler renders no second time, its error propagates. Override it to handle events
   * otherwise — without a render, Blazor's `@implements IHandleEvent`: `return callback.invokeAsync(arg);`.
   */
  protected handleEventAsync(callback: EventCallbackWorkItem, arg: unknown): Promise<void> {
    const task = callback.invokeAsync(arg);
    componentInternals.requestRender(this);
    if (task === EventCallbackWorkItem.completed) return task;
    return task.then(() => componentInternals.requestRender(this));
  }

  /** Blazor's ShouldRender: consulted by stateHasChanged, never for the first render. */
  protected shouldRender(): boolean {
    return true;
  }

  /**
   * Blazor's StateHasChanged: at most one queued render; the first render always happens, later ones only when
   * shouldRender() agrees.
   */
  protected stateHasChanged(): void {
    this.#requestRender();
  }

  #requestRender(): void {
    if (this.#hasPendingRender || !this.#renderHandle) return;
    if (!this.#firstRenderDone || this.shouldRender()) {
      this.#hasPendingRender = true;
      this.#renderHandle.render();
    }
  }

  /**
   * Builds this component's output. Components written in .tsazor override
   * this (generated code); hand-built components override it as well.
   */
  protected buildRenderTree(builder: RenderTreeBuilder): void {}

  /** Renders a fragment that is not part of buildRenderTree (e.g. a child content wrapper). */
  protected renderFragment(builder: RenderTreeBuilder, fragment: RenderFragment): void {
    fragment(builder);
  }

  /** Resolves a service from the DI scope the renderer used for this component. */
  protected inject<T>(token: abstract new (...args: never[]) => T): T {
    const provider = getCurrentServices(this);
    if (!provider) {
      throw new Error(`No service provider is active for this component. inject(${String((token as { name?: string }).name)}) failed.`);
    }
    const service = provider.get(token);
    // E8 auto-render: a culture-aware service injected from a lifecycle method
    // is observed here (a construction-time call is collected and drained by
    // the renderer — componentInternals.autoObserve); anything else is just resolved.
    if (isAutoRender(service) && !collectAutoObserve(service)) this.#autoObserve(service);
    return service;
  }

  /**
   * Tsazor extension: an `AbortSignal` that aborts when the component is
   * disposed. Anything that takes a signal tears itself down with the
   * component: `addEventListener(…, { signal })`, `fetch(url, { signal })`.
   */
  get disposeSignal(): AbortSignal {
    if (this.#disposeController === null) {
      this.#disposeController = new AbortController();
      if (this.#disposed) this.#disposeController.abort();
    }
    return this.#disposeController.signal;
  }

  /**
   * Hands an exception to the component's error handling as if the component had thrown it: the
   * nearest ErrorBoundary shows it (Blazor's DispatchExceptionAsync). For failures the renderer
   * can't see — a callback from a DOM listener, a timer or a behavior the component set up itself.
   */
  protected dispatchExceptionAsync(error: unknown): Promise<void> {
    this.#reportError(error, "event");
    return Promise.resolve();
  }

  /**
   * Tsazor extension: subscribes to an external source for the component's
   * lifetime. Every notification runs `onNext` (if given) and then requests
   * a render through the render queue, so a burst of notifications renders
   * once. The subscription ends when the component is disposed, or earlier
   * through the returned function. An async subscription (`subscribe`
   * returns a promise) that resolves after that is unsubscribed right away.
   * Errors in `onNext` and source errors take the lifecycle error path
   * (nearest ErrorBoundary). Blazor form: subscribe + `InvokeAsync(StateHasChanged)`
   * + unsubscribe in `Dispose`.
   */
  protected observe<T>(source: ObserveSource<T>, onNext?: (value: T) => void): () => void {
    if (this.#disposed) {
      // eslint-disable-next-line no-console
      if (DEV) console.warn(`[tsazor] ${this.constructor.name}: observe() after dispose is ignored.`);
      return () => {};
    }
    const observed = (this.#observed ??= new Set());
    if (DEV) {
      for (const entry of observed) {
        if (entry.source === source) {
          // eslint-disable-next-line no-console
          console.warn(
            `[tsazor] ${this.constructor.name}: the same source is observed twice — each observe() is a new subscription. ` +
              "Observe once in onInitialized, or stop the previous one with the function observe() returns.",
          );
          break;
        }
      }
    }
    let active = true;
    let teardown: ObserveTeardown;
    let controller: AbortController | undefined;
    const fail = (error: unknown): void => {
      if (active) this.#reportError(error, "lifecycle");
    };
    const notify = (value?: T): void => {
      if (!active) return;
      if (onNext !== undefined) {
        try {
          onNext.call(this, value as T);
        } catch (error) {
          fail(error);
          return;
        }
      }
      this.#requestRender();
    };
    const entry = {
      source,
      stop: (): void => {
        if (!active) return;
        active = false;
        observed.delete(entry);
        controller?.abort();
        const pending = release(teardown);
        if (isPromiseLike(pending)) Promise.resolve(pending).catch((error) => this.#reportError(error, "dispose"));
      },
    };
    observed.add(entry);
    if (typeof source === "function") {
      controller = new AbortController();
      source(controller.signal, notify);
    } else {
      const noop = (): void => {};
      const listener: ObserveListener<T> = Object.assign((value?: T) => notify(value), {
        next: notify,
        error: fail,
        complete: noop,
        onNext: notify,
        onError: fail,
        onComplete: noop,
      });
      const result = source.subscribe(listener);
      if (isPromiseLike(result)) {
        // An async handshake. Not tracked for waitUntilIdle: a subscription is
        // open-ended (a pending handshake must not stall idle/prerendering).
        // A handle that arrives after stop/dispose is released at once.
        void Promise.resolve(result as PromiseLike<ObserveTeardown>).then(
          (handle) => {
            if (active) teardown = handle;
            else release(handle);
          },
          fail,
        );
      } else {
        teardown = result as ObserveTeardown;
      }
    }
    return entry.stop;
  }

  /**
   * E8 auto-render (design-localization.md §3): the renderer drains here the marked services resolved during
   * construction (`@inject` field initializers) — a culture-aware service re-renders this component on its
   * notifications, the same subscription a hand-written `observe` would build.
   */
  #autoObserve(source: unknown): void {
    // Injected again (a second localizer, a lifecycle method that runs on every parameter set): already observed.
    const observed = (this.#autoObserved ??= new Set());
    if (observed.has(source)) return;
    observed.add(source);
    this.observe(source as ObserveSource);
  }

  /**
   * Routes a failure of work outside the render pipeline (`@Bindable` callbacks, `observe`) to the renderer's error
   * path; an unmounted component logs it.
   */
  #reportError(error: unknown, phase: RenderErrorPhase): void {
    if (this.#renderHandle) this.#renderHandle.reportError(error, phase);
    // eslint-disable-next-line no-console
    else console.error(`[tsazor] ${this.constructor.name}:`, error);
  }

  /**
   * Called by the renderer when it disposes the component, before dispose/disposeAsync: aborts disposeSignal and ends
   * every observed subscription. Teardown failures go to the dispose error path.
   */
  #dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#disposeController?.abort();
    if (this.#observed === null) return;
    for (const entry of [...this.#observed]) {
      try {
        entry.stop();
      } catch (error) {
        this.#reportError(error, "dispose");
      }
    }
  }

  /**
   * Blazor's IHandleAfterRender.OnAfterRenderAsync, called by the renderer once the batch that rendered this component
   * completed: `firstRender` is true on the first call per instance. Like Blazor, a completed (async) onAfterRender does
   * not trigger a render.
   */
  #notifyAfterRender(): void | Promise<void> {
    const firstRender = !this.#hasCalledOnAfterRender;
    this.#hasCalledOnAfterRender = true;
    return this.onAfterRender(firstRender);
  }

  /** Builds the current output (wraps the protected buildRenderTree); a `@State` assignment meanwhile schedules nothing (F6). */
  #renderOutput(builder: RenderTreeBuilder): void {
    this.#building = true;
    try {
      this.buildRenderTree(builder);
    } finally {
      this.#building = false;
    }
  }

  static {
    Object.assign(componentInternals, {
      attach(component: ComponentBase, handle: RenderHandle, services: unknown): void {
        component.#renderHandle = handle;
        component.#services = services;
      },
      renderHandle: (component: ComponentBase): RenderHandle | undefined => component.#renderHandle,
      services: (component: ComponentBase): unknown => component.#services,
      requestRender: (component: ComponentBase): void => component.#requestRender(),
      stateFieldChanged(component: ComponentBase): void {
        // F6: before the first render it comes anyway; while building, it would render again and again.
        if (!component.#firstRenderDone || component.#building) return;
        component.#requestRender();
      },
      forceRender(component: ComponentBase): void {
        if (component.#hasPendingRender || !component.#renderHandle) return;
        component.#hasPendingRender = true;
        component.#renderHandle.render();
      },
      notifyAfterRender: (component: ComponentBase): void | Promise<void> => component.#notifyAfterRender(),
      hasPendingRender: (component: ComponentBase): boolean => component.#hasPendingRender,
      clearPendingRender(component: ComponentBase): void {
        component.#hasPendingRender = false;
      },
      renderOutput: (component: ComponentBase, builder: RenderTreeBuilder): void => component.#renderOutput(builder),
      firstRenderCompleted: (component: ComponentBase): boolean => component.#firstRenderDone,
      markFirstRenderCompleted(component: ComponentBase): void {
        component.#firstRenderDone = true;
      },
      autoObserve: (component: ComponentBase, source: unknown): void => component.#autoObserve(source),
      reportError: (component: ComponentBase, error: unknown, phase: RenderErrorPhase): void => component.#reportError(error, phase),
      dispose: (component: ComponentBase): void => component.#dispose(),
      applyParameters: (component: ComponentBase, parameters: ParameterView): void => component.applyParameterValues(parameters),
      // Blazor: `Receiver is IHandleEvent` — a receiver that isn't a component just runs the handler.
      handleEvent: (receiver: object, callback: EventCallbackWorkItem, arg: unknown): Promise<void> =>
        #renderHandle in receiver ? (receiver as ComponentBase).handleEventAsync(callback, arg) : callback.invokeAsync(arg),
    } satisfies typeof componentInternals);
  }
}

/** @internal */
export function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return typeof (value as PromiseLike<void> | null | undefined)?.then === "function";
}

/**
 * Blazor's "Object of type 'X' does not have a property matching the name
 * 'Y'" (ParameterView.SetParameterProperties), plus its variant for a
 * property that exists but is not a parameter.
 */
function unknownParameterError(component: ComponentBase, name: string): Error {
  const type = (component.constructor as { name?: string }).name || "(anonymous component)";
  const lower = name.toLowerCase();
  let property: string | undefined;
  for (let target: object | null = component; target !== null && target !== ComponentBase.prototype; target = Object.getPrototypeOf(target)) {
    property = Object.getOwnPropertyNames(target).find((key) => key.toLowerCase() === lower);
    if (property !== undefined) break;
  }
  return new Error(
    property !== undefined
      ? `Object of type '${type}' has a property matching the name '${name}', but it is not declared as @Parameter() or @CascadingParameter().`
      : `Object of type '${type}' does not have a property matching the name '${name}'.`,
  );
}