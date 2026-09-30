/** @tsazor/testing acceptance tests: render helper over happy-dom. */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, type RenderTreeBuilder } from "@tsazor/runtime";
import { render, renderTree } from "../src";

class Greeting extends ComponentBase {
  name = "World";
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "h1");
    b.addContent(1, `Hello ${this.name}`);
    b.closeElement();
  }
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("render helper", () => {
  it("mounts a component and exposes its instance and container", async () => {
    const result = await render(Greeting);
    expect(result.container.querySelector("h1")?.textContent).toBe("Hello World");
    expect(result.instance).toBeInstanceOf(Greeting);

    (result.instance as unknown as { name: string }).name = "Tsazor";
    await result.rerender();
    expect(result.container.querySelector("h1")?.textContent).toBe("Hello Tsazor");

    result.dispose();
    expect(result.container.parentNode).toBeNull();
  });

  it("renders ad-hoc builder trees", async () => {
    const result = await renderTree((b) => {
      b.openElement(0, "p");
      b.addContent(1, "ad hoc");
      b.closeElement();
    });
    expect(result.container.querySelector("p")?.textContent).toBe("ad hoc");
  });
});