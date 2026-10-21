/**
 * `readOnly` on the text and boolean inputs (MudBlazor's and Fluent UI Blazor's `ReadOnly`; BlazorHero's user list
 * shows each user's flags in read-only boxes, the user profile its fields in read-only text fields, B48).
 */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback } from "@tsazor/runtime";
import { Checkbox, NumberInput, Switch, TextArea, TextInput } from "../dist/index.js";

describe("readOnly", () => {
  it("makes the text inputs readonly, not disabled", async () => {
    for (const component of [TextInput, TextArea, NumberInput]) {
      const { container } = await renderTree((b) => {
        b.openComponent(0, component);
        b.addAttribute(1, "label", "Field");
        b.addAttribute(2, "readOnly", true);
        b.closeComponent();
      });
      const field = container.querySelector("input, textarea") as HTMLInputElement;
      expect(field.readOnly).toBe(true);
      expect(field.disabled).toBe(false);
    }
  });

  it("keeps a box's and a switch's state: aria-readonly, a click changes nothing", async () => {
    for (const component of [Checkbox, Switch]) {
      const captured: boolean[] = [];
      const { container, settle } = await renderTree((b) => {
        b.openComponent(0, component);
        b.addAttribute(1, "label", "Active");
        b.addAttribute(2, "value", true);
        b.addAttribute(3, "valueChanged", EventCallback.unbound((value: boolean) => captured.push(value)));
        b.addAttribute(4, "readOnly", true);
        b.closeComponent();
      });
      const input = container.querySelector("input") as HTMLInputElement;
      expect(input.getAttribute("aria-readonly")).toBe("true");
      expect(input.disabled).toBe(false);
      input.click();
      await settle();
      expect(input.checked).toBe(true);
      expect(captured).toEqual([]);
    }
  });

  it("is off by default: no readonly, no aria-readonly", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Checkbox);
      b.addAttribute(1, "label", "Active");
      b.closeComponent();
    });
    expect(container.querySelector("input")!.hasAttribute("aria-readonly")).toBe(false);
  });
});
