/**
 * MemoryHistory + NavigationManager over it (the H.7 preview setup: documents
 * without a usable history API — sandboxed srcdoc iframes, headless tests).
 */
import { afterEach, describe, expect, it } from "vitest";
import { MemoryHistory, NavigationManager, type LocationChangedEventArgs } from "../src/index";

const managers: NavigationManager[] = [];
function memory(): { history: MemoryHistory; navigation: NavigationManager } {
  const history = new MemoryHistory(`${location.origin}/`);
  const navigation = new NavigationManager({ history, location: history });
  managers.push(navigation);
  return { history, navigation };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  for (const navigation of managers.splice(0)) navigation.dispose();
});

describe("MemoryHistory", () => {
  it("starts at the initial URL with null state; length follows the entries", () => {
    const history = new MemoryHistory("http://localhost/app/");
    expect(history.href).toBe("http://localhost/app/");
    expect(history.state).toBeNull();
    expect(history.length).toBe(1);
    history.pushState({ _index: 1 }, "", "http://localhost/app/orders");
    expect(history.href).toBe("http://localhost/app/orders");
    expect(history.state).toEqual({ _index: 1 });
    expect(history.length).toBe(2);
  });

  it("keeps the current URL when pushState/replaceState get an empty string", () => {
    const history = new MemoryHistory("http://localhost/");
    history.pushState(null, "", "");
    expect(history.href).toBe("http://localhost/");
    history.replaceState({ _index: 0 }, "");
    expect(history.href).toBe("http://localhost/");
    expect(history.state).toEqual({ _index: 0 });
  });

  it("goes back and forward, truncating on a push after a back", () => {
    const history = new MemoryHistory("http://localhost/");
    history.pushState(null, "", "/a");
    history.pushState(null, "", "/b");
    history.go(-1);
    expect(history.href).toBe("http://localhost/a");
    history.go(1);
    expect(history.href).toBe("http://localhost/b");
    history.go(-2);
    expect(history.href).toBe("http://localhost/");
    history.pushState(null, "", "/c"); // /b is gone, like a browser push
    expect(history.length).toBe(2);
    history.go(1);
    expect(history.href).toBe("http://localhost/c");
  });

  it("ignores out-of-range go and go(0)", () => {
    const history = new MemoryHistory("http://localhost/");
    history.go(-1);
    history.go(1);
    history.go(0);
    expect(history.href).toBe("http://localhost/");
  });

  it("dispatches popstate with the target entry's state", () => {
    const history = new MemoryHistory("http://localhost/");
    history.pushState({ _index: 1 }, "", "/a");
    history.pushState({ _index: 2 }, "", "/b");
    const states: unknown[] = [];
    const listener = (event: PopStateEvent): void => {
      states.push(event.state);
    };
    window.addEventListener("popstate", listener);
    try {
      history.back();
    } finally {
      window.removeEventListener("popstate", listener);
    }
    expect(states).toEqual([{ _index: 1 }]);
  });
});

describe("NavigationManager over a MemoryHistory", () => {
  it("reports the memory href as uri and baseRelativePath, never window.location", () => {
    const { history, navigation } = memory();
    expect(navigation.uri).toBe(`${location.origin}/`);
    navigation.navigateTo("/orders/5");
    expect(navigation.uri).toBe(`${location.origin}/orders/5`);
    expect(history.href).toBe(`${location.origin}/orders/5`);
    expect(navigation.baseRelativePath).toBe("orders/5");
    expect(location.pathname).toBe("/"); // the real location is untouched
  });

  it("navigates synchronously and fires LocationChanged; back/forward run through popstate", async () => {
    const { history, navigation } = memory();
    const events: LocationChangedEventArgs[] = [];
    navigation.addLocationChanged((event) => events.push(event));
    navigation.navigateTo("/a");
    navigation.navigateTo("/b?q=1");
    expect(events.map((event) => event.location)).toEqual([`${location.origin}/a`, `${location.origin}/b?q=1`]);
    history.back(); // real popstate handling (locks, LocationChanged)
    await tick();
    expect(navigation.uri).toBe(`${location.origin}/a`);
    expect(events.at(-1)!.location).toBe(`${location.origin}/a`);
    history.forward();
    await tick();
    expect(navigation.uri).toBe(`${location.origin}/b?q=1`);
  });

  it("a navigation lock can cancel a back move; the URL stays put", async () => {
    const { history, navigation } = memory();
    navigation.navigateTo("/a");
    navigation.navigateTo("/b");
    navigation.setNavigationLock("form", () => false);
    history.back();
    await tick();
    await tick();
    expect(navigation.uri).toBe(`${location.origin}/b`);
    navigation.releaseNavigationLock("form");
  });
});
describe("hash mode over a MemoryHistory (the preview's document has no usable location)", () => {
  it("reads and writes the route in the history's fragment; uri stays logical", async () => {
    const history = new MemoryHistory("http://localhost/app/index.html?token=abc");
    const navigation = new NavigationManager({ mode: "hash", history });
    managers.push(navigation);
    expect(navigation.baseUri).toBe("http://localhost/app/");
    expect(navigation.uri).toBe("http://localhost/app/");
    expect(navigation.toLinkHref("orders?state=open")).toBe("#/orders?state=open");

    const seen: string[] = [];
    navigation.addLocationChanged((event: LocationChangedEventArgs) => seen.push(event.location));
    navigation.navigateTo("orders?state=open");
    expect(history.href).toBe("http://localhost/app/index.html?token=abc#/orders?state=open");
    expect(navigation.uri).toBe("http://localhost/app/orders?state=open");
    expect(navigation.baseRelativePath).toBe("orders?state=open");
    expect(navigation.toAbsoluteUri("#/bread")).toBe("http://localhost/app/bread");

    history.back();
    await tick();
    expect(navigation.uri).toBe("http://localhost/app/");
    expect(seen).toEqual(["http://localhost/app/orders?state=open", "http://localhost/app/"]);
  });
});
