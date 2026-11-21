/**
 * Slider (Fluent UI Blazor's FluentSlider, MudBlazor's MudSlider): a native range input with min, max and step; the
 * bound value follows the drag once it pauses (immediateDelay), or waits for the release; the rail's fill, tick
 * marks with labels, a value label whose format screen readers read too, vertical; Bootstrap's .form-range.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { Slider } from "../dist/index.js";



const hosts: RenderResult[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
  document.body.innerHTML = "";
});

/** A page that binds `volume` to the slider, as `@bind-Value="volume"` does. */
function hostOf(attrs: Record<string, unknown>) {
  return class Host extends ComponentBase {
    static last: Host | undefined;
    volume = 40;
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      Host.last = this;
      b.openComponent(0, Slider);
      b.addAttribute(1, "value", this.volume);
      b.addAttribute(2, "valueChanged", EventCallback.bind(this, (value: number) => {
        this.volume = value;
      }));
      b.addAttribute(3, "label", "Volume");
      let seq = 4;
      for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value);
      b.closeComponent();
    }
  };
}

async function mount(attrs: Record<string, unknown> = {}) {
  const Host = hostOf(attrs);
  const result = await render(Host);
  hosts.push(result);
  const input = result.container.querySelector<HTMLInputElement>("input[type=range]")!;
  return { Host, result, input, wrapper: result.container.firstElementChild as HTMLElement };
}

async function move(result: RenderResult, input: HTMLInputElement, value: string, eventName = "input"): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event(eventName, { bubbles: true }));
  await result.settle();
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Slider", () => {
  it("is a labelled range input with min, max and step, at the bound value", async () => {
    const { input, wrapper, result } = await mount({ min: 0, max: 1000, step: 50 });
    expect(input.min).toBe("0");
    expect(input.max).toBe("1000");
    expect(input.step).toBe("50");
    expect(input.value).toBe("40");
    expect(result.container.querySelector("label")!.htmlFor).toBe(input.id);
    expect(wrapper.className).toBe("mb-3 tz-slider tz-slider--horizontal");
    expect(input.className).toBe("form-range");
  });

  it("the value follows the drag once it pauses; the value label follows at once", async () => {
    const { Host, input, result } = await mount({ immediateDelay: 30, valueLabel: true });
    await move(result, input, "55");
    await move(result, input, "60");
    expect(Host.last!.volume).toBe(40);
    expect(result.container.querySelector("output")!.textContent).toBe("60");
    expect(input.value).toBe("60");
    await pause(60);
    await result.settle();
    expect(Host.last!.volume).toBe(60);
    expect(input.value).toBe("60");
  });

  it("immediate false waits for the release (change)", async () => {
    const { Host, input, result } = await mount({ immediate: false });
    await move(result, input, "70");
    await pause(80);
    expect(Host.last!.volume).toBe(40);
    await move(result, input, "70", "change");
    expect(Host.last!.volume).toBe(70);
  });

  it("tick marks per step with their labels, hidden from screen readers", async () => {
    const { result } = await mount({ step: 25, tickMarks: true, tickMarkLabels: ["Off", "Low", "Mid", "High", "Max"] });
    const ticks = result.container.querySelector(`.tz-slider__ticks`)!;
    expect(ticks.getAttribute("aria-hidden")).toBe("true");
    const marks = [...ticks.querySelectorAll<HTMLElement>(`.tz-slider__tick`)];
    expect(marks.map((mark) => mark.textContent!.trim())).toEqual(["Off", "Low", "Mid", "High", "Max"]);
    expect(marks[1]!.getAttribute("style")).toContain("--tz-slider-tick: 0.25");
  });

  it("a screen reader hears the label of the tick the value sits on (the tick labels are hidden from it)", async () => {
    const { input, result } = await mount({ step: 25, tickMarks: true, tickMarkLabels: ["Off", "Low", "Mid", "High", "Max"] });
    expect(input.hasAttribute("aria-valuetext")).toBe(false); // 40: between ticks, the number says it
    await move(result, input, "50", "change");
    expect(input.getAttribute("aria-valuetext")).toBe("Mid");
    await move(result, input, "100", "change");
    expect(input.getAttribute("aria-valuetext")).toBe("Max");
  });

  it("a value label in the value's format, which screen readers read (aria-valuetext)", async () => {
    const { input, result } = await mount({ valueLabel: true, valueFormat: (value: number) => `${value} %` });
    const output = result.container.querySelector("output")!;
    expect(output.textContent).toBe("40 %");
    expect(output.getAttribute("aria-hidden")).toBe("true");
    expect(input.getAttribute("aria-valuetext")).toBe("40 %");
    await move(result, input, "45");
    expect(output.textContent).toBe("45 %");
    expect(input.getAttribute("aria-valuetext")).toBe("45 %");
  });

  it("vertical, small and disabled", async () => {
    const { input, wrapper } = await mount({ orientation: "vertical", size: "small", disabled: true });
    expect(input.getAttribute("aria-orientation")).toBe("vertical");
    expect(input.disabled).toBe(true);
    expect(wrapper.className).toBe("mb-3 tz-slider tz-slider--vertical tz-slider--small");
  });
});
