/**
 * M3 acceptance tests: complete parameter system — ChildContent via markup
 * (addContent inside a component frame), CaptureUnmatchedValues, and async
 * lifecycle orchestration (onInitialized delays the first render).
 */
import { describe, expect, it } from "vitest";
import { ComponentBase, RenderTreeBuilder, Renderer, Parameter, defineComponent, EventCallback } from "../src/index";
import type { RenderFragment } from "../src/index";

class Card extends ComponentBase {
  @Parameter() title = "";
  @Parameter() childContent?: RenderFragment;

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "section");
    b.openElement(1, "h2");
    b.addContent(2, this.title);
    b.closeElement();
    b.openElement(3, "div");
    b.addContent(4, "BODY");
    b.closeElement();
    if (this.childContent) {
      this.childContent(b);
    }
    b.closeElement();
  }
}

class Footer extends ComponentBase {
  @Parameter() childContent?: RenderFragment;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "footer");
    this.childContent?.(b);
    b.closeElement();
  }
}

describe("child content (Blazor's markup-inside-component syntax)", () => {
  it("passes markup written inside a component tag as the ChildContent parameter", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();

    class Page extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Card));
        b.addAttribute(1, "Title", "Hello");
        b.addContent(2, (inner) => {
          inner.openElement(0, "p");
          inner.addContent(1, "from child markup");
          inner.closeElement();
        });
        b.closeComponent();
      }
    }
    renderer.renderInContainer(Page, container);
    await renderer.waitUntilIdle();

    expect(container.querySelector("h2")?.textContent).toBe("Hello");
    expect(container.querySelector("p")?.textContent).toBe("from child markup");
  });

  it("re-renders the child when the parent's child content changes", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();

    class Page extends ComponentBase {
      @Parameter() text = "one";
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Footer));
        b.addAttribute(1, "ChildContent", (inner: RenderTreeBuilder) => {
          inner.addContent(0, this.text);
        });
        b.closeComponent();
      }
    }
    const state = renderer.renderInContainer(Page, container);
    await renderer.waitUntilIdle();
    expect(container.querySelector("footer")?.textContent).toBe("one");

    (state.component as unknown as { text: string }).text = "two";
    state.component.stateHasChangedInternal();
    await renderer.waitUntilIdle();
    expect(container.querySelector("footer")?.textContent).toBe("two");
  });

  it("throws on a duplicate ChildContent for the same component frame", () => {
    const b = new RenderTreeBuilder();
    b.openComponent(0, defineComponent(Footer));
    b.addContent(1, (inner: RenderTreeBuilder) => inner.addContent(0, "first"));
    expect(() => b.addContent(2, (inner: RenderTreeBuilder) => inner.addContent(0, "second"))).toThrow(/ChildContent/);
  });
});

describe("CaptureUnmatchedValues", () => {
  it("collects attributes without a matching parameter into the decorated property", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();

    class Input extends ComponentBase {
      @Parameter({ captureUnmatchedValues: true }) extras?: Record<string, unknown>;
      @Parameter() type = "text";

      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "input");
        b.addAttribute(1, "type", this.type);
        b.closeElement();
      }
    }

    class Page extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Input));
        b.addAttribute(1, "Type", "email");
        b.addAttribute(2, "placeholder", "Enter…");
        b.addAttribute(3, "data-id", 7);
        b.closeComponent();
      }
    }
    renderer.renderInContainer(Page, container);
    await renderer.waitUntilIdle();

    const input = container.querySelector("input")!;
    expect(input.getAttribute("type")).toBe("email"); // case-insensitive match
    // Component ids: root Page = 1, the child Input = 2.
    const componentState = renderer.getComponentState(2)!;
    const captured = (componentState.component as unknown as { extras?: Record<string, unknown> }).extras;
    expect(captured).toEqual({ placeholder: "Enter…", "data-id": 7 });
  });

  /** Child capturing unmatched attributes; renders them as a sorted key list. */
  class Capture extends ComponentBase {
    @Parameter({ captureUnmatchedValues: true }) rest?: Record<string, unknown>;
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.addContent(0, Object.keys(this.rest ?? {}).sort().join(","));
    }
  }

  async function hostWith(attrs: () => Record<string, unknown>) {
    const container = document.createElement("div");
    const renderer = new Renderer();
    let host!: Host;
    class Host extends ComponentBase {
      protected override onInitialized(): void {
        host = this;
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Capture));
        let seq = 1;
        for (const [name, value] of Object.entries(attrs())) b.addAttribute(seq++, name, value as never);
        b.closeComponent();
      }
      rerender(): void {
        this.stateHasChanged();
      }
    }
    const errors: unknown[] = [];
    renderer.errorHandler = (e) => void errors.push(e.error);
    renderer.renderInContainer(Host, container);
    await renderer.waitUntilIdle();
    return { container, renderer, errors, rerender: async () => { host.rerender(); await renderer.waitUntilIdle(); } };
  }

  it("rebuilds the dictionary per parameter set: an attribute the parent drops disappears (Blazor)", async () => {
    let attrs: Record<string, unknown> = { a: 1, b: { x: 1 } };
    const view = await hostWith(() => attrs);
    expect(view.container.textContent).toBe("a,b");
    attrs = { b: { x: 2 } };
    await view.rerender();
    expect(view.container.textContent).toBe("b");
  });

  it("accepts the capture property passed explicitly", async () => {
    const view = await hostWith(() => ({ rest: { id: "x", title: "t" } }));
    expect(view.container.textContent).toBe("id,title");
  });

  it("rejects an explicit capture property combined with unmatched attributes (Blazor)", async () => {
    const view = await hostWith(() => ({ rest: { id: "x" }, title: "t" }));
    expect(view.errors.map(String).join("\n")).toMatch(/cannot be set explicitly when also used to capture unmatched values/);
  });
});

describe("async lifecycle orchestration", () => {
  it("renders the result of an async onInitialized once it completes", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();
    let initialized = false;

    class Delayed extends ComponentBase {
      message = "pending";

      protected override async onInitialized(): Promise<void> {
        initialized = true;
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        this.message = "ready";
      }

      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "p");
        b.addContent(1, this.message);
        b.closeElement();
      }
    }
    renderer.renderInContainer(Delayed, container);
    await renderer.waitUntilIdle();

    expect(initialized).toBe(true);
    expect(container.querySelector("p")?.textContent).toBe("ready");
  });

  it("runs onParametersSet on re-render when parameters change", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();
    const seen: string[] = [];

    class Child extends ComponentBase {
      @Parameter() value = "";
      protected override onParametersSet(): void {
        seen.push(this.value);
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "span");
        b.addContent(1, this.value);
        b.closeElement();
      }
    }

    class Parent extends ComponentBase {
      @Parameter() value = "a";
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Child));
        b.addAttribute(1, "Value", this.value);
        b.closeComponent();
      }
    }
    const state = renderer.renderInContainer(Parent, container);
    await renderer.waitUntilIdle();
    expect(container.querySelector("span")?.textContent).toBe("a");

    (state.component as unknown as { value: string }).value = "b";
    state.component.stateHasChangedInternal();
    await renderer.waitUntilIdle();
    expect(container.querySelector("span")?.textContent).toBe("b");
    expect(seen).toEqual(["a", "b"]);
  });
});

describe("EventCallback parameters (Blazor's EventCallbackFactory conversion, done by the compiler since B8)", () => {
  it("an EventCallback bound to the declaring parent re-renders it", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();

    class Clicker extends ComponentBase {
      @Parameter() onClick?: EventCallback;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "button");
        b.addEventHandler(1, "onclick", EventCallback.bind(this, () => {
          this.onClick?.invokeAsync(null);
        }));
        b.addContent(2, "go");
        b.closeElement();
      }
    }

    class Page extends ComponentBase {
      @Parameter() label = "init";
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "span");
        b.addContent(1, this.label);
        b.closeElement();
        b.openComponent(2, defineComponent(Clicker));
        // What the compiler emits for `OnClick="handler"` on an EventCallback
        // parameter; the renderer passes values through unchanged (B8).
        b.addAttribute(3, "onClick", EventCallback.bind(this, () => {
          this.label = "clicked";
        }));
        b.closeComponent();
      }
    }
    const state = renderer.renderInContainer(Page, container);
    await renderer.waitUntilIdle();
    expect(container.querySelector("span")?.textContent).toBe("init");

    container.querySelector("button")!.dispatchEvent(new Event("click"));
    await renderer.waitUntilIdle();
    expect(container.querySelector("span")?.textContent).toBe("clicked");
  });
});