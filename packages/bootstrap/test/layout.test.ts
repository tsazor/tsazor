/**
 * Switch, Stack and Divider — the components the Bootstrap skin shares with
 * @tsazor/fluent: same parameters, Bootstrap classes.
 */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback, type RenderFragment } from "@tsazor/runtime";
import { Divider, Stack, Switch } from "../dist/index.js";

const text = (content: string): RenderFragment => (b) => b.addContent(0, content);

describe("Switch", () => {
  it("is a role=switch checkbox in .form-switch and reports the new value", async () => {
    const values: boolean[] = [];
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Switch);
      b.addAttribute(1, "label", "Reminders");
      b.addAttribute(2, "value", false);
      b.addAttribute(3, "valueChanged", EventCallback.unbound((value: boolean) => {
        values.push(value);
      }));
      b.closeComponent();
    });
    const input = container.querySelector<HTMLInputElement>("input")!;
    expect(container.querySelector(".form-check.form-switch")).not.toBeNull();
    expect(input.getAttribute("role")).toBe("switch");
    expect(container.querySelector(`label[for="${input.id}"]`)!.textContent).toBe("Reminders");
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await renderer.waitUntilIdle();
    expect(values).toEqual([true]);
  });
});

describe("Stack", () => {
  it("maps direction, gap, align, justify and wrap to the flex utilities", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Stack);
      b.addAttribute(1, "direction", "vertical");
      b.addAttribute(2, "gap", "m");
      b.addAttribute(3, "align", "center");
      b.addAttribute(4, "justify", "space-between");
      b.addAttribute(5, "wrap", true);
      b.addAttribute(6, "childContent", text("items"));
      b.closeComponent();
    });
    expect(container.firstElementChild!.className).toBe("d-flex flex-column gap-3 align-items-center justify-content-between flex-wrap");
  });
});

describe("Divider", () => {
  it("is an hr across, or a .vr between items in a row, as a separator", async () => {
    const across = await renderTree((b) => {
      b.openComponent(0, Divider);
      b.closeComponent();
    });
    const hr = across.container.querySelector("hr")!;
    expect(hr.getAttribute("role")).toBe("separator");
    expect(hr.getAttribute("aria-orientation")).toBe("horizontal");
    const between = await renderTree((b) => {
      b.openComponent(0, Divider);
      b.addAttribute(1, "orientation", "vertical");
      b.addAttribute(2, "appearance", "stronger");
      b.closeComponent();
    });
    const vr = between.container.querySelector("[role=separator]")!;
    expect(vr.className).toBe("vr opacity-75");
    expect(vr.getAttribute("aria-orientation")).toBe("vertical");
  });
});
