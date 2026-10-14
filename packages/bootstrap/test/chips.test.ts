/**
 * Chip and ChipSet (MudBlazor's MudChip, MudChipSet): selection by mode with two-way binding, check marks, close
 * buttons and Delete, the focus after a close, and a chip alone as label, toggle and link.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, renderTree, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { Chip, ChipSet } from "../dist/index.js";

let mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

const keep = (result: RenderResult) => (mounted.push(result), result);
const settle = async (result: RenderResult) => {
  await result.settle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await result.settle();
};

/** A page with a set of fruit chips bound to `selected`, whose closed chips leave `fruits`. */
function pageWith(mode: string, options: { checkMark?: boolean; allClosable?: boolean } = {}) {
  return class Page extends ComponentBase {
    static last: Page | undefined;
    fruits = ["Apple", "Banana", "Cherry"];
    selected: string[] = ["Banana"];
    closed: string[] = [];
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      Page.last = this;
      b.openComponent(0, ChipSet);
      b.addAttribute(1, "selectionMode", mode);
      b.addAttribute(2, "selectedValues", this.selected);
      b.addAttribute(3, "selectedValuesChanged", EventCallback.bind(this, (values: string[]) => {
        this.selected = values;
      }));
      b.addAttribute(4, "checkMark", options.checkMark ?? false);
      b.addAttribute(5, "allClosable", options.allClosable ?? false);
      b.addAttribute(6, "ariaLabel", "Fruit");
      b.addAttribute(7, "onClose", EventCallback.bind(this, (value: string) => {
        this.closed.push(value);
        this.fruits = this.fruits.filter((fruit) => fruit !== value);
      }));
      b.addAttribute(8, "childContent", (c: RenderTreeBuilder) => {
        for (const fruit of this.fruits) {
          c.openComponent(0, Chip);
          c.setKey(fruit);
          c.addAttribute(1, "text", fruit);
          c.closeComponent();
        }
      });
      b.closeComponent();
    }
  };
}

const pressed = (container: Element) =>
  [...container.querySelectorAll("[data-chip] > :first-child")].map((button) => `${button.textContent}:${button.getAttribute("aria-pressed")}`);
const click = (container: Element, text: string) =>
  ([...container.querySelectorAll<HTMLElement>("[data-chip] > :first-child")].find((button) => button.textContent === text))!.click();

describe("ChipSet", () => {
  it("multiple: a click adds or removes a chip, two-way bound", async () => {
    const Page = pageWith("multiple");
    const result = keep(await render(Page));
    await settle(result);
    expect(result.container.querySelector("[role=group]")!.getAttribute("aria-label")).toBe("Fruit");
    expect(pressed(result.container)).toEqual(["Apple:false", "Banana:true", "Cherry:false"]);
    click(result.container, "Apple");
    await settle(result);
    click(result.container, "Banana");
    await settle(result);
    expect(Page.last!.selected).toEqual(["Apple"]);
    expect(pressed(result.container)).toEqual(["Apple:true", "Banana:false", "Cherry:false"]);
  });

  it("single keeps one chip; toggle can leave none", async () => {
    const Single = pageWith("single");
    const single = keep(await render(Single));
    await settle(single);
    click(single.container, "Banana");
    await settle(single);
    click(single.container, "Cherry");
    await settle(single);
    expect(Single.last!.selected).toEqual(["Cherry"]);
    const Toggle = pageWith("toggle");
    const toggle = keep(await render(Toggle));
    await settle(toggle);
    click(toggle.container, "Banana");
    await settle(toggle);
    expect(Toggle.last!.selected).toEqual([]);
  });

  it("checkMark marks the selected chip; none makes plain labels", async () => {
    const Marked = pageWith("single", { checkMark: true });
    const marked = keep(await render(Marked));
    await settle(marked);
    const banana = [...marked.container.querySelectorAll("[data-chip]")].find((chip) => chip.textContent === "Banana")!;
    expect(banana.querySelector("svg")).not.toBeNull();
    expect(banana.className).toContain("text-bg-primary");
    const Plain = pageWith("none");
    const plain = keep(await render(Plain));
    await settle(plain);
    expect(plain.container.querySelectorAll("button").length).toBe(0);
  });

  it("allClosable: a close button per chip; Delete closes the focused chip and the focus moves on", async () => {
    const Page = pageWith("multiple", { allClosable: true });
    const result = keep(await render(Page));
    await settle(result);
    const removes = [...result.container.querySelectorAll<HTMLElement>(".btn-close")];
    expect(removes.map((button) => button.getAttribute("aria-label"))).toEqual(["Remove Apple", "Remove Banana", "Remove Cherry"]);
    removes[0]!.click();
    await settle(result);
    expect(Page.last!.closed).toEqual(["Apple"]);
    const banana = [...result.container.querySelectorAll<HTMLElement>("[data-chip] > :first-child")].find((button) => button.textContent === "Banana")!;
    banana.focus();
    banana.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    await settle(result);
    expect(Page.last!.fruits).toEqual(["Cherry"]);
    expect(document.activeElement?.textContent).toBe("Cherry");
  });
});

describe("Chip alone", () => {
  async function chip(attrs: (b: RenderTreeBuilder) => void): Promise<HTMLElement> {
    const result = keep(await renderTree((b) => {
      b.openComponent(0, Chip);
      attrs(b);
      b.closeComponent();
    }));
    await settle(result);
    return result.container.querySelector<HTMLElement>("[data-chip]")!;
  }

  it("is a label, a toggle with selectedChanged, or a link", async () => {
    const label = await chip((b) => b.addAttribute(1, "text", "Draft"));
    expect(label.querySelector("button, a")).toBeNull();
    expect(label.className).toContain("bg-secondary-subtle");
    const toggled: boolean[] = [];
    const toggle = await chip((b) => {
      b.addAttribute(1, "text", "Mine");
      b.addAttribute(2, "selectedChanged", EventCallback.unbound((value: boolean) => {
        toggled.push(value);
      }));
    });
    toggle.querySelector<HTMLElement>("button")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(toggled).toEqual([true]);
    expect(toggle.querySelector("button")!.getAttribute("aria-pressed")).toBe("false");
    const link = await chip((b) => {
      b.addAttribute(1, "text", "Docs");
      b.addAttribute(2, "href", "https://example.com");
      b.addAttribute(3, "target", "_blank");
    });
    expect(link.querySelector("a")!.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("onClose gives it a close button that reports its value", async () => {
    const closed: unknown[] = [];
    const tag = await chip((b) => {
      b.addAttribute(1, "text", "Urgent");
      b.addAttribute(2, "value", 7);
      b.addAttribute(3, "onClose", EventCallback.unbound((value: unknown) => {
        closed.push(value);
      }));
    });
    tag.querySelector<HTMLElement>(".btn-close")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(closed).toEqual([7]);
  });
});
