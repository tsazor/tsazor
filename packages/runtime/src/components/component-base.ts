import type { ParameterMeta } from "./parameter-metadata.js";
import type { ParameterView } from "./parameter-view.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { RenderHandle } from "../renderer/render-handle.js";
import { findParameterMetadata } from "./parameter-metadata.js";
import { getCurrentServices } from "../di/service-provider.js";

/**
 * Blazor's ComponentBase. Sync-first lifecycle: hooks may return a Promise;
 * when they do, the renderer orchestrates renders around the awaits just
 * like Blazor's async lifecycle orchestration.
 */
export abstract class ComponentBase {
  /** @internal Assigned by the renderer at instantiation time. */
  renderHandle!: RenderHandle;

  /** @internal The DI scope the renderer used to construct this component. */
  componentServices: unknown;

  private initialized = false;
  private hasPendingRender = false;
  private firstRenderDone = false;
  private readonly afterRenderCallbacks: Array<(firstRender: boolean) => void | Promise<void>> = [];

  /**
   * Blazor's SetParametersAsync. Parameter values are applied synchronously
   * first (so cascading values resolve correctly for children created in the
   * same render walk — a documented deviation from Blazor's ordering, where
   * OnInitialized runs before parameter application), then the lifecycle runs.
   */
  setParametersAsync(parameters: ParameterView): Promise<void> {
    const wasInitialized = this.initialized;
    if (!this.initialized) {
      this.initialized = true;
    }
    this.applyParameterValues(parameters);
    return this.runLifecycleAsync(!wasInitialized);
  }

  private async runLifecycleAsync(runInitialize: boolean): Promise<void> {
    if (runInitialize) {
      await this.onInitialized();
    }
    await this.onParametersSet();
    this.stateHasChanged();
  }

  /** Writes decorated parameter properties (normal + resolved cascading ones). */
  applyParameterValues(parameters: ParameterView): void {
    const metadata = this.getAllParameterMetadata();
    // Blazor matches attribute names to parameters case-insensitively.
    const caseFolded = new Map<string, string>();
    for (const key of metadata.keys()) {
      caseFolded.set(key.toLowerCase(), key);
    }
    // Blazor's [Parameter(CaptureUnmatchedValues = true)]: a dictionary
    // property that collects every attribute without a matching parameter.
    let captureTarget: Record<string, unknown> | null = null;
    let captureProperty: string | null = null;
    for (const [propertyName, meta] of metadata) {
      if (meta.captureUnmatchedValues) {
        captureProperty = propertyName;
        const current = (this as unknown as Record<string, unknown>)[propertyName];
        captureTarget = typeof current === "object" && current !== null ? { ...(current as Record<string, unknown>) } : {};
        break;
      }
    }
    for (const [name, value] of parameters.entries()) {
      const propertyName = metadata.has(name) ? name : caseFolded.get(name.toLowerCase());
      const meta = propertyName ? metadata.get(propertyName) : undefined;
      if (meta && !meta.captureUnmatchedValues) {
        (this as unknown as Record<string, unknown>)[meta.propertyName] = value;
      } else if (captureProperty !== null && !meta) {
        // Unmatched attribute → the capture dictionary (Blazor semantics).
        captureTarget![name] = value;
      }
    }
    if (captureProperty !== null) {
      (this as unknown as Record<string, unknown>)[captureProperty] = captureTarget!;
    }
  }

  /** Blazor's OnInitialized / OnInitializedAsync. */
  protected onInitialized(): void | Promise<void> {}

  /** Blazor's OnParametersSet / OnParametersSetAsync. */
  protected onParametersSet(): void | Promise<void> {}

  /** Blazor's OnAfterRender / OnAfterRenderAsync. */
  protected onAfterRender(firstRender: boolean): void | Promise<void> {}

  /** Blazor's ShouldRender. */
  protected shouldRender(): boolean {
    return true;
  }

  /** Blazor's StateHasChanged. */
  protected stateHasChanged(): void {
    this.stateHasChangedInternal();
  }

  /** @internal Public re-render request (used by the event system). */
  stateHasChangedInternal(): void {
    this.hasPendingRender = true;
    this.renderHandle?.render();
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

  /** @internal Called by the renderer after DOM patching completed. */
  async notifyAfterRender(firstRender: boolean): Promise<void> {
    if (this.afterRenderCallbacks.length > 0) {
      const callbacks = this.afterRenderCallbacks.splice(0);
      for (const cb of callbacks) {
        await cb(firstRender);
      }
    }
    await this.onAfterRender(firstRender);
  }

  /** @internal Whether a render is queued but not yet flushed. */
  get pendingRender(): boolean {
    return this.hasPendingRender;
  }

  /** @internal Renderer entry: builds the current output (wraps protected buildRenderTree). */
  renderCurrentOutput(builder: RenderTreeBuilder): void {
    this.buildRenderTree(builder);
  }

  /** @internal Renderer entry: shouldRender check. */
  shouldRenderInternal(): boolean {
    return this.shouldRender();
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

  /** All parameter metadata including inherited members (own class wins). */
  getAllParameterMetadata(): Map<string, ParameterMeta> {
    return findParameterMetadata(Object.getPrototypeOf(this).constructor as abstract new () => unknown);
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