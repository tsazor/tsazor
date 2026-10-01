/**
 * FocusOnNavigate vs. Blazor (src/Components/Web/src/Routing/FocusOnNavigate.cs
 * + DomWrapper.focusBySelector): on page-type change — including the change to
 * the FIRST page — the element matching the selector is focused after the
 * render (tabIndex -1 without an existing tabindex, preventScroll).
 */
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, FocusOnNavigate, type RouteData } from "@tsazor/runtime";
import { host, type Build } from "./host.js";

/** Page classes (Blazor compares the page TYPE, not a name). */
const PageA = class PageA {};
const PageB = class PageB {};

const routeDataFor = (page: abstract new (...args: never[]) => unknown): RouteData => ({
  route: { template: "/", type: page, values: {} },
  values: {},
});

const focusBuild =
  (page: abstract new (...args: never[]) => unknown, attributes: Record<string, string> = {}): Build =>
  (b) => {
    b.openElement(0, "p");
    b.addContent(1, "page");
    b.closeElement();
    b.openComponent(2, defineComponent(FocusOnNavigate));
    b.addAttribute(3, "routeData", routeDataFor(page) as never);
    b.addAttribute(4, "selector", "#focus-target");
    b.closeComponent();
    b.openElement(5, "button");
    b.addAttribute(6, "id", "focus-target");
    for (const [name, value] of Object.entries(attributes)) b.addAttribute(7, name, value);
    b.closeElement();
  };

afterEach(() => {
  document.body.innerHTML = "";
});

describe("FocusOnNavigate (3.4)", () => {
  it("focuses the selector on the first render and on page change", async () => {
    const h = await host(focusBuild(PageA));
    expect(document.activeElement?.id).toBe("focus-target");
    // Blazor's DomWrapper: without tabindex the element gets tabIndex -1 to
    // become focusable at all.
    expect(h.container.querySelector("#focus-target")!.tabIndex).toBe(-1);
    await h.update(focusBuild(PageB));
    expect(document.activeElement?.id).toBe("focus-target");
  });

  it("does not refocus while the page type stays the same", async () => {
    const h = await host(focusBuild(PageA));
    expect(document.activeElement?.id).toBe("focus-target");
    (document.activeElement as HTMLElement).blur();
    await h.update(focusBuild(PageA));
    expect(document.activeElement?.id).not.toBe("focus-target");
    await h.update(focusBuild(PageB));
    expect(document.activeElement?.id).toBe("focus-target");
  });

  it("keeps an existing tabindex", async () => {
    const h = await host(focusBuild(PageA, { tabindex: "5" }));
    expect(h.container.querySelector("#focus-target")!.tabIndex).toBe(5);
    expect(document.activeElement?.id).toBe("focus-target");
  });

  it("throws for a missing RouteData or an empty selector", async () => {
    await expect(
      host((b) => {
        b.openComponent(0, defineComponent(FocusOnNavigate));
        b.addAttribute(1, "selector", "#x");
        b.closeComponent();
      }),
    ).rejects.toThrow("FocusOnNavigate requires a non-null value for the parameter 'RouteData'.");

    await expect(
      host((b) => {
        b.openComponent(0, defineComponent(FocusOnNavigate));
        b.addAttribute(1, "routeData", routeDataFor(PageA) as never);
        b.addAttribute(2, "selector", "   ");
        b.closeComponent();
      }),
    ).rejects.toThrow("FocusOnNavigate requires a nonempty value for the parameter 'Selector'.");
  });
});