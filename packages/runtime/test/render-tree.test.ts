import { describe, expect, it } from "vitest";
import { RenderTreeBuilder, FrameType, getFrameChildren, getFrameSubtreeLength } from "../src/render-tree/render-tree";
import { ComponentBase, Renderer } from "../src/index";

describe("RenderTreeBuilder", () => {
  it("builds a flat tree with resolved subtree lengths", () => {
    const b = new RenderTreeBuilder();
    b.openElement(0, "div");
    b.addAttribute(1, "class", "box");
    b.openElement(2, "span");
    b.addContent(3, "hello");
    b.closeElement();
    b.closeElement();

    const frames = b.getFrames();
    expect(frames).toHaveLength(4); // div, class-attr, span, text
    expect(frames[0]!.frameType).toBe(FrameType.Element);
    expect(frames[0]!.elementSubtreeLength).toBe(4);
    expect(frames[2]!.elementSubtreeLength).toBe(2);
  });

  it("wraps RenderFragment content in a region frame", () => {
    const b = new RenderTreeBuilder();
    b.addContent(0, (fragment) => {
      fragment.openElement(0, "p");
      fragment.addContent(1, "child");
      fragment.closeElement();
    });

    const frames = b.getFrames();
    expect(frames[0]!.frameType).toBe(FrameType.Region);
    expect(frames[0]!.regionSubtreeLength).toBe(3);
  });

  it("converts content written inside a component frame to ChildContent", () => {
    const b = new RenderTreeBuilder();
    b.openComponent(0, { type: class {} } as never);
    b.addAttribute(1, "Text", "hi");
    b.addContent(2, "hello");
    b.closeComponent();

    const frames = b.getFrames();
    expect(frames[2]!.frameType).toBe(FrameType.Attribute);
    expect(frames[2]!.attributeName).toBe("ChildContent");
    expect(frames[0]!.componentSubtreeLength).toBe(3);
    // Invoking the fragment renders the wrapped text.
    const child = new RenderTreeBuilder();
    (frames[2]!.attributeValue as (builder: typeof b) => void)(child);
    expect(child.getFrames()[0]!.textContent).toBe("hello");
  });

  it("skips attribute frames when listing children", () => {
    const b = new RenderTreeBuilder();
    b.openElement(0, "div");
    b.addAttribute(1, "id", "x");
    b.addContent(2, "text");
    b.openElement(3, "br");
    b.closeElement();
    b.closeElement();

    const children = getFrameChildren(b.getFrames(), 0);
    expect(children.map((c) => c.frame.frameType)).toEqual([FrameType.Text, FrameType.Element]);
  });

  it("supports keys via setKey", () => {
    const b = new RenderTreeBuilder();
    b.openElement(0, "li");
    b.setKey("item-1");
    b.addContent(1, "one");
    b.closeElement();

    const frame = b.getFrames()[0]!;
    expect(frame.elementKey).toBe("item-1");
    expect(getFrameSubtreeLength(frame)).toBe(2); // li + text
  });
});
describe("addContent value rendering (Blazor: value?.ToString())", () => {
  it("renders booleans and bigints as text, null/undefined as nothing", async () => {
    class Values extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, true);
        b.addContent(1, "|");
        b.addContent(2, false);
        b.addContent(3, "|");
        b.addContent(4, 2n ** 60n);
        b.addContent(5, null);
        b.addContent(6, undefined);
        b.addContent(7, 0);
      }
    }
    const container = document.createElement("div");
    const renderer = new Renderer();
    renderer.renderInContainer(Values, container);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe(`true|false|${2n ** 60n}0`);
  });
});
