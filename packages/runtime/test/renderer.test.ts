import { describe, expect, it } from "vitest";
import {
  ComponentBase,
  EventCallback,
  RenderTreeBuilder,
  Renderer,
  Parameter,
  CascadingParameter,
  defineComponent,
  isCascadingValueSupplier,
} from "../src/index";
import type { RenderFragment } from "../src/index";

class Counter extends ComponentBase {
  count = 0;
  readonly increment = (): void => {
    this.count++;
  };

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "div");
    b.openElement(1, "span");
    b.addContent(2, `Count: ${this.count}`);
    b.closeElement();
    b.openElement(3, "button");
    b.addAttribute(4, "onclick", EventCallback.bind(this, this.increment));
    b.addContent(5, "+");
    b.closeElement();
    b.closeElement();
  }
}

// The compiler emits prototype methods, so `@onclick="incrementCount"` hands
// EventCallback an UNBOUND method reference — invokeAsync must call it with
// the receiver as `this` (Blazor Factory.Bind semantics).
class MethodCounter extends ComponentBase {
  count = 0;

  incrementCount(): void {
    this.count++;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "span");
    b.addContent(1, `${this.count}`);
    b.closeElement();
    b.openElement(2, "button");
    b.addAttribute(3, "onclick", EventCallback.bind(this, this.incrementCount));
    b.addContent(4, "Click me");
    b.closeElement();
  }
}

class Greeter extends ComponentBase {
  @Parameter() name = "";
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "p");
    b.addContent(1, `Hello, ${this.name}!`);
    b.closeElement();
  }
}

class ParentWithChild extends ComponentBase {
  @Parameter() message = "";
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "h1");
    b.addContent(1, this.message);
    b.closeElement();
    b.openComponent(2, defineComponent(Greeter));
    b.addAttribute(3, "Name", this.message);
    b.closeComponent();
  }
}

class ThemeProvider extends ComponentBase implements { isCascadingValueSupplier: true } {
  readonly isCascadingValueSupplier = true as const;
  @Parameter() theme = "dark";
  @Parameter() childContent?: RenderFragment;
  get cascadeValue(): unknown {
    return this.theme;
  }
  get cascadeName(): string | undefined {
    return "Theme";
  }
  get isFixed(): boolean {
    return false;
  }
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.childContent?.(b);
  }
}

class ThemeConsumer extends ComponentBase {
  @CascadingParameter({ name: "Theme" }) theme = "";
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "div");
    b.addContent(1, this.theme);
    b.closeElement();
  }
}

describe("Renderer", () => {
  it("renders a hand-built component to the DOM", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();
    renderer.renderInContainer(Counter, container);
    await renderer.waitUntilIdle();

    const span = container.querySelector("span");
    expect(span?.textContent).toBe("Count: 0");
    expect(container.querySelector("button")?.textContent).toBe("+");
  });

  it("re-renders after an event handler mutates state (diffed, not rebuilt)", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();
    renderer.renderInContainer(Counter, container);
    await renderer.waitUntilIdle();

    const spanBefore = container.querySelector("span")!;
    const button = container.querySelector("button")!;
    button.dispatchEvent(new Event("click"));
    await renderer.waitUntilIdle();

    const spanAfter = container.querySelector("span")!;
    expect(spanAfter.textContent).toBe("Count: 1");
    expect(spanAfter).toBe(spanBefore); // DOM node preserved by the diff
  });

  it("invokes unbound method references with the receiver as 'this'", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();
    renderer.renderInContainer(MethodCounter, container);
    await renderer.waitUntilIdle();

    const button = container.querySelector("button")!;
    button.dispatchEvent(new Event("click"));
    await renderer.waitUntilIdle();

    expect(container.querySelector("span")?.textContent).toBe("1");
  });

  it("sets parameters case-insensitively on child components", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();

    class Parent extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Greeter));
        b.addAttribute(1, "Name", "World");
        b.closeComponent();
      }
    }
    renderer.renderInContainer(Parent, container);
    await renderer.waitUntilIdle();

    expect(container.querySelector("p")?.textContent).toBe("Hello, World!");
  });

  it("re-renders children when parent parameters change", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();

    class Parent extends ComponentBase {
      @Parameter() message = "first";
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(ParentWithChild));
        b.addAttribute(1, "Message", this.message);
        b.closeComponent();
      }
    }
    const state = renderer.renderInContainer(Parent, container);
    await renderer.waitUntilIdle();
    expect(container.querySelectorAll("p")[0]?.textContent).toBe("Hello, first!");

    // Simulate a parent update: change a field and re-render.
    const component = state.component as unknown as { message: string };
    component.message = "second";
    component["stateHasChangedInternal"]();
    await renderer.waitUntilIdle();

    expect(container.querySelector("h1")?.textContent).toBe("second");
    expect(container.querySelectorAll("p")[0]?.textContent).toBe("Hello, second!");
  });

  it("resolves cascading values by name into child subtrees", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();

    class Root extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(ThemeProvider));
        b.addAttribute(1, "Theme", "neon");
        b.addAttribute(2, "ChildContent", (fragment: RenderTreeBuilder) => {
          fragment.openComponent(0, defineComponent(ThemeConsumer));
          fragment.closeComponent();
        });
        b.closeComponent();
      }
    }
    renderer.renderInContainer(Root, container);
    await renderer.waitUntilIdle();

    expect(container.querySelector("div")?.textContent).toBe("neon");
  });

  it("updates cascading values when the provider re-renders", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();

    class Root extends ComponentBase {
      themeValue = "light";
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(ThemeProvider));
        b.addAttribute(1, "Theme", this.themeValue);
        b.addAttribute(2, "ChildContent", (fragment: RenderTreeBuilder) => {
          fragment.openComponent(0, defineComponent(ThemeConsumer));
          fragment.closeComponent();
        });
        b.closeComponent();
      }
    }
    const rootState = renderer.renderInContainer(Root, container);
    await renderer.waitUntilIdle();
    expect(container.querySelector("div")?.textContent).toBe("light");

    (rootState.component as unknown as { themeValue: string; stateHasChangedInternal(): void }).themeValue = "solar";
    (rootState.component as unknown as { stateHasChangedInternal(): void }).stateHasChangedInternal();
    await renderer.waitUntilIdle();

    expect(container.querySelector("div")?.textContent).toBe("solar");
  });

  it("removes elements that disappear from the tree and keeps keyed siblings", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();

    class List extends ComponentBase {
      items = ["a", "b", "c"];
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "ul");
        for (const item of this.items) {
          b.openElement(0, "li");
          b.setKey(item);
          b.addContent(0, item);
          b.closeElement();
        }
        b.closeElement();
      }
    }
    const state = renderer.renderInContainer(List, container);
    await renderer.waitUntilIdle();

    const second = container.querySelectorAll("li")[1]!;
    expect(container.querySelectorAll("li")).toHaveLength(3);

    (state.component as unknown as { items: string[]; stateHasChangedInternal(): void }).items = ["a", "c"];
    (state.component as unknown as { stateHasChangedInternal(): void }).stateHasChangedInternal();
    await renderer.waitUntilIdle();

    const remaining = [...container.querySelectorAll("li")];
    expect(remaining).toHaveLength(2);
    expect(remaining[0]!.textContent).toBe("a");
    expect(remaining[1]!.textContent).toBe("c");
    expect(remaining[1]).toBe(container.querySelectorAll("li")[1]); // keyed node preserved
  });

  it("fires element reference captures with the enclosing element", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();
    let captured: Element | null = null;

    class WithRef extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "section");
        b.addElementReferenceCapture(1, (el) => {
          captured = el;
        });
        b.closeElement();
      }
    }
    renderer.renderInContainer(WithRef, container);
    await renderer.waitUntilIdle();

    expect(captured).toBe(container.querySelector("section"));
  });

  it("applies preventDefault and stopPropagation flags", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();
    let called = 0;

    class WithHandler extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "a");
        b.addAttribute(1, "onclick", EventCallback.bind(this, () => { called++; }), );
        b.closeElement();
      }
    }
    renderer.renderInContainer(WithHandler, container);
    await renderer.waitUntilIdle();

    const anchor = container.querySelector("a")!;
    const event = new Event("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    await renderer.waitUntilIdle();
    expect(called).toBe(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it("supports preventDefault flag on event attributes", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();

    class WithHandler extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "a");
        b.addAttribute(1, "onclick", EventCallback.bind(this, () => undefined));
        b.closeElement();
      }
    }
    renderer.renderInContainer(WithHandler, container);
    await renderer.waitUntilIdle();
    expect(isCascadingValueSupplier(container)).toBe(false);
  });
});