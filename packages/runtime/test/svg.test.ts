/**
 * SVG namespace handling (Blazor's BrowserRenderer rule): <svg> and its
 * descendants are created in the SVG namespace, <foreignObject> content is
 * HTML again, components and markup blocks inside SVG inherit the namespace.
 * Without it browsers render <path>/<polyline> as HTMLUnknownElement (nothing).
 */
import { describe, expect, it } from "vitest";
import { ComponentBase, Renderer, defineComponent, type RenderTreeBuilder } from "../src/index";

const SVG = "http://www.w3.org/2000/svg";
const HTML = "http://www.w3.org/1999/xhtml";

type Build = (b: RenderTreeBuilder) => void;

class Fn extends ComponentBase {
  build: Build = () => {};
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.build(b);
  }
  rerender(): void {
    this.stateHasChanged();
  }
}

/** Renders a <circle> — used as a component inside an <svg>. */
class Dot extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "circle");
    b.addAttribute(1, "r", "2");
    b.closeElement();
  }
}

async function render(build: Build): Promise<{ container: HTMLElement; rerender(next: Build): Promise<void> }> {
  const container = document.createElement("div");
  const renderer = new Renderer();
  const state = renderer.renderInContainer(Fn, container);
  const root = state.component as Fn;
  root.build = build;
  root.rerender();
  await renderer.waitUntilIdle();
  return {
    container,
    async rerender(next: Build) {
      root.build = next;
      root.rerender();
      await renderer.waitUntilIdle();
    },
  };
}

describe("SVG namespace", () => {
  it("creates <svg> and its descendants in the SVG namespace, preserving tag case", async () => {
    const { container } = await render((b) => {
      b.openElement(0, "svg");
      b.openElement(1, "polyline");
      b.addAttribute(2, "points", "0,0 1,1");
      b.closeElement();
      b.openElement(3, "linearGradient");
      b.closeElement();
      b.closeElement();
    });
    expect(container.querySelector("svg")!.namespaceURI).toBe(SVG);
    expect(container.querySelector("polyline")!.namespaceURI).toBe(SVG);
    const gradient = container.querySelector("svg")!.lastElementChild!;
    expect({ ns: gradient.namespaceURI, name: gradient.localName }).toEqual({ ns: SVG, name: "linearGradient" });
  });

  it("switches back to HTML inside <foreignObject>", async () => {
    const { container } = await render((b) => {
      b.openElement(0, "svg");
      b.openElement(1, "foreignObject");
      b.openElement(2, "div");
      b.closeElement();
      b.closeElement();
      b.closeElement();
    });
    expect(container.querySelector("foreignObject")!.namespaceURI).toBe(SVG);
    expect(container.querySelector("div")!.namespaceURI).toBe(HTML);
  });

  it("keeps HTML elements outside SVG in the HTML namespace", async () => {
    const { container } = await render((b) => {
      b.openElement(0, "p");
      b.closeElement();
    });
    expect(container.querySelector("p")!.namespaceURI).toBe(HTML);
  });

  it("a component rendered inside <svg> creates SVG elements", async () => {
    const { container } = await render((b) => {
      b.openElement(0, "svg");
      b.openComponent(1, defineComponent(Dot));
      b.closeComponent();
      b.closeElement();
    });
    expect(container.querySelector("circle")!.namespaceURI).toBe(SVG);
  });

  it("elements added to an existing <svg> by a later render are SVG", async () => {
    let withPath = false;
    const build: Build = (b) => {
      b.openElement(0, "svg");
      if (withPath) {
        b.openElement(1, "path");
        b.addAttribute(2, "d", "M0 0");
        b.closeElement();
      }
      b.closeElement();
    };
    const view = await render(build);
    withPath = true;
    await view.rerender(build);
    expect(view.container.querySelector("path")!.namespaceURI).toBe(SVG);
  });

  it("markup content inside <svg> is parsed as SVG", async () => {
    const { container } = await render((b) => {
      b.openElement(0, "svg");
      b.addMarkupContent(1, `<circle r="1"></circle>`);
      b.closeElement();
    });
    expect(container.querySelector("circle")!.namespaceURI).toBe(SVG);
  });
});
