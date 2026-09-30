/**
 * Render queue and batches (roadmap B2): parent-first ordering, renders
 * requested during a batch join it, a defined batch end, per-component error
 * isolation, and independent renderers.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComponentBase, EventCallback, Parameter, Renderer, defineComponent, type RenderBatch, type RenderError, type RenderTreeBuilder } from "../src/index";
import type { ComponentState } from "../src/renderer/component-state";

const log: string[] = [];
const instances = new Map<string, Tree>();

/** Logs `render:<label>` and renders its label plus the child it is told to. */
class Tree extends ComponentBase {
  @Parameter() label = "";
  @Parameter() child: string | null = null;
  protected override onInitialized(): void {
    instances.set(this.label, this);
  }
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    log.push(`render:${this.label}`);
    b.addContent(0, this.label);
    if (this.child !== null) {
      b.openComponent(1, defineComponent(Tree));
      b.addAttribute(2, "label", this.child);
      b.addAttribute(3, "child", this.child === "c" ? "g" : null);
      b.closeComponent();
    }
  }
  poke(): void {
    this.stateHasChanged();
  }
}

class Root extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    log.push("render:root");
    b.openComponent(0, defineComponent(Tree));
    b.addAttribute(1, "label", "p");
    b.addAttribute(2, "child", "c");
    b.closeComponent();
  }
}

function mount(type: abstract new () => ComponentBase, renderer = new Renderer()): { renderer: Renderer; container: HTMLElement; state: ComponentState } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const state = renderer.renderInContainer(type, container);
  return { renderer, container, state };
}

function collectErrors(renderer: Renderer): RenderError[] {
  const errors: RenderError[] = [];
  renderer.errorHandler = (error) => errors.push(error);
  return errors;
}

function batches(renderer: Renderer): string[][] {
  const seen: string[][] = [];
  renderer.onBatchCompleted((batch: RenderBatch) => {
    seen.push(batch.renderedComponents.map((s) => (s.component as Tree).label ?? s.component.constructor.name));
  });
  return seen;
}

afterEach(() => {
  log.length = 0;
  instances.clear();
});

describe("render queue", () => {
  it("renders dirty components parent-first, each once", async () => {
    const { renderer } = mount(Root);
    await renderer.waitUntilIdle();
    log.length = 0;
    // Dirtied deepest-first: the queue still renders ancestors first, and
    // the parent's parameter update folds into the already queued render.
    instances.get("g")!.poke();
    instances.get("c")!.poke();
    instances.get("p")!.poke();
    await renderer.waitUntilIdle();
    expect(log).toEqual(["render:p", "render:c", "render:g"]);
  });

  it("renders a whole new subtree in one batch (children join the running batch)", async () => {
    const renderer = new Renderer();
    const seen = batches(renderer);
    mount(Root, renderer);
    await renderer.waitUntilIdle();
    expect(seen).toEqual([["Root", "p", "c", "g"]]);
  });

  it("processes stateHasChanged during a render in the same batch", async () => {
    let renders = 0;
    let other!: Tree;
    class Trigger extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        renders++;
        // A sibling and itself request renders while this one renders.
        if (renders === 2) {
          other.poke();
          this.stateHasChanged();
        }
        b.addContent(0, String(renders));
      }
    }
    class Pair extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Trigger));
        b.closeComponent();
        b.openComponent(1, defineComponent(Tree));
        b.addAttribute(2, "label", "other");
        b.closeComponent();
      }
    }
    const { renderer, container, state } = mount(Pair);
    await renderer.waitUntilIdle();
    other = instances.get("other")!;
    const seen = batches(renderer);
    (state.slotChildren.values().next().value!.component as ComponentBase).stateHasChangedInternal();
    await renderer.waitUntilIdle();
    expect(seen).toEqual([["Trigger", "other", "Trigger"]]);
    expect(renders).toBe(3);
    expect(container.textContent).toBe("3other");
  });

  it("reports isRenderingInProgress on the render handle during a batch only", async () => {
    const observed: boolean[] = [];
    class Observer extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        observed.push(this.renderHandle.isRenderingInProgress);
        b.addContent(0, "o");
      }
    }
    const { renderer, state } = mount(Observer);
    await renderer.waitUntilIdle();
    expect([...observed, state.renderHandle.isRenderingInProgress]).toEqual([true, false]);
  });

  it("stops a component that re-requests its render on every pass (render loop)", async () => {
    let renders = 0;
    class Loop extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        renders++;
        this.stateHasChanged();
        b.addContent(0, "loop");
      }
    }
    const renderer = new Renderer();
    const errors = collectErrors(renderer);
    const { container, state } = mount(Loop, renderer);
    await renderer.waitUntilIdle();
    expect(renders).toBe(100);
    expect(errors.map((e) => [e.component, e.phase])).toEqual([[state, "render"]]);
    expect(String(errors[0]!.error)).toMatch(/render loop/);
    expect(container.textContent).toBe("loop");
  });
});

describe("batch end", () => {
  it("fires once per batch after all its renders, in render order", async () => {
    const { renderer } = mount(Root);
    await renderer.waitUntilIdle();
    const seen = batches(renderer);
    instances.get("c")!.poke();
    instances.get("p")!.poke();
    await renderer.waitUntilIdle();
    // g does not: c re-renders with unchanged primitive parameters for g (B6).
    expect(seen).toEqual([["p", "c"]]);
  });

  it("renders requested by a batch-end listener start the next batch; unsubscribe works", async () => {
    const { renderer } = mount(Root);
    await renderer.waitUntilIdle();
    const seen = batches(renderer);
    let requested = false;
    const unsubscribe = renderer.onBatchCompleted(() => {
      if (!requested) {
        requested = true;
        instances.get("g")!.poke();
      }
    });
    instances.get("p")!.poke();
    await renderer.waitUntilIdle();
    unsubscribe();
    instances.get("g")!.poke();
    await renderer.waitUntilIdle();
    // p's children keep their (primitive) parameters, so only p renders (B6).
    expect(seen).toEqual([["p"], ["g"], ["g"]]);
  });

  it("routes a failing listener to the error handler", async () => {
    const renderer = new Renderer();
    const errors = collectErrors(renderer);
    const failure = new Error("listener");
    renderer.onBatchCompleted(() => {
      throw failure;
    });
    const { container } = mount(Root, renderer);
    await renderer.waitUntilIdle();
    expect(errors).toEqual([{ error: failure, component: null, phase: "batch" }]);
    expect(container.textContent).toBe("pcg");
  });
});

describe("error isolation", () => {
  class Flaky extends ComponentBase {
    fail = false;
    text = "a";
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      if (this.fail) throw new Error("render failed");
      b.openElement(0, "b");
      b.addContent(1, this.text);
      b.closeElement();
    }
  }

  it("a render exception does not stop the batch and keeps the live tree", async () => {
    class Siblings extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Flaky));
        b.closeComponent();
        b.openComponent(1, defineComponent(Tree));
        b.addAttribute(2, "label", "ok");
        b.closeComponent();
      }
    }
    const renderer = new Renderer();
    const errors = collectErrors(renderer);
    const { container, state } = mount(Siblings, renderer);
    await renderer.waitUntilIdle();
    const flakyState = [...state.slotChildren.values()][0]!;
    const flaky = flakyState.component as Flaky;
    const bold = container.querySelector("b");

    flaky.fail = true;
    flaky.stateHasChangedInternal();
    instances.get("ok")!.poke();
    log.length = 0;
    await renderer.waitUntilIdle();
    expect(errors.map((e) => [String(e.error), e.component, e.phase])).toEqual([["Error: render failed", flakyState, "render"]]);
    expect(log).toEqual(["render:ok"]);
    expect(container.textContent).toBe("aok");

    // The next pass diffs against the surviving tree: same element, patched.
    flaky.fail = false;
    flaky.text = "b";
    flaky.stateHasChangedInternal();
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("bok");
    expect(container.querySelector("b")).toBe(bold);
  });

  it("a DOM application failure is isolated, keeps the live tree and disposes the pass's new children", async () => {
    let show = false;
    let fail = true;
    const extras: string[] = [];
    class Extra extends ComponentBase {
      constructor() {
        super();
        extras.push("created");
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, "extra");
      }
      dispose(): void {
        extras.push("disposed");
      }
    }
    class Capturing extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        if (show) {
          b.openElement(0, "div");
          b.addElementReferenceCapture(1, () => {
            if (fail) throw new Error("capture failed");
          });
          b.addContent(2, "shown");
          b.closeElement();
          b.openComponent(3, defineComponent(Extra));
          b.closeComponent();
        }
        b.openComponent(4, defineComponent(Tree));
        b.addAttribute(5, "label", "kid");
        b.closeComponent();
      }
    }
    const renderer = new Renderer();
    const errors = collectErrors(renderer);
    const { container, state } = mount(Capturing, renderer);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("kid");
    const kid = [...state.slotChildren.values()][0]!;

    show = true;
    state.component.stateHasChangedInternal();
    await renderer.waitUntilIdle();
    expect(errors.map((e) => [String(e.error), e.component, e.phase])).toEqual([["Error: capture failed", state, "apply"]]);
    expect(container.textContent).toBe("kid");
    expect(extras).toEqual(["created", "disposed"]);
    expect([...state.slotChildren.values()]).toEqual([kid]);

    fail = false;
    state.component.stateHasChangedInternal();
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("shownextrakid");
    expect([...state.slotChildren.values()].at(-1)).toBe(kid);
    expect(errors).toHaveLength(1);
  });

  it("routes lifecycle, after-render and event handler failures with their component", async () => {
    class Faulty extends ComponentBase {
      protected override onInitialized(): void {
        throw new Error("init");
      }
      protected override onAfterRender(): Promise<void> {
        return Promise.reject(new Error("after"));
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "button");
        b.addAttribute(1, "onclick", EventCallback.bind(this, async () => {
          throw new Error("click");
        }));
        b.closeElement();
      }
    }
    class Parent extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Faulty));
        b.closeComponent();
      }
    }
    const renderer = new Renderer();
    const errors = collectErrors(renderer);
    const { container, state } = mount(Parent, renderer);
    await renderer.waitUntilIdle();
    const faulty = [...state.slotChildren.values()][0]!;
    // The throwing onInitialized means no render request: nothing to click yet.
    expect(errors.map((e) => [String(e.error), e.component, e.phase])).toEqual([["Error: init", faulty, "lifecycle"]]);
    faulty.component.stateHasChangedInternal();
    await renderer.waitUntilIdle();
    container.querySelector("button")!.click();
    await renderer.waitUntilIdle();
    // The async click handler re-renders after its synchronous part (Blazor's
    // HandleEventAsync), so onAfterRender fails once more before the handler's
    // own rejection arrives; the failed handler causes no second re-render.
    expect(errors.map((e) => [String(e.error), e.component, e.phase])).toEqual([
      ["Error: init", faulty, "lifecycle"],
      ["Error: after", faulty, "afterRender"],
      ["Error: after", faulty, "afterRender"],
      ["Error: click", faulty, "event"],
    ]);
  });

  it("logs with component context by default and never throws out of the batch", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    class Boom extends ComponentBase {
      protected override buildRenderTree(): void {
        throw new Error("boom");
      }
    }
    try {
      const { renderer } = mount(Boom);
      await expect(renderer.waitUntilIdle()).resolves.toBeUndefined();
      expect(consoleError.mock.calls.map((c) => [c[0], String(c[1])])).toEqual([
        [expect.stringMatching(/^\[tsazor\] Render of component #\d+ \(Boom\) failed:$/), "Error: boom"],
      ]);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("independent renderers", () => {
  it("each renderer tracks its own event handlers and routes its own errors", async () => {
    let release!: () => void;
    let clicks = 0;
    class Clicker extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "button");
        b.addAttribute(1, "onclick", EventCallback.bind(this, async () => {
          await new Promise<void>((r) => (release = r));
          clicks++;
          throw new Error("late");
        }));
        b.addContent(2, String(clicks));
        b.closeElement();
      }
    }
    const a = new Renderer();
    const aErrors = collectErrors(a);
    const { container } = mount(Clicker, a);
    // Constructed later: formerly the global "active" renderer for all events.
    const b = new Renderer();
    const bErrors = collectErrors(b);
    mount(Tree, b);
    await a.waitUntilIdle();
    await b.waitUntilIdle();

    container.querySelector("button")!.click();
    let aIdle = false;
    const idle = a.waitUntilIdle().then(() => (aIdle = true));
    await b.waitUntilIdle();
    await new Promise((r) => setTimeout(r, 0));
    expect(aIdle).toBe(false);
    release();
    await idle;
    expect(aErrors.map((e) => String(e.error))).toEqual(["Error: late"]);
    expect(bErrors).toEqual([]);
  });

  it("batches of two renderers do not mix", async () => {
    const a = new Renderer();
    const b = new Renderer();
    const aBatches = batches(a);
    const bBatches = batches(b);
    mount(Root, a);
    mount(Tree, b);
    await Promise.all([a.waitUntilIdle(), b.waitUntilIdle()]);
    expect(aBatches).toEqual([["Root", "p", "c", "g"]]);
    expect(bBatches).toEqual([[""]]);
  });
});
