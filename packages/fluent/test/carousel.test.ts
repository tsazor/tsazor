/**
 * Carousel (MudBlazor's MudCarousel; the WAI-ARIA carousel pattern): a slide at a time, named "2 of 5"; previous,
 * next and a button per slide; @bind-selectedIndex; itemsSource with itemTemplate; turning by itself until paused,
 * hovered or focused, and announced only when a person turns it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { Carousel, CarouselItem } from "../dist/index.js";

const mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

async function carousel(attrs: Record<string, unknown> = {}, slides: string[] | undefined = ["Rye", "Spelt", "Sourdough"]) {
  class Host extends ComponentBase {
    static last: Host | undefined;
    index = 0;
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      Host.last = this;
      b.openComponent(0, Carousel);
      b.addAttribute(1, "selectedIndex", this.index);
      b.addAttribute(2, "selectedIndexChanged", EventCallback.bind(this, (next: number) => {
        this.index = next;
      }));
      b.addAttribute(3, "ariaLabel", "Today's bread");
      let seq = 4;
      for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value);
      if (slides !== undefined) {
        b.addAttribute(20, "childContent", (c: RenderTreeBuilder) => {
          slides.forEach((slide, i) => {
            c.openComponent(i * 2, CarouselItem);
            c.addAttribute(i * 2 + 1, "childContent", (t: RenderTreeBuilder) => t.addContent(0, slide));
            c.closeComponent();
          });
        });
      }
      b.closeComponent();
    }
  }
  const result = await render(Host);
  mounted.push(result);
  // settle() lets one timer tick pass; under fake timers it is advanced by hand.
  const idle = async () => {
    const settled = result.settle();
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
    await settled;
  };
  const root = () => result.container.querySelector<HTMLElement>("section")!;
  const shown = () => [...result.container.querySelectorAll<HTMLElement>("[aria-roledescription=slide]")].filter((slide) => !slide.hidden).map((slide) => slide.textContent);
  const button = (name: string) => [...result.container.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent) === name)!;
  return { Host, idle, root, shown, button };
}

describe("Carousel", () => {
  it("is a named carousel showing one slide, each a group named by its place", async () => {
    const { root, shown } = await carousel({ autoCycle: false });
    expect(root().getAttribute("aria-roledescription")).toBe("carousel");
    expect(root().getAttribute("aria-label")).toBe("Today's bread");
    expect(shown()).toEqual(["Rye"]);
    const slides = [...root().querySelectorAll("[aria-roledescription=slide]")];
    expect(slides.map((slide) => slide.getAttribute("aria-label"))).toEqual(["1 of 3", "2 of 3", "3 of 3"]);
    expect(slides.map((slide) => slide.getAttribute("role"))).toEqual(["group", "group", "group"]);
  });

  it("previous and next wrap around; a bullet goes to its slide; the parent learns the index", async () => {
    const { Host, idle, shown, button } = await carousel({ autoCycle: false });
    button("Previous slide").click();
    await idle();
    expect(shown()).toEqual(["Sourdough"]);
    expect(Host.last!.index).toBe(2);
    button("Next slide").click();
    await idle();
    expect(shown()).toEqual(["Rye"]);
    button("Slide 2").click();
    await idle();
    expect(shown()).toEqual(["Spelt"]);
    expect(button("Slide 2").getAttribute("aria-current")).toBe("true");
    expect(Host.last!.index).toBe(1);
  });

  it("itemsSource draws its slides through itemTemplate", async () => {
    const { shown } = await carousel({
      autoCycle: false,
      itemsSource: ["Croissant", "Danish"],
      itemTemplate: (item: string) => (b: RenderTreeBuilder) => b.addContent(0, item.toUpperCase()),
    }, undefined);
    expect(shown()).toEqual(["CROISSANT"]);
  });

  it("turns by itself every autoCycleTime ms, silently; not while paused or hovered", async () => {
    vi.useFakeTimers();
    const { idle, root, shown, button } = await carousel({ autoCycleTime: 1000 });
    const slides = () => root().querySelector("[aria-live]")!;
    expect(slides().getAttribute("aria-live")).toBe("off");
    await vi.advanceTimersByTimeAsync(1000);
    await idle();
    expect(shown()).toEqual(["Spelt"]);
    button("Stop the slides").click();
    await idle();
    expect(slides().getAttribute("aria-live")).toBe("polite");
    await vi.advanceTimersByTimeAsync(3000);
    expect(shown()).toEqual(["Spelt"]);
    button("Start the slides").click();
    await idle();
    root().dispatchEvent(new PointerEvent("pointerenter"));
    await idle();
    await vi.advanceTimersByTimeAsync(3000);
    expect(shown()).toEqual(["Spelt"]);
    root().dispatchEvent(new PointerEvent("pointerleave"));
    await idle();
    await vi.advanceTimersByTimeAsync(1000);
    await idle();
    expect(shown()).toEqual(["Sourdough"]);
  });

  it("a swipe from right to left shows the next slide", async () => {
    const { idle, root, shown } = await carousel({ autoCycle: false });
    root().dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 50 }));
    root().dispatchEvent(new PointerEvent("pointerup", { clientX: 100, clientY: 55 }));
    await idle();
    expect(shown()).toEqual(["Spelt"]);
  });
});
