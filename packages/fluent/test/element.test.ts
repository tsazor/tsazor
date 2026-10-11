/**
 * The inputs hold their field as `element` (Blazor's InputBase.Element; Fluent UI Blazor's FocusAsync is
 * `element?.focus()`), so a page focuses one through its @ref.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, type ComponentType, type RenderTreeBuilder } from "@tsazor/runtime";
import { Checkbox, ColorPickerInput, DateInput, DatePicker, NumberInput, Select, Slider, Switch, TextArea, TextInput, TimePicker } from "../dist/index.js";

const mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

describe("an input's element", () => {
  it.each([
    ["TextInput", TextInput, "", "input[type=text]"],
    ["TextArea", TextArea, "", "textarea"],
    ["NumberInput", NumberInput, 1, "input[type=number]"],
    ["Select", Select, "", "select"],
    ["Checkbox", Checkbox, false, "input[type=checkbox]"],
    ["Switch", Switch, false, "input[type=checkbox]"],
    ["DateInput", DateInput, "", "input[type=date]"],
    ["Slider", Slider, 5, "input[type=range]"],
    ["DatePicker", DatePicker, "2026-10-11", "input[type=text]"],
    ["TimePicker", TimePicker, "09:00:00", "input[role=combobox]"],
    ["ColorPickerInput", ColorPickerInput, "#0f6cbd", "input[type=text]"],
  ] as const)("%s: its field, focusable", async (_name, component, value, selector) => {
    let instance: { element?: HTMLElement } | undefined;
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, component as ComponentType);
        b.addAttribute(1, "value", value);
        b.addAttribute(2, "label", "Field");
        b.addComponentReferenceCapture(3, (captured) => {
          instance = captured as { element?: HTMLElement };
        });
        b.closeComponent();
      }
    }
    const result = await render(Host);
    mounted.push(result);
    const field = result.container.querySelector<HTMLElement>(selector);
    expect(field).not.toBeNull();
    expect(instance?.element).toBe(field);
    instance!.element!.focus();
    expect(document.activeElement).toBe(field);
  });
});
