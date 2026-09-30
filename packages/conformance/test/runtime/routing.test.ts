/**
 * Route matching and navigation vs. Blazor. Review §3: R14, R15.
 */
import { describe, expect, it } from "vitest";
import { matchRoute, NavigationManager, type RouteEntry } from "@tsazor/runtime";

class PageA {}
class PageB {}
const routes = (...entries: [string, abstract new () => unknown][]): RouteEntry[] =>
  entries.map(([template, type]) => ({ template, type }));

describe("R14 — route precedence", () => {
  it.fails("a literal segment beats a parameter regardless of manifest order", () => {
    const table = routes(["/users/{id}", PageA], ["/users/new", PageB]);
    expect(matchRoute(table, "/users/new")?.route.type).toBe(PageB);
  });

  it("a parameter still matches other values", () => {
    const table = routes(["/users/{id}", PageA], ["/users/new", PageB]);
    expect(matchRoute(table, "/users/42")?.route.type).toBe(PageA);
  });
});

describe("R14 — constraints", () => {
  it.fails("bool is anchored (no partial match)", () => {
    expect(matchRoute(routes(["/f/{b:bool}", PageA]), "/f/trueish")).toBeNull();
  });

  it.fails("bool converts case-insensitively", () => {
    expect(matchRoute(routes(["/f/{b:bool}", PageA]), "/f/True")?.values.b).toBe(true);
  });

  it.fails("optional parameters {id:int?}", () => {
    const table = routes(["/o/{id:int?}", PageA]);
    expect(matchRoute(table, "/o")).not.toBeNull();
    expect(matchRoute(table, "/o/5")?.values.id).toBe(5);
  });

  it.fails("double rejects non-numbers", () => {
    expect(matchRoute(routes(["/d/{x:double}", PageA]), "/d/abc")).toBeNull();
  });

  it("int converts to a number", () => {
    expect(matchRoute(routes(["/n/{id:int}", PageA]), "/n/7")?.values.id).toBe(7);
  });
});

describe("R15 — navigation lock", () => {
  it.fails("navigateTo consults the lock and can be cancelled", async () => {
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
});
