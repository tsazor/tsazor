import { ComponentBase } from "../components/component-base.js";
import { EventCallback } from "../components/event-callback.js";
import { Parameter } from "../components/parameter-metadata.js";
import type { ServiceProvider, Token } from "../di/service-collection.js";
import { scrollToElement } from "../navigation/dom-wrapper.js";
import { NavigationManager } from "../navigation/navigation-manager.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import {
  getRouteTable,
  isLazyRoute,
  RouteManifest,
  type LazyRouteEntry,
  type LoadedRoute,
  type RouteData,
  type RouteEntry,
  type RouteManifestEntry,
  type RouteMatch,
  type RouteTable,
} from "./route-data.js";
import { componentInternals } from "../components/component-internals.js";

/** Lazy pages by loader: loading (shared promise) and loaded. */
const loadingRoutes = new WeakMap<LazyRouteEntry["load"], Promise<LoadedRoute>>();
const loadedRoutes = new WeakMap<LazyRouteEntry["load"], LoadedRoute>();
/** A lazy manifest entry resolved to the RouteEntry its page renders with (stable per entry). */
const resolvedRoutes = new WeakMap<LazyRouteEntry, RouteEntry>();

const RELOAD_KEY = "tsazor:chunk-reload";

/** Records a reload for `uri`; false when one was already made (session storage, so it survives the reload). */
function markReload(uri: string): boolean {
  try {
    if (typeof sessionStorage === "undefined" || sessionStorage.getItem(RELOAD_KEY) === uri) return false;
    sessionStorage.setItem(RELOAD_KEY, uri);
    return true;
  } catch {
    return false; // storage blocked: no reload loop risk worth taking
  }
}

function forgetReload(uri: string): void {
  try {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(RELOAD_KEY) === uri) sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    // storage blocked: nothing was recorded
  }
}

/**
 * Blazor's NavigationContext: what `OnNavigateAsync` receives. `signal`
 * stands for Blazor's CancellationToken — it is aborted when a newer
 * navigation starts before this one finished.
 */
export interface NavigationContext {
  /** The target, base-relative (`orders/5?tab=2`). */
  readonly path: string;
  /** Aborted when the navigation is superseded. */
  readonly signal: AbortSignal;
}

/**
 * Blazor's Router: matches the current location against the route manifest
 * and renders the found/not-found content. The manifest is an explicit list
 * of RouteEntry values (M7's Vite plugin generates it from @page modules —
 * Blazor uses assembly reflection, which TS does not have).
 *
 * With `OnNavigateAsync`, every navigation (the first one included) runs it
 * before the page renders; meanwhile the router renders `Navigating`, or —
 * without it — keeps showing what it showed before (Blazor). A newer
 * navigation aborts the running one's `signal`; only the latest renders. A
 * failing `OnNavigateAsync` is a failure of the router (an ErrorBoundary
 * around it shows it).
 */
export class Router extends ComponentBase {
  /** The app's route manifest (template + component per @page; lazy entries load on first navigation). */
  @Parameter() routes: RouteManifestEntry[] = [];
  /** RenderFragment factory receiving the RouteData (Blazor's <Found Context>). */
  @Parameter() found?: (routeData: RouteData) => RenderFragment;
  /** Content rendered when no route matches (Blazor's <NotFound>). */
  @Parameter() notFound?: RenderFragment;
  /** Runs before each navigation renders (Blazor's OnNavigateAsync): load data or code the target needs. */
  @Parameter() onNavigateAsync?: EventCallback<NavigationContext> | ((context: NavigationContext) => void | Promise<void>);
  /** Rendered while `OnNavigateAsync` runs (Blazor's <Navigating>). */
  @Parameter() navigating?: RenderFragment;

  private readonly navigation = this.inject(NavigationManager);
  private unsubscribe?: () => void;
  private routeTable?: RouteTable;
  /** The running navigation's controller; undefined when none runs. */
  private pending?: AbortController;
  private failure?: { error: unknown };

  protected override onInitialized(): void {
    if (this.routes.length === 0) {
      // Fall back to the app-provided manifest (createTsazorApp `routes` option).
      const services = componentInternals.services(this) as ServiceProvider | null;
      const manifest = services?.tryGet(RouteManifest as unknown as Token<RouteManifest>);
      if (manifest) this.routes = manifest.entries;
    }
    this.unsubscribe = this.navigation.addLocationChanged(() => this.navigate());
    // Same-origin anchor clicks become SPA navigations from here on (Blazor
    // enables interception when the Router renders, too).
    this.navigation.enableNavigationInterception();
    this.navigate(true);
  }

  protected override onParametersSet(): void {
    // Blazor's RefreshRouteTable: sorts by precedence and throws for
    // ambiguous routes here (lifecycle), not on the first render.
    this.routeTable = getRouteTable(this.routes);
  }

  /**
   * Blazor's RunOnNavigateAsync: the hook (if any) and — Tsazor's lazy
   * routes — loading the matched page, then the page renders.
   */
  private navigate(initial = false): void {
    this.pending?.abort();
    this.pending = undefined;
    const handler = this.onNavigateAsync;
    const matched = getRouteTable(this.routes).match(this.navigation.baseRelativePath);
    const lazy = matched && isLazyRoute(matched.route) && !loadedRoutes.has(matched.route.load) ? matched.route : undefined;
    if (!handler && !lazy) {
      if (!initial) componentInternals.requestRender(this);
      return;
    }
    const controller = new AbortController();
    this.pending = controller;
    const context: NavigationContext = { path: this.navigation.baseRelativePath, signal: controller.signal };
    // Shows Navigating (or keeps the current output) meanwhile; the first
    // render follows initialization anyway. Without Navigating a held
    // navigation waits for it too; with it, the app shows its own waiting state.
    if (!initial) componentInternals.requestRender(this);
    const running = this.run(handler, lazy, context, controller);
    if (this.navigating === undefined) this.navigation.holdFor(running);
  }

  private async run(
    handler: Router["onNavigateAsync"],
    lazy: LazyRouteEntry | undefined,
    context: NavigationContext,
    controller: AbortController,
  ): Promise<void> {
    try {
      if (handler) await (handler instanceof EventCallback ? handler.invokeAsync(context) : handler(context));
      if (lazy && !controller.signal.aborted) await this.load(lazy);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (lazy && !loadedRoutes.has(lazy.load) && this.reloadOnce()) return;
      this.failure = { error };
    }
    // A superseded navigation renders nothing: the newer one does.
    if (this.pending !== controller) return;
    this.pending = undefined;
    componentInternals.requestRender(this);
  }

  /** Loads a lazy page once (shared by every Router and template of that page). */
  private async load(route: LazyRouteEntry): Promise<void> {
    let loading = loadingRoutes.get(route.load);
    if (!loading) {
      loading = route.load();
      loadingRoutes.set(route.load, loading);
      // A failed load may be retried by the next navigation.
      loading.catch(() => loadingRoutes.delete(route.load));
    }
    loadedRoutes.set(route.load, await loading);
    forgetReload(this.navigation.uri);
  }

  /**
   * A chunk that fails to load is usually a deploy: the running index.html
   * names hashes that are gone. Reload the target once — the new index.html
   * has the new ones; a second failure for the same URL is an error.
   */
  private reloadOnce(): boolean {
    const uri = this.navigation.uri;
    if (!markReload(uri)) return false;
    this.navigation.navigateTo(uri, { forceLoad: true, replaceHistoryEntry: true });
    return true;
  }

  /** The matched route as RouteData: a lazy entry resolved to its loaded page. */
  private routeDataFor(matched: RouteMatch): RouteData | undefined {
    if (!isLazyRoute(matched.route)) return { route: matched.route, values: matched.values };
    const loaded = loadedRoutes.get(matched.route.load);
    if (!loaded) return undefined;
    let resolved = resolvedRoutes.get(matched.route);
    if (!resolved) {
      resolved = { template: matched.route.template, type: loaded.type, ...(loaded.layout ? { layout: loaded.layout } : {}), ...(matched.route.authorize ? { authorize: matched.route.authorize } : {}) };
      resolvedRoutes.set(matched.route, resolved);
    }
    return { route: resolved, values: matched.values };
  }

  /** While a navigation runs without a Navigating fragment, the previous output stays (Blazor). */
  protected override shouldRender(): boolean {
    return this.pending === undefined || this.navigating !== undefined || this.failure !== undefined;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    if (this.failure) {
      const { error } = this.failure;
      this.failure = undefined;
      throw error;
    }
    if (this.pending) {
      if (this.navigating) b.addContent(2, this.navigating);
      return;
    }
    const matched = (this.routeTable ?? getRouteTable(this.routes)).match(this.navigation.baseRelativePath);
    if (matched) {
      const routeData = this.routeDataFor(matched);
      if (!routeData) {
        // Lazy and not loaded (the routes changed under the router): load it now.
        queueMicrotask(() => this.navigate());
        return;
      }
      const fragment = this.found?.(routeData);
      if (fragment) {
        b.addContent(0, fragment);
      }
    } else if (this.notFound) {
      b.addContent(1, this.notFound);
    }
  }

  /** Blazor resets the scroll position after a navigation renders — to the fragment's element, if any. */
  protected override onAfterRender(): void {
    if (this.pending) return; // the page is not shown yet
    const target = this.navigation.takeScrollTarget();
    if (target === undefined || typeof window === "undefined") return;
    if (!scrollToElement(target)) window.scrollTo?.(0, 0);
  }

  /** Stops listening to location changes and abandons a running navigation. */
  dispose(): void {
    this.unsubscribe?.();
    this.pending?.abort();
    this.pending = undefined;
  }
}
