import { ComponentBase } from "../components/component-base";
import { Parameter } from "../components/parameter-metadata";
import type { RenderFragment } from "../render-tree/render-tree";

/**
 * Blazor's LayoutComponentBase: every @layout component extends this and
 * renders `Body` where the page content belongs.
 */
export abstract class LayoutComponentBase extends ComponentBase {
  /** The page content rendered inside the layout. */
  @Parameter() Body?: RenderFragment;
}