/**
 * Scrolling on navigation (Blazor): after an internal navigation the Router
 * scrolls to the fragment's element or to the top; a fragment-only link on
 * the current page adds a history entry and scrolls, without
 * LocationChanging/LocationChanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComponentBase, defineComponent, NavigationManager, Router, RouteView, ServiceCollection } from "../src/index";
import { Renderer } from "../src/internal";
import type { RenderTreeBuilder } from "../src/index";

class LongPage extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "h1");
    b.addContent(1, "Long page");
    b.closeElement();
    b.openElement(2, "h2");
    b.addAttribute(3, "id", "details");
    b.addContent(4, "Details");
    b.closeElement();
    b.openElement(5, "a");
    b.addAttribute(6, "name", "legacy");
    b.closeElement();
  }
}

class OtherPage extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "h1");
    b.addContent(1, "Other page");
    b.closeElement();
  }
}

const routes = [
  { template: "/long", type: LongPage },
  { template: "/other", type: OtherPage },
];

class App extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, defineComponent(Router));
    b.addAttribute(1, "Routes", routes);
    b.addAttribute(2, "Found", (routeData: unknown) => (inner: RenderTreeBuilder) => {
      inner.openComponent(0, defineComponent(RouteView));
      inner.addAttribute(1, "RouteData", routeData);
      inner.closeComponent();
    });
    b.closeComponent();
  }
}

const managers: NavigationManager[] = [];
let scrolledInto: string[];
let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrolledInto = [];
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolledInto.push(this.id || this.getAttribute("name") || this.tagName);
  };
  scrollTo = vi.fn();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});

afterEach(() => {
  for (const navigation of managers.splice(0)) navigation.dispose();
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

async function start(path: string): Promise<{ navigation: NavigationManager; renderer: Renderer }> {
  history.replaceState(null, "", path);
  const navigation = new NavigationManager();
  managers.push(navigation);
  const collection = new ServiceCollection();
  collection.registerValue(NavigationManager as never, navigation);
  const renderer = new Renderer(collection.build());
  const host = document.createElement("div");
  document.body.appendChild(host);
  renderer.renderInContainer(App, host);
  await renderer.waitUntilIdle();
  return { navigation, renderer };
}

describe("scrolling on navigation", () => {
  it("scrolls to the top after navigating to another page", async () => {
    const { navigation, renderer } = await start("/long");
    scrollTo.mockClear();
    navigation.navigateTo("/other");
    await renderer.waitUntilIdle();
    expect(document.querySelector("h1")?.textContent).toBe("Other page");
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(scrolledInto).toEqual([]);
  });

  it("scrolls to the fragment's element (by id, else by name) after navigating", async () => {
    const { navigation, renderer } = await start("/other");
    navigation.navigateTo("/long#details");
    await renderer.waitUntilIdle();
    expect(scrolledInto).toEqual(["details"]);
    navigation.navigateTo("/other");
    await renderer.waitUntilIdle();
    navigation.navigateTo("/long#legacy");
    await renderer.waitUntilIdle();
    expect(scrolledInto).toEqual(["details", "legacy"]);
  });

  it("falls back to the top when the fragment names no element", async () => {
    const { navigation, renderer } = await start("/other");
    scrollTo.mockClear();
    navigation.navigateTo("/long#nowhere");
    await renderer.waitUntilIdle();
    expect(scrolledInto).toEqual([]);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("a fragment-only change on the current page scrolls without LocationChanging/LocationChanged", async () => {
    const { navigation, renderer } = await start("/long");
    const changing = vi.fn();
    const changed = vi.fn();
    navigation.registerLocationChangingHandler(changing);
    navigation.addLocationChanged(changed);
    const length = history.length;

    navigation.navigateTo("/long#details");
    expect(scrolledInto).toEqual(["details"]);
    expect(location.hash).toBe("#details");
    expect(history.length).toBe(length + 1);

    const link = document.createElement("a");
    link.href = "/long#legacy";
    document.body.appendChild(link);
    link.click();
    await renderer.waitUntilIdle();
    expect(scrolledInto).toEqual(["details", "legacy"]);
    expect(location.hash).toBe("#legacy");
    expect(changing).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it("scrolls to the fragment of a deep link once the Router rendered", async () => {
    await start("/long#details");
    expect(scrolledInto).toEqual(["details"]);
  });

  it("leaves the position alone on renders that are no navigation", async () => {
    const { renderer } = await start("/long");
    scrollTo.mockClear();
    window.dispatchEvent(new Event("resize"));
    await renderer.waitUntilIdle();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
