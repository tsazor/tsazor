/**
 * Hash routing — a Tsazor extension (Blazor has no counterpart): with
 * `createTsazorApp({ routing: { mode: "hash" } })` the route path and its
 * query live in the URL fragment (`#/items/7?tab=2`), for hosting without an
 * index.html fallback. The NavigationManager exposes a *logical* URI (the
 * fragment route below the base URI), so Router, @page templates and
 * constraints, NavLink, SupplyParameterFromQuery and FocusOnNavigate behave
 * as in history mode; the real path and `location.search` stay untouched.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileFiles } from "../harness.js";
import {
  createTsazorApp,
  NavigationManager,
  type LocationChangedEventArgs,
  type RouteEntry,
} from "@tsazor/runtime";
import { rendererOf } from "@tsazor/runtime/internal";

const tick = () => new Promise((r) => setTimeout(r, 0));
const settleFor = async (app: { renderer: { waitUntilIdle(): Promise<void> } }) => {
  for (let i = 0; i < 3; i++) {
    await tick();
    await rendererOf(app).waitUntilIdle();
  }
};

/** Clicks an anchor; reports whether the app's interception prevented the default action. */
function clickPreventedByApp(anchor: HTMLAnchorElement): boolean {
  let prevented = false;
  const probe = (e: Event) => {
    prevented = e.defaultPrevented;
    e.preventDefault();
  };
  window.addEventListener("click", probe);
  anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  window.removeEventListener("click", probe);
  return prevented;
}

/** Session history for happy-dom (its go() does not traverse same-document entries). */
class TestHistory {
  private readonly entries: { state: unknown; url: string }[] = [{ state: history.state, url: location.href }];
  private index = 0;
  get state(): unknown {
    return this.entries[this.index]!.state;
  }
  get length(): number {
    return this.entries.length;
  }
  pushState(state: unknown, unused: string, url?: string): void {
    history.pushState(state, unused, url);
    this.entries.splice(this.index + 1);
    this.entries.push({ state: history.state, url: location.href });
    this.index++;
  }
  replaceState(state: unknown, unused: string, url?: string): void {
    history.replaceState(state, unused, url);
    this.entries[this.index] = { state: history.state, url: location.href };
  }
  go(delta: number): void {
    setTimeout(() => {
      this.index += delta;
      const entry = this.entries[this.index]!;
      history.replaceState(entry.state, "", entry.url);
      // Browsers fire popstate and then hashchange for a fragment traversal.
      window.dispatchEvent(new PopStateEvent("popstate", { state: entry.state }));
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
  }
  back(): void {
    this.go(-1);
  }
  forward(): void {
    this.go(1);
  }
}

const APP = `@import { Router, RouteView, FocusOnNavigate } from "@tsazor/runtime"
<Router>
    <Found Context="routeData">
        <RouteView RouteData="@routeData" />
        <FocusOnNavigate RouteData="@routeData" Selector="h1" />
    </Found>
    <NotFound>
        <p class="not-found">Not found</p>
    </NotFound>
</Router>`;

const HOME = `@page "/"
@import { NavLink, NavLinkMatch } from "@tsazor/runtime"
<h1>Home</h1>
<nav>
    <NavLink Href="" Match="@NavLinkMatch.All">Home</NavLink>
    <NavLink Href="items/7">Item seven</NavLink>
    <NavLink Href="/items">Items</NavLink>
    <NavLink Href="https://elsewhere.example/docs">External</NavLink>
</nav>
<a class="plain" href="#/items/8">plain route link</a>
<a class="document" href="other.html">document link</a>`;

const ITEM = `@page "/items/{id:int}"
@import { SupplyParameterFromQuery } from "@tsazor/runtime"
<h1>Item @id</h1>
<p class="tab">@(tab ?? "none")</p>
@code {
    @Parameter() id = 0;
    @Parameter() @SupplyParameterFromQuery() tab: string | null = null;
}`;

const ITEMS = `@page "/items"
@import { NavLink } from "@tsazor/runtime"
<h1>Items</h1>
<NavLink Href="items/7">Item seven</NavLink>`;

interface Booted {
  app: ReturnType<typeof createTsazorApp>;
  nav: NavigationManager;
  root: HTMLElement;
  events: LocationChangedEventArgs[];
}

const apps: ReturnType<typeof createTsazorApp>[] = [];
const extraManagers: NavigationManager[] = [];

afterEach(() => {
  for (const app of apps.splice(0)) app.dispose();
  for (const nav of extraManagers.splice(0)) nav.dispose();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

let compiled: Promise<{ App: unknown; routes: RouteEntry[] }> | undefined;
/** Compiles the app once (the modules are immutable across tests). */
function compileApp(): Promise<{ App: unknown; routes: RouteEntry[] }> {
  compiled ??= (async () => {
    const files = { "App.tsazor": APP, "Home.tsazor": HOME, "Item.tsazor": ITEM, "Items.tsazor": ITEMS };
    const result = await compileFiles(files);
    for (const name of Object.keys(files)) {
      expect(result.diagnostics[name]!.filter((d) => d.severity === "error")).toEqual([]);
    }
    const load = async (name: string) =>
      (await import(/* @vite-ignore */ result.modules[name]!)) as { default: unknown; routeTemplate?: string };
    const App = (await load("App.tsazor")).default;
    const routes: RouteEntry[] = [];
    for (const name of ["Home.tsazor", "Item.tsazor", "Items.tsazor"]) {
      const module = await load(name);
      routes.push({ template: module.routeTemplate!, type: module.default as RouteEntry["type"] });
    }
    return { App, routes };
  })();
  return compiled;
}

async function boot(initialUrl: string, navigationManager?: NavigationManager): Promise<Booted> {
  history.replaceState(null, "", initialUrl);
  const { App, routes } = await compileApp();
  const root = document.createElement("div");
  root.id = "app";
  document.body.appendChild(root);
  const app = createTsazorApp({
    root: App as never,
    routes,
    ...(navigationManager ? { navigationManager } : { routing: { mode: "hash" } }),
  });
  apps.push(app);
  const events: LocationChangedEventArgs[] = [];
  app.navigationManager.addLocationChanged((_, e) => events.push(e));
  await settleFor(app);
  return { app, nav: app.navigationManager, root, events };
}

const heading = (root: HTMLElement) => root.querySelector("h1")?.textContent ?? root.querySelector(".not-found")?.textContent;

describe("hash routing — matching and the logical URI", () => {
  it("routes by the fragment; uri, baseUri and toBaseRelativePath are logical; location.search is untouched", async () => {
    const { nav, root } = await boot("/app/index.html?token=abc#/items/7?tab=2");
    const origin = location.origin;
    expect(nav.routingMode).toBe("hash");
    expect(heading(root)).toBe("Item 7");
    expect(root.querySelector(".tab")?.textContent).toBe("2");
    expect(nav.baseUri).toBe(`${origin}/app/`);
    expect(nav.uri).toBe(`${origin}/app/items/7?tab=2`);
    expect(nav.baseRelativePath).toBe("items/7?tab=2");
    expect(nav.toBaseRelativePath(nav.uri)).toBe("items/7?tab=2");
    expect(location.search).toBe("?token=abc");
  });

  it("a missing fragment or one without '#/' is the root route", async () => {
    const { nav, root } = await boot("/app/index.html?token=abc");
    expect(heading(root)).toBe("Home");
    expect(nav.uri).toBe(`${location.origin}/app/`);
    history.replaceState(history.state, "", "/app/index.html?token=abc#section");
    expect(nav.uri).toBe(`${location.origin}/app/`);
  });

  it("route constraints apply to the fragment path; unmatched routes render NotFound", async () => {
    const { nav, root, app } = await boot("/app/index.html#/items/abc");
    expect(heading(root)).toBe("Not found");
    nav.navigateTo("items/12");
    await settleFor(app);
    expect(heading(root)).toBe("Item 12");
    nav.navigateTo("nowhere/at/all");
    await settleFor(app);
    expect(heading(root)).toBe("Not found");
  });

  it("toAbsoluteUri reads relative, root-relative, fragment and real-document forms", async () => {
    const { nav } = await boot("/app/index.html?token=abc#/");
    const base = `${location.origin}/app/`;
    expect(nav.toAbsoluteUri("items/1")).toBe(`${base}items/1`);
    expect(nav.toAbsoluteUri("/items/1")).toBe(`${base}items/1`);
    expect(nav.toAbsoluteUri("#/items/1?tab=a")).toBe(`${base}items/1?tab=a`);
    expect(nav.toAbsoluteUri(`${location.origin}/app/index.html?token=abc#/items/1`)).toBe(`${base}items/1`);
    expect(nav.toAbsoluteUri("https://elsewhere.example/x")).toBe("https://elsewhere.example/x");
  });
});

describe("hash routing — navigateTo", () => {
  it("pushes a fragment entry, keeps path and search, fires LocationChanged with the logical URI", async () => {
    const { nav, root, app, events } = await boot("/app/index.html?token=abc#/");
    const length = history.length;
    nav.navigateTo("items/9?tab=x");
    await settleFor(app);
    expect(location.pathname).toBe("/app/index.html");
    expect(location.search).toBe("?token=abc");
    expect(location.hash).toBe("#/items/9?tab=x");
    expect(history.length).toBe(length + 1);
    expect(heading(root)).toBe("Item 9");
    expect(root.querySelector(".tab")?.textContent).toBe("x");
    expect(events.map((e) => [e.location, e.isNavigationIntercepted])).toEqual([[`${location.origin}/app/items/9?tab=x`, false]]);
  });

  it("replace keeps the history length; root-relative and fragment targets are routes", async () => {
    const { nav, root, app } = await boot("/app/index.html?token=abc#/");
    const length = history.length;
    nav.navigateTo("/items", { replaceHistoryEntry: true });
    await settleFor(app);
    expect(history.length).toBe(length);
    expect(location.hash).toBe("#/items");
    expect(heading(root)).toBe("Items");
    nav.navigateTo("#/items/3", false, true);
    await settleFor(app);
    expect(history.length).toBe(length);
    expect(location.hash).toBe("#/items/3");
    expect(location.search).toBe("?token=abc");
    expect(heading(root)).toBe("Item 3");
  });

  it("forceLoad inside the base writes the fragment entry and reloads the document", async () => {
    const { nav, events } = await boot("/app/index.html?token=abc#/");
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => undefined);
    nav.navigateTo("items/4", true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(location.hash).toBe("#/items/4");
    expect(location.search).toBe("?token=abc");
    expect(events).toEqual([]);
  });

  it("a navigation lock cancels a hash navigation", async () => {
    const { nav, app, root } = await boot("/app/index.html?token=abc#/items/1");
    const asked: string[] = [];
    nav.setNavigationLock("lock", (uri) => {
      asked.push(uri);
      return false;
    });
    nav.navigateTo("items/2");
    await settleFor(app);
    expect(asked).toEqual([`${location.origin}/app/items/2`]);
    expect(location.hash).toBe("#/items/1");
    expect(heading(root)).toBe("Item 1");
  });
});

describe("hash routing — links", () => {
  it("NavLink renders fragment hrefs and matches the logical URI", async () => {
    const { nav, root, app } = await boot("/app/index.html?token=abc#/");
    const links = () => [...root.querySelectorAll("nav a")].map((a) => [a.textContent, a.getAttribute("href"), a.classList.contains("active")]);
    expect(links()).toEqual([
      ["Home", "#/", true],
      ["Item seven", "#/items/7", false],
      ["Items", "#/items", false],
      ["External", "https://elsewhere.example/docs", false],
    ]);
    nav.navigateTo("items");
    await settleFor(app);
    const link = root.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("#/items/7");
  });

  it("plain <a href=\"#/…\"> clicks are intercepted (pushState, LocationChanged intercepted); other hrefs are not", async () => {
    const { root, app, events } = await boot("/app/index.html?token=abc#/");
    expect(clickPreventedByApp(root.querySelector<HTMLAnchorElement>("a.plain")!)).toBe(true);
    await settleFor(app);
    expect(location.hash).toBe("#/items/8");
    expect(location.search).toBe("?token=abc");
    expect(heading(root)).toBe("Item 8");
    expect(events.map((e) => e.isNavigationIntercepted)).toEqual([true]);

    history.replaceState(history.state, "", "/app/index.html?token=abc#/");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await settleFor(app);
    expect(clickPreventedByApp(root.querySelector<HTMLAnchorElement>("a.document")!)).toBe(false);
  });

  it("a lock sees an intercepted fragment click and can cancel it", async () => {
    const { nav, root, app } = await boot("/app/index.html#/");
    const asked: { uri: string; intercepted: boolean }[] = [];
    nav.setNavigationLock("lock", (uri, intercepted) => {
      asked.push({ uri, intercepted });
      return false;
    });
    expect(clickPreventedByApp(root.querySelector<HTMLAnchorElement>("a.plain")!)).toBe(true);
    await settleFor(app);
    expect(asked).toEqual([{ uri: `${location.origin}/app/items/8`, intercepted: true }]);
    expect(location.hash).toBe("#/");
    expect(heading(root)).toBe("Home");
  });

  it("toLinkHref: unchanged in history mode; fragments for in-base targets in hash mode", () => {
    history.replaceState(null, "", "/app/index.html");
    const historyNav = new NavigationManager();
    const hashNav = new NavigationManager({ mode: "hash" });
    extraManagers.push(historyNav, hashNav);
    expect(["", "items/1", "/items", "#/x"].map((h) => historyNav.toLinkHref(h))).toEqual(["", "items/1", "/items", "#/x"]);
    expect(["", "items/1", "/items?q=1", "#/x", "https://elsewhere.example/"].map((h) => hashNav.toLinkHref(h))).toEqual([
      "#/",
      "#/items/1",
      "#/items?q=1",
      "#/x",
      "https://elsewhere.example/",
    ]);
  });
});

describe("hash routing — back/forward and hashchange", () => {
  it("back and forward re-render the fragment route (popstate + hashchange announce it once)", async () => {
    const testHistory = new TestHistory();
    const nav = new NavigationManager({ mode: "hash", history: testHistory as unknown as History });
    const { root, app, events } = await boot("/app/index.html?token=abc#/", nav);
    nav.navigateTo("items/1");
    nav.navigateTo("items/2");
    await settleFor(app);
    expect(heading(root)).toBe("Item 2");

    testHistory.back();
    await settleFor(app);
    expect(heading(root)).toBe("Item 1");
    expect(location.search).toBe("?token=abc");
    testHistory.forward();
    await settleFor(app);
    expect(heading(root)).toBe("Item 2");
    expect(events.map((e) => e.location.slice(location.origin.length))).toEqual([
      "/app/items/1",
      "/app/items/2",
      "/app/items/1",
      "/app/items/2",
    ]);
  });

  it("a hashchange alone (typed URL, location.hash = …) navigates", async () => {
    const { root, app, events } = await boot("/app/index.html?token=abc#/");
    history.replaceState(history.state, "", "/app/index.html?token=abc#/items/5?tab=t");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await settleFor(app);
    expect(heading(root)).toBe("Item 5");
    expect(root.querySelector(".tab")?.textContent).toBe("t");
    expect(events).toHaveLength(1);
    // The same location again (a late twin event) is not announced twice.
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await settleFor(app);
    expect(events).toHaveLength(1);
  });

  it("a lock cancels back/forward and restores the fragment", async () => {
    const testHistory = new TestHistory();
    const nav = new NavigationManager({ mode: "hash", history: testHistory as unknown as History });
    const { root, app, events } = await boot("/app/index.html?token=abc#/", nav);
    nav.navigateTo("items/1");
    nav.navigateTo("items/2");
    await settleFor(app);
    events.length = 0;
    nav.setNavigationLock("lock", () => false);
    testHistory.back();
    for (let i = 0; i < 4; i++) await settleFor(app);
    expect(location.hash).toBe("#/items/2");
    expect(location.search).toBe("?token=abc");
    expect(heading(root)).toBe("Item 2");
    expect(events).toEqual([]);
  });
});

describe("hash routing — page features", () => {
  it("SupplyParameterFromQuery reads the fragment's query, not location.search", async () => {
    const { root, nav, app } = await boot("/app/index.html?tab=fromSearch#/items/1");
    expect(root.querySelector(".tab")?.textContent).toBe("none");
    nav.navigateTo("items/1?tab=fromFragment");
    await settleFor(app);
    expect(root.querySelector(".tab")?.textContent).toBe("fromFragment");
  });

  it("FocusOnNavigate focuses the selector after a fragment navigation", async () => {
    const { nav, app, root } = await boot("/app/index.html#/");
    (document.activeElement as HTMLElement | null)?.blur();
    nav.navigateTo("items/6");
    await settleFor(app);
    expect(document.activeElement).toBe(root.querySelector("h1"));
  });
});

describe("hash routing — configuration", () => {
  it("createTsazorApp rejects a routing mode that conflicts with a shared NavigationManager", async () => {
    const { App, routes } = await compileApp();
    const root = document.createElement("div");
    root.id = "app";
    document.body.appendChild(root);
    const shared = new NavigationManager();
    extraManagers.push(shared);
    expect(() => createTsazorApp({ root: App as never, routes, navigationManager: shared, routing: { mode: "hash" } })).toThrow(
      /routing\.mode 'hash' conflicts with the shared NavigationManager's mode 'history'/,
    );
  });

  it("history stays the default; an unknown mode is an error", () => {
    const nav = new NavigationManager();
    extraManagers.push(nav);
    expect(nav.routingMode).toBe("history");
    expect(() => new NavigationManager({ mode: "fragment" as never })).toThrow(/Unknown routing mode 'fragment'/);
  });
});
