/**
 * Route matching and navigation vs. Blazor. Review §3: R14, R15, auth race.
 */
import { afterEach, describe, expect, it } from "vitest";
import { compileFiles } from "../harness.js";
import {
  ANONYMOUS,
  AuthenticationState,
  AuthenticationStateProvider,
  ComponentBase,
  createTsazorApp,
  createUser,
  defineComponent,
  matchRoute,
  NavigationManager,
  Renderer,
  Router,
  RouteView,
  ServiceCollection,
  watchAuthenticationState,
  type RenderTreeBuilder,
  type RouteData,
  type RouteEntry,
} from "@tsazor/runtime";

class PageA {}
class PageB {}
const routes = (...entries: [string, abstract new () => unknown][]): RouteEntry[] =>
  entries.map(([template, type]) => ({ template, type }));

/**
 * Clicks an anchor and reports whether document-level interception called
 * preventDefault. A window listener (runs after the document's) then
 * prevents the default action so happy-dom never leaves the page.
 */
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

/** Resolves after pending promise callbacks and a macrotask. */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("R14 — route precedence", () => {
  it("a literal segment beats a parameter regardless of manifest order", () => {
    const table = routes(["/users/{id}", PageA], ["/users/new", PageB]);
    expect(matchRoute(table, "/users/new")?.route.type).toBe(PageB);
  });

  it("a parameter still matches other values", () => {
    const table = routes(["/users/{id}", PageA], ["/users/new", PageB]);
    expect(matchRoute(table, "/users/42")?.route.type).toBe(PageA);
  });

  it("ambiguous routes are an error when the table is built", () => {
    const table = routes(["/users/{id}", PageA], ["/Users/{name}", PageB]);
    expect(() => matchRoute(table, "/users/1")).toThrow(/The following routes are ambiguous:\n'\/users\/\{id\}' in 'PageA'\n'\/Users\/\{name\}' in 'PageB'/);
  });
});

describe("R14 — constraints", () => {
  it("bool is anchored (no partial match)", () => {
    expect(matchRoute(routes(["/f/{b:bool}", PageA]), "/f/trueish")).toBeNull();
  });

  it("bool converts case-insensitively", () => {
    expect(matchRoute(routes(["/f/{b:bool}", PageA]), "/f/True")?.values.b).toBe(true);
  });

  it("optional parameters {id:int?}", () => {
    const table = routes(["/o/{id:int?}", PageA]);
    expect(matchRoute(table, "/o")).not.toBeNull();
    expect(matchRoute(table, "/o/5")?.values.id).toBe(5);
  });

  it("double rejects non-numbers", () => {
    expect(matchRoute(routes(["/d/{x:double}", PageA]), "/d/abc")).toBeNull();
  });

  it("int converts to a number", () => {
    expect(matchRoute(routes(["/n/{id:int}", PageA]), "/n/7")?.values.id).toBe(7);
  });

  it("long keeps values above 2^53 exact", () => {
    const table = routes(["/l/{id:long}", PageA]);
    expect(matchRoute(table, "/l/9007199254740993")?.values.id).toBe(9007199254740993n);
    expect(matchRoute(table, "/l/9223372036854775807")?.values.id).toBe(9223372036854775807n);
    expect(matchRoute(table, "/l/9223372036854775808")).toBeNull();
  });

  it("regex(a|b) is anchored as a group", () => {
    const table = routes(["/r/{x:regex(a|b)}", PageA]);
    expect(matchRoute(table, "/r/a")?.values.x).toBe("a");
    expect(matchRoute(table, "/r/b")?.values.x).toBe("b");
    expect(matchRoute(table, "/r/ab")).toBeNull();
    expect(matchRoute(table, "/r/xb")).toBeNull();
    expect(matchRoute(table, "/r/ax")).toBeNull();
  });
});

/* Navigation --------------------------------------------------------------- */

const managers: NavigationManager[] = [];
function track<T extends NavigationManager>(nav: T): T {
  managers.push(nav);
  return nav;
}

afterEach(() => {
  for (const nav of managers.splice(0)) nav.dispose();
  document.head.querySelectorAll("base").forEach((b) => b.remove());
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

/**
 * Session history for happy-dom, whose history.go() does not traverse
 * same-document entries: go() moves through the recorded entries and fires
 * popstate asynchronously, like a browser's back/forward.
 */
class TestHistory {
  private readonly entries: { state: unknown; url: string }[] = [{ state: history.state, url: location.href }];
  private index = 0;
  get state(): unknown {
    return this.entries[this.index]!.state;
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
      window.dispatchEvent(new PopStateEvent("popstate", { state: entry.state }));
    });
  }
  back(): void {
    this.go(-1);
  }
}

describe("R15 — navigation lock", () => {
  it("navigateTo consults the lock and can be cancelled", async () => {
    const nav = new NavigationManager();
    let asked = false;
    nav.setNavigationLock("lock", async () => {
      asked = true;
      return false;
    });
    const before = nav.uri;
    nav.navigateTo("/blocked");
    await new Promise((r) => setTimeout(r, 0));
    const result = { asked, uri: nav.uri };
    nav.dispose();
    expect(result).toEqual({ asked: true, uri: before });
  });

  it("a lock cancels an intercepted link click", async () => {
    const nav = track(new NavigationManager());
    nav.enableNavigationInterception();
    const changed: string[] = [];
    nav.addLocationChanged((_, e) => changed.push(e.location));
    const asked: { uri: string; intercepted: boolean }[] = [];
    nav.setNavigationLock("lock", (uri, intercepted) => {
      asked.push({ uri, intercepted });
      return false;
    });
    const before = location.href;
    const link = document.createElement("a");
    link.setAttribute("href", "/elsewhere");
    document.body.appendChild(link);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    await tick();

    expect(click.defaultPrevented).toBe(true); // no full page load either
    expect(asked).toEqual([{ uri: `${location.origin}/elsewhere`, intercepted: true }]);
    expect(location.href).toBe(before);
    expect(changed).toEqual([]);

    nav.releaseNavigationLock("lock");
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(location.pathname).toBe("/elsewhere");
    expect(changed).toEqual([`${location.origin}/elsewhere`]);
  });

  it("a lock cancels back/forward and restores the URL", async () => {
    const testHistory = new TestHistory();
    const nav = track(new NavigationManager(testHistory as unknown as History));
    nav.navigateTo("/first");
    nav.navigateTo("/second");
    const changed: string[] = [];
    nav.addLocationChanged((_, e) => changed.push(e.location));
    const asked: string[] = [];
    nav.setNavigationLock("lock", (uri) => {
      asked.push(uri);
      return false;
    });

    testHistory.back();
    for (let i = 0; i < 5; i++) await tick();
    expect(asked).toEqual([`${location.origin}/first`]);
    expect(location.pathname).toBe("/second");
    expect(changed).toEqual([]);

    // Allowed: the back navigation completes and LocationChanged fires once.
    nav.releaseNavigationLock("lock");
    let allowed = 0;
    nav.setNavigationLock("lock", () => {
      allowed++;
      return true;
    });
    testHistory.back();
    for (let i = 0; i < 5; i++) await tick();
    expect(allowed).toBe(1);
    expect(location.pathname).toBe("/first");
    expect(changed).toEqual([`${location.origin}/first`]);
  });
});

describe("R15 — <base href>", () => {
  it("baseUri, toAbsoluteUri, toBaseRelativePath and interception honour a non-root base", () => {
    const base = document.createElement("base");
    base.setAttribute("href", "/app/");
    document.head.appendChild(base);
    history.replaceState(null, "", "/app/start");
    const nav = track(new NavigationManager());
    const origin = location.origin;

    expect(nav.baseUri).toBe(`${origin}/app/`);
    expect(nav.toAbsoluteUri("orders/5")).toBe(`${origin}/app/orders/5`);
    expect(nav.toBaseRelativePath(`${origin}/app/orders/5?x=1`)).toBe("orders/5?x=1");
    expect(nav.toBaseRelativePath(`${origin}/app`)).toBe("");
    expect(() => nav.toBaseRelativePath(`${origin}/other`)).toThrow(/is not contained by the base URI/);
    expect(nav.baseRelativePath).toBe("start");

    nav.navigateTo("counter");
    expect(location.pathname).toBe("/app/counter");
    expect(nav.baseRelativePath).toBe("counter");

    // Links outside the base URI space are full page loads (not intercepted).
    nav.enableNavigationInterception();
    const outside = document.createElement("a");
    outside.setAttribute("href", "/other");
    const inside = document.createElement("a");
    inside.setAttribute("href", "orders");
    document.body.append(outside, inside);
    expect(clickPreventedByApp(outside)).toBe(false);
    expect(location.pathname).toBe("/app/counter");
    expect(clickPreventedByApp(inside)).toBe(true);
    expect(location.pathname).toBe("/app/orders");
  });
});

describe("A7 — NavLink compares absolute URIs (Blazor)", () => {
  const links = `@import { NavLink, NavLinkMatch } from "@tsazor/runtime"
<NavLink Href="" Match="@NavLinkMatch.All">Home</NavLink>
<NavLink Href="">Prefix home</NavLink>
<NavLink Href="orders">Relative</NavLink>
<NavLink Href="/app/orders">Root-relative</NavLink>
<NavLink Href="@absolute">Absolute</NavLink>
<NavLink Href="/orders">Outside the base</NavLink>
<NavLink Href="orders" Match="@NavLinkMatch.All">All</NavLink>
@code { absolute = location.origin + "/APP/Orders/"; }`;
  const active = (container: HTMLElement): string[] =>
    [...container.querySelectorAll("a")].filter((a) => a.classList.contains("active")).map((a) => a.textContent!);
  /** Compiles the links and renders them with a NavigationManager for the current location. */
  const mount = async (source: string): Promise<{ container: HTMLElement }> => {
    const compiled = await compileFiles({ "Test.tsazor": source });
    expect(compiled.diagnostics["Test.tsazor"]!.filter((d) => d.severity === "error")).toEqual([]);
    const { default: Component } = await import(/* @vite-ignore */ compiled.modules["Test.tsazor"]!);
    const services = new ServiceCollection();
    services.registerValue(NavigationManager as never, track(new NavigationManager()));
    const renderer = new Renderer(services.build());
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderer.renderInContainer(Component, container);
    await renderer.waitUntilIdle();
    return { container };
  };

  it("relative, root-relative and absolute hrefs under a non-root <base href>", async () => {
    const base = document.createElement("base");
    base.setAttribute("href", "/app/");
    document.head.appendChild(base);
    history.replaceState(null, "", "/app/orders/5?tab=1");
    const m = await mount(links);
    // Prefix: the base covers everything; /app/orders covers /app/orders/5.
    // The absolute href differs in case and has a trailing slash; /orders is outside the base.
    expect(active(m.container)).toEqual(["Prefix home", "Relative", "Root-relative", "Absolute"]);
  });

  it("All matches exactly, ignoring the current query and fragment, with a trailing slash on the href", async () => {
    const base = document.createElement("base");
    base.setAttribute("href", "/app/");
    document.head.appendChild(base);
    history.replaceState(null, "", "/app/orders?tab=1#top");
    const m = await mount(links);
    // The trailing-slash href (`…/Orders/`) is no prefix of `…/orders?tab=1` — as in Blazor.
    expect(active(m.container)).toEqual(["Prefix home", "Relative", "Root-relative", "All"]);

    history.replaceState(null, "", "/app");
    const root = await mount(links);
    // http://host/app is the base URI http://host/app/ without its slash.
    expect(active(root.container)).toEqual(["Home", "Prefix home"]);
  });
});

describe("R15 — app.dispose()", () => {
  it("removes the rendered DOM and the click/popstate listeners", async () => {
    class Home extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "a");
        b.addAttribute(1, "href", "/other");
        b.addContent(2, "go");
        b.closeElement();
      }
    }
    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Router));
        b.addAttribute(1, "Found", (routeData: RouteData) => (inner: RenderTreeBuilder) => {
          inner.openComponent(0, defineComponent(RouteView));
          inner.addAttribute(1, "RouteData", routeData);
          inner.closeComponent();
        });
        b.closeComponent();
      }
    }
    const root = document.createElement("div");
    root.id = "app";
    document.body.appendChild(root);
    const app = createTsazorApp({ root: App, routes: [{ template: "/", type: Home }] });
    await app.renderer.waitUntilIdle();
    expect(root.querySelector("a")?.textContent).toBe("go");
    const changed: string[] = [];
    app.navigationManager.addLocationChanged((_, e) => changed.push(e.location));

    app.dispose();
    expect(root.innerHTML).toBe("");
    expect((globalThis as { __tsazor?: unknown }).__tsazor).toBeUndefined();

    const link = document.createElement("a");
    link.setAttribute("href", "/other");
    document.body.appendChild(link);
    expect(clickPreventedByApp(link)).toBe(false);
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    await tick();
    expect(changed).toEqual([]);
  });
});

describe("auth race", () => {
  it("a late getState() result does not overwrite a newer notification", async () => {
    let resolveInitial!: (state: AuthenticationState) => void;
    class Provider extends AuthenticationStateProvider {
      getState(): Promise<AuthenticationState> {
        return new Promise((resolve) => (resolveInitial = resolve));
      }
      signIn(name: string): void {
        this.notifyAuthenticationStateChanged(new AuthenticationState(createUser({ name })));
      }
    }
    const provider = new Provider();
    const applied: string[] = [];
    watchAuthenticationState({ tryGet: () => provider as never }, (state) => applied.push(state.user.name || "anonymous"));

    provider.signIn("alice"); // login completes while the initial request is pending
    resolveInitial(ANONYMOUS); // stale: requested before the login
    await tick();
    expect(applied).toEqual(["alice"]);
  });
});
