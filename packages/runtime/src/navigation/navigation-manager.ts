/**
 * Blazor's NavigationManager: History-API based URL management with
 * LocationChanged notifications and navigation locks.
 */
export class NavigationManager {
  private readonly locationChangedHandlers = new Set<(sender: NavigationManager, event: LocationChangedEventArgs) => void>();
  /** Internal URI store for non-DOM environments (happy-dom tests have window). */
  private internalUri = "http://localhost/";
  private baseUriValue = "";

  constructor(private readonly historyApi?: History) {
    if (typeof window !== "undefined") {
      window.addEventListener("popstate", this.onPopState);
      this.baseUriValue = `${location.origin}/`;
    }
  }

  /** Current absolute URI. */
  get uri(): string {
    if (typeof window !== "undefined") {
      return window.location.href;
    }
    return this.internalUri;
  }

  /** Absolute URI of the app root. */
  get baseUri(): string {
    return this.baseUriValue;
  }

  /** Path (and query) relative to the app root. */
  get baseRelativePath(): string {
    const uri = this.uri;
    const base = this.baseUriValue;
    if (base && uri.startsWith(base)) {
      return uri.slice(base.length) || "";
    }
    return uri;
  }

  /** Navigates to a URI, updating history and notifying LocationChanged. */
  navigateTo(uri: string, options?: { forceLoad?: boolean; replace?: boolean }): void {
    const absolute = this.toAbsolute(uri);
    if (options?.forceLoad && typeof window !== "undefined") {
      window.location.href = absolute;
      return;
    }
    if (typeof window !== "undefined") {
      if (options?.replace) {
        (this.historyApi ?? window.history).replaceState(null, "", absolute);
      } else {
        (this.historyApi ?? window.history).pushState(null, "", absolute);
      }
    } else {
      this.internalUri = absolute;
    }
    this.notifyLocationChanged(absolute, false);
  }

  /** Blazor's LocationChanged. */
  addLocationChanged(handler: (sender: NavigationManager, event: LocationChangedEventArgs) => void): () => void {
    this.locationChangedHandlers.add(handler);
    return () => this.locationChangedHandlers.delete(handler);
  }

  /** Registers a navigation lock (Blazor's NavigationLock contract). */
  setNavigationLock(_lockId: string, callback: (uri: string, isIntercepted: boolean) => Promise<boolean>): void {
    this.navigationLock = callback;
  }

  /** Releases the lock, optionally confirming the pending navigation. */
  releaseNavigationLock(_lockId: string, result: boolean): void {
    const callback = this.navigationLock;
    this.navigationLock = null;
    if (callback && result) {
      this.notifyLocationChanged(this.uri, false);
    }
  }

  /** Resolves a possibly relative URI against the base. */
  toAbsolute(uri: string): string {
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith("//")) {
      return uri;
    }
    if (typeof window !== "undefined") {
      return new URL(uri, window.location.origin).toString();
    }
    return uri.startsWith("/") ? uri : `/${uri}`;
  }

  private navigationLock: ((uri: string, isIntercepted: boolean) => Promise<boolean>) | null = null;
  private interceptionEnabled = false;

  /**
   * Blazor's enableNavigationInterception: intercepts clicks on same-origin
   * anchors document-wide and turns them into SPA navigations (pushState +
   * LocationChanged) instead of full page loads. Enabled by the Router.
   */
  enableNavigationInterception(): void {
    if (this.interceptionEnabled || typeof document === "undefined") return;
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
    const absolute = this.toAbsolute(href);
    if (!/^https?:/i.test(absolute)) return;
    if (typeof location !== "undefined" && !this.isSameOrigin(absolute)) return;
    event.preventDefault();
    this.navigateTo(absolute);
  };

  private isSameOrigin(absolute: string): boolean {
    try {
      return new URL(absolute).origin === window.location.origin;
    } catch {
      return false;
    }
  }

  /** Removes the document-level click listener and the popstate listener. */
  dispose(): void {
    if (this.interceptionEnabled) {
      document.removeEventListener("click", this.onDocumentClick);
      this.interceptionEnabled = false;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("popstate", this.onPopState);
    }
  }

  private onPopState = (): void => {
    this.notifyLocationChanged(this.uri, true);
  };

  private notifyLocationChanged(uri: string, isIntercepted: boolean): void {
    const event: LocationChangedEventArgs = { location: uri, isIntercepted };
    for (const handler of [...this.locationChangedHandlers]) {
      handler(this, event);
    }
  }
}

export interface LocationChangedEventArgs {
  readonly location: string;
  readonly isIntercepted: boolean;
}