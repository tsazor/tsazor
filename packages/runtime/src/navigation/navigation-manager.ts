import { scrollToElement } from "./dom-wrapper.js";

/**
 * Blazor's NavigationManager: History-API based URL management with
 * LocationChanged notifications and location-changing handlers
 * (NavigationLock / RegisterLocationChangingHandler).
 *
 * Flow (Blazor WebAssembly):
 * - navigateTo: location-changing handlers run first (also for forceLoad and
 *   external URIs); if none prevents it, a URI inside the base URI space is
 *   pushed/replaced client-side and LocationChanged fires, anything else (or
 *   forceLoad) is a full page load.
 * - intercepted link clicks: handlers run (isNavigationIntercepted = true),
 *   then client-side navigation.
 * - popstate (back/forward): with handlers registered, the history move is
 *   reverted first, the handlers are asked, and only if none prevents it the
 *   move is re-applied; a cancelled back/forward leaves the old URL.
 * Without handlers every navigation completes synchronously.
 *
 * Routing modes: "history" (default) is Blazor's model — the route is the URL
 * path below the base URI. "hash" is a Tsazor extension (Blazor has no
 * counterpart) for hosting without a server-side index.html fallback (static
 * file hosting, iframe embeds): the route path and its query live in the
 * fragment (`page?q=1#/orders/5?tab=2`). The manager then works with a
 * *logical* URI — the fragment route mapped onto the base URI
 * (`http://host/app/orders/5?tab=2`) — so Router, NavLink matching and
 * SupplyParameterFromQuery behave exactly as in history mode. Only reading
 * the browser location and writing history entries translate between the
 * two; the real path and `location.search` are never touched.
 *
 * Scrolling (Blazor): after an internal navigation the Router scrolls to the
 * fragment's element (`orders#total`) or to the top; a link that only
 * changes the fragment of the current page just adds a history entry and
 * scrolls — no LocationChanging/LocationChanged.
 */
export class NavigationManager {
  private readonly locationChangedHandlers = new Set<(sender: NavigationManager, event: LocationChangedEventArgs) => void>();
  private readonly locationChangingHandlers = new Set<LocationChangingHandler>();
  /** Lock id → handler registration (setNavigationLock). */
  private readonly locks = new Map<string, { dispose(): void }>();
  /** Internal URI store for non-DOM environments (happy-dom tests have window). */
  private internalUri = "http://localhost/";
  /** Blazor's `_index` in history.state: position of the current entry. */
  private currentHistoryIndex = 0;
  /** Bumped per navigation; a pending one whose id is stale was superseded. */
  private navigationId = 0;
  private pendingController: AbortController | null = null;
  /** Set while reverting/re-applying a history move (popstate must not re-enter). */
  private popStateCallback: (() => void) | null = null;
  private disposed = false;
  /** Last location announced through LocationChanged (restore target for a cancelled popstate). */
  private lastLocation: string | undefined;

  private readonly historyApi: History | undefined;
  /** URI source when the document's location is not the route space (MemoryHistory). */
  private readonly uriSource: { readonly href: string } | undefined;
  /** Routing mode, fixed at construction ("history" = Blazor; "hash" = Tsazor extension). */
  readonly routingMode: RoutingMode;
  /** True while a popstate is being processed (hash mode: its hashchange twin is ignored). */
  private handlingPopState = false;
  /**
   * Where the Router scrolls after it rendered the next navigation: an element
   * id/name, "" for the top; undefined leaves the position alone (popstate:
   * the browser restores it).
   */
  private scrollTarget: string | undefined;

  /**
   * `new NavigationManager()` (history mode, window.history),
   * `new NavigationManager(historyApi)` (custom History, e.g. tests) or
   * `new NavigationManager({ mode: "hash", history })`. A MemoryHistory as
   * the history also becomes the URI source (`{ history, location }` for any
   * other History implementation with an href).
   */
  constructor(historyApiOrOptions?: History | NavigationManagerOptions) {
    const options: NavigationManagerOptions =
      historyApiOrOptions === undefined || isHistory(historyApiOrOptions) ? { history: historyApiOrOptions } : historyApiOrOptions;
    this.historyApi = options.history;
    // A MemoryHistory is both the history and the URI source (its href is the
    // current entry); an explicit `location` wins either way.
    this.uriSource = options.location ?? (isMemoryHistory(options.history) ? options.history : undefined);
    const mode = options.mode ?? "history";
    if (mode !== "history" && mode !== "hash") {
      throw new Error(`Unknown routing mode '${String(mode)}'. Expected "history" or "hash".`);
    }
    this.routingMode = mode;
    if (typeof window !== "undefined") {
      window.addEventListener("popstate", this.onPopState);
      if (this.isHashMode) window.addEventListener("hashchange", this.onHashChange);
      const state = this.history.state as HistoryState | null;
      if (typeof state?._index === "number") {
        this.currentHistoryIndex = state._index;
      } else if (state === null || state === undefined) {
        this.history.replaceState({ _index: 0 } satisfies HistoryState, "");
      }
    }
    this.lastLocation = this.uri;
  }

  private get history(): History {
    return this.historyApi ?? window.history;
  }

  private get isHashMode(): boolean {
    return this.routingMode === "hash";
  }

  /**
   * Current absolute URI. In hash mode the logical URI: the fragment route
   * (`#/orders/5?tab=2`) below baseUri; a fragment that does not start with
   * `#/` (or none) is the root route.
   */
  get uri(): string {
    const page = this.documentLocation;
    if (this.isHashMode && page) {
      return this.baseUri + (page.hash.startsWith("#/") ? page.hash.slice(2) : "");
    }
    if (this.uriSource) return this.uriSource.href;
    if (typeof window !== "undefined") return window.location.href;
    return this.internalUri;
  }

  /**
   * The document's URL, which hash mode reads its route from: the URI
   * source's (a MemoryHistory — the preview, tests) or the window's.
   */
  private get documentLocation(): { readonly origin: string; readonly pathname: string; readonly search: string; readonly hash: string } | undefined {
    if (this.uriSource) return new URL(this.uriSource.href);
    return typeof window !== "undefined" ? window.location : undefined;
  }

  /**
   * Absolute URI of the app root, always ending with "/": the `<base href>`
   * up to its last slash, like Blazor. Without a `<base>` element the origin
   * root (Blazor would take the directory of the current document URL — Vite
   * apps usually have no `<base>`, and a deep link like /myorders/5 must not
   * become the base).
   */
  get baseUri(): string {
    const page = this.documentLocation;
    if (this.isHashMode && page) {
      // Hash mode: the route space hangs off the document itself; <base href>
      // only affects asset resolution there.
      const { origin, pathname } = page;
      return `${origin}${pathname.slice(0, pathname.lastIndexOf("/") + 1)}`;
    }
    let base: string;
    if (typeof document !== "undefined" && document.querySelector("base[href]")) {
      base = document.baseURI;
    } else if (typeof window !== "undefined") {
      base = `${window.location.origin}/`;
    } else {
      base = this.internalUri;
    }
    return base.slice(0, base.lastIndexOf("/") + 1);
  }

  /**
   * Path (and query) relative to the app root. Tsazor convenience: a URI
   * outside the base falls back to its path below the origin instead of
   * throwing like toBaseRelativePath.
   */
  get baseRelativePath(): string {
    const uri = this.uri;
    const base = this.baseUri;
    if (uri.startsWith(base)) return uri.slice(base.length);
    if (`${uri}/` === base) return "";
    try {
      const url = new URL(uri);
      return `${url.pathname}${url.search}${url.hash}`.replace(/^\/+/, "");
    } catch {
      return uri;
    }
  }

  /**
   * Blazor's ToAbsoluteUri: resolves a (base-)relative URI against baseUri.
   * Hash mode additionally reads route forms: `#/orders` and root-relative
   * `/orders` are routes below the base, and a real URL of this document with
   * a `#/` fragment maps to its logical URI.
   */
  toAbsoluteUri(relativeUri: string): string {
    if (this.isHashMode) {
      const route = this.hashRouteOf(relativeUri);
      if (route !== undefined) return this.baseUri + route;
    }
    try {
      return new URL(relativeUri, this.baseUri).toString();
    } catch {
      return relativeUri;
    }
  }

  /** Former name of toAbsoluteUri (kept for existing callers). */
  toAbsolute(uri: string): string {
    return this.toAbsoluteUri(uri);
  }

  /**
   * The href to render for a link to `href` (NavLink uses it). History mode:
   * unchanged (Blazor renders the Href as written). Hash mode: targets inside
   * the base URI space become fragment links (`orders/5` ⇒ `#/orders/5`), so
   * they also work without interception (new tab, copied link); fragments
   * and external URLs stay as written.
   */
  toLinkHref(href: string): string {
    if (!this.isHashMode || href.startsWith("#")) return href;
    const absolute = this.toAbsoluteUri(href);
    return this.isWithinBaseUriSpace(absolute) ? `#/${this.relativeToBase(absolute)}` : href;
  }

  /**
   * Blazor's ToBaseRelativePath: the part of an absolute URI after baseUri.
   * Throws when the URI is not contained by the base URI.
   */
  toBaseRelativePath(uri: string): string {
    const base = this.baseUri;
    if (uri.startsWith(base)) return uri.slice(base.length);
    // The base URI without its trailing slash is the root itself.
    if (`${uri}/` === base) return "";
    throw new Error(`The URI '${uri}' is not contained by the base URI '${base}'.`);
  }

  /**
   * Navigates to a (base-relative or absolute) URI. Blazor overloads:
   * `navigateTo(uri, forceLoad?, replace?)` and `navigateTo(uri, options)`.
   * Registered location-changing handlers can cancel it; without handlers it
   * completes synchronously.
   */
  navigateTo(uri: string, forceLoadOrOptions?: boolean | NavigationOptions, replace?: boolean): void {
    const options: NavigationOptions =
      typeof forceLoadOrOptions === "object" ? forceLoadOrOptions : { forceLoad: forceLoadOrOptions ?? false, replace: replace ?? false };
    const replaceEntry = options.replaceHistoryEntry ?? options.replace ?? false;
    const state = options.historyEntryState;
    const target = this.toAbsoluteUri(uri);
    if (!options.forceLoad && this.isWithinBaseUriSpace(target) && this.isSamePageWithHash(target)) {
      this.scrollOnSamePage(target, replaceEntry, state);
      return;
    }
    const perform = () => {
      const absolute = this.toAbsoluteUri(uri);
      const withinBase = this.isWithinBaseUriSpace(absolute);
      if (!options.forceLoad && withinBase) {
        this.performInternalNavigation(absolute, false, replaceEntry, state);
      } else if (this.isHashMode && withinBase) {
        this.performHashReload(absolute, replaceEntry);
      } else {
        // External navigation keeps the supplied text (Blazor's performExternalNavigation).
        this.performExternalNavigation(this.isAbsolute(uri) ? uri : absolute, replaceEntry);
      }
    };
    this.runLocationChanging(this.toAbsoluteUri(uri), state, false, perform);
  }

  /** Blazor's LocationChanged. */
  addLocationChanged(handler: (sender: NavigationManager, event: LocationChangedEventArgs) => void): () => void {
    this.locationChangedHandlers.add(handler);
    return () => this.locationChangedHandlers.delete(handler);
  }

  /**
   * Blazor's RegisterLocationChangingHandler: the handler runs before each
   * internal navigation and may call `context.preventNavigation()`. Several
   * handlers run concurrently; one prevention cancels the navigation. A
   * throwing handler prevents it too (the error is logged).
   */
  registerLocationChangingHandler(handler: LocationChangingHandler): { dispose(): void } {
    this.locationChangingHandlers.add(handler);
    return {
      dispose: () => {
        this.locationChangingHandlers.delete(handler);
      },
    };
  }

  /**
   * Registers a navigation lock under an id (replacing an existing one with
   * that id). The callback returns whether the navigation may continue.
   * Thin wrapper over registerLocationChangingHandler.
   */
  setNavigationLock(lockId: string, callback: (uri: string, isIntercepted: boolean) => boolean | Promise<boolean>): void {
    this.locks.get(lockId)?.dispose();
    const registration = this.registerLocationChangingHandler(async (context) => {
      if (!(await callback(context.targetLocation, context.isNavigationIntercepted))) {
        context.preventNavigation();
      }
    });
    this.locks.set(lockId, registration);
  }

  /** Removes the navigation lock registered under `lockId`. */
  releaseNavigationLock(lockId: string): void {
    this.locks.get(lockId)?.dispose();
    this.locks.delete(lockId);
  }

  private interceptionEnabled = false;

  /**
   * Blazor's enableNavigationInterception: intercepts clicks on anchors
   * within the base URI space document-wide and turns them into SPA
   * navigations (pushState + LocationChanged) instead of full page loads.
   * Enabled by the Router.
   */
  enableNavigationInterception(): void {
    if (this.interceptionEnabled || this.disposed || typeof document === "undefined") return;
    this.interceptionEnabled = true;
    document.addEventListener("click", this.onDocumentClick);
    // A deep link with a fragment: the element exists only once the Router rendered.
    if (!this.isHashMode) this.scrollTarget = fragmentOf(this.uri) || undefined;
  }

  /**
   * @internal Taken by the Router after it rendered: the element to scroll
   * to ("" = the top), undefined when the render was no navigation.
   */
  takeScrollTarget(): string | undefined {
    const target = this.scrollTarget;
    this.scrollTarget = undefined;
    return target;
  }

  /** Blazor's isSamePageWithHash: the target differs from the current URI only in its fragment. */
  private isSamePageWithHash(absolute: string): boolean {
    if (this.isHashMode) return false;
    const hashIndex = absolute.indexOf("#");
    return hashIndex > -1 && withoutFragment(this.uri) === absolute.slice(0, hashIndex);
  }

  /**
   * Blazor's performScrollToElementOnTheSamePage: a history entry and a
   * scroll, no LocationChanging/LocationChanged (the page stays as it is).
   */
  private scrollOnSamePage(absolute: string, replace: boolean, state: string | undefined): void {
    this.saveToHistory(absolute, replace, state);
    if (typeof document !== "undefined") scrollToElement(fragmentOf(absolute));
  }

  private onDocumentClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
      return;
    }
    const anchor = (event.target as Element | null)?.closest?.("a") as HTMLAnchorElement | null;
    if (!anchor) return;
    const target = anchor.getAttribute("target");
    if (target && target !== "_self") return;
    if (anchor.hasAttribute("download")) return;
    if (anchor.getAttribute("rel")?.split(/\s+/).includes("external")) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    if (this.isHashMode) {
      // Hash mode intercepts route fragments only; other hrefs are real
      // document navigations (the route space is the fragment).
      if (!href.startsWith("#/")) return;
    } else if (href.startsWith("#")) {
      return;
    }
    const absolute = this.toAbsoluteUri(href);
    if (!this.isWithinBaseUriSpace(absolute)) return;
    event.preventDefault();
    if (this.isSamePageWithHash(absolute)) {
      this.scrollOnSamePage(absolute, false, undefined);
      return;
    }
    this.runLocationChanging(absolute, undefined, true, () => this.performInternalNavigation(absolute, true, false, undefined));
  };

  /** Blazor's isWithinBaseUriSpace: same origin and below the base path. */
  private isWithinBaseUriSpace(absolute: string): boolean {
    const base = this.baseUri.replace(/\/$/, "");
    const next = absolute.charAt(base.length);
    return absolute.startsWith(base) && (next === "" || next === "/" || next === "?" || next === "#");
  }

  private isAbsolute(uri: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith("//");
  }

  /** Removes the document-level click listener and the popstate listener; pending navigations are dropped. */
  dispose(): void {
    this.disposed = true;
    this.navigationId++;
    this.pendingController?.abort();
    this.pendingController = null;
    if (this.interceptionEnabled) {
      document.removeEventListener("click", this.onDocumentClick);
      this.interceptionEnabled = false;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("popstate", this.onPopState);
      window.removeEventListener("hashchange", this.onHashChange);
    }
  }

  /**
   * Runs the location-changing handlers, then `proceed` unless one prevented
   * the navigation or a newer navigation superseded this one (Blazor cancels
   * the previous LocationChangingContext). Synchronous without handlers.
   */
  private runLocationChanging(targetLocation: string, historyEntryState: string | undefined, isNavigationIntercepted: boolean, proceed: () => void): void {
    const id = ++this.navigationId;
    this.pendingController?.abort();
    this.pendingController = null;
    if (this.locationChangingHandlers.size === 0) {
      proceed();
      return;
    }
    void this.notifyLocationChanging(targetLocation, historyEntryState, isNavigationIntercepted).then((shouldContinue) => {
      if (shouldContinue && id === this.navigationId && !this.disposed) proceed();
    });
  }

  /** Blazor's NotifyLocationChangingAsync: true when no handler prevented the navigation. */
  private async notifyLocationChanging(targetLocation: string, historyEntryState: string | undefined, isNavigationIntercepted: boolean): Promise<boolean> {
    if (this.locationChangingHandlers.size === 0) return true;
    const controller = new AbortController();
    this.pendingController = controller;
    let prevented = false;
    const context: LocationChangingContext = {
      targetLocation,
      historyEntryState,
      isNavigationIntercepted,
      signal: controller.signal,
      preventNavigation: () => {
        prevented = true;
        // One prevention is final: signal the other handlers.
        controller.abort();
      },
    };
    try {
      await Promise.all([...this.locationChangingHandlers].map(async (handler) => handler(context)));
    } catch (error) {
      // After a prevention, other handlers may reject on the aborted signal — not an error.
      if (!prevented) {
        // eslint-disable-next-line no-console
        console.error("[tsazor] A location-changing handler threw; the navigation was cancelled:", error);
      }
      prevented = true;
    }
    if (this.pendingController === controller) this.pendingController = null;
    // Superseded by a newer navigation ⇒ this one does not continue.
    return !prevented && !controller.signal.aborted;
  }

  private performInternalNavigation(absolute: string, isIntercepted: boolean, replace: boolean, state: string | undefined): void {
    this.saveToHistory(absolute, replace, state);
    // Blazor's resetScrollAfterNextBatch — to the fragment's element, if any.
    if (typeof window !== "undefined") this.scrollTarget = this.isHashMode ? "" : fragmentOf(absolute);
    this.notifyLocationChanged(absolute, isIntercepted, state);
  }

  private saveToHistory(absolute: string, replace: boolean, state: string | undefined): void {
    if (typeof window !== "undefined") {
      const url = this.toBrowserUrl(absolute);
      if (replace) {
        this.history.replaceState({ _index: this.currentHistoryIndex, userState: state } satisfies HistoryState, "", url);
      } else {
        this.currentHistoryIndex++;
        this.history.pushState({ _index: this.currentHistoryIndex, userState: state } satisfies HistoryState, "", url);
      }
    } else {
      this.internalUri = absolute;
    }
  }

  private performExternalNavigation(uri: string, replace: boolean): void {
    if (typeof window === "undefined") {
      this.internalUri = uri;
      this.notifyLocationChanged(uri, false, undefined);
      return;
    }
    if (window.location.href === uri) {
      // Same URL: browsers ignore the assignment, so force a reload (Blazor's trick).
      this.history.replaceState(null, "", `${uri}?`);
      window.location.replace(uri);
    } else if (replace) {
      window.location.replace(uri);
    } else {
      window.location.href = uri;
    }
  }

  /**
   * Hash mode, forceLoad inside the base URI space: a fragment-only change
   * never reloads, so write the entry and reload explicitly.
   */
  private performHashReload(absolute: string, replace: boolean): void {
    if (typeof window === "undefined") {
      this.internalUri = absolute;
      this.notifyLocationChanged(absolute, false, undefined);
      return;
    }
    const url = this.toBrowserUrl(absolute);
    if (replace) {
      this.history.replaceState({ _index: this.currentHistoryIndex } satisfies HistoryState, "", url);
    } else {
      this.currentHistoryIndex++;
      this.history.pushState({ _index: this.currentHistoryIndex } satisfies HistoryState, "", url);
    }
    window.location.reload();
  }

  /**
   * The browser URL for a logical URI: unchanged in history mode; in hash
   * mode the current document (path + search untouched) with the route as
   * its `#/` fragment.
   */
  private toBrowserUrl(absolute: string): string {
    const page = this.documentLocation;
    if (!this.isHashMode || !page) return absolute;
    return `${page.pathname}${page.search}#/${this.relativeToBase(absolute)}`;
  }

  /** The base-relative part of a URI inside the base URI space ("" for the base itself). */
  private relativeToBase(absolute: string): string {
    const base = this.baseUri;
    if (absolute.startsWith(base)) return absolute.slice(base.length);
    // The base without its trailing slash, or base + "?query"/"#hash".
    return absolute.slice(base.length - 1);
  }

  /**
   * Hash mode: the route a URI names, or undefined for a plain (base-relative
   * or foreign absolute) URI. `#/x` / `#x` ⇒ `x`; root-relative `/x` ⇒ `x`
   * (the pathname has no route meaning here); a URL of this document with a
   * `#/` fragment ⇒ its fragment route.
   */
  private hashRouteOf(uri: string): string | undefined {
    if (uri.startsWith("#")) return uri.slice(1).replace(/^\//, "");
    if (uri.startsWith("/") && !uri.startsWith("//")) return uri.slice(1);
    const page = this.documentLocation;
    if (!page || !this.isAbsolute(uri)) return undefined;
    try {
      const url = new URL(uri);
      if (url.origin === page.origin && url.pathname === page.pathname && url.hash.startsWith("#/")) {
        return url.hash.slice(2);
      }
    } catch {
      // Not parsable: resolved as a plain URI.
    }
    return undefined;
  }

  private onPopState = (event: PopStateEvent): void => {
    if (this.popStateCallback) {
      // Our own revert/re-apply (history.go) — not a user navigation.
      this.popStateCallback();
      return;
    }
    // event.state equals history.state at popstate (the latter also works for synthetic events).
    void this.trackPopState((event.state ?? this.history.state) as HistoryState | null);
  };

  /**
   * Hash mode: a fragment change announced only through hashchange (a typed
   * URL, `location.hash = …`, an environment without popstate for fragment
   * navigations) is handled like a back/forward move. Browsers that fire
   * popstate for fragment navigations too make the hashchange twin find the
   * location already announced (or a popstate still in progress).
   */
  private onHashChange = (): void => {
    if (this.popStateCallback || this.handlingPopState || this.uri === this.lastLocation) return;
    void this.trackPopState(this.history.state as HistoryState | null);
  };

  private async trackPopState(state: HistoryState | null): Promise<void> {
    this.handlingPopState = true;
    try {
      await this.handlePopState(state);
    } finally {
      this.handlingPopState = false;
    }
  }

  private async handlePopState(state: HistoryState | null): Promise<void> {
    const uri = this.uri;
    const index = typeof state?._index === "number" ? state._index : undefined;
    const userState = state?.userState;
    if (this.locationChangingHandlers.size > 0) {
      const id = ++this.navigationId;
      this.pendingController?.abort();
      const previousIndex = this.currentHistoryIndex;
      const delta = index === undefined ? 0 : index - previousIndex;
      if (delta !== 0) {
        // Temporarily revert the back/forward move until the handlers agree.
        await this.navigateHistoryWithoutPopStateCallback(-delta);
      }
      const shouldContinue = await this.notifyLocationChanging(uri, userState, false);
      if (!shouldContinue || id !== this.navigationId || this.disposed) {
        if (delta === 0 && !this.disposed && id === this.navigationId) {
          // No history index to revert with (entry not created by us): restore
          // the old URL on the current entry instead.
          this.restoreLocation();
        }
        return;
      }
      if (delta !== 0) await this.navigateHistoryWithoutPopStateCallback(delta);
    }
    if (index !== undefined) this.currentHistoryIndex = index;
    this.notifyLocationChanged(this.uri, false, userState);
  }

  /** Blazor's navigateHistoryWithoutPopStateCallback: history.go(delta), resolved on its popstate. */
  private navigateHistoryWithoutPopStateCallback(delta: number): Promise<void> {
    return new Promise((resolve) => {
      this.popStateCallback = () => {
        this.popStateCallback = null;
        resolve();
      };
      this.history.go(delta);
    });
  }

  private restoreLocation(): void {
    if (this.lastLocation && this.lastLocation !== this.uri) {
      this.history.replaceState({ _index: this.currentHistoryIndex } satisfies HistoryState, "", this.toBrowserUrl(this.lastLocation));
    }
  }

  private notifyLocationChanged(uri: string, isIntercepted: boolean, historyEntryState: string | undefined): void {
    this.lastLocation = uri;
    const event: LocationChangedEventArgs = { location: uri, isNavigationIntercepted: isIntercepted, isIntercepted, historyEntryState };
    for (const handler of [...this.locationChangedHandlers]) {
      handler(this, event);
    }
  }
}

/**
 * Routing mode. "history" (default): Blazor's model, the route is the URL
 * path. "hash" (Tsazor extension): the route and its query live in the
 * fragment (`#/orders/5?tab=2`) — for hosting without an index.html fallback.
 */
export type RoutingMode = "history" | "hash";

/** Options of `new NavigationManager({ … })`. */
export interface NavigationManagerOptions {
  /** Routing mode (default "history"). */
  readonly mode?: RoutingMode;
  /** History implementation (default window.history; tests pass a fake). */
  readonly history?: History;
  /**
   * URI source instead of `window.location.href` — for documents whose
   * location is not the route space (a srcdoc preview is `about:srcdoc`).
   * A MemoryHistory passed as `history` serves as the source by itself.
   */
  readonly location?: { readonly href: string };
}

function isHistory(value: History | NavigationManagerOptions): value is History {
  return typeof (value as History).pushState === "function";
}

/** The fragment without `#` ("" when there is none). */
function fragmentOf(uri: string): string {
  const hashIndex = uri.indexOf("#");
  return hashIndex < 0 ? "" : uri.slice(hashIndex + 1);
}

function withoutFragment(uri: string): string {
  const hashIndex = uri.indexOf("#");
  return hashIndex < 0 ? uri : uri.slice(0, hashIndex);
}

/** A MemoryHistory exposes its current URL (window.history does not — that is location's job). */
function isMemoryHistory(history: History | undefined): history is History & { readonly href: string } {
  return history !== undefined && typeof (history as { href?: unknown }).href === "string";
}

/** Blazor's NavigationOptions (plus `replace`, the former Tsazor spelling of ReplaceHistoryEntry). */
export interface NavigationOptions {
  /** Bypass client-side routing: full page load. */
  readonly forceLoad?: boolean;
  /** Replace the current history entry instead of pushing a new one. */
  readonly replaceHistoryEntry?: boolean;
  /** Alias of replaceHistoryEntry. */
  readonly replace?: boolean;
  /** State stored with the history entry (LocationChangedEventArgs.historyEntryState). */
  readonly historyEntryState?: string;
}

/** Blazor's LocationChangingContext. */
export interface LocationChangingContext {
  /** Absolute target URI. */
  readonly targetLocation: string;
  readonly historyEntryState: string | undefined;
  /** True for an intercepted link click. */
  readonly isNavigationIntercepted: boolean;
  /** Aborted when the navigation was prevented or superseded (Blazor's CancellationToken). */
  readonly signal: AbortSignal;
  /** Cancels the navigation. */
  preventNavigation(): void;
}

export type LocationChangingHandler = (context: LocationChangingContext) => void | Promise<void>;

export interface LocationChangedEventArgs {
  readonly location: string;
  /** Blazor's IsNavigationIntercepted: true for an intercepted link click. */
  readonly isNavigationIntercepted: boolean;
  /** Former Tsazor name of isNavigationIntercepted. */
  readonly isIntercepted: boolean;
  readonly historyEntryState?: string;
}

interface HistoryState {
  _index: number;
  userState?: string;
}
