import type { ParameterInfo, ParameterMeta } from "./parameter-metadata.js";
import type { ParameterView } from "./parameter-view.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { RenderHandle } from "../renderer/render-handle.js";
import { findParameterMetadata, getParameterInfo } from "./parameter-metadata.js";
import { getCurrentServices } from "../di/service-provider.js";

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
  /** @internal Assigned by the renderer at instantiation time. */
  renderHandle!: RenderHandle;

  /** @internal The DI scope the renderer used to construct this component. */
  componentServices: unknown;

  private initialized = false;
  private hasPendingRender = false;
  private firstRenderDone = false;
  private hasCalledOnAfterRender = false;
  private readonly afterRenderCallbacks: Array<(firstRender: boolean) => void | Promise<void>> = [];

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
    if (!this.initialized) {
      this.initialized = true;
      return this.runInitAndSetParameters();
    }
    return this.callOnParametersSet();
  }

  /** Blazor's RunInitAndSetParametersAsync. */
  private runInitAndSetParameters(): Promise<void> {
    const initialized = this.onInitialized();
    if (isPromiseLike(initialized)) {
      // Render after the synchronous part of onInitialized (loading state);
      // callOnParametersSet renders again once it completed.
      this.stateHasChanged();
      return Promise.resolve(initialized).then(() => this.callOnParametersSet());
    }
    return this.callOnParametersSet();
  }

  /**
   * Blazor's CallOnParametersSetAsync: always renders after (the synchronous
   * part of) onParametersSet; a returned Promise renders again on completion
   * (CallStateHasChangedOnAsyncCompletion).
   */
  private callOnParametersSet(): Promise<void> {
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
  applyParameterValues(parameters: ParameterView): void {
    // Cached per class (B6); Blazor matches attribute names case-insensitively.
    const { all: metadata, caseFolded, captureUnmatchedProperty: captureProperty } = this.getParameterInfo();
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
        (this as unknown as Record<string, unknown>)[meta.propertyName] = value;
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

  /** Blazor's ShouldRender: consulted by stateHasChanged, never for the first render. */
  protected shouldRender(): boolean {
    return true;
  }

  /** Blazor's StateHasChanged. */
  protected stateHasChanged(): void {
    this.stateHasChangedInternal();
  }

  /**
   * @internal Public re-render request (used by the event system). Blazor's
   * StateHasChanged: at most one queued render; the first render always
   * happens, later ones only when shouldRender() agrees.
   */
  stateHasChangedInternal(): void {
    if (this.hasPendingRender || !this.renderHandle) return;
    if (!this.firstRenderDone || this.shouldRender()) {
      this.hasPendingRender = true;
      this.renderHandle.render();
    }
  }

  /** @internal Queues a render regardless of shouldRender (hot reload, Blazor's IsRenderingOnMetadataUpdate). */
  forceRenderInternal(): void {
    if (this.hasPendingRender || !this.renderHandle) return;
    this.hasPendingRender = true;
    this.renderHandle.render();
  }

  /**
   * Builds this component's output. Components written in .tsazor override
   * this (generated code); hand-built components override it as well.
   */
  protected buildRenderTree(builder: RenderTreeBuilder): void {}

  /** Adds a callback to run after the next render (Blazor's OnAfterRender contract for fragments). */
  onAfterRenderInternal(callback: (firstRender: boolean) => void | Promise<void>): void {
    this.afterRenderCallbacks.push(callback);
  }

  /**
   * @internal Blazor's IHandleAfterRender.OnAfterRenderAsync, called by the
   * renderer once the batch that rendered this component completed.
   * `firstRender` is true on the first call per instance. Like Blazor, a
   * completed (async) onAfterRender does not trigger a render.
   */
  notifyAfterRender(): void | Promise<void> {
    const firstRender = !this.hasCalledOnAfterRender;
    this.hasCalledOnAfterRender = true;
    if (this.afterRenderCallbacks.length === 0) {
      return this.onAfterRender(firstRender);
    }
    const callbacks = this.afterRenderCallbacks.splice(0);
    return (async () => {
      for (const cb of callbacks) {
        await cb(firstRender);
      }
      await this.onAfterRender(firstRender);
    })();
  }

  /** @internal Whether a render is queued but not yet flushed. */
  get pendingRender(): boolean {
    return this.hasPendingRender;
  }

  /** @internal Renderer entry: builds the current output (wraps protected buildRenderTree). */
  renderCurrentOutput(builder: RenderTreeBuilder): void {
    this.buildRenderTree(builder);
  }

  /** @internal */
  clearPendingRender(): void {
    this.hasPendingRender = false;
  }

  /** @internal */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /** @internal Whether the component has produced output at least once. */
  get firstRenderCompleted(): boolean {
    return this.firstRenderDone;
  }

  /** @internal */
  markFirstRenderCompleted(): void {
    this.firstRenderDone = true;
  }

  /** All parameter metadata including inherited members (own class wins); cached per class, do not mutate. */
  getAllParameterMetadata(): Map<string, ParameterMeta> {
    return findParameterMetadata(Object.getPrototypeOf(this).constructor as abstract new () => unknown);
  }

  /** @internal The cached per-class parameter lookup (see getParameterInfo). */
  getParameterInfo(): ParameterInfo {
    return getParameterInfo(Object.getPrototypeOf(this).constructor as abstract new () => unknown);
  }

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
    return provider.get(token);
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