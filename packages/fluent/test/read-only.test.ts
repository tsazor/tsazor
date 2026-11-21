/**
 * `readOnly` on the text and boolean inputs (MudBlazor's and Fluent UI Blazor's `ReadOnly`; BlazorHero's user list
 * shows each user's flags in read-only boxes, the user profile its fields in read-only text fields, B48), and on the
 * choice inputs: where HTML has no readonly (a select, radios, a range), the value says aria-readonly and holds.
 */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback } from "@tsazor/runtime";
import { Autocomplete, Checkbox, CheckboxGroup, DateInput, NumberInput, RadioGroup, Select, Slider, Switch, TextArea, TextInput } from "../dist/index.js";

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

describe("readOnly on the choice inputs", () => {
  /** Renders one component with its parameters; `changes` collects what it reports. */
  async function one(component: unknown, parameters: Record<string, unknown>, changed = "valueChanged") {
    const changes: unknown[] = [];
    const result = await renderTree((b) => {
      b.openComponent(0, component as never);
      let sequence = 1;
      for (const [name, value] of Object.entries(parameters)) b.addAttribute(sequence++, name, value);
      b.addAttribute(sequence, changed, EventCallback.unbound((value: unknown) => changes.push(value)));
      b.closeComponent();
    });
    return { ...result, changes };
  }
  const key = (target: Element, name: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it("DateInput: the native readonly", async () => {
    const { container } = await one(DateInput, { label: "Due", value: "2026-10-21", readOnly: true });
    const input = container.querySelector("input") as HTMLInputElement;
    expect([input.readOnly, input.disabled]).toEqual([true, false]);
  });

  it("Select: aria-readonly, no opening, the keys pick nothing, a change goes back", async () => {
    const { container, changes, settle } = await one(Select, {
      label: "Topic",
      value: "a",
      readOnly: true,
      childContent: (b: { openElement(s: number, t: string): void; addAttribute(s: number, n: string, v: unknown): void; addContent(s: number, c: string): void; closeElement(): void }) => {
        for (const [i, option] of ["a", "b"].entries()) {
          b.openElement(i * 3, "option");
          b.addAttribute(i * 3 + 1, "value", option);
          b.addContent(i * 3 + 2, option);
          b.closeElement();
        }
      },
    });
    const select = container.querySelector("select") as HTMLSelectElement;
    expect([select.getAttribute("aria-readonly"), select.disabled]).toEqual(["true", false]);
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    select.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    expect([key(select, "ArrowDown"), key(select, "b"), key(select, "Tab"), key(select, "c", { ctrlKey: true })]).toEqual([true, true, false, false]);
    select.value = "b";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    expect([select.value, changes]).toEqual(["a", []]);
  });

  it("RadioGroup: a radiogroup that says aria-readonly; a click or an arrow key picks nothing", async () => {
    const { container, changes, settle } = await one(RadioGroup, {
      label: "Size",
      value: "s",
      readOnly: true,
      options: [{ value: "s", label: "Small" }, { value: "l", label: "Large" }],
    });
    const group = container.querySelector("fieldset")!;
    expect([group.getAttribute("role"), group.getAttribute("aria-readonly")]).toEqual(["radiogroup", "true"]);
    const [small, large] = [...container.querySelectorAll("input")] as HTMLInputElement[];
    large!.click();
    await settle();
    // A browser also checks Small again (legacy-canceled-activation; Chromium, Firefox and WebKit, probed); happy-dom
    // only takes the click back.
    expect([large!.checked, changes]).toEqual([false, []]);
    expect(key(small!, "ArrowDown")).toBe(true);
  });

  it("CheckboxGroup: each box says aria-readonly, a click changes nothing", async () => {
    const { container, changes, settle } = await one(CheckboxGroup, {
      label: "Toppings",
      value: ["cheese"],
      readOnly: true,
      options: [{ value: "cheese", label: "Cheese" }, { value: "olives", label: "Olives" }],
    });
    const boxes = [...container.querySelectorAll("input")] as HTMLInputElement[];
    expect(boxes.map((box) => box.getAttribute("aria-readonly"))).toEqual(["true", "true"]);
    boxes[1]!.click();
    boxes[0]!.click();
    await settle();
    expect([boxes[0]!.checked, boxes[1]!.checked, changes]).toEqual([true, false, []]);
  });

  it("Slider: aria-readonly; a drag, a key or an input moves nothing", async () => {
    const { container, changes, settle } = await one(Slider, { label: "Oven", min: 0, max: 100, value: 40, readOnly: true });
    const range = container.querySelector("input[type=range]") as HTMLInputElement;
    expect([range.getAttribute("aria-readonly"), range.disabled]).toEqual(["true", false]);
    const drag = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    range.dispatchEvent(drag);
    expect([drag.defaultPrevented, key(range, "ArrowRight"), key(range, "Tab")]).toEqual([true, true, false]);
    range.value = "70";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    expect([range.value, changes]).toEqual(["40", []]);
  });

  it("Autocomplete: the native readonly, no list, the chips not removable", async () => {
    const { container, changes, settle } = await one(
      Autocomplete,
      { label: "Brands", items: ["Rye", "Wheat"], selectedOptions: ["Rye"], readOnly: true },
      "selectedOptionsChanged",
    );
    const input = container.querySelector("input[role=combobox]") as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    key(input, "ArrowDown");
    key(input, "Backspace");
    await settle();
    expect([container.querySelector("[role=listbox]"), changes]).toEqual([null, []]);
    expect((container.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
