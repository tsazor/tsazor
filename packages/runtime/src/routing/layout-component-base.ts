import { ComponentBase } from "../components/component-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import type { RenderFragment } from "../render-tree/render-tree.js";

/**
 * Blazor's LayoutComponentBase: every @layout component extends this and
 * renders `Body` where the page content belongs.
 */
export abstract class LayoutComponentBase extends ComponentBase {
  /** The page content rendered inside the layout. */
  @Parameter() Body?: RenderFragment;
}