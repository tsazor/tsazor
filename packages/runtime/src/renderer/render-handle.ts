import type { RenderFragment } from "../render-tree/render-tree.js";
import type { SectionRegistry } from "../sections/section-registry.js";

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
  /** Blazor's RenderHandle.SectionRegistry: the sections of THIS renderer. */
  readonly sectionRegistry: SectionRegistry;
}