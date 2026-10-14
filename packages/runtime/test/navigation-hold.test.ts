/**
 * Holding the previous page (Tsazor extension, `routing.holdPreviousPage`): in a browser with view
 * transitions, an in-app navigation announces LocationChanged inside one, and the transition's
 * update finishes only once the new page has rendered and its async work is done — the browser
 * shows the previous page until then, and the new one in one step. happy-dom has no view
 * transitions; the tests stand in for the browser's `document.startViewTransition`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, createTsazorApp, defineComponent, Router, RouteView } from "../src/index";
import type { NavigationContext, RenderFragment, RenderTreeBuilder, TsazorApp } from "../src/index";
import { rendererOf } from "../src/internal";

/** A promise the test resolves by hand. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => (resolve = res));
  return { promise, resolve };
}

const never = () => new Promise<void>(() => undefined);
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

function page(title: string): typeof ComponentBase {
  return class extends ComponentBase {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.openElement(0, "h1");
      b.addContent(1, title);
      b.closeElement();
    }
  };
}

/** A page whose data arrives when `load` resolves: "loading" until then. */
function loadingPage(title: string, load: () => Promise<void>): typeof ComponentBase {
  return class extends ComponentBase {
    private loaded = false;

    protected override async onInitialized(): Promise<void> {
      await load();
      this.loaded = true;
    }

    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.openElement(0, "h1");
      b.addContent(1, this.loaded ? title : "loading");
      b.closeElement();
    }
  };
}

/** A view transition as the browser runs it: the update after the old page was captured (the next frame). */
interface Transition {
  readonly updateCallbackDone: Promise<void>;
  /** The page's heading when the update finished: what the browser shows next. */
  shown?: string;
  skipped: boolean;
}

let transitions: Transition[] = [];
let app: TsazorApp | undefined;

const heading = () => document.querySelector("h1")?.textContent ?? "";

function fakeViewTransitions(): void {
  document.startViewTransition = ((update: () => Promise<void>) => {
    const transition: Transition = {
      updateCallbackDone: nextTask()
        .then(update)
        .then(() => {
          transition.shown = heading();
        }),
      skipped: false,
    };
    transitions.push(transition);
    return {
      updateCallbackDone: transition.updateCallbackDone,
      ready: transition.updateCallbackDone.then(() => Promise.reject(new DOMException("Skipped", "AbortError"))),
      finished: transition.updateCallbackDone,
      skipTransition: () => {
        transition.skipped = true;
      },
    };
  }) as unknown as Document["startViewTransition"];
}

const realRect = HTMLElement.prototype.getBoundingClientRect;

afterEach(() => {
  app?.dispose();
  app = undefined;
  transitions = [];
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  HTMLElement.prototype.getBoundingClientRect = realRect;
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

async function start(
  routes: { template: string; type: typeof ComponentBase }[],
  options: {
    holdPreviousPage?: number | false;
    onNavigateAsync?: (context: NavigationContext) => Promise<void>;
    navigating?: boolean;
    viewTransitions?: boolean;
    idle?: boolean;
  } = {},
): Promise<TsazorApp> {
  history.replaceState(null, "", "/");
  class App extends ComponentBase {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.openElement(0, "nav");
      for (const [index, route] of routes.entries()) {
        b.openElement(1 + index * 2, "a");
        b.addAttribute(2 + index * 2, "href", route.template);
        b.closeElement();
      }
      b.closeElement();
      b.openComponent(20, defineComponent(Router));
      b.addAttribute(21, "Routes", routes);
      if (options.onNavigateAsync) b.addAttribute(22, "OnNavigateAsync", options.onNavigateAsync);
      if (options.navigating) {
        b.addAttribute(24, "Navigating", ((inner: RenderTreeBuilder) => {
          inner.openElement(0, "h1");
          inner.addContent(1, "Navigating");
          inner.closeElement();
        }) as RenderFragment);
      }
      b.addAttribute(23, "Found", (routeData: unknown) => (inner: RenderTreeBuilder) => {
        inner.openComponent(0, defineComponent(RouteView));
        inner.addAttribute(1, "RouteData", routeData);
        inner.closeComponent();
      });
      b.closeComponent();
    }
  }
  const host = document.createElement("div");
  host.id = "app";
  document.body.appendChild(host);
  if (options.viewTransitions !== false) fakeViewTransitions();
  app = createTsazorApp({
    root: App,
    ...(options.holdPreviousPage === undefined ? {} : { routing: { holdPreviousPage: options.holdPreviousPage } }),
  });
  // A first page whose work never ends is never idle.
  await (options.idle === false ? nextTask() : rendererOf(app).waitUntilIdle());
  return app;
}

const pathOf = (uri: string) => new URL(uri).pathname;

describe("holding the previous page on navigation", () => {
  it("the URL and the page change inside a view transition that ends when the new page has its data", async () => {
    const data = deferred();
    const app = await start([
      { template: "/", type: page("Home") },
      { template: "/orders", type: loadingPage("Orders", () => data.promise) },
    ]);
    app.navigationManager.navigateTo("/orders");
    // The URL and LocationChanged change once the browser captured the previous page.
    expect([pathOf(app.navigationManager.uri), heading()]).toEqual(["/", "Home"]);
    expect(transitions).toHaveLength(1);

    await nextTask();
    await nextTask();
    expect([pathOf(app.navigationManager.uri), heading()]).toEqual(["/orders", "loading"]);
    expect(transitions[0]!.shown).toBeUndefined();

    data.resolve();
    await transitions[0]!.updateCallbackDone;
    expect(transitions[0]!.shown).toBe("Orders");
    // No animation: the browser shows the new page as it is.
    await nextTask();
    expect(transitions[0]!.skipped).toBe(true);
  });

  it("work in flight before the navigation doesn't hold it", async () => {
    const app = await start(
      [
        { template: "/", type: loadingPage("Home", never) },
        { template: "/orders", type: page("Orders") },
      ],
      { holdPreviousPage: 5000, idle: false },
    );
    app.navigationManager.navigateTo("/orders");
    const done = await Promise.race([transitions[0]!.updateCallbackDone.then(() => "done"), new Promise((resolve) => setTimeout(() => resolve("held"), 200))]);
    expect(done).toBe("done");
    expect(transitions[0]!.shown).toBe("Orders");
  });

  it("ends when its time is up, showing the page as far as it got", async () => {
    const app = await start(
      [
        { template: "/", type: page("Home") },
        { template: "/orders", type: loadingPage("Orders", never) },
      ],
      { holdPreviousPage: 50 },
    );
    app.navigationManager.navigateTo("/orders");
    await transitions[0]!.updateCallbackDone;
    expect(transitions[0]!.shown).toBe("loading");
  });

  it("waits for the Router's OnNavigateAsync, then for the page it renders", async () => {
    let gate: ReturnType<typeof deferred> | undefined;
    const data = deferred();
    const app = await start(
      [
        { template: "/", type: page("Home") },
        { template: "/orders", type: loadingPage("Orders", () => data.promise) },
      ],
      {
        onNavigateAsync: (context) => {
          if (context.path === "") return Promise.resolve();
          gate = deferred();
          return gate.promise;
        },
      },
    );
    app.navigationManager.navigateTo("/orders");
    await nextTask();
    await nextTask();
    expect(heading()).toBe("Home");
    gate!.resolve();
    await nextTask();
    await nextTask();
    expect(heading()).toBe("loading");
    expect(transitions[0]!.shown).toBeUndefined();
    data.resolve();
    await transitions[0]!.updateCallbackDone;
    expect(transitions[0]!.shown).toBe("Orders");
  });

  it("with <Navigating>, the app shows its own waiting state: the hold doesn't wait for OnNavigateAsync", async () => {
    const gate = deferred();
    const app = await start(
      [
        { template: "/", type: page("Home") },
        { template: "/orders", type: page("Orders") },
      ],
      { navigating: true, onNavigateAsync: (context) => (context.path === "" ? Promise.resolve() : gate.promise) },
    );
    app.navigationManager.navigateTo("/orders");
    await transitions[0]!.updateCallbackDone;
    expect(transitions[0]!.shown).toBe("Navigating");
    gate.resolve();
    await rendererOf(app).waitUntilIdle();
    await nextTask();
    expect(heading()).toBe("Orders");
  });

  it("a navigation while the previous page is held joins the hold: one transition, in order, until the last page is ready", async () => {
    const orders = deferred();
    const admin = deferred();
    const app = await start([
      { template: "/", type: page("Home") },
      { template: "/orders", type: loadingPage("Orders", () => orders.promise) },
      { template: "/admin", type: loadingPage("Admin", () => admin.promise) },
    ]);
    const announced: string[] = [];
    app.navigationManager.addLocationChanged((event) => announced.push(pathOf(event.location)));
    // One before the browser captured the page (the Router renders the current URL: Admin)…
    app.navigationManager.navigateTo("/admin");
    app.navigationManager.navigateTo("/admin?tab=2");
    await nextTask();
    await nextTask();
    expect(heading()).toBe("loading");
    // …and one while the update waits for Admin: then it waits for Orders, and only for Orders.
    app.navigationManager.navigateTo("/orders");
    expect(transitions).toHaveLength(1);
    expect(announced).toEqual(["/admin", "/admin", "/orders"]);

    orders.resolve();
    const done = await Promise.race([transitions[0]!.updateCallbackDone.then(() => "done"), new Promise((resolve) => setTimeout(() => resolve("held"), 300))]);
    expect(done).toBe("done");
    expect(transitions[0]!.shown).toBe("Orders");
    expect(transitions).toHaveLength(1);
    admin.resolve();
  });

  it("a click on a link of the held page follows it (the browser hit-tests nothing meanwhile)", async () => {
    // happy-dom lays nothing out: the links stand side by side, 100 px wide.
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const index = this.parentElement === null ? 0 : [...this.parentElement.children].indexOf(this);
      return new DOMRect(index * 100, 0, this instanceof HTMLAnchorElement ? 100 : 0, 20);
    };
    const orders = deferred();
    const app = await start([
      { template: "/", type: page("Home") },
      { template: "/orders", type: loadingPage("Orders", () => orders.promise) },
      { template: "/admin", type: page("Admin") },
    ]);
    app.navigationManager.navigateTo("/orders");
    await nextTask();
    await nextTask();
    // The click lands on the root element, at the third link ("/admin") of the page the browser shows.
    document.documentElement.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 250, clientY: 10 }));
    expect(pathOf(app.navigationManager.uri)).toBe("/admin");
    await transitions[0]!.updateCallbackDone;
    expect(transitions[0]!.shown).toBe("Admin");

    // Without a hold, a click on the root element is no link click.
    document.documentElement.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 50, clientY: 10 }));
    expect(pathOf(app.navigationManager.uri)).toBe("/admin");
  });

  it.each([
    ["holdPreviousPage: false", { holdPreviousPage: false as const }],
    ["a browser without view transitions", { viewTransitions: false }],
  ])("%s: LocationChanged at once, every render shows", async (_, options) => {
    const data = deferred();
    const app = await start(
      [
        { template: "/", type: page("Home") },
        { template: "/orders", type: loadingPage("Orders", () => data.promise) },
      ],
      options,
    );
    app.navigationManager.navigateTo("/orders");
    await nextTask();
    expect(heading()).toBe("loading");
    expect(transitions).toHaveLength(0);
    data.resolve();
    await rendererOf(app).waitUntilIdle();
    expect(heading()).toBe("Orders");
  });

  it("rejects a hold that isn't a positive number of ms", () => {
    const host = document.createElement("div");
    host.id = "app";
    document.body.appendChild(host);
    expect(() => createTsazorApp({ root: page("Home"), routing: { holdPreviousPage: 0 } })).toThrow(
      "routing.holdPreviousPage must be a positive number of ms or false, not 0.",
    );
  });
});
