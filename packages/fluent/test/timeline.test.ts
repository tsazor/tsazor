/**
 * Timeline (MudBlazor's MudTimeline): an ordered list of items with their content, the opposite content and a dot;
 * the timeline's orientation, position and align, an item's own align, a solid or outlined dot, a hidden one.
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderTree, type RenderResult } from "@tsazor/testing";
import type { RenderTreeBuilder } from "@tsazor/runtime";
import { icon } from "@tsazor/ui";
import { Timeline, TimelineItem } from "../dist/index.js";

const PREFIX = "fui";
const star = icon("star", '<svg viewBox="0 0 16 16"><path d="M8 1l2 5h5l-4 3 2 6-5-4-5 4 2-6-4-3h5z"/></svg>');

let mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

async function timeline(attrs: (b: RenderTreeBuilder) => void, items: (c: RenderTreeBuilder) => void): Promise<HTMLElement> {
  const result = await renderTree((b) => {
    b.openComponent(0, Timeline);
    attrs(b);
    b.addAttribute(10, "childContent", items);
    b.closeComponent();
  });
  mounted.push(result);
  await result.renderer.waitUntilIdle();
  return result.container.querySelector<HTMLElement>("ol")!;
}

const text = (content: string) => (b: RenderTreeBuilder) => b.addContent(0, content);

describe("Timeline", () => {
  it("is an ordered list of items, each with its opposite content, a dot and its content", async () => {
    const list = await timeline((b) => b.addAttribute(1, "aria-label", "History"), (c) => {
      c.openComponent(0, TimelineItem);
      c.addAttribute(1, "itemOpposite", text("06:10"));
      c.addAttribute(2, "itemContent", text("Baked"));
      c.closeComponent();
      c.openComponent(3, TimelineItem);
      c.addAttribute(4, "childContent", text("Picked up"));
      c.closeComponent();
    });
    expect(list.getAttribute("aria-label")).toBe("History");
    expect(list.className).toBe(`${PREFIX}-timeline ${PREFIX}-timeline--vertical ${PREFIX}-timeline--alternate`);
    const items = [...list.querySelectorAll("li")];
    expect(items.map((li) => li.querySelector(`.${PREFIX}-timeline__content`)!.textContent)).toEqual(["Baked", "Picked up"]);
    expect(items[0]!.querySelector(`.${PREFIX}-timeline__opposite`)!.textContent).toBe("06:10");
    expect(items[0]!.querySelector(`.${PREFIX}-timeline__dot`)!.getAttribute("aria-hidden")).toBe("true");
  });

  it("orientation, position, reverse and the align reach the items; an item's own align wins", async () => {
    const list = await timeline((b) => {
      b.addAttribute(1, "orientation", "horizontal");
      b.addAttribute(2, "position", "end");
      b.addAttribute(3, "align", "center");
      b.addAttribute(4, "reverse", true);
    }, (c) => {
      c.openComponent(0, TimelineItem);
      c.closeComponent();
      c.openComponent(1, TimelineItem);
      c.addAttribute(2, "align", "end");
      c.closeComponent();
    });
    expect(list.className).toBe(`${PREFIX}-timeline ${PREFIX}-timeline--horizontal ${PREFIX}-timeline--end ${PREFIX}-timeline--reverse`);
    expect([...list.querySelectorAll("li")].map((li) => li.className)).toEqual([
      `${PREFIX}-timeline__item ${PREFIX}-timeline__item--align-center`,
      `${PREFIX}-timeline__item ${PREFIX}-timeline__item--align-end`,
    ]);
  });

  it("a solid dot with an icon in a color, a large one, and a hidden one", async () => {
    const list = await timeline(() => {}, (c) => {
      c.openComponent(0, TimelineItem);
      c.addAttribute(1, "appearance", "solid");
      c.addAttribute(2, "intent", "success");
      c.addAttribute(3, "icon", star);
      c.addAttribute(4, "size", "large");
      c.closeComponent();
      c.openComponent(5, TimelineItem);
      c.addAttribute(6, "hideDot", true);
      c.closeComponent();
    });
    const [first, second] = [...list.querySelectorAll("li")];
    const dot = first!.querySelector(`.${PREFIX}-timeline__dot`)!;
    expect(dot.className).toContain(`${PREFIX}-timeline__dot--filled`);
    expect(dot.className).toContain(`${PREFIX}-timeline__dot--large`);
    expect(dot.querySelector("svg")!.getAttribute("width")).toBe("20");
    expect(second!.querySelector(`.${PREFIX}-timeline__dot`)).toBeNull();
  });
});
