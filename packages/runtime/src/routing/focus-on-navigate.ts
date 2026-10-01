import { ComponentBase } from "../components/component-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import type { RouteData } from "./route-data.js";
import type { RenderTreeBuilder } from "../render-tree/render-tree.js";
import { focusBySelector } from "../navigation/dom-wrapper.js";

// On the first render the page type counts as changed even when it is the same
// class as a previous null — a sentinel, as in Blazor's NonMatchingType.
const nonMatchingPageType = class NonMatchingType {};

/**
 * Blazor's FocusOnNavigate: after navigating from one page to another, focuses
 * an element matching a CSS selector (accessibility). The focus runs on
 * page-type change — including the change to the FIRST page (a sentinel class
 * starts the comparison, as in Blazor) — after the render, via Blazor's
 * DomWrapper.focusBySelector semantics.
 *
 * Deviation: Blazor's non-interactive path renders a
 * `blazor-focus-on-navigate` custom element for its JS bridge; Tsazor is
 * always interactive, so the component renders nothing.
 */
export class FocusOnNavigate extends ComponentBase {
  /** The route data of an enclosing Router. */
  @Parameter() routeData?: RouteData;
  /** CSS selector of the element to focus after page changes. */
  @Parameter() selector?: string;

  /** On the first render the page type counts as changed even when null (Blazor's NonMatchingType). */
  private lastNavigatedPageType: unknown = nonMatchingPageType;
  private focusAfterRender = false;

  protected override onParametersSet(): void {
    if (this.routeData == null) {
      throw new Error("FocusOnNavigate requires a non-null value for the parameter 'RouteData'.");
    }
    if (typeof this.selector !== "string" || this.selector.trim().length === 0) {
      throw new Error("FocusOnNavigate requires a nonempty value for the parameter 'Selector'.");
    }

    // We focus whenever the page type changes, including to or from null.
    if (this.routeData.route.type !== this.lastNavigatedPageType) {
      this.lastNavigatedPageType = this.routeData.route.type;
      this.focusAfterRender = true;
    }
  }

  // Blazor (interactive): renders nothing — the focus is JS-side.
  protected override buildRenderTree(_b: RenderTreeBuilder): void {}

  protected override onAfterRender(): void {
    if (this.focusAfterRender) {
      this.focusAfterRender = false;
      focusBySelector(this.selector!);
    }
  }
}