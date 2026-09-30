/**
 * Tabs behavior tests through the compiled dist pipeline: cascading
 * self-registration, keyboard navigation, roving tabindex and callbacks.
 */
import { afterAll, describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { Tabs, Tab } from "../dist/index.js";

/** The renderer type returned by renderTree. */
type Renderer = Awaited<ReturnType<typeof renderTree>>["renderer"];

/** Waits out the microtask render queue plus the settle timer. */
async function settle(renderer: Renderer): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

/** Renders a Tabs with three labelled tabs and per-tab panel text. */
async function renderTabs(
  onSelected?: (index: number) => void,
): Promise<{ container: HTMLElement; renderer: Renderer }> {
  const { container, renderer } = await renderTree(b => {
    b.openComponent(0, Tabs);
    b.addAttribute(1, "id", "demo-tabs");
    if (onSelected) {
      b.addAttribute(2, "onSelected", EventCallback.unbound(onSelected));
    }
    b.addAttribute(
      3,
      "childContent",
      (c: RenderTreeBuilder) => {
        const titles = ["One", "Two", "Three"];
        const bodies = ["First body", "Second body", "Third body"];
        for (let i = 0; i < titles.length; i++) {
          c.openComponent(i * 3, Tab);
          c.addAttribute(i * 3 + 1, "title", titles[i]!);
          c.addAttribute(i * 3 + 2, "childContent", (t: RenderTreeBuilder) => t.addContent(0, bodies[i]!));
          c.closeComponent();
        }
      },
    );
    b.closeComponent();
  });
  await settle(renderer);
  return { container, renderer };
}

afterAll(() => {
  document.body.innerHTML = "";
});

describe("Tabs", () => {
  it("registers child tabs via the cascade and renders the tab list", async () => {
    const { container } = await renderTabs();
    const buttons = [...container.querySelectorAll(".fui-tabs__list .fui-tab")];
    expect(buttons.map(b => b.textContent)).toEqual(["One", "Two", "Three"]);
    expect(buttons[0]!.getAttribute("aria-selected")).toBe("true");
    expect(buttons[1]!.getAttribute("aria-selected")).toBe("false");
    // Roving tabindex + panel wiring.
    expect(buttons[0]!.getAttribute("tabindex")).toBe("0");
    expect(buttons[1]!.getAttribute("tabindex")).toBe("-1");
    expect(buttons[0]!.getAttribute("id")).toBe("demo-tabs-tab-0");
    expect(buttons[0]!.getAttribute("aria-controls")).toBe("demo-tabs-panel-0");
  });

  it("shows only the active panel and switches on click", async () => {
    const selected: number[] = [];
    const { container, renderer } = await renderTabs((i) => selected.push(i));
    expect(container.querySelector(".fui-tab-panel")!.textContent).toBe("First body");
    const buttons = [...container.querySelectorAll(".fui-tabs__list .fui-tab")];
    buttons[1]!.dispatchEvent(new Event("click", { bubbles: true }));
    await settle(renderer);
    expect(selected).toEqual([1]);
    const panels = [...container.querySelectorAll(".fui-tab-panel")];
    expect(panels).toHaveLength(1);
    expect(panels[0]!.textContent).toBe("Second body");
    expect(panels[0]!.id).toBe("demo-tabs-panel-1");
    expect(buttons[1]!.getAttribute("aria-selected")).toBe("true");
  });

  it("moves with ArrowRight / ArrowLeft and keeps the roving tabindex", async () => {
    const { container, renderer } = await renderTabs();
    const list = container.querySelector(".fui-tabs__list")!;
    const buttons = [...list.querySelectorAll(".fui-tab")];

    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await settle(renderer);
    expect(container.querySelector(".fui-tab-panel")!.textContent).toBe("Second body");
    expect(buttons[0]!.getAttribute("tabindex")).toBe("-1");
    // Focus rode along to the newly selected tab.
    expect(document.activeElement).toBe(buttons[1]!);

    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await settle(renderer);
    expect(container.querySelector(".fui-tab-panel")!.textContent).toBe("First body");
  });

  it("handles Home and End", async () => {
    const { container, renderer } = await renderTabs();
    const list = container.querySelector(".fui-tabs__list")!;

    list.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    await settle(renderer);
    expect(container.querySelector(".fui-tab-panel")!.textContent).toBe("Third body");

    list.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    await settle(renderer);
    expect(container.querySelector(".fui-tab-panel")!.textContent).toBe("First body");
  });
});