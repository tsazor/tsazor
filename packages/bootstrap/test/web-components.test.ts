/**
 * Web Components interop probe: does Tsazor treat custom elements as plain
 * elements (Direction A — custom elements inside .tsazor markup), and does
 * light-DOM child content get projected into shadow-DOM slots?
 */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { ComponentBase, type RenderTreeBuilder } from "@tsazor/runtime";

class MyWidget extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host { display: block; border: 1px solid silver; }</style><b><slot></slot></b><i>widget intern</i>`;
  }
}

if (!customElements.get("my-widget")) customElements.define("my-widget", MyWidget);

class Page extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "section");
    b.openElement(1, "my-widget");
    b.addAttribute(2, "data-x", "7");
    b.addContent(3, (inner) => {
      inner.openElement(0, "span");
      inner.addContent(1, "Slot-Inhalt");
      inner.closeElement();
    });
    b.closeElement();
    b.closeElement();
  }
}

describe("web components interop (direction A)", () => {
  it("renders custom elements as plain elements with slot-projected children", async () => {
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Page);
      b.closeComponent();
    });
    await renderer.waitUntilIdle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await renderer.waitUntilIdle();

    const widget = container.querySelector("my-widget")!;
    expect(widget).not.toBeNull();
    expect(widget.getAttribute("data-x")).toBe("7");
    // Child content lands in the light DOM -> the shadow slot picks it up.
    expect(widget.querySelector("span")!.textContent).toBe("Slot-Inhalt");
    // The shadow root coexists with Tsazor's patched children.
    expect(widget.shadowRoot!.querySelector("i")!.textContent).toBe("widget intern");
    // The shadow root's slot markup is in place to project the light DOM.
    expect(widget.shadowRoot!.innerHTML).toContain("<slot>");
  });
});