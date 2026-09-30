/**
 * Component lifecycle and render batching vs. Blazor.
 * Review §3: R5, R6, R7, R9, R13.
 */
import { describe, expect, it, vi } from "vitest";
import { ComponentBase, defineComponent, Renderer, type RenderTreeBuilder } from "@tsazor/runtime";
import { createTestRenderer } from "../harness.js";
import { host, settle } from "./host.js";

function mountRoot(type: new () => ComponentBase): { container: HTMLElement; renderer: Renderer } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = createTestRenderer();
  renderer.renderInContainer(type, container);
  return { container, renderer };
}

describe("R6 — async lifecycle methods", () => {
  it.fails("async onInitialized renders while pending (loading state) and again after completion", async () => {
    let resolve!: () => void;
    const renders: string[] = [];
    class Loader extends ComponentBase {
      data = "loading";
      protected override async onInitialized(): Promise<void> {
        await new Promise<void>((r) => (resolve = r));
        this.data = "loaded";
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        renders.push(this.data);
        b.addContent(0, this.data);
      }
    }
    const { container, renderer } = mountRoot(Loader);
    await new Promise((r) => setTimeout(r, 10));
    const whilePending = [...renders];
    resolve();
    await settle(renderer);
    expect({ whilePending, all: renders, text: container.textContent }).toEqual({
      whilePending: ["loading"],
      all: ["loading", "loaded"],
      text: "loaded",
    });
  });

  it.fails("async onParametersSet renders while pending and again after completion", async () => {
    let resolve!: () => void;
    const renders: string[] = [];
    class Loader extends ComponentBase {
      data = "loading";
      protected override async onParametersSet(): Promise<void> {
        await new Promise<void>((r) => (resolve = r));
        this.data = "loaded";
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        renders.push(this.data);
        b.addContent(0, this.data);
      }
    }
    const { renderer } = mountRoot(Loader);
    await new Promise((r) => setTimeout(r, 10));
    const whilePending = [...renders];
    resolve();
    await settle(renderer);
    expect({ whilePending, all: renders }).toEqual({ whilePending: ["loading"], all: ["loading", "loaded"] });
  });

  it("synchronous lifecycle renders exactly once", async () => {
    let renders = 0;
    class Sync extends ComponentBase {
      protected override onInitialized(): void {}
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        renders++;
        b.addContent(0, "s");
      }
    }
    const { renderer } = mountRoot(Sync);
    await settle(renderer);
    expect(renders).toBe(1);
  });
});

describe("R5 — ShouldRender", () => {
  it.fails("the first render happens even when shouldRender() returns false", async () => {
    class Never extends ComponentBase {
      protected override shouldRender(): boolean {
        return false;
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, "first");
      }
    }
    const { container, renderer } = mountRoot(Never);
    await settle(renderer);
    expect(container.textContent).toBe("first");
  });
});

describe("R7 — OnAfterRender", () => {
  it.fails("runs after the whole batch: children render (and after-render) before the parent's callback", async () => {
    const order: string[] = [];
    class Kid extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        order.push("K.render");
        b.addContent(0, "k");
      }
      protected override onAfterRender(first: boolean): void {
        order.push(`K.after:${first}`);
      }
    }
    class Parent extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        order.push("P.render");
        b.openComponent(0, defineComponent(Kid));
        b.closeComponent();
      }
      protected override onAfterRender(first: boolean): void {
        order.push(`P.after:${first}`);
      }
    }
    const { renderer } = mountRoot(Parent);
    await settle(renderer);
    expect(order).toEqual(["P.render", "K.render", "K.after:true", "P.after:true"]);
  });
});

describe("R9 — render queue", () => {
  // Tsazor-specific, not Blazor: Blazor's ComponentRenderQueue is FIFO (K, P, K here).
  // Parent-first is a deliberate optimization (roadmap B2).
  it("renders parents before children when both are dirty (child renders once)", async () => {
    const order: string[] = [];
    let kid!: Kid;
    class Kid extends ComponentBase {
      protected override onInitialized(): void {
        kid = this;
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        order.push("K");
        b.addContent(0, "k");
      }
      poke(): void {
        this.stateHasChanged();
      }
    }
    let parent!: Parent;
    class Parent extends ComponentBase {
      protected override onInitialized(): void {
        parent = this;
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        order.push("P");
        b.openComponent(0, defineComponent(Kid));
        b.closeComponent();
      }
      poke(): void {
        this.stateHasChanged();
      }
    }
    const { renderer } = mountRoot(Parent);
    await settle(renderer);
    order.length = 0;
    kid.poke();
    parent.poke();
    await settle(renderer);
    expect(order).toEqual(["P", "K"]);
  });

  it("an exception in one component does not stop other components in the batch", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    class Bad extends ComponentBase {
      protected override buildRenderTree(): void {
        throw new Error("boom");
      }
    }
    class Ok extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, "ok");
      }
    }
    const renderer = new Renderer();
    const bad = document.createElement("div");
    const ok = document.createElement("div");
    renderer.renderInContainer(Bad, bad);
    renderer.renderInContainer(Ok, ok);
    let threw = false;
    try {
      await settle(renderer);
    } catch {
      threw = true;
    }
    error.mockRestore();
    expect({ threw, ok: ok.textContent }).toEqual({ threw: false, ok: "ok" });
  });

  it("stateHasChanged during its own render schedules another render", async () => {
    let n = 0;
    class Self extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        n++;
        if (n < 3) this.stateHasChanged();
        b.addContent(0, String(n));
      }
    }
    const { container, renderer } = mountRoot(Self);
    await settle(renderer);
    expect({ n, text: container.textContent }).toEqual({ n: 3, text: "3" });
  });
});

describe("R13 — disposal", () => {
  it.fails("disposeAsync is awaited on removal", async () => {
    let called = false;
    class AsyncDisposable extends ComponentBase {
      async disposeAsync(): Promise<void> {
        called = true;
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, "d");
      }
    }
    let show = true;
    const h = await host((b) => {
      if (show) {
        b.openComponent(0, defineComponent(AsyncDisposable));
        b.closeComponent();
      }
    });
    show = false;
    await h.update();
    expect(called).toBe(true);
  });

  it.fails("a parent is disposed before its children", async () => {
    const order: string[] = [];
    class Kid extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, "k");
      }
      dispose(): void {
        order.push("kid");
      }
    }
    class Parent extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Kid));
        b.closeComponent();
      }
      dispose(): void {
        order.push("parent");
      }
    }
    let show = true;
    const h = await host((b) => {
      if (show) {
        b.openComponent(0, defineComponent(Parent));
        b.closeComponent();
      }
    });
    show = false;
    await h.update();
    expect(order).toEqual(["parent", "kid"]);
  });
});
