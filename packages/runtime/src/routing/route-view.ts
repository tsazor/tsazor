import { ComponentBase } from "../components/component-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import { defineComponent } from "../components/component-definition.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { RouteData } from "./route-data.js";

/**
 * Blazor's RouteView: renders the matched page inside its layout. The layout
 * wins in order routeData (from @layout) → defaultLayout parameter.
 *
 * Query parameters: the renderer supplies `@SupplyParameterFromQuery()` fields
 * to every component (Blazor 8); a route value passed here wins over the query.
 */
export class RouteView extends ComponentBase {
  /** The RouteData the Router's found fragment passed in. */
  @Parameter() routeData!: RouteData;
  /** Fallback layout when the page has no @layout. */
  @Parameter() defaultLayout?: abstract new (...args: never[]) => ComponentBase;

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    const page = this.routeData.route.type as abstract new (...args: never[]) => ComponentBase;
    // The route's layout (the manifest's, from @layout or _Imports), else the page's own (Blazor's [Layout]), else the default.
    const layout = (this.routeData.route.layout ?? layoutOf(page) ?? this.defaultLayout) as
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

type LayoutType = abstract new (...args: never[]) => ComponentBase;

/** A component's own layout: its `@layout` (the compiler's `static layout`, Blazor's [Layout] attribute). */
export function layoutOf(type: unknown): LayoutType | undefined {
  const layout = (type as { layout?: unknown } | null | undefined)?.layout;
  return typeof layout === "function" ? (layout as LayoutType) : undefined;
}

/**
 * Wraps a fragment in a layout component's Body parameter — and that layout in its own layout, outward to the first
 * that has none (Blazor's LayoutView.WrapInLayout): a Settings layout with `@layout AppShell` renders inside the
 * shell. The outermost layout stays the same component across pages that share it. A repeated layout ends the chain.
 * Also used by LayoutView and AuthorizeRouteView.
 */
export function renderWithLayout(b: RenderTreeBuilder, layout: LayoutType, body: RenderFragment): void {
  const chain: LayoutType[] = [];
  for (let current: LayoutType | undefined = layout; current !== undefined && !chain.includes(current); current = layoutOf(current)) {
    chain.push(current);
  }
  let content = body;
  for (const type of chain) {
    const inner = content;
    content = (builder) => {
      builder.openComponent(0, defineComponent(type));
      builder.addAttribute(1, "Body", inner);
      builder.closeComponent();
    };
  }
  content(b);
}