import type { RenderFragment } from "../render-tree/render-tree.js";
import type { SectionRegistry } from "../sections/section-registry.js";
import type { RenderErrorPhase } from "./renderer.js";

/**
 * RenderHandle connects a component instance to the renderer that displays
 * it (Blazor's RenderHandle). Set by the renderer during instantiation.
 */
export interface RenderHandle {
  /** Marks the component's current output as out-of-date; the renderer re-renders it soon. */
  render(fragment?: RenderFragment): void;
  readonly isRenderingInProgress: boolean;
  /** Registers in-flight async work so waitUntilIdle includes it (Blazor awaits async operations similarly). */
  track(promise: Promise<unknown>): Promise<unknown>;
  /**
   * @internal Routes a failure of this component to the renderer's error
   * path (nearest ErrorBoundary, else the error handler) — for work that
   * runs outside a render pass, event handler or lifecycle hook
   * (`@Bindable` callbacks, `track` notifications).
   */
  reportError(error: unknown, phase: RenderErrorPhase): void;
  /** Blazor's RenderHandle.SectionRegistry: the sections of THIS renderer. */
  readonly sectionRegistry: SectionRegistry;
}
