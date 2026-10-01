import { ComponentBase } from "../components/component-base.js";
import { Parameter, getParameterInfo } from "../components/parameter-metadata.js";
import { defineComponent } from "../components/component-definition.js";
import { getCurrentServices } from "../di/service-provider.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { Token } from "../di/service-collection.js";
import { NavigationManager } from "../navigation/navigation-manager.js";
import type { RouteData } from "./route-data.js";
import { queryParameterValue, queryParametersOf, type QueryParameterMeta } from "./supply-parameter-from-query.js";

/**
 * Blazor's RouteView: renders the matched page inside its layout. The layout
 * wins in order routeData (from @layout) → defaultLayout parameter.
 *
 * Query parameters (3.7): the page's `@SupplyParameterFromQuery()` fields
 * receive the current URI's query values as attributes, appended to the route
 * values (a field that is also a route parameter keeps the route value).
 * Blazor does this through an internal cascading-value provider; Tsazor
 * supplies attributes directly, so the field is `@Parameter()` too. Values
 * refresh on every render — the Router re-renders after each navigation, so
 * a changed query string reaches the page in that pass. Absent keys supply
 * null (Blazor's provider nulls the value) with the parameter type's
 * invariant-culture conversion.
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
      for (const [field, value] of this.queryParameterValues(page)) {
        inner.addAttribute(sequence++, field, value as never);
      }
      inner.closeComponent();
    };

    if (layout) {
      renderWithLayout(b, layout, pageFragment);
    } else {
      b.addContent(0, pageFragment);
    }
  }

  /** The query values of the page's @SupplyParameterFromQuery fields for the current URI. */
  private queryParameterValues(page: abstract new (...args: never[]) => ComponentBase): Map<string, unknown> {
    const parameters = queryParametersOf(page);
    const values = new Map<string, unknown>();
    if (parameters.size === 0) return values;
    const provider = getCurrentServices(this);
    const navigation = provider?.tryGet(NavigationManager as unknown as Token<NavigationManager>);
    if (!navigation) {
      throw new Error("RouteView requires a NavigationManager service to supply the page's SupplyParameterFromQuery parameters.");
    }
    // Query keys match case-insensitively (Blazor), and a repeated key is an
    // array of values (Blazor's QueryParameterValueSupplier arrays).
    const byLowerKey = new Map<string, string[]>();
    for (const [key, value] of new URL(navigation.uri).searchParams) {
      const lower = key.toLowerCase();
      const list = byLowerKey.get(lower);
      if (list) list.push(value);
      else byLowerKey.set(lower, [value]);
    }
    const routeNames = new Set(Object.keys(this.routeData.values).map((name) => name.toLowerCase()));
    const declared = getParameterInfo(page).all;
    for (const field of parameters.keys()) {
      if (!declared.has(field)) {
        // Blazor's [SupplyParameterFromQuery] implies a settable property; the
        // Tsazor supply model writes attributes, so @Parameter() is required.
        throw new Error(
          `The field '${field}' on '${(page as { name?: string }).name ?? "(anonymous page)"}' is marked @SupplyParameterFromQuery() but not declared as @Parameter().`,
        );
      }
    }
    for (const [field, meta] of parameters) {
      const name = meta.queryName ?? field;
      // A field the route template supplies (its name, case-insensitive) keeps
      // the route value; the query does not override it.
      if (routeNames.has(field.toLowerCase())) continue;
      values.set(field, queryParameterValue(byLowerKey.get(name.toLowerCase()) ?? [], meta, name));
    }
    return values;
  }
}

/** Wraps a fragment in a layout component's Body parameter (also used by AuthorizeRouteView). */
export function renderWithLayout(b: RenderTreeBuilder, layout: abstract new (...args: never[]) => ComponentBase, body: RenderFragment): void {
  b.openComponent(0, defineComponent(layout));
  b.addAttribute(1, "Body", body);
  b.closeComponent();
}