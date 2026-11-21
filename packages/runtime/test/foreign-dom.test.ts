/**
 * A foreign element's DOM (a JavaScript widget's) survives the owner's
 * re-render: the renderer diffs only what its frames describe. An external
 * editor mounts its content under a rendered area — RichText is the wrapper
 * doing exactly this (design-extended-library.md §2.7) — and the renderer
 * keeps it while the element's own attributes still patch.
 */
import { describe, expect, it } from "vitest";
import { ComponentBase, type RenderTreeBuilder } from "../src/index";
import { Renderer } from "../src/internal";
import { componentInternals } from "../src/components/component-internals.js";

class Host extends ComponentBase {
  label = "a";
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "div");
    b.addAttribute(1, "class", this.label);
    b.closeElement();
  }
}

describe("foreign DOM under rendered elements", () => {
  it("survives a re-render; the element's own attributes still patch", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const renderer = new Renderer();
    const state = renderer.renderInContainer(Host, container);
    await renderer.waitUntilIdle();
    const component = state.component as Host;
    const div = container.querySelector("div")!;

    // The widget mounts itself into the rendered area (the factory's business).
    const foreign = document.createElement("p");
    foreign.textContent = "engine dom";
    div.append(foreign);

    component.label = "b";
    componentInternals.requestRender(component);
    await renderer.waitUntilIdle();
    expect(div.className).toBe("b");
    expect(div.contains(foreign)).toBe(true);
    expect([...div.childNodes].map((node) => node.nodeName)).toEqual(["P"]);
    container.remove();
  });
});