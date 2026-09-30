/**
 * B7: NavigationManager location-changing flow (Blazor's
 * RegisterLocationChangingHandler / NavigationLock) and navigation options.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ComponentBase,
  defineComponent,
  NavigationLock,
  NavigationManager,
  Renderer,
  ServiceCollection,
  type LocationChangedEventArgs,
  type LocationChangingContext,
  type RenderTreeBuilder,
} from "../src/index";

const managers: NavigationManager[] = [];
function fresh(): NavigationManager {
  const nav = new NavigationManager();
  managers.push(nav);
  return nav;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  for (const nav of managers.splice(0)) nav.dispose();
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

describe("navigateTo", () => {
  it("pushes by default, replaces with replace / replaceHistoryEntry, and carries historyEntryState", () => {
    const nav = fresh();
    const events: LocationChangedEventArgs[] = [];
    nav.addLocationChanged((_, e) => events.push(e));
    const length = history.length;
    nav.navigateTo("/a");
    expect(history.length).toBe(length + 1);
    nav.navigateTo("/b", false, true);
    nav.navigateTo("/c", { replaceHistoryEntry: true, historyEntryState: "s1" });
    expect(history.length).toBe(length + 1);
    expect(location.pathname).toBe("/c");
    expect(events.map((e) => [new URL(e.location).pathname, e.isNavigationIntercepted, e.historyEntryState])).toEqual([
      ["/a", false, undefined],
      ["/b", false, undefined],
      ["/c", false, "s1"],
    ]);
  });

  it("is synchronous without handlers", () => {
    const nav = fresh();
    nav.navigateTo("/now");
    expect(location.pathname).toBe("/now");
  });

  it("runs handlers with the absolute target; a later navigation supersedes a pending one", async () => {
    const nav = fresh();
    const contexts: LocationChangingContext[] = [];
    const releases: (() => void)[] = [];
    nav.registerLocationChangingHandler((context) => {
      contexts.push(context);
      return new Promise<void>((resolve) => releases.push(resolve));
    });
    nav.navigateTo("/slow");
    nav.navigateTo("/fast");
    expect(contexts[0]!.signal.aborted).toBe(true);
    releases.forEach((release) => release());
    await tick();
    expect(contexts.map((c) => c.targetLocation)).toEqual([`${location.origin}/slow`, `${location.origin}/fast`]);
    expect(location.pathname).toBe("/fast");
  });

  it("one preventing handler cancels even if others allow; a throwing handler cancels too", async () => {
    const nav = fresh();
    const first = nav.registerLocationChangingHandler(() => undefined);
    const second = nav.registerLocationChangingHandler(async (context) => {
      await tick();
      context.preventNavigation();
    });
    nav.navigateTo("/nope");
    await tick();
    await tick();
    expect(location.pathname).toBe("/");
    first.dispose();
    second.dispose();

    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const failing = nav.registerLocationChangingHandler(() => {
        throw new Error("boom");
      });
      nav.navigateTo("/boom");
      await tick();
      expect(location.pathname).toBe("/");
      expect(errors).toHaveLength(1);
      failing.dispose();
    } finally {
      console.error = original;
    }
    nav.navigateTo("/free");
    expect(location.pathname).toBe("/free");
  });

  it("a cancelled forceLoad does not leave the page", async () => {
    const nav = fresh();
    nav.setNavigationLock("l", () => false);
    nav.navigateTo("/reload", { forceLoad: true });
    await tick();
    expect(location.pathname).toBe("/");
  });

  it("setNavigationLock replaces a lock with the same id", async () => {
    const nav = fresh();
    nav.setNavigationLock("l", () => false);
    nav.setNavigationLock("l", () => true);
    nav.navigateTo("/allowed");
    await tick();
    expect(location.pathname).toBe("/allowed");
  });
});

describe("popstate", () => {
  it("without a handler notifies LocationChanged (not intercepted)", async () => {
    const nav = fresh();
    const events: LocationChangedEventArgs[] = [];
    nav.addLocationChanged((_, e) => events.push(e));
    history.pushState(null, "", "/popped");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await tick();
    expect(events.map((e) => [new URL(e.location).pathname, e.isNavigationIntercepted])).toEqual([["/popped", false]]);
  });

  it("a cancelled entry without a history index restores the previous URL", async () => {
    const nav = fresh();
    nav.navigateTo("/current");
    nav.setNavigationLock("l", () => false);
    const events: string[] = [];
    nav.addLocationChanged((_, e) => events.push(e.location));
    // An entry not created by the NavigationManager (no _index in its state).
    history.pushState({ foreign: true }, "", "/foreign");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await tick();
    expect(location.pathname).toBe("/current");
    expect(events).toEqual([]);
  });
});

describe("NavigationLock component", () => {
  it("registers onBeforeInternalNavigation while rendered and unregisters on dispose", async () => {
    const nav = fresh();
    const collection = new ServiceCollection();
    collection.registerValue(NavigationManager as never, nav);
    const renderer = new Renderer(collection.build());
    const seen: string[] = [];
    class Page extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(NavigationLock));
        b.addAttribute(1, "OnBeforeInternalNavigation", (context: LocationChangingContext) => {
          seen.push(new URL(context.targetLocation).pathname);
          context.preventNavigation();
        });
        b.closeComponent();
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const state = renderer.renderInContainer(Page, container);
    await renderer.waitUntilIdle();

    nav.navigateTo("/locked");
    await tick();
    expect(seen).toEqual(["/locked"]);
    expect(location.pathname).toBe("/");

    renderer.disposeComponent(state);
    nav.navigateTo("/unlocked");
    expect(location.pathname).toBe("/unlocked");
  });
});
