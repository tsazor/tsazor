/**
 * M4 acceptance tests: Routing/Layout — Router + RouteView + NavLink over a
 * 3-route manifest with a shared layout, in happy-dom.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ComponentBase,
  LayoutComponentBase,
  NavigationManager,
  NavLink,
  NavLinkMatch,
  Parameter,
  Renderer,
  RouteView,
  Router,
  ServiceCollection,
  matchRoute,
} from "../src/index";
import { defineComponent } from "../src/index";
import { navLinkMatches } from "../src/routing/nav-link";
import type { RenderFragment, RenderTreeBuilder } from "../src/index";

/* Layout ------------------------------------------------------------------ */

class MainLayout extends LayoutComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "div");
    b.addAttribute(1, "class", "layout");
    b.openElement(2, "nav");
    b.openComponent(3, defineComponent(NavLink));
    b.addAttribute(4, "Href", "/");
    b.addAttribute(5, "Match", NavLinkMatch.All);
    b.addContent(6, (inner: RenderTreeBuilder) => inner.addContent(0, "Home"));
    b.closeComponent();
    b.openComponent(7, defineComponent(NavLink));
    b.addAttribute(8, "Href", "/counter");
    b.addContent(9, (inner: RenderTreeBuilder) => inner.addContent(0, "Counter"));
    b.closeComponent();
    b.openComponent(10, defineComponent(NavLink));
    b.addAttribute(11, "Href", "/fetch");
    b.addContent(12, (inner: RenderTreeBuilder) => inner.addContent(0, "Fetch"));
    b.closeComponent();
    b.closeElement();
    b.openElement(13, "main");
    if (this.Body) {
      this.Body(b);
    }
    b.closeElement();
    b.closeElement();
  }
}

/* Pages ------------------------------------------------------------------- */

class HomePage extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "h1");
    b.addContent(1, "Home page");
    b.closeElement();
  }
}

class CounterPage extends ComponentBase {
  @Parameter() startValue?: string | number;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "h1");
    b.addContent(1, `Counter: ${this.startValue ?? "0"}`);
    b.closeElement();
  }
}

class UserPage extends ComponentBase {
  @Parameter() id?: string;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "h1");
    b.addContent(1, `User ${this.id}`);
    b.closeElement();
  }
}

const routes = [
  { template: "/", type: HomePage, layout: MainLayout },
  { template: "/counter", type: CounterPage, layout: MainLayout },
  { template: "/user/{Id:int}", type: UserPage, layout: MainLayout },
];

/* App shell --------------------------------------------------------------- */

function buildApp(navigation: NavigationManager): Renderer {
  const collection = new ServiceCollection();
  collection.registerValue(NavigationManager as never, navigation);
  const services = collection.build();
  return new Renderer(services);
}

describe("route matching", () => {
  it("matches literals, int constraints and rejects bad input", () => {
    const matchedHome = matchRoute(routes, "/");
    expect(matchedHome?.route.type).toBe(HomePage);
    const matchedCounter = matchRoute(routes, "/counter");
    expect(matchedCounter?.route.type).toBe(CounterPage);
    const matchedUser = matchRoute(routes, "/user/42");
    expect(matchedUser?.values.Id).toBe(42); // coerced by the :int constraint
    expect(matchRoute(routes, "/user/notanumber")).toBeNull();
    expect(matchRoute(routes, "/missing")).toBeNull();
  });
});

describe("NavLink matching over absolute URIs (Blazor .NET 8, A7)", () => {
  const h = "http://host";
  it.each([
    // href (absolute), current, match, active
    [`${h}/app/counter`, `${h}/app/counter`, NavLinkMatch.All, true],
    [`${h}/app/counter`, `${h}/APP/Counter`, NavLinkMatch.All, true], // case-insensitive
    [`${h}/app/counter/`, `${h}/app/counter`, NavLinkMatch.All, true], // trailing slash on the href only
    [`${h}/app/counter`, `${h}/app/counter/`, NavLinkMatch.All, false],
    [`${h}/app/counter`, `${h}/app/counter?x=1`, NavLinkMatch.All, true], // query ignored
    [`${h}/app/counter`, `${h}/app/counter#top`, NavLinkMatch.All, true], // fragment ignored
    [`${h}/app/counter?x=1`, `${h}/app/counter?x=1`, NavLinkMatch.All, true],
    [`${h}/app/counter?x=1`, `${h}/app/counter`, NavLinkMatch.All, false],
    [`${h}/app/counter`, `${h}/app/counter/5`, NavLinkMatch.All, false],
    [`${h}/app/counter`, `${h}/app/counter/5`, NavLinkMatch.Prefix, true],
    [`${h}/app/counter`, `${h}/app/counter?x=1`, NavLinkMatch.Prefix, true],
    [`${h}/app/counter`, `${h}/app/counters`, NavLinkMatch.Prefix, false], // no separator
    [`${h}/app/counter`, `${h}/app/counter-2`, NavLinkMatch.Prefix, false], // '-' is unreserved
    [`${h}/app/counter/`, `${h}/app/counter/5`, NavLinkMatch.Prefix, true],
    [`${h}/app/`, `${h}/app/anything`, NavLinkMatch.Prefix, true], // the base covers the app
    [`${h}/app/`, `${h}/app`, NavLinkMatch.All, true],
    [`${h}/app/`, `${h}/app/anything`, NavLinkMatch.All, false],
    [`${h}/app/x`, `${h}/other/x`, NavLinkMatch.Prefix, false],
    [`${h}/app/x`, `http://elsewhere/app/x`, NavLinkMatch.All, false],
  ])("%s at %s (match %s) → %s", (href, current, match, expected) => {
    expect(navLinkMatches(href, current, match)).toBe(expected);
  });
});

describe("Router + RouteView + NavLink", () => {
  it("renders the matching page inside its layout with active NavLink", async () => {
    const navigation = freshNavigation();
    navigation.navigateTo("/counter");
    const renderer = buildApp(navigation);

    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Router));
        b.addAttribute(1, "Routes", routes);
        b.addAttribute(2, "Found", (routeData: unknown) => {
          return (inner: RenderTreeBuilder) => {
            inner.openComponent(0, defineComponent(RouteView));
            inner.addAttribute(1, "RouteData", routeData);
            inner.closeComponent();
          };
        });
        b.closeComponent();
      }
    }
    renderer.renderInContainer(App, container());
    await renderer.waitUntilIdle();

    expect(document.querySelector(".layout")).not.toBeNull();
    expect(document.querySelector("h1")?.textContent).toBe("Counter: 0");
    // NavLink active state: /counter is active, others are not. The active
    // link also carries aria-current="page" for assistive tech.
    const links = [...document.querySelectorAll("a")];
    expect(links.map((a) => a.className)).toEqual(["", "active", ""]);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null]);
  });

  it("passes URL parameters into the page component", async () => {
    const navigation = freshNavigation();
    navigation.navigateTo("/user/17");
    const renderer = buildApp(navigation);

    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Router));
        b.addAttribute(1, "Routes", routes);
        b.addAttribute(2, "Found", (routeData: unknown) => {
          return (inner0: RenderTreeBuilder) => {
            inner0.openComponent(0, defineComponent(RouteView));
            inner0.addAttribute(1, "RouteData", routeData);
            inner0.closeComponent();
          };
        });
        b.closeComponent();
      }
    }
    renderer.renderInContainer(App, container());
    await renderer.waitUntilIdle();

    expect(document.querySelector("h1")?.textContent).toBe("User 17");
  });

  it("re-renders the route view on location change", async () => {
    const navigation = freshNavigation();
    navigation.navigateTo("/");
    const renderer = buildApp(navigation);

    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Router));
        b.addAttribute(1, "Routes", routes);
        b.addAttribute(2, "Found", (routeData: unknown) => {
          return (inner0: RenderTreeBuilder) => {
            inner0.openComponent(0, defineComponent(RouteView));
            inner0.addAttribute(1, "RouteData", routeData);
            inner0.closeComponent();
          };
        });
        b.closeComponent();
      }
    }
    renderer.renderInContainer(App, container());
    await renderer.waitUntilIdle();
    expect(document.querySelector("h1")?.textContent).toBe("Home page");
    expect(document.querySelector("a.active")?.textContent).toBe("Home");

    // Clicking a same-origin NavLink must be SPA navigation: preventDefault +
    // pushState, content swaps, the document is NOT reloaded.
    const link = document.querySelector('a[href="/counter"]') as HTMLAnchorElement;
    const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(clickEvent);
    await renderer.waitUntilIdle();
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(document.querySelector("h1")?.textContent).toBe("Counter: 0");
    expect(location.pathname).toBe("/counter");

    navigation.navigateTo("/fetch");
    await renderer.waitUntilIdle();
    // /fetch is not in the manifest → nothing rendered (no notFound configured).
    expect(document.querySelector("h1")).toBeNull();
  });

  it("does not intercept ctrl-clicks or external links", async () => {
    const navigation = freshNavigation();
    navigation.navigateTo("/");
    const renderer = buildApp(navigation);

    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Router));
        b.addAttribute(1, "Routes", routes);
        b.addAttribute(2, "Found", (routeData: unknown) => {
          return (inner0: RenderTreeBuilder) => {
            inner0.openComponent(0, defineComponent(RouteView));
            inner0.addAttribute(1, "RouteData", routeData);
            inner0.closeComponent();
          };
        });
        b.closeComponent();
      }
    }
    renderer.renderInContainer(App, container());
    await renderer.waitUntilIdle();

    // Ctrl-click: browser opens a new tab — must reach the default action.
    const ctrl = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    (document.querySelector('a[href="/counter"]') as HTMLAnchorElement).dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBe(false);

    // External link: not ours to intercept.
    const external = document.createElement("a");
    external.setAttribute("href", "https://example.com/page");
    document.body.appendChild(external);
    const ext = new MouseEvent("click", { bubbles: true, cancelable: true });
    external.dispatchEvent(ext);
    expect(ext.defaultPrevented).toBe(false);
  });
});

function container(): HTMLElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

/** Creates a NavigationManager and remembers it for disposal in afterEach. */
const managers: NavigationManager[] = [];
function freshNavigation(): NavigationManager {
  const navigation = new NavigationManager();
  managers.push(navigation);
  return navigation;
}

afterEach(() => {
  document.body.innerHTML = "";
  for (const navigation of managers.splice(0)) navigation.dispose();
});