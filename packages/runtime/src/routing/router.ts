import { ComponentBase } from "../components/component-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import { inject } from "../di/service-provider.js";
import type { ServiceProvider, Token } from "../di/service-collection.js";
import { NavigationManager } from "../navigation/navigation-manager.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import { getRouteTable, RouteManifest, type RouteData, type RouteEntry, type RouteTable } from "./route-data.js";

/**
 * Blazor's Router: matches the current location against the route manifest
 * and renders the found/not-found content. The manifest is an explicit list
 * of RouteEntry values (M7's Vite plugin generates it from @page modules —
 * Blazor uses assembly reflection, which TS does not have).
 */
export class Router extends ComponentBase {
  /** The app's route manifest (template + component per @page). */
  @Parameter() routes: RouteEntry[] = [];
  /** RenderFragment factory receiving the RouteData (Blazor's <Found Context>). */
  @Parameter() found?: (routeData: RouteData) => RenderFragment;
  /** Content rendered when no route matches (Blazor's <NotFound>). */
  @Parameter() notFound?: RenderFragment;

  private readonly navigation = this.inject(NavigationManager);
  private unsubscribe?: () => void;
  private routeTable?: RouteTable;

  protected override onInitialized(): void {
    if (this.routes.length === 0) {
      // Fall back to the app-provided manifest (createTsazorApp `routes` option).
      const services = this.componentServices as ServiceProvider | null;
      const manifest = services?.tryGet(RouteManifest as unknown as Token<RouteManifest>);
      if (manifest) this.routes = manifest.entries;
    }
    this.unsubscribe = this.navigation.addLocationChanged(() => this.stateHasChangedInternal());
    // Same-origin anchor clicks become SPA navigations from here on (Blazor
    // enables interception when the Router renders, too).
    this.navigation.enableNavigationInterception();
  }

  protected override onParametersSet(): void {
    // Blazor's RefreshRouteTable: sorts by precedence and throws for
    // ambiguous routes here (lifecycle), not on the first render.
    this.routeTable = getRouteTable(this.routes);
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    const matched = (this.routeTable ?? getRouteTable(this.routes)).match(this.navigation.baseRelativePath);
    if (matched) {
      const fragment = this.found?.(matched);
      if (fragment) {
        b.addContent(0, fragment);
      }
    } else if (this.notFound) {
      b.addContent(1, this.notFound);
    }
  }

  dispose(): void {
    this.unsubscribe?.();
  }
}