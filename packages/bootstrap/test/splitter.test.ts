/**
 * Splitter (Fluent UI Blazor's FluentMultiSplitter): panes with a bar between each two (role="separator", named, with
 * aria-valuenow), a pane's flex from its size, Enter collapsing a collapsible pane unless onCollapse cancels, and the
 * MultiSplitter aliases. Dragging and the arrow keys need a layout: the skins app's gate checks them in browsers.
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderTree, type RenderResult } from "@tsazor/testing";
import { EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import type { SplitterEventArgs } from "@tsazor/ui";
import { MultiSplitter, Splitter, SplitterPane } from "../dist/index.js";

const PREFIX = "tz";

let mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

const settle = async (result: RenderResult) => {
  for (let i = 0; i < 3; i++) {
    await result.settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

async function splitter(cancelCollapse = false, component: unknown = Splitter): Promise<{ root: HTMLElement; result: RenderResult; collapses: number[] }> {
  const collapses: number[] = [];
  const result = await renderTree((b) => {
    b.openComponent(0, component as never);
    b.addAttribute(1, "onCollapse", EventCallback.unbound((args: SplitterEventArgs) => {
      collapses.push(args.paneIndex);
      args.cancel = cancelCollapse;
    }));
    b.addAttribute(2, "childContent", (c: RenderTreeBuilder) => {
      c.openComponent(0, SplitterPane);
      c.addAttribute(1, "size", "25%");
      c.addAttribute(2, "collapsible", true);
      c.addAttribute(3, "label", "Resize the navigation");
      c.addAttribute(4, "childContent", (d: RenderTreeBuilder) => d.addContent(0, "Nav"));
      c.closeComponent();
      c.openComponent(5, SplitterPane);
      c.addAttribute(6, "childContent", (d: RenderTreeBuilder) => d.addContent(0, "Main"));
      c.closeComponent();
      c.openComponent(7, SplitterPane);
      c.addAttribute(8, "size", "240px");
      c.addAttribute(9, "childContent", (d: RenderTreeBuilder) => d.addContent(0, "Chat"));
      c.closeComponent();
    });
    b.closeComponent();
  });
  mounted.push(result);
  await settle(result);
  return { root: result.container.querySelector<HTMLElement>(`.${PREFIX}-splitter`)!, result, collapses };
}

const panes = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(`.${PREFIX}-splitter__pane`)];
const bars = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>("[role=separator]")];

describe("Splitter", () => {
  it("puts a named, focusable bar between each two panes; a pane's size is its flex basis", async () => {
    const { root } = await splitter();
    expect(root.className).toBe(`${PREFIX}-splitter ${PREFIX}-splitter--horizontal`);
    expect(panes(root).map((pane) => pane.textContent)).toEqual(["Nav", "Main", "Chat"]);
    expect(panes(root).map((pane) => pane.style.flex)).toEqual(["0 0 25%", "1 1 0px", "0 0 240px"]);
    const [first, second] = bars(root);
    expect(bars(root).length).toBe(2);
    expect(first!.getAttribute("aria-label")).toBe("Resize the navigation");
    expect(second!.getAttribute("aria-label")).toBe("Resize");
    expect(first!.getAttribute("tabindex")).toBe("0");
    expect(first!.getAttribute("aria-orientation")).toBe("vertical");
    expect(first!.getAttribute("aria-controls")).toBe(panes(root)[0]!.id);
    expect(first!.hasAttribute("aria-valuenow")).toBe(true);
  });

  it("Enter on a bar collapses its collapsible pane and expands it again", async () => {
    const { root, result, collapses } = await splitter();
    const [first] = bars(root);
    first!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle(result);
    expect(collapses).toEqual([0]);
    expect(panes(root)[0]!.style.flex).toBe("0 0 0px");
    expect(panes(root)[0]!.className).toContain(`${PREFIX}-splitter__pane--collapsed`);
    first!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle(result);
    expect(panes(root)[0]!.style.flex).toBe("0 0 25%");
  });

  it("onCollapse can cancel; MultiSplitter is the same component", async () => {
    const { root, result } = await splitter(true, MultiSplitter);
    bars(root)[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle(result);
    expect(panes(root)[0]!.style.flex).toBe("0 0 25%");
  });
});
