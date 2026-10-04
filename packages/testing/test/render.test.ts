/** @tsazor/testing acceptance tests: render helper over happy-dom. */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, defineComponent, EventCallback, Parameter, type ComponentType, type RenderTreeBuilder } from "@tsazor/runtime";
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
class Greeter extends ComponentBase {
  @Parameter() name = "World";
  @Parameter() excited = false;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "p");
    b.addContent(1, `Hello ${this.name}${this.excited ? "!" : "."}`);
    b.closeElement();
  }
}

class SlowCounter extends ComponentBase {
  count = 0;
  text = "";
  private async increment(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 20));
    this.count++;
  }
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "button");
    b.addAttribute(1, "onclick", EventCallback.bind(this, () => this.increment()));
    b.addContent(2, `Clicked ${this.count}`);
    b.closeElement();
    b.openElement(3, "input");
    b.addAttribute(4, "value", this.text);
    b.addAttribute(5, "onchange", EventCallback.bind(this, (event: Event) => {
      this.text = (event.target as HTMLInputElement).value;
    }));
    b.closeElement();
    b.openElement(6, "output");
    b.addContent(7, this.text);
    b.closeElement();
  }
}

describe("render with parameters and user actions (bUnit-style)", () => {
  it("passes typed parameters like a parent and re-renders on setParameters", async () => {
    const greeter = await render(Greeter, { parameters: { name: "Marta" } });
    expect(greeter.markup).toBe("<p>Hello Marta.</p>");
    expect(greeter.instance.name).toBe("Marta");
    await greeter.setParameters({ excited: true });
    expect(greeter.find("p").textContent).toBe("Hello Marta!");
    // Type-level only (never called): parameters are the component's fields, typed.
    const typeChecks = (): void => {
      // @ts-expect-error — not a field of Greeter
      void render(Greeter, { parameters: { nme: "x" } });
      // @ts-expect-error — the wrong type for name
      void render(Greeter, { parameters: { name: 42 } });
    };
    expect(typeChecks).toBeTypeOf("function");
  });

  it("accepts a component definition (what a .tsazor import is) with any parameter names", async () => {
    const definition: ComponentType = defineComponent(Greeter);
    const greeter = await render(definition, { parameters: { name: "Bea" } });
    expect(greeter.markup).toBe("<p>Hello Bea.</p>");
  });

  it("click and change act like a user and wait for the render — async handlers included", async () => {
    const counter = await render(SlowCounter);
    await counter.click("button");
    expect(counter.find("button").textContent).toBe("Clicked 1");
    await counter.change("input", "rye");
    expect(counter.find("output").textContent).toBe("rye");
    expect(counter.findAll("button")).toHaveLength(1);
  });

  it("find throws with the markup when nothing matches", async () => {
    const greeter = await render(Greeter);
    expect(() => greeter.find(".missing")).toThrow("No element matches '.missing'. The markup is:\n<p>Hello World.</p>");
  });
});

describe("component failures fail the test (bUnit-style)", () => {
  class NeedsClock extends ComponentBase {
    protected override onInitialized(): void {
      throw new Error("No clock");
    }
  }
  class Fragile extends ComponentBase {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.openElement(0, "button");
      b.addAttribute(1, "onclick", EventCallback.bind(this, async () => {
        await Promise.resolve();
        throw new Error("Handler broke");
      }));
      b.closeElement();
    }
  }

  it("render rejects with a lifecycle error", async () => {
    await expect(render(NeedsClock)).rejects.toThrow("No clock");
  });

  it("click rejects with an async handler's error", async () => {
    const fragile = await render(Fragile);
    await expect(fragile.click("button")).rejects.toThrow("Handler broke");
  });
});
