/**
 * B7: NavigationManager location-changing flow (Blazor's
 * RegisterLocationChangingHandler / NavigationLock) and navigation options.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ComponentBase,
  defineComponent,
  MemoryHistory,
  NavigationLock,
  NavigationManager,
  ServiceCollection,
  type LocationChangedEventArgs,
  type LocationChangingContext,
  type RenderTreeBuilder,
} from "../src/index";
import {
  Renderer,
} from "../src/internal";

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

  it("keeps the current entry's state as historyEntryState: set by a navigation, restored on back and on load", async () => {
    const entries = new MemoryHistory(`${location.origin}/`);
    const nav = new NavigationManager({ history: entries, location: entries });
    managers.push(nav);
    expect(nav.historyEntryState).toBeUndefined();
    nav.navigateTo("/login", { historyEntryState: "/tenants" });
    expect(nav.historyEntryState).toBe("/tenants");
    nav.navigateTo("/");
    expect(nav.historyEntryState).toBeUndefined();
    entries.back();
    await tick();
    expect(nav.uri).toBe(`${location.origin}/login`);
    expect(nav.historyEntryState).toBe("/tenants");
    // A reload: a new manager on the same entry reads its state.
    const reloaded = new NavigationManager({ history: entries, location: entries });
    managers.push(reloaded);
    expect(reloaded.historyEntryState).toBe("/tenants");
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

describe("getUriWithQueryParameter(s) (Blazor's NavigationManagerExtensions)", () => {
  it("replaces a parameter where it is, appends a new one, removes on null, and keeps the rest and the fragment", () => {
    const nav = fresh();
    nav.navigateTo("/audits?type=Security&page=3&q=a%20b#top");
    expect(nav.getUriWithQueryParameter("page", 1)).toBe(`${location.origin}/audits?type=Security&page=1&q=a%20b#top`);
    expect(nav.getUriWithQueryParameter("Page", null)).toBe(`${location.origin}/audits?type=Security&q=a%20b#top`);
    expect(nav.getUriWithQueryParameter("severity", "high & low")).toBe(`${location.origin}/audits?type=Security&page=3&q=a%20b&severity=high%20%26%20low#top`);
    expect(nav.getUriWithQueryParameters({ type: undefined, page: undefined, q: undefined })).toBe(`${location.origin}/audits#top`);
  });

  it("writes one occurrence per array value — in place first, the rest appended — and formats as Blazor", () => {
    const nav = fresh();
    expect(nav.getUriWithQueryParameters("/x?tag=a&other=1&tag=b&tag=c", { tag: ["x", "y"] })).toBe("/x?tag=x&other=1&tag=y");
    expect(nav.getUriWithQueryParameters("/x?tag=a", { tag: ["x", null, "z"] })).toBe("/x?tag=x&tag=z");
    expect(nav.getUriWithQueryParameters("/x", { on: true, off: false, n: 2.5, big: 10n, at: new Date(Date.UTC(2026, 9, 13, 8, 30)), s: "it's (ok)*!" })).toBe(
      "/x?on=True&off=False&n=2.5&big=10&at=2026-10-13T08%3A30%3A00.000Z&s=it%27s%20%28ok%29%2A%21",
    );
    expect(() => nav.getUriWithQueryParameters("/x", { "": 1 })).toThrow("Cannot have empty query parameter names.");
  });
});
