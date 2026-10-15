/**
 * K.11 (docs/port-findings.md): in happy-dom 18 a `<form>`'s and a `<select>`'s `nextSibling` was `null`, so a
 * component test that updated anything after a form failed ("Cannot read properties of null"). happy-dom 20 fixed
 * it; the repository and `npm create tsazor` use 21. This keeps the case a test.
 */
import { describe, expect, it } from "vitest";
import { ComponentBase, render, type RenderTreeBuilder } from "../src/index";

class FormThenText extends ComponentBase {
  count = 0;
  protected override buildRenderTree(builder: RenderTreeBuilder): void {
    builder.openElement(0, "form");
    builder.openElement(1, "select");
    builder.openElement(2, "option");
    builder.addContent(3, "a");
    builder.closeElement();
    builder.closeElement();
    builder.closeElement();
    builder.openElement(4, "p");
    builder.addContent(5, `count ${this.count}`);
    builder.closeElement();
  }
  bump(): void {
    this.count++;
    this.stateHasChanged();
  }
}

describe("a form and a select in a component test", () => {
  it("updates what comes after them", async () => {
    const result = await render(FormThenText);
    expect(result.container.querySelector("form")!.nextSibling).toBe(result.container.querySelector("p"));
    (result.instance as FormThenText).bump();
    await result.settle();
    expect(result.container.querySelector("p")!.textContent).toBe("count 1");
  });
});
