/**
 * ColorPicker (Fluent UI Blazor's FluentColorPicker) and ColorPickerInput (FluentColorPickerInput): swatches and the
 * wheel as radio groups — the arrows move and choose, a click picks —, the nearest swatch marked, the HSV square and
 * hue bar as sliders; the field's hex text, its dialog closing on a pick and on Escape.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { ColorPicker, ColorPickerInput } from "../dist/index.js";

const mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

const press = (target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

async function picker(attrs: Record<string, unknown> = {}, color = "#f44236") {
  class Host extends ComponentBase {
    static last: Host | undefined;
    color = color;
    picks: string[] = [];
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      Host.last = this;
      b.openComponent(0, ColorPicker);
      b.addAttribute(1, "selectedColor", this.color);
      b.addAttribute(2, "selectedColorChanged", EventCallback.bind(this, (next: string) => {
        this.color = next;
      }));
      b.addAttribute(3, "onPick", EventCallback.bind(this, (picked: string) => {
        this.picks.push(picked);
      }));
      let seq = 4;
      for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value);
      b.closeComponent();
    }
  }
  const result = await render(Host);
  mounted.push(result);
  const idle = () => result.settle();
  const radios = () => [...result.container.querySelectorAll<HTMLElement>("[role=radio]")];
  const checked = () => radios().filter((radio) => radio.getAttribute("aria-checked") === "true");
  return { Host, result, idle, radios, checked };
}

describe("ColorPicker", () => {
  it("swatch: a named radio group of 190 swatches, each saying its color, the value's checked and the tab stop", async () => {
    const { result, radios, checked } = await picker();
    expect(result.container.querySelector("[role=radiogroup]")!.getAttribute("aria-label")).toBe("Color");
    expect(radios()).toHaveLength(190);
    expect(checked().map((radio) => radio.getAttribute("aria-label"))).toEqual(["red, #f44236"]);
    expect(radios().filter((radio) => radio.getAttribute("tabindex") === "0")).toEqual(checked());
  });

  it("a click picks a swatch; the arrows move and choose, by one and by a row", async () => {
    const { Host, idle, radios } = await picker();
    radios()[12]!.click();
    await idle();
    expect(Host.last!.color).toBe("#f48fb1");
    expect(Host.last!.picks).toEqual(["#f48fb1"]);
    press(radios()[12]!, "ArrowRight");
    await idle();
    expect(Host.last!.color).toBe("#f06292");
    expect(document.activeElement).toBe(radios()[13]);
    press(radios()[13]!, "ArrowDown");
    await idle();
    expect(Host.last!.color).toBe("#b968c7");
    expect(Host.last!.picks).toEqual(["#f48fb1"]);
    press(radios()[23]!, "Enter");
    await idle();
    expect(Host.last!.picks).toEqual(["#f48fb1", "#b968c7"]);
  });

  it("marks the palette's nearest color when the value isn't in it, unless findClosestColor is off", async () => {
    const near = await picker({ palette: ["#ff0000", "#00ff00", "#0000ff"], columns: 3 }, "#1010f0");
    expect(near.checked().map((radio) => radio.getAttribute("aria-label"))).toEqual(["blue, #0000ff"]);
    const exact = await picker({ palette: ["#ff0000", "#00ff00", "#0000ff"], columns: 3, findClosestColor: false }, "#1010f0");
    expect(exact.checked()).toEqual([]);
  });

  it("wheel: the 127 hexagons as radios, the arrows moving between the rows", async () => {
    const { Host, idle, radios, result } = await picker({ view: "wheel" }, "");
    expect(result.container.querySelector("svg[role=radiogroup]")).not.toBeNull();
    expect(radios()).toHaveLength(127);
    expect(radios()[0]!.getAttribute("tabindex")).toBe("0");
    press(radios()[0]!, "ArrowDown");
    await idle();
    expect(Host.last!.color).toBe(radios()[7]!.getAttribute("fill"));
  });

  it("hsv: a square and a hue bar as sliders the keys move", async () => {
    const { Host, idle, result } = await picker({ view: "hsv" }, "#ff0000");
    const [square, hue] = [...result.container.querySelectorAll<HTMLElement>("[role=slider]")];
    expect(square!.getAttribute("aria-label")).toBe("Saturation and brightness");
    expect(square!.getAttribute("aria-valuetext")).toBe("Saturation 100%, brightness 100%: red, #ff0000"); // the color it makes: the hsv view shows no hex of its own
    expect(hue!.getAttribute("aria-valuenow")).toBe("0");
    press(square!, "ArrowDown", { shiftKey: true });
    await idle();
    expect(Host.last!.color).toBe("#e60000");
    press(hue!, "End");
    await idle();
    expect(hue!.getAttribute("aria-valuenow")).toBe("359");
    press(hue!, "Home");
    press(hue!, "ArrowDown", { shiftKey: true });
    await idle();
    expect(hue!.getAttribute("aria-valuenow")).toBe("10");
    expect(hue!.getAttribute("aria-valuetext")).toBe("10 degrees, red");
    press(square!, "Enter");
    await idle();
    expect(Host.last!.picks).toEqual([Host.last!.color]);
  });

  it("keeps the hue of a gray", async () => {
    const { Host, idle, result } = await picker({ view: "hsv" }, "#3366cc");
    const [square, hue] = [...result.container.querySelectorAll<HTMLElement>("[role=slider]")];
    for (let i = 0; i < 10; i++) press(square!, "ArrowLeft", { shiftKey: true });
    await idle();
    expect(Host.last!.color).toBe("#cccccc");
    expect(hue!.getAttribute("aria-valuenow")).toBe("220");
  });
});

describe("ColorPickerInput", () => {
  async function field(attrs: Record<string, unknown> = {}, value = "#0f6cbd") {
    class Host extends ComponentBase {
      static last: Host | undefined;
      value = value;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        Host.last = this;
        b.openComponent(0, ColorPickerInput);
        b.addAttribute(1, "value", this.value);
        b.addAttribute(2, "valueChanged", EventCallback.bind(this, (next: string) => {
          this.value = next;
        }));
        b.addAttribute(3, "label", "Brand color");
        let seq = 4;
        for (const [name, val] of Object.entries(attrs)) b.addAttribute(seq++, name, val);
        b.closeComponent();
      }
    }
    const result = await render(Host);
    mounted.push(result);
    const idle = () => result.settle();
    return {
      Host,
      idle,
      input: () => result.container.querySelector<HTMLInputElement>("input")!,
      button: () => result.container.querySelector<HTMLButtonElement>("button")!,
      dialog: () => result.container.querySelector<HTMLElement>("[role=dialog]"),
    };
  }

  it("shows the hex code and the color, reads typed codes, keeps other text for validation", async () => {
    const { Host, idle, input, button } = await field();
    expect(input().value).toBe("#0f6cbd");
    expect(button().getAttribute("aria-label")).toBe("Choose color (#0f6cbd)");
    input().value = "#FC0";
    input().dispatchEvent(new Event("change", { bubbles: true }));
    await idle();
    expect(Host.last!.value).toBe("#ffcc00");
    input().value = "blue";
    input().dispatchEvent(new Event("change", { bubbles: true }));
    await idle();
    expect(Host.last!.value).toBe("blue");
  });

  it("the button opens the picker in a dialog on the value; a click on a swatch picks and closes it", async () => {
    const { Host, idle, button, dialog } = await field({}, "#f44236");
    button().click();
    await idle();
    expect(dialog()!.getAttribute("aria-label")).toBe("Choose color");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("red, #f44236");
    dialog()!.querySelectorAll<HTMLElement>("[role=radio]")[20]!.click();
    await idle();
    expect(Host.last!.value).toBe("#f8d5ff");
    expect(dialog()).toBeNull();
  });

  it("the arrows change the color and keep the dialog open; Escape closes it; Alt+ArrowDown opens it", async () => {
    const { Host, idle, input, dialog } = await field({}, "#f44236");
    press(input(), "ArrowDown", { altKey: true });
    await idle();
    expect(dialog()).not.toBeNull();
    press(document.activeElement!, "ArrowRight");
    await idle();
    expect(Host.last!.value).toBe("#e53935");
    expect(dialog()).not.toBeNull();
    press(document.activeElement!, "Escape");
    await idle();
    expect(dialog()).toBeNull();
  });

  it("hideTextInput leaves the button, named by the label and its color, with the field's help", async () => {
    const { input, button } = await field({ hideTextInput: true, help: "The header's color" });
    expect(input()).toBeNull();
    const label = document.querySelector("label")!;
    expect(label.htmlFor).toBe(button().id);
    // Its own aria-label would hide the label: aria-labelledby names it by both ("Brand color Choose color (#0f6cbd)").
    expect(button().getAttribute("aria-labelledby")).toBe(`${label.id} ${button().id}`);
    expect(button().getAttribute("aria-label")).toBe("Choose color (#0f6cbd)");
    const help = document.getElementById(button().getAttribute("aria-describedby")!);
    expect(help?.textContent).toBe("The header's color");
  });
});
