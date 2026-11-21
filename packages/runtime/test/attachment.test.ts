import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addAttachment,
  ComponentBase,
  ErrorBoundary,
  RenderTreeBuilder,
  defineComponent,
  type Attachment,
  type RenderFragment,
} from "../src/index";
import {
  Renderer,
  RenderTreeEditType,
  computeDiff,
} from "../src/internal";
import { componentInternals } from "../src/components/component-internals";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

interface Mounted<T> {
  container: HTMLElement;
  renderer: Renderer;
  component: T;
  rerender(): Promise<void>;
}

async function mount<T extends ComponentBase>(type: new () => T): Promise<Mounted<T>> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new Renderer();
  const state = renderer.renderInContainer(type, container);
  await renderer.waitUntilIdle();
  const component = state.component as T;
  return {
    container,
    renderer,
    component,
    async rerender() {
      componentInternals.requestRender(component as unknown as ComponentBase);
      await renderer.waitUntilIdle();
    },
  };
}

/** A recording attachment: logs `attach <tag>` and `cleanup <tag>`. */
function recorder(log: string[], label: string): Attachment {
  return (element) => {
    log.push(`attach ${label} ${element.tagName.toLowerCase()} connected=${element.isConnected}`);
    return () => log.push(`cleanup ${label}`);
  };
}

describe("@attach (F2): diff", () => {
  const tree = (value: Attachment | null): ReturnType<RenderTreeBuilder["getFrames"]> => {
    const b = new RenderTreeBuilder();
    b.openElement(0, "div");
    b.addAttribute(1, "id", "x");
    addAttachment(b, 2, "@attach:tip", value);
    b.closeElement();
    return b.getFrames();
  };

  it("compares attachments by identity: the same function is no edit", () => {
    const attachment: Attachment = () => {};
    expect(computeDiff(tree(attachment), tree(attachment)).edits).toEqual([]);
    const changed = computeDiff(tree(attachment), tree(() => {})).edits;
    expect(changed.map((edit) => [edit.type, edit.referenceFrameIndex])).toEqual([[RenderTreeEditType.SetAttribute, 2]]);
  });

  it("removes a dropped attachment by its directive name", () => {
    const old = tree(() => {});
    const b = new RenderTreeBuilder();
    b.openElement(0, "div");
    b.addAttribute(1, "id", "x");
    b.closeElement();
    const edits = computeDiff(old, b.getFrames()).edits;
    expect(edits.map((edit) => [edit.type, edit.removedAttributeName])).toEqual([[RenderTreeEditType.RemoveAttribute, "@attach:tip"]]);
  });
});

describe("@attach (F2)", () => {
  it("runs after the element is in the DOM, before onAfterRender, and not again for the same function", async () => {
    const log: string[] = [];
    class Page extends ComponentBase {
      readonly focus = recorder(log, "focus");
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "input");
        b.addAttribute(1, "class", "search");
        addAttachment(b, 2, "@attach", this.focus);
        b.closeElement();
      }
      protected override onAfterRender(firstRender: boolean): void {
        log.push(`afterRender ${firstRender}`);
      }
    }
    const { rerender } = await mount(Page);
    expect(log).toEqual(["attach focus input connected=true", "afterRender true"]);
    await rerender();
    expect(log).toEqual(["attach focus input connected=true", "afterRender true", "afterRender false"]);
  });

  it("cleans up and re-attaches when the value changes; null, undefined and false attach nothing", async () => {
    const log: string[] = [];
    const first = recorder(log, "first");
    const second = recorder(log, "second");
    class Page extends ComponentBase {
      value: Attachment | null | undefined | false = first;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "div");
        addAttachment(b, 1, "@attach", this.value);
        b.closeElement();
      }
    }
    const { component, rerender } = await mount(Page);
    component.value = second;
    await rerender();
    expect(log).toEqual(["attach first div connected=true", "cleanup first", "attach second div connected=true"]);
    log.length = 0;
    for (const none of [null, undefined, false] as const) {
      component.value = none;
      await rerender();
    }
    expect(log).toEqual(["cleanup second"]);
    component.value = first;
    await rerender();
    expect(log).toEqual(["cleanup second", "attach first div connected=true"]);
  });

  it("re-attaches a factory call every render (a new function each time)", async () => {
    const log: string[] = [];
    const tooltip = (text: string): Attachment => recorder(log, text);
    class Page extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "button");
        addAttachment(b, 1, "@attach", tooltip("Save"));
        b.closeElement();
      }
    }
    const { rerender } = await mount(Page);
    await rerender();
    expect(log).toEqual(["attach Save button connected=true", "cleanup Save", "attach Save button connected=true"]);
  });

  it("keeps several attachments of one element independent (@attach and @attach:name)", async () => {
    const log: string[] = [];
    const tooltip = recorder(log, "tooltip");
    const shortcutA = recorder(log, "ctrl+s");
    const shortcutB = recorder(log, "ctrl+shift+s");
    class Page extends ComponentBase {
      shortcut = shortcutA;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "button");
        addAttachment(b, 1, "@attach", tooltip);
        addAttachment(b, 2, "@attach:shortcut", this.shortcut);
        b.addContent(3, "Save");
        b.closeElement();
      }
    }
    const { component, rerender } = await mount(Page);
    expect(log).toEqual(["attach tooltip button connected=true", "attach ctrl+s button connected=true"]);
    log.length = 0;
    component.shortcut = shortcutB;
    await rerender();
    expect(log).toEqual(["cleanup ctrl+s", "attach ctrl+shift+s button connected=true"]);
  });

  it("runs in document order and cleans up when an element (or an ancestor) is removed", async () => {
    const log: string[] = [];
    const outer = recorder(log, "outer");
    const inner = recorder(log, "inner");
    const sibling = recorder(log, "sibling");
    class Page extends ComponentBase {
      show = true;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        if (this.show) {
          b.openElement(0, "section");
          addAttachment(b, 1, "@attach", outer);
          b.openElement(2, "p");
          addAttachment(b, 3, "@attach", inner);
          b.closeElement();
          b.closeElement();
        }
        b.openElement(4, "footer");
        addAttachment(b, 5, "@attach", sibling);
        b.closeElement();
      }
    }
    const { component, rerender } = await mount(Page);
    expect(log).toEqual([
      "attach outer section connected=true",
      "attach inner p connected=true",
      "attach sibling footer connected=true",
    ]);
    log.length = 0;
    component.show = false;
    await rerender();
    expect(log.sort()).toEqual(["cleanup inner", "cleanup outer"]);
  });

  it("does not re-run attachments of keyed rows that only move", async () => {
    const log: string[] = [];
    const row = recorder(log, "row");
    class List extends ComponentBase {
      items = ["a", "b", "c"];
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "ul");
        for (const item of this.items) {
          b.openElement(1, "li");
          b.setKey(item);
          addAttachment(b, 2, "@attach", row);
          b.addContent(3, item);
          b.closeElement();
        }
        b.closeElement();
      }
    }
    const { component, container, rerender } = await mount(List);
    log.length = 0;
    component.items = ["c", "a"];
    await rerender();
    expect([...container.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["c", "a"]);
    expect(log).toEqual(["cleanup row"]);
  });

  it("cleans up a disposed child component's attachments before its dispose", async () => {
    const log: string[] = [];
    const attachment = recorder(log, "child");
    class Child extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "span");
        addAttachment(b, 1, "@attach", attachment);
        b.closeElement();
      }
      dispose(): void {
        log.push("dispose");
      }
    }
    class Host extends ComponentBase {
      show = true;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        if (this.show) {
          b.openComponent(0, defineComponent(Child));
          b.closeComponent();
        }
      }
    }
    const { component, rerender } = await mount(Host);
    component.show = false;
    await rerender();
    expect(log).toEqual(["attach child span connected=true", "cleanup child", "dispose"]);
  });

  it("never attaches to an element a later pass of the same batch removed", async () => {
    const log: string[] = [];
    const attachment = recorder(log, "late");
    class Page extends ComponentBase {
      show = false;
      hideAgain = false;
      passes = 0;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        this.passes++;
        if (this.show) {
          b.openElement(0, "div");
          addAttachment(b, 1, "@attach", attachment);
          b.closeElement();
        }
        if (this.hideAgain) {
          // A render requested while rendering joins the running batch.
          this.hideAgain = false;
          this.show = false;
          componentInternals.requestRender(this as unknown as ComponentBase);
        }
      }
    }
    const { component, container, rerender } = await mount(Page);
    component.show = true;
    component.hideAgain = true;
    component.passes = 0;
    await rerender();
    expect(component.passes).toBe(2);
    expect(container.querySelector("div")).toBeNull();
    expect(log).toEqual([]);
  });

  it("routes an attachment's or a cleanup's exception to the nearest ErrorBoundary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing: Attachment = () => {
      throw new Error("attach failed");
    };
    class Page extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "div");
        addAttachment(b, 1, "@attach", failing);
        b.closeElement();
      }
    }
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, ErrorBoundary);
        const content: RenderFragment = (inner) => {
          inner.openComponent(0, defineComponent(Page));
          inner.closeComponent();
        };
        b.addAttribute(1, "childContent", content);
        b.addAttribute(2, "errorContent", (error: unknown) => ((inner: RenderTreeBuilder) => inner.addContent(0, `caught: ${(error as Error).message}`)) as RenderFragment);
        b.closeComponent();
      }
    }
    const { container, renderer } = await mount(Host);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("caught: attach failed");
  });

  it("reports an exception of a cleanup with the afterRender phase", async () => {
    const phases: string[] = [];
    class Page extends ComponentBase {
      show = true;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        if (this.show) {
          b.openElement(0, "div");
          addAttachment(b, 1, "@attach", () => () => {
            throw new Error("cleanup failed");
          });
          b.closeElement();
        }
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = new Renderer();
    renderer.errorHandler = ({ phase, error }) => phases.push(`${phase}: ${(error as Error).message}`);
    const state = renderer.renderInContainer(Page, container);
    await renderer.waitUntilIdle();
    (state.component as Page).show = false;
    componentInternals.requestRender(state.component as unknown as ComponentBase);
    await renderer.waitUntilIdle();
    expect(phases).toEqual(["afterRender: cleanup failed"]);
  });

  it("drops the attachments a rolled-back pass queued", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const log: string[] = [];
    const attachment = recorder(log, "rolled back");
    class Page extends ComponentBase {
      broken = false;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        if (this.broken) {
          b.openElement(0, "div");
          addAttachment(b, 1, "@attach", attachment);
          b.closeElement();
          // An invalid attribute name: setAttribute throws, the pass rolls back.
          b.openElement(2, "p");
          b.addAttribute(3, "a b", "x");
          b.closeElement();
        }
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = new Renderer();
    const phases: string[] = [];
    renderer.errorHandler = ({ phase }) => phases.push(phase);
    const state = renderer.renderInContainer(Page, container);
    await renderer.waitUntilIdle();
    (state.component as Page).broken = true;
    componentInternals.requestRender(state.component as unknown as ComponentBase);
    await renderer.waitUntilIdle();
    expect(phases).toEqual(["apply"]);
    expect(container.querySelector("div")).toBeNull();
    expect(log).toEqual([]);
  });

  it("keeps the attachment of a hot-swapped component and cleans it up with the component", async () => {
    const log: string[] = [];
    const attachment = recorder(log, "hmr");
    const build = (b: RenderTreeBuilder, text: string): void => {
      b.openElement(0, "div");
      addAttachment(b, 1, "@attach", attachment);
      b.addContent(2, text);
      b.closeElement();
    };
    class Widget extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        build(b, "v1");
      }
    }
    const WidgetV2 = class Widget extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        build(b, "v2");
      }
    };
    class Host extends ComponentBase {
      show = true;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        if (this.show) {
          b.openComponent(0, defineComponent(Widget));
          b.closeComponent();
        }
      }
    }
    const { component, container, renderer, rerender } = await mount(Host);
    renderer.hmrSwap(Widget, WidgetV2);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("v2");
    expect(log).toEqual(["attach hmr div connected=true"]);
    component.show = false;
    await rerender();
    expect(log).toEqual(["attach hmr div connected=true", "cleanup hmr"]);
  });
});
