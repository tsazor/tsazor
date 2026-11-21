/**
 * E5 part 1 — Blazor's Router.OnNavigateAsync and <Navigating>: the hook runs
 * before each navigation renders (the first one too), Navigating shows
 * meanwhile (or, without it, the previous page stays), a newer navigation
 * aborts the running one, and a failing hook is a failure of the router.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, defineComponent, NavigationManager, Router, RouteView, ServiceCollection } from "../src/index";
import { Renderer } from "../src/internal";
import type { NavigationContext, RenderFragment, RenderTreeBuilder } from "../src/index";
import type { RenderError } from "../src/internal";

function page(title: string): typeof ComponentBase {
  return class extends ComponentBase {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.openElement(0, "h1");
      b.addContent(1, title);
      b.closeElement();
    }
  };
}

const routes = [
  { template: "/", type: page("Home") },
  { template: "/orders", type: page("Orders") },
  { template: "/admin", type: page("Admin") },
];

const navigatingFragment: RenderFragment = (b) => {
  b.openElement(0, "p");
  b.addAttribute(1, "class", "navigating");
  b.addContent(2, "Loading…");
  b.closeElement();
};

/** A promise the test resolves or rejects by hand. */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const managers: NavigationManager[] = [];
afterEach(() => {
  for (const navigation of managers.splice(0)) navigation.dispose();
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

async function start(options: { onNavigateAsync: (context: NavigationContext) => Promise<void>; navigating?: RenderFragment }) {
  history.replaceState(null, "", "/");
  const navigation = new NavigationManager();
  managers.push(navigation);
  const collection = new ServiceCollection();
  collection.registerValue(NavigationManager as never, navigation);
  const renderer = new Renderer(collection.build());
  const errors: RenderError[] = [];
  renderer.errorHandler = (error) => errors.push(error);
  class App extends ComponentBase {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.openComponent(0, defineComponent(Router));
      b.addAttribute(1, "Routes", routes);
      b.addAttribute(2, "OnNavigateAsync", options.onNavigateAsync);
      if (options.navigating) b.addAttribute(3, "Navigating", options.navigating);
      b.addAttribute(4, "Found", (routeData: unknown) => (inner: RenderTreeBuilder) => {
        inner.openComponent(0, defineComponent(RouteView));
        inner.addAttribute(1, "RouteData", routeData);
        inner.closeComponent();
      });
      b.closeComponent();
    }
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  renderer.renderInContainer(App, host);
  await renderer.waitUntilIdle();
  return { navigation, renderer, host, errors };
}

const flush = (renderer: Renderer) => new Promise((resolve) => setTimeout(resolve, 0)).then(() => renderer.waitUntilIdle());

describe("Router OnNavigateAsync", () => {
  it("runs before the first render and every navigation, with the base-relative path; Navigating shows meanwhile", async () => {
    const calls: string[] = [];
    let gate = deferred();
    const { navigation, renderer, host } = await start({
      onNavigateAsync: (context) => {
        calls.push(context.path);
        return gate.promise;
      },
      navigating: navigatingFragment,
    });
    expect(host.querySelector(".navigating")?.textContent).toBe("Loading…");
    expect(host.querySelector("h1")).toBeNull();
    gate.resolve();
    await flush(renderer);
    expect(host.querySelector("h1")?.textContent).toBe("Home");

    gate = deferred();
    navigation.navigateTo("/orders?state=open");
    await flush(renderer);
    expect(host.querySelector(".navigating")).not.toBeNull();
    gate.resolve();
    await flush(renderer);
    expect(host.querySelector("h1")?.textContent).toBe("Orders");
    expect(calls).toEqual(["", "orders?state=open"]);
  });

  it("without Navigating keeps the previous page until the hook finishes", async () => {
    let gate = deferred();
    const { navigation, renderer, host } = await start({ onNavigateAsync: () => gate.promise });
    gate.resolve();
    await flush(renderer);
    expect(host.querySelector("h1")?.textContent).toBe("Home");

    gate = deferred();
    navigation.navigateTo("/orders");
    await flush(renderer);
    expect(host.querySelector("h1")?.textContent).toBe("Home");
    gate.resolve();
    await flush(renderer);
    expect(host.querySelector("h1")?.textContent).toBe("Orders");
  });

  it("a newer navigation aborts the running one; only the latest renders", async () => {
    const gates = new Map<string, ReturnType<typeof deferred>>();
    const signals = new Map<string, AbortSignal>();
    const { navigation, renderer, host } = await start({
      onNavigateAsync: (context) => {
        const gate = deferred();
        gates.set(context.path, gate);
        signals.set(context.path, context.signal);
        return context.path === "" ? Promise.resolve() : gate.promise;
      },
      navigating: navigatingFragment,
    });
    await flush(renderer);
    navigation.navigateTo("/orders");
    navigation.navigateTo("/admin");
    expect(signals.get("orders")!.aborted).toBe(true);
    expect(signals.get("admin")!.aborted).toBe(false);
    gates.get("orders")!.resolve();
    await flush(renderer);
    expect(host.querySelector(".navigating")).not.toBeNull();
    gates.get("admin")!.resolve();
    await flush(renderer);
    expect(host.querySelector("h1")?.textContent).toBe("Admin");
  });

  it("a failing hook is a failure of the router; an aborted one is not", async () => {
    let gate = deferred();
    const { navigation, renderer, errors } = await start({ onNavigateAsync: () => gate.promise, navigating: navigatingFragment });
    gate.resolve();
    await flush(renderer);

    const first = deferred();
    gate = first;
    navigation.navigateTo("/orders");
    gate = deferred();
    navigation.navigateTo("/admin");
    first.reject(new Error("superseded"));
    await flush(renderer);
    expect(errors).toEqual([]);

    gate.reject(new Error("no access"));
    await flush(renderer);
    expect(errors.map((error) => (error.error as Error).message)).toEqual(["no access"]);
  });
});

describe("lazy routes", () => {
  async function startLazy(routesOf: (load: () => Promise<{ type: typeof ComponentBase }>) => unknown[], load: () => Promise<{ type: typeof ComponentBase }>, path = "/") {
    history.replaceState(null, "", path);
    try {
      sessionStorage.clear();
    } catch {
      // no storage in this environment
    }
    const navigation = new NavigationManager();
    managers.push(navigation);
    const collection = new ServiceCollection();
    collection.registerValue(NavigationManager as never, navigation);
    const renderer = new Renderer(collection.build());
    const errors: RenderError[] = [];
    renderer.errorHandler = (error) => errors.push(error);
    const routes = routesOf(load);
    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Router));
        b.addAttribute(1, "Routes", routes);
        b.addAttribute(2, "Navigating", navigatingFragment);
        b.addAttribute(3, "Found", (routeData: unknown) => (inner: RenderTreeBuilder) => {
          inner.openComponent(0, defineComponent(RouteView));
          inner.addAttribute(1, "RouteData", routeData);
          inner.closeComponent();
        });
        b.closeComponent();
      }
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    renderer.renderInContainer(App, host);
    await renderer.waitUntilIdle();
    return { navigation, renderer, host, errors };
  }

  const Reports = page("Reports");
  const twoTemplates = (load: () => Promise<{ type: typeof ComponentBase }>) => [
    { template: "/", type: page("Home") },
    { template: "/reports", load },
    { template: "/annual-reports", load },
  ];

  it("loads a lazy page on the first navigation, once for all its templates, with Navigating meanwhile", async () => {
    let calls = 0;
    let gate = deferred();
    const load = () => {
      calls++;
      return gate.promise.then(() => ({ type: Reports }));
    };
    const { navigation, renderer, host } = await startLazy(twoTemplates, load);
    expect(host.querySelector("h1")?.textContent).toBe("Home");
    expect(calls).toBe(0);

    navigation.navigateTo("/reports");
    await flush(renderer);
    expect(host.querySelector(".navigating")).not.toBeNull();
    gate.resolve();
    await flush(renderer);
    expect(host.querySelector("h1")?.textContent).toBe("Reports");

    gate = deferred();
    navigation.navigateTo("/annual-reports");
    await flush(renderer);
    expect(host.querySelector("h1")?.textContent).toBe("Reports");
    expect(calls).toBe(1);
  });

  it("a deep link to a lazy page shows Navigating, then the page", async () => {
    const gate = deferred();
    const load = () => gate.promise.then(() => ({ type: Reports }));
    const { renderer, host } = await startLazy(twoTemplates, load, "/reports");
    expect(host.querySelector(".navigating")).not.toBeNull();
    gate.resolve();
    await flush(renderer);
    expect(host.querySelector("h1")?.textContent).toBe("Reports");
  });

  it("a failed chunk reloads the target once; a second failure is an error", async () => {
    const load = () => Promise.reject(new Error("Failed to fetch dynamically imported module"));
    const { navigation, renderer, errors } = await startLazy(twoTemplates, load);
    const reloads: string[] = [];
    const original = navigation.navigateTo.bind(navigation);
    navigation.navigateTo = ((uri: string, options?: unknown) => {
      if (typeof options === "object" && (options as { forceLoad?: boolean }).forceLoad) reloads.push(new URL(uri).pathname);
      else original(uri, options as never);
    }) as typeof navigation.navigateTo;

    navigation.navigateTo("/reports");
    await flush(renderer);
    expect(reloads).toEqual(["/reports"]);
    expect(errors).toEqual([]);

    // After the "reload" the same URL fails again: now it is an error.
    navigation.navigateTo("/");
    await flush(renderer);
    navigation.navigateTo("/reports");
    await flush(renderer);
    expect(reloads).toEqual(["/reports"]);
    expect(errors.map((error) => (error.error as Error).message)).toEqual(["Failed to fetch dynamically imported module"]);
  });
});
