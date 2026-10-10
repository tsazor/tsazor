/**
 * Toolbar (MudBlazor's MudToolBar; the WAI-ARIA toolbar pattern): one tab stop, the arrow keys of its orientation, Bootstrap's .btn-toolbar,
 * a name, dense spacing and wrapping, a vertical Divider between groups.
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderTree, type RenderResult } from "@tsazor/testing";
import type { RenderTreeBuilder } from "@tsazor/runtime";
import { Button, Divider, Toolbar } from "../dist/index.js";

let mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

async function toolbar(attrs: (b: RenderTreeBuilder) => void): Promise<HTMLElement> {
  const result = await renderTree((b) => {
    b.openComponent(0, Toolbar);
    b.addAttribute(1, "ariaLabel", "Formatting");
    attrs(b);
    b.addAttribute(10, "childContent", (c: RenderTreeBuilder) => {
      for (const [index, label] of ["Bold", "Italic", "Underline"].entries()) {
        if (index === 2) {
          c.openComponent(20, Divider);
          c.addAttribute(21, "orientation", "vertical");
          c.closeComponent();
        }
        c.openComponent(30 + index * 2, Button);
        c.addAttribute(31 + index * 2, "childContent", (t: RenderTreeBuilder) => t.addContent(0, label));
        c.closeComponent();
      }
    });
    b.closeComponent();
  });
  mounted.push(result);
  await result.renderer.waitUntilIdle();
  return result.container.querySelector<HTMLElement>("[role=toolbar]")!;
}

const press = (target: Element, key: string) => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

describe("Toolbar", () => {
  it("is a named toolbar with one tab stop", async () => {
    const bar = await toolbar(() => {});
    expect(bar.getAttribute("aria-label")).toBe("Formatting");
    expect(bar.hasAttribute("aria-orientation")).toBe(false);
    expect(bar.className).toBe("btn-toolbar tz-toolbar gap-2 align-items-center flex-nowrap");
    expect([...bar.querySelectorAll("button")].map((button) => button.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(bar.querySelector("[role=separator]")!.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("the arrow keys move between the buttons (and skip the divider), Home and End jump", async () => {
    const bar = await toolbar(() => {});
    const buttons = [...bar.querySelectorAll("button")];
    buttons[0]!.focus();
    press(buttons[0]!, "ArrowRight");
    expect(document.activeElement).toBe(buttons[1]);
    press(buttons[1]!, "ArrowRight");
    expect(document.activeElement).toBe(buttons[2]);
    press(buttons[2]!, "ArrowRight");
    expect(document.activeElement).toBe(buttons[0]);
    press(buttons[0]!, "End");
    expect(document.activeElement).toBe(buttons[2]);
    expect(buttons.map((button) => button.getAttribute("tabindex"))).toEqual(["-1", "-1", "0"]);
  });

  it("vertical takes up and down and says so; small and wrap set their classes", async () => {
    const bar = await toolbar((b) => {
      b.addAttribute(2, "orientation", "vertical");
      b.addAttribute(3, "size", "small");
      b.addAttribute(4, "wrap", true);
      b.addAttribute(5, "class", "mine");
    });
    expect(bar.getAttribute("aria-orientation")).toBe("vertical");
    expect(bar.className).toBe("btn-toolbar tz-toolbar gap-1 flex-column align-items-stretch mine");
    const buttons = [...bar.querySelectorAll("button")];
    buttons[0]!.focus();
    press(buttons[0]!, "ArrowRight");
    expect(document.activeElement).toBe(buttons[0]);
    press(buttons[0]!, "ArrowDown");
    expect(document.activeElement).toBe(buttons[1]);
  });
});
