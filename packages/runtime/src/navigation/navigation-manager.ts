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

  constructor(private readonly historyApi?: History) {
    if (typeof window !== "undefined") {
      window.addEventListener("popstate", this.onPopState);
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

  /** Current absolute URI. */
  get uri(): string {
    if (typeof window !== "undefined") {
      return window.location.href;
    }
    return this.internalUri;
  }

  /**
   * Absolute URI of the app root, always ending with "/": the `<base href>`
   * up to its last slash, like Blazor. Without a `<base>` element the origin
   * root (Blazor would take the directory of the current document URL — Vite
   * apps usually have no `<base>`, and a deep link like /myorders/5 must not
   * become the base).
   */
  get baseUri(): string {
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

  /** Blazor's ToAbsoluteUri: resolves a (base-)relative URI against baseUri. */
  toAbsoluteUri(relativeUri: string): string {
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
    const perform = () => {
      const absolute = this.toAbsoluteUri(uri);
      if (!options.forceLoad && this.isWithinBaseUriSpace(absolute)) {
        this.performInternalNavigation(absolute, false, replaceEntry, state);
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
    if (!href || href.startsWith("#")) return;
    const absolute = this.toAbsoluteUri(href);
    if (!this.isWithinBaseUriSpace(absolute)) return;
    event.preventDefault();
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
    if (typeof window !== "undefined") {
      if (replace) {
        this.history.replaceState({ _index: this.currentHistoryIndex, userState: state } satisfies HistoryState, "", absolute);
      } else {
        this.currentHistoryIndex++;
        this.history.pushState({ _index: this.currentHistoryIndex, userState: state } satisfies HistoryState, "", absolute);
      }
    } else {
      this.internalUri = absolute;
    }
    this.notifyLocationChanged(absolute, isIntercepted, state);
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

  private onPopState = (event: PopStateEvent): void => {
    if (this.popStateCallback) {
      // Our own revert/re-apply (history.go) — not a user navigation.
      this.popStateCallback();
      return;
    }
    // event.state equals history.state at popstate (the latter also works for synthetic events).
    void this.handlePopState((event.state ?? this.history.state) as HistoryState | null);
  };

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
      this.history.replaceState({ _index: this.currentHistoryIndex } satisfies HistoryState, "", this.lastLocation);
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
