import type { ComponentBase } from "./component-base.js";
import type { ParameterView } from "./parameter-view.js";
import type { RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { RenderHandle } from "../renderer/render-handle.js";
import type { RenderErrorPhase } from "../renderer/renderer.js";

/**
 * ComponentBase's plumbing: what the renderer, the runtime's own components and @tsazor/testing reach into
 * (`@tsazor/runtime/internal`). Functions over the component's private state, not members, so that no name of an
 * app's component collides with them and none is taken from it (TZS031 guards only the deliberate API).
 * ComponentBase's static block fills it in.
 */
export interface ComponentInternals {
  /** The renderer hands the component its RenderHandle and the DI scope it was constructed in. */
  attach(component: ComponentBase, handle: RenderHandle, services: unknown): void;
  /** The component's RenderHandle, before the renderer attached it undefined. */
  renderHandle(component: ComponentBase): RenderHandle | undefined;
  /** The DI scope the renderer constructed the component in. */
  services(component: ComponentBase): unknown;
  /** Blazor's StateHasChanged: at most one queued render; the first always, later ones when shouldRender agrees. */
  requestRender(component: ComponentBase): void;
  /** A `@State` field changed: requestRender, except before the first render and while the component builds its tree. */
  stateFieldChanged(component: ComponentBase): void;
  /** Queues a render regardless of shouldRender (hot reload, Blazor's IsRenderingOnMetadataUpdate). */
  forceRender(component: ComponentBase): void;
  /** Blazor's IHandleAfterRender.OnAfterRenderAsync, once the batch that rendered the component completed. */
  notifyAfterRender(component: ComponentBase): void | Promise<void>;
  /** Whether a render is queued but not yet flushed. */
  hasPendingRender(component: ComponentBase): boolean;
  clearPendingRender(component: ComponentBase): void;
  /** Builds the component's current output (its protected buildRenderTree). */
  renderOutput(component: ComponentBase, builder: RenderTreeBuilder): void;
  /** Whether the component has produced output at least once. */
  firstRenderCompleted(component: ComponentBase): boolean;
  markFirstRenderCompleted(component: ComponentBase): void;
  /** E8 auto-render: re-renders the component on a culture-aware service's notifications (one subscription each). */
  autoObserve(component: ComponentBase, source: unknown): void;
  /** Routes a failure outside the render pipeline to the renderer's error path; an unmounted component logs it. */
  reportError(component: ComponentBase, error: unknown, phase: RenderErrorPhase): void;
  /** Before dispose/disposeAsync: aborts disposeSignal and ends every observed subscription. */
  dispose(component: ComponentBase): void;
  /** Writes the parameters into the component's properties (its protected applyParameterValues). */
  applyParameters(component: ComponentBase, parameters: ParameterView): void;
}

/** See ComponentInternals. */
export const componentInternals = {} as ComponentInternals;
