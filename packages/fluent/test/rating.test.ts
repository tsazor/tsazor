/**
 * Rating (MudBlazor's MudRating) and RatingDisplay (Fluent UI Blazor's FluentRatingDisplay): stars as radio buttons in
 * a named group, the keys without wrapping, a click on the value's star clears it, the pointer's preview, readOnly;
 * the display's fill, numbers and text alternative.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, renderTree, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { Rating, RatingDisplay } from "../dist/index.js";

const mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

async function rating(attrs: Record<string, unknown> = {}, value = 3) {
  class Host extends ComponentBase {
    static last: Host | undefined;
    value = value;
    hovered: (number | undefined)[] = [];
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      Host.last = this;
      b.openComponent(0, Rating);
      b.addAttribute(1, "value", this.value);
      b.addAttribute(2, "valueChanged", EventCallback.bind(this, (next: number) => {
        this.value = next;
      }));
      b.addAttribute(3, "hoveredValueChanged", EventCallback.bind(this, (star: number | undefined) => {
        this.hovered.push(star);
      }));
      let seq = 4;
      for (const [name, val] of Object.entries(attrs)) b.addAttribute(seq++, name, val);
      b.closeComponent();
    }
  }
  const result = await render(Host);
  mounted.push(result);
  const idle = () => result.settle();
  const group = () => result.container.querySelector<HTMLElement>("[role=radiogroup]")!;
  const radios = () => [...result.container.querySelectorAll<HTMLInputElement>("input[type=radio]")];
  const key = async (target: Element, name: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    await idle();
    return event;
  };
  return { Host, idle, group, radios, key };
}

describe("Rating", () => {
  it("is a named group of radio buttons, one per star, the value's checked", async () => {
    const { group, radios } = await rating();
    expect(group().getAttribute("aria-label")).toBe("Rating");
    expect(radios().map((radio) => radio.getAttribute("aria-label"))).toEqual(["1 star", "2 stars", "3 stars", "4 stars", "5 stars"]);
    expect(radios().map((radio) => radio.checked)).toEqual([false, false, true, false, false]);
    expect(new Set(radios().map((radio) => radio.name)).size).toBe(1);
    expect(group().querySelectorAll(".fui-rating__item--full")).toHaveLength(3);
  });

  it("a click picks a star; a click on the value's star clears it", async () => {
    const { Host, idle, radios } = await rating();
    radios()[4]!.click();
    await idle();
    expect(Host.last!.value).toBe(5);
    radios()[4]!.click();
    await idle();
    expect(Host.last!.value).toBe(0);
    expect(radios().some((radio) => radio.checked)).toBe(false);
  });

  it("the arrows move the value without wrapping, Shift and Home/End to the ends, the focus following", async () => {
    const { Host, radios, key } = await rating({}, 4);
    radios()[3]!.focus();
    let event = await key(radios()[3]!, "ArrowRight");
    expect(event.defaultPrevented).toBe(true);
    expect(Host.last!.value).toBe(5);
    expect(document.activeElement).toBe(radios()[4]);
    event = await key(radios()[4]!, "ArrowRight");
    expect(event.defaultPrevented).toBe(true);
    expect(Host.last!.value).toBe(5);
    await key(radios()[4]!, "ArrowLeft", { shiftKey: true });
    expect(Host.last!.value).toBe(0);
    expect(document.activeElement).toBe(radios()[0]);
    await key(radios()[0]!, "End");
    expect(Host.last!.value).toBe(5);
    await key(radios()[4]!, "ArrowDown");
    expect(Host.last!.value).toBe(4);
  });

  it("the pointer previews a value and tells the parent", async () => {
    const { Host, idle, group } = await rating({}, 1);
    const labels = [...group().querySelectorAll("label")];
    labels[3]!.dispatchEvent(new PointerEvent("pointerenter"));
    await idle();
    expect(group().querySelectorAll(".fui-rating__item--full")).toHaveLength(4);
    group().dispatchEvent(new PointerEvent("pointerleave"));
    await idle();
    expect(group().querySelectorAll(".fui-rating__item--full")).toHaveLength(1);
    expect(Host.last!.hovered).toEqual([4, undefined]);
  });

  it("readOnly keeps the value and says so; disabled disables the radios", async () => {
    const readOnly = await rating({ readOnly: true });
    expect(readOnly.group().getAttribute("aria-readonly")).toBe("true");
    readOnly.radios()[0]!.click();
    await readOnly.idle();
    expect(readOnly.Host.last!.value).toBe(3);
    // A browser also puts the check back (a canceled click on a radio); happy-dom leaves it, so the value tells.
    await readOnly.key(readOnly.radios()[2]!, "ArrowRight");
    expect(readOnly.Host.last!.value).toBe(3);
    const disabled = await rating({ disabled: true });
    expect(disabled.radios().every((radio) => radio.disabled)).toBe(true);
  });

  it("max, labels and color", async () => {
    const { group, radios } = await rating({ max: 3, color: "marigold", labels: { item: (value: number, max: number) => `${value} von ${max}` } });
    expect(radios().map((radio) => radio.getAttribute("aria-label"))).toEqual(["1 von 3", "2 von 3", "3 von 3"]);
    expect(group().className).toContain("fui-rating--marigold");
  });
});

describe("RatingDisplay", () => {
  async function display(attrs: Record<string, unknown>): Promise<HTMLElement> {
    const result = await renderTree((b) => {
      b.openComponent(0, RatingDisplay);
      let seq = 1;
      for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value);
      b.closeComponent();
    });
    mounted.push(result);
    await result.settle();
    return result.container.querySelector<HTMLElement>("[role=img]")!;
  }

  it("fills the stars to the value, halves too, and is one image with a text alternative", async () => {
    const root = await display({ value: 3.5, count: 1234, locale: "en-US" });
    expect(root.getAttribute("aria-label")).toBe("Rated 3.5 out of 5, 1,234 ratings");
    const fills = [...root.querySelectorAll<HTMLElement>(".fui-rating-display__item")].map((item) => item.style.getPropertyValue("--fui-rating-fill"));
    expect(fills).toEqual(["100%", "100%", "100%", "50%", "0%"]);
    expect(root.querySelector(".fui-rating-display__value")!.textContent).toBe("3.5");
    expect(root.querySelector(".fui-rating-display__count")!.textContent).toBe("1,234");
    expect([...root.children].every((child) => child.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("compact shows one star; the locale writes the numbers", async () => {
    const root = await display({ value: 4.5, count: 1234, compact: true, locale: "de-DE" });
    expect(root.querySelectorAll(".fui-rating-display__item")).toHaveLength(1);
    expect(root.querySelector(".fui-rating-display__value")!.textContent).toBe("4,5");
    expect(root.getAttribute("aria-label")).toBe("Rated 4,5 out of 5, 1.234 ratings");
  });

  it("without a count, the value only", async () => {
    const root = await display({ value: 4, max: 10, locale: "en-US" });
    expect(root.querySelectorAll(".fui-rating-display__item")).toHaveLength(10);
    expect(root.querySelector(".fui-rating-display__count")).toBeNull();
    expect(root.getAttribute("aria-label")).toBe("Rated 4 out of 10");
  });
});
