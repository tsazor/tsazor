import { ComponentBase } from "../components/component-base";
import { Parameter } from "../components/parameter-metadata";
import { defineComponent } from "../components/component-definition";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree";
import type { RouteData } from "./route-data";

/**
 * Blazor's RouteView: renders the matched page inside its layout. The layout
 * wins in order routeData (from @layout) → defaultLayout parameter.
 */
export class RouteView extends ComponentBase {
  /** The RouteData the Router's found fragment passed in. */
  @Parameter() routeData!: RouteData;
  /** Fallback layout when the page has no @layout. */
  @Parameter() defaultLayout?: abstract new (...args: never[]) => ComponentBase;

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    const page = this.routeData.route.type as abstract new (...args: never[]) => ComponentBase;
    const layout = (this.routeData.route.layout ?? this.defaultLayout) as
      | (abstract new (...args: never[]) => ComponentBase)
      | undefined;

    const pageFragment: RenderFragment = (inner) => {
      inner.openComponent(0, defineComponent(page));
      let sequence = 1;
      for (const [name, value] of Object.entries(this.routeData.values)) {
        inner.addAttribute(sequence++, name, value);
      }
      inner.closeComponent();
    };

    if (layout) {
      renderWithLayout(b, layout, pageFragment);
    } else {
      b.addContent(0, pageFragment);
    }
  }
}

/** Wraps a fragment in a layout component's Body parameter (also used by AuthorizeRouteView). */
export function renderWithLayout(b: RenderTreeBuilder, layout: abstract new (...args: never[]) => ComponentBase, body: RenderFragment): void {
  b.openComponent(0, defineComponent(layout));
  b.addAttribute(1, "Body", body);
  b.closeComponent();
}