/**
 * An in-memory History implementation for documents that have no usable
 * history API — sandboxed iframes (srcdoc/opaque origin: pushState throws)
 * and headless tests. Usable like window.history:
 *
 *   const history = new MemoryHistory("http://localhost/");
 *   const navigation = new NavigationManager({ history, location: history });
 *
 * A MemoryHistory passed as a NavigationManager's `history` also serves as
 * its URI source (its `href` is the current entry's URL), so the manager
 * never reads `window.location` — the whole route space lives here.
 *
 * `go`/`back`/`forward` dispatch a real `popstate` event on `window`, so
 * back/forward runs through the manager's normal popstate handling
 * (navigation locks, LocationChanged) — nothing is short-circuited.
 */
export class MemoryHistory implements History {
  private entries: { url: string; state: unknown }[];
  private index = 0;

  /** @param initialUrl The document's URL — the app root (createTsazorApp's baseUri). */
  constructor(initialUrl = "http://localhost/") {
    this.entries = [{ url: initialUrl, state: null }];
  }

  /** The current entry's URL — the URI a NavigationManager over this history reports. */
  get href(): string {
    return this.entries[this.index]!.url;
  }

  get length(): number {
    return this.entries.length;
  }

  get state(): unknown {
    return this.entries[this.index]!.state;
  }

  get scrollRestoration(): ScrollRestoration {
    return "auto";
  }

  set scrollRestoration(_value: ScrollRestoration) {
    // In memory there is nothing to restore.
  }

  pushState(data: unknown, _unused: string, url?: string | URL | null): void {
    this.truncate();
    this.entries.push({ url: this.resolve(url), state: data });
    this.index++;
  }

  replaceState(data: unknown, _unused: string, url?: string | URL | null): void {
    this.entries[this.index] = { url: this.resolve(url), state: data };
  }

  go(delta = 0): void {
    // A browser reloads on go(0); in memory there is nothing to reload.
    if (delta === 0) return;
    const target = this.index + delta;
    if (target < 0 || target >= this.entries.length) return;
    this.index = target;
    this.dispatchPopState();
  }

  back(): void {
    this.go(-1);
  }

  forward(): void {
    this.go(1);
  }

  /** URL for a state change: "" keeps the current URL; others resolve against it, like the browser. */
  private resolve(url: string | URL | null | undefined): string {
    if (url === null || url === undefined || url === "") return this.href;
    try {
      return new URL(String(url), this.href).toString();
    } catch {
      return String(url);
    }
  }

  /** Everything after the current entry is dropped, like a browser push. */
  private truncate(): void {
    if (this.index < this.entries.length - 1) this.entries = this.entries.slice(0, this.index + 1);
  }

  private dispatchPopState(): void {
    if (typeof window === "undefined" || typeof PopStateEvent === "undefined") return;
    const state = this.state;
    const event = new PopStateEvent("popstate", { state });
    // Some environments (happy-dom) drop the constructor's state: put it back.
    if ((event as { state?: unknown }).state !== state) {
      try {
        Object.defineProperty(event, "state", { value: state });
      } catch {
        // The listener can fall back to history.state (NavigationManager does).
      }
    }
    window.dispatchEvent(event);
  }
}