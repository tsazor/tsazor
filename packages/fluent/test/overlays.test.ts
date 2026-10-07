/**
 * Menu (alias Dropdown), Drawer and Tooltip — the Fluent skin of the
 * @tsazor/ui behaviors: the menu button pattern, a modal drawer, a tooltip
 * that describes its element.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback, type RenderFragment } from "@tsazor/runtime";
import { Drawer, Dropdown, DropdownItem, Menu, MenuItem, Tooltip } from "../dist/index.js";

const text = (content: string): RenderFragment => (b) => b.addContent(0, content);

type Renderer = Awaited<ReturnType<typeof renderTree>>["renderer"];
async function settle(renderer: Renderer): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

beforeAll(() => {
  document.body.innerHTML = "";
});

describe("Menu + MenuItem", () => {
  it("is also exported as Dropdown/DropdownItem (the name both skins share)", () => {
    expect(Dropdown).toBe(Menu);
    expect(DropdownItem).toBe(MenuItem);
  });

  it("toggles the menu, selects an item and closes", async () => {
    let selected = 0;
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Menu);
      b.addAttribute(1, "label", "Actions");
      b.addAttribute(2, "childContent", (inner: typeof b) => {
        inner.openComponent(0, MenuItem);
        inner.addAttribute(1, "onSelect", EventCallback.unbound(() => {
          selected++;
        }));
        inner.addAttribute(2, "childContent", text("Archive"));
        inner.closeComponent();
      });
      b.closeComponent();
    });
    const toggle = container.querySelector<HTMLElement>(".fui-menu-button__toggle")!;
    expect(toggle.className).toBe("fui-button fui-menu-button__toggle");
    expect(container.querySelector(".fui-menu")).toBeNull();
    toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    expect(container.querySelector(".fui-menu")).not.toBeNull();
    container.querySelector(".fui-menu__item")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    expect(selected).toBe(1);
    expect(container.querySelector(".fui-menu")).toBeNull();
  });

  it("follows the menu button pattern: arrow keys open and move, Escape closes and returns focus", async () => {
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Menu);
      b.addAttribute(1, "label", "Order");
      b.addAttribute(2, "childContent", (inner: typeof b) => {
        for (const [seq, label] of [[0, "Copy"], [2, "Paste"], [4, "Print"]] as const) {
          inner.openComponent(seq, MenuItem);
          inner.addAttribute(seq + 1, "childContent", text(label));
          inner.closeComponent();
        }
      });
      b.closeComponent();
    });
    const toggle = container.querySelector<HTMLElement>(".fui-menu-button__toggle")!;
    expect(toggle.getAttribute("aria-haspopup")).toBe("menu");
    toggle.focus();
    toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await settle(renderer);
    const menu = container.querySelector<HTMLElement>("[role=menu]")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(menu.getAttribute("aria-labelledby")).toBe(toggle.id);
    expect(document.activeElement?.textContent).toBe("Print");
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    expect(document.activeElement?.textContent).toBe("Copy");
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle(renderer);
    expect(container.querySelector("[role=menu]")).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });
});

describe("Drawer", () => {
  it("is a modal panel on its edge: focus moves in, Escape asks to close", async () => {
    let closed = 0;
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Drawer);
      b.addAttribute(1, "isOpen", true);
      b.addAttribute(2, "placement", "end");
      b.addAttribute(3, "title", "Filters");
      b.addAttribute(4, "onClosed", EventCallback.unbound(() => {
        closed++;
      }));
      b.addAttribute(5, "childContent", text("Only open orders"));
      b.closeComponent();
    });
    await settle(renderer);
    const panel = container.querySelector<HTMLElement>(".fui-drawer")!;
    expect(panel.className).toBe("fui-drawer fui-drawer--end");
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(panel.getAttribute("aria-labelledby")!)!.textContent).toBe("Filters");
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle(renderer);
    expect(closed).toBe(1);
  });
});

describe("Tooltip", () => {
  it("describes the element inside it, in Fluent's tooltip classes", async () => {
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Tooltip);
      b.addAttribute(1, "text", "Save the order");
      b.addAttribute(2, "childContent", (inner: typeof b) => {
        inner.openElement(0, "button");
        inner.addContent(1, "💾");
        inner.closeElement();
      });
      b.closeComponent();
    });
    await settle(renderer);
    const button = container.querySelector("button")!;
    button.dispatchEvent(new FocusEvent("focusin"));
    const tip = document.getElementById(button.getAttribute("aria-describedby")!)!;
    expect(tip.className).toBe("fui-tooltip");
    expect(tip.getAttribute("role")).toBe("tooltip");
    expect(tip.querySelector(".fui-tooltip__content")!.textContent).toBe("Save the order");
  });
});
