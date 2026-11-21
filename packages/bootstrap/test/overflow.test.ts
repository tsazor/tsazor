/**
 * Overflow (Fluent UI Blazor's FluentOverflow): the items that don't fit move behind "+N", which names them and opens
 * them in a popup; onMoreClick takes the button over. happy-dom has no layout, so the sizes are given.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderTree, type RenderResult } from "@tsazor/testing";
import { EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { Overflow } from "../dist/index.js";

const mounted: RenderResult[] = [];
beforeEach(() => {
  // Each item 50 px wide, the button 30, the container 130: two fit beside the button.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const width = this.className.includes("__more") ? 30 : this.className.includes("__item") ? 50 : 0;
    return { width, height: 20, top: 0, left: 0, right: width, bottom: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.className.includes("overflow") && !this.className.includes("__") ? 130 : 0;
  });
});
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function overflow(attrs: Record<string, unknown> = {}) {
  const result = await renderTree((b) => {
    b.openComponent(0, Overflow);
    b.addAttribute(1, "items", ["Rye", "Spelt", "Oat", "Barley"]);
    b.addAttribute(2, "itemTemplate", (item: string) => (t: RenderTreeBuilder) => {
      t.openElement(0, "button");
      t.addContent(1, item);
      t.closeElement();
    });
    let seq = 3;
    for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value);
    b.closeComponent();
  });
  mounted.push(result);
  const idle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await result.settle();
  };
  await idle();
  const more = () => result.container.querySelector<HTMLButtonElement>("button[aria-label$='Barley']")!;
  const shown = () => [...result.container.querySelectorAll("[class*=overflow__item]:not([inert]) button")].map((button) => button.textContent);
  return { result, idle, more, shown };
}

describe("Overflow", () => {
  it("keeps what fits; the rest behind +N, out of the tab order, named on the button", async () => {
    const { result, more, shown } = await overflow();
    expect(shown()).toEqual(["Rye", "Spelt"]);
    expect(result.container.querySelectorAll("[inert]")).toHaveLength(2);
    expect(more().textContent?.trim()).toBe("+2");
    expect(more().getAttribute("aria-label")).toBe("2 more: Oat, Barley");
    expect(more().hidden).toBe(false);
    expect(more().getAttribute("aria-expanded")).toBe("false");
  });

  it("the button opens the overflowed items in a popup, usable there", async () => {
    const { result, idle, more } = await overflow();
    more().click();
    await idle();
    const popup = result.container.querySelector<HTMLElement>("[role=group]")!;
    expect(popup.getAttribute("aria-label")).toBe("2 more: Oat, Barley");
    // A disclosure: aria-haspopup would promise a menu (or a listbox, a dialog), and the popup is neither.
    expect(more().getAttribute("aria-controls")).toBe(popup.id);
    expect(more().hasAttribute("aria-haspopup")).toBe(false);
    expect([...popup.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Oat", "Barley"]);
    expect(more().getAttribute("aria-expanded")).toBe("true");
    more().click();
    await idle();
    expect(result.container.querySelector("[role=group]")).toBeNull();
  });

  it("onMoreClick takes the button over; itemText names the items", async () => {
    let clicks = 0;
    const { result, idle } = await overflow({ onMoreClick: EventCallback.unbound(() => void clicks++), itemText: (item: string) => item.toUpperCase() });
    const button = result.container.querySelector<HTMLButtonElement>("button[aria-label$='BARLEY']")!;
    expect(button.getAttribute("aria-label")).toBe("2 more: OAT, BARLEY");
    expect(button.hasAttribute("aria-expanded")).toBe(false);
    button.click();
    await idle();
    expect(clicks).toBe(1);
    expect(result.container.querySelector("[role=group]")).toBeNull();
  });
});
