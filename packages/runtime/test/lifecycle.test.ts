/**
 * Component lifecycle on top of the render batches (roadmap B4): async
 * onInitialized/onParametersSet, OnAfterRender at the batch end, ShouldRender,
 * disposal (disposeAsync, parent first) and unknown parameters.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ComponentBase, Parameter, Renderer, defineComponent, type RenderError, type RenderTreeBuilder } from "../src/index";
import type { ComponentState } from "../src/renderer/component-state";

const log: string[] = [];

function mount(type: abstract new () => ComponentBase): { renderer: Renderer; container: HTMLElement; state: ComponentState; errors: RenderError[] } {
  const renderer = new Renderer();
  const errors: RenderError[] = [];
  renderer.errorHandler = (error) => errors.push(error);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const state = renderer.renderInContainer(type, container);
  return { renderer, container, state, errors };
}

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown): void => {
  unhandled.push(reason);
};
beforeEach(() => {
  process.on("unhandledRejection", onUnhandled);
});
afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  unhandled.length = 0;
  log.length = 0;
});

/** Lets pending promise callbacks and the next batch run without waiting for idle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("async lifecycle (Blazor's RunInitAndSetParametersAsync)", () => {
  it("a synchronous lifecycle renders exactly once, in the parent's batch", async () => {
    class Kid extends ComponentBase {
      protected override onInitialized(): void {
        log.push("K.init");
      }
      protected override onParametersSet(): void {
        log.push("K.pset");
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        log.push("K.render");
        b.addContent(0, "k");
      }
    }
    class Parent extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        log.push("P.render");
        b.openComponent(0, defineComponent(Kid));
        b.closeComponent();
      }
    }
    const { renderer } = mount(Parent);
    const batches: number[] = [];
    renderer.onBatchCompleted((batch) => batches.push(batch.renderedComponents.length));
    await renderer.waitUntilIdle();
    expect(log).toEqual(["P.render", "K.init", "K.pset", "K.render"]);
    expect(batches).toEqual([2]);
  });

  it("an async onInitialized renders the loading state, then runs onParametersSet and renders again", async () => {
    const load = deferred();
    class Loader extends ComponentBase {
      data = "loading";
      protected override async onInitialized(): Promise<void> {
        log.push("init");
        await load.promise;
        this.data = "loaded";
      }
      protected override onParametersSet(): void {
        log.push(`pset:${this.data}`);
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        log.push(`render:${this.data}`);
        b.addContent(0, this.data);
      }
    }
    const { renderer, container } = mount(Loader);
    await flush();
    expect(log).toEqual(["init", "render:loading"]);
    expect(container.textContent).toBe("loading");
    load.resolve();
    await renderer.waitUntilIdle();
    expect(log).toEqual(["init", "render:loading", "pset:loaded", "render:loaded"]);
    expect(container.textContent).toBe("loaded");
  });

  it("an async onParametersSet renders after its synchronous part and again on completion", async () => {
    const load = deferred();
    class Loader extends ComponentBase {
      data = "a";
      protected override async onParametersSet(): Promise<void> {
        this.data = "b";
        await load.promise;
        this.data = "c";
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        log.push(this.data);
        b.addContent(0, this.data);
      }
    }
    const { renderer } = mount(Loader);
    await flush();
    expect(log).toEqual(["b"]);
    load.resolve();
    await renderer.waitUntilIdle();
    expect(log).toEqual(["b", "c"]);
  });

  it("waitUntilIdle covers pending lifecycle work", async () => {
    class Slow extends ComponentBase {
      data = "loading";
      protected override async onInitialized(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 10));
        this.data = "loaded";
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, this.data);
      }
    }
    const { renderer, container } = mount(Slow);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("loaded");
  });

  it("a rejected async hook goes to the error handler (phase lifecycle) without an unhandled rejection", async () => {
    const boom = new Error("load failed");
    class Failing extends ComponentBase {
      protected override async onInitialized(): Promise<void> {
        await flush();
        throw boom;
      }
      protected override onParametersSet(): void {
        log.push("pset");
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        log.push("render");
        b.addContent(0, "x");
      }
    }
    const { renderer, state, errors } = mount(Failing);
    await renderer.waitUntilIdle();
    await flush();
    // The loading render happened; onParametersSet does not run after a failed init (Blazor).
    expect(log).toEqual(["render"]);
    expect(errors).toEqual([{ error: boom, component: state, phase: "lifecycle" }]);
    expect(unhandled).toEqual([]);
  });

  it("a synchronous throw in a hook goes to the error handler", async () => {
    const boom = new Error("sync");
    class Failing extends ComponentBase {
      protected override onParametersSet(): void {
        throw boom;
      }
    }
    const { renderer, errors } = mount(Failing);
    await renderer.waitUntilIdle();
    expect(errors.map((e) => [e.error, e.phase])).toEqual([[boom, "lifecycle"]]);
  });
});

describe("OnAfterRender (Blazor's InvokeRenderCompletedCalls)", () => {
  class Leaf extends ComponentBase {
    @Parameter() name = "";
    /** Changes with every parent render, so the leaves re-render with it (B6). */
    @Parameter() generation = 0;
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      log.push(`${this.name}.render`);
      b.addContent(0, this.name);
    }
    protected override onAfterRender(firstRender: boolean): void {
      log.push(`${this.name}.after:${firstRender}`);
    }
  }
  class Tree extends ComponentBase {
    renders = 0;
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      log.push("P.render");
      this.renders++;
      b.openComponent(0, defineComponent(Leaf));
      b.addAttribute(1, "name", "A");
      b.addAttribute(2, "generation", this.renders);
      b.closeComponent();
      b.openComponent(3, defineComponent(Leaf));
      b.addAttribute(4, "name", "B");
      b.addAttribute(5, "generation", this.renders);
      b.closeComponent();
    }
    protected override onAfterRender(firstRender: boolean): void {
      log.push(`P.after:${firstRender}`);
    }
    poke(): void {
      this.stateHasChanged();
    }
  }

  it("runs after the whole batch, children before parents, firstRender once per instance", async () => {
    const { renderer, state } = mount(Tree);
    renderer.onBatchCompleted(() => log.push("batch"));
    await renderer.waitUntilIdle();
    expect(log).toEqual(["P.render", "A.render", "B.render", "A.after:true", "B.after:true", "P.after:true", "batch"]);
    log.length = 0;
    (state.component as Tree).poke();
    await renderer.waitUntilIdle();
    expect(log).toEqual(["P.render", "A.render", "B.render", "A.after:false", "B.after:false", "P.after:false", "batch"]);
  });

  it("runs once per batch for a component rendered repeatedly in it", async () => {
    let n = 0;
    class Twice extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        if (++n < 2) this.stateHasChanged();
        b.addContent(0, String(n));
      }
      protected override onAfterRender(firstRender: boolean): void {
        log.push(`after:${firstRender}:${n}`);
      }
    }
    const { renderer } = mount(Twice);
    await renderer.waitUntilIdle();
    expect(log).toEqual(["after:true:2"]);
  });

  it("skips components the batch disposed and components whose render failed", async () => {
    let show = true;
    let host!: Host;
    class Bad extends ComponentBase {
      protected override buildRenderTree(): void {
        throw new Error("render");
      }
      protected override onAfterRender(): void {
        log.push("Bad.after");
      }
    }
    class Doomed extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        log.push("Doomed.render");
        // Its parent renders after it in this batch and removes it.
        if (!show) host.poke();
        b.addContent(0, "d");
      }
      protected override onAfterRender(firstRender: boolean): void {
        log.push(`Doomed.after:${firstRender}`);
      }
      poke(): void {
        this.stateHasChanged();
      }
    }
    class Host extends ComponentBase {
      protected override onInitialized(): void {
        host = this;
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        if (show) {
          b.openComponent(0, defineComponent(Doomed));
          b.closeComponent();
        }
        b.openComponent(2, defineComponent(Bad));
        b.closeComponent();
      }
      poke(): void {
        this.stateHasChanged();
      }
    }
    const { renderer, state, errors } = mount(Host);
    await renderer.waitUntilIdle();
    expect(log).toEqual(["Doomed.render", "Doomed.after:true"]);
    log.length = 0;
    show = false;
    ([...state.slotChildren.values()][0]!.component as Doomed).poke();
    await renderer.waitUntilIdle();
    expect(log).toEqual(["Doomed.render"]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.phase === "render")).toBe(true);
  });

  it("an async onAfterRender is tracked, does not re-render, and routes failures", async () => {
    const done = deferred();
    const boom = new Error("after");
    let renders = 0;
    class AsyncAfter extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        renders++;
        b.addContent(0, "x");
      }
      protected override async onAfterRender(): Promise<void> {
        await done.promise;
        throw boom;
      }
    }
    const { renderer, state, errors } = mount(AsyncAfter);
    let idle = false;
    const idlePromise = renderer.waitUntilIdle().then(() => (idle = true));
    await flush();
    expect(idle).toBe(false);
    done.resolve();
    await idlePromise;
    expect(renders).toBe(1);
    expect(errors).toEqual([{ error: boom, component: state, phase: "afterRender" }]);
    expect(unhandled).toEqual([]);
  });

  it("a synchronous throw goes to the error handler and the other callbacks still run", async () => {
    class Throwing extends ComponentBase {
      protected override onAfterRender(): void {
        throw new Error("sync after");
      }
    }
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Throwing));
        b.closeComponent();
      }
      protected override onAfterRender(): void {
        log.push("Host.after");
      }
    }
    const { renderer, errors } = mount(Host);
    await renderer.waitUntilIdle();
    expect(log).toEqual(["Host.after"]);
    expect(errors.map((e) => e.phase)).toEqual(["afterRender"]);
  });

  it("stateHasChanged in onAfterRender renders in the next batch", async () => {
    let n = 0;
    class Again extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, String(++n));
      }
      protected override onAfterRender(firstRender: boolean): void {
        if (firstRender) this.stateHasChanged();
      }
    }
    const { renderer, container } = mount(Again);
    const batches: number[] = [];
    renderer.onBatchCompleted((batch) => batches.push(batch.renderedComponents.length));
    await renderer.waitUntilIdle();
    await flush();
    expect(batches).toEqual([1, 1]);
    expect(container.textContent).toBe("2");
  });
});

describe("ShouldRender", () => {
  it("the first render ignores it, later renders respect it", async () => {
    let allow = false;
    let renders = 0;
    class Gated extends ComponentBase {
      protected override shouldRender(): boolean {
        return allow;
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, String(++renders));
      }
      poke(): void {
        this.stateHasChanged();
      }
    }
    const { renderer, state, container } = mount(Gated);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("1");
    (state.component as Gated).poke();
    await renderer.waitUntilIdle();
    expect(renders).toBe(1);
    allow = true;
    (state.component as Gated).poke();
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("2");
  });

  it("a throwing shouldRender surfaces where the render was requested", async () => {
    const boom = new Error("should");
    class Child extends ComponentBase {
      @Parameter() n = 0;
      protected override shouldRender(): boolean {
        throw boom;
      }
    }
    class Host extends ComponentBase {
      n = 0;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Child));
        b.addAttribute(1, "n", this.n);
        b.closeComponent();
      }
      poke(): void {
        this.n++;
        this.stateHasChanged();
      }
    }
    const { renderer, state, errors } = mount(Host);
    await renderer.waitUntilIdle();
    expect(errors).toEqual([]);
    (state.component as Host).poke();
    await renderer.waitUntilIdle();
    expect(errors.map((e) => [e.error, e.phase])).toEqual([[boom, "lifecycle"]]);
  });
});

describe("disposal (Blazor's disposal queue)", () => {
  class Node extends ComponentBase {
    @Parameter() name = "";
    @Parameter() kids: string[] = [];
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      for (const kid of this.kids) {
        b.openComponent(0, defineComponent(Node));
        b.setKey(kid);
        b.addAttribute(1, "name", kid);
        b.addAttribute(2, "kids", kid.length < 2 ? [`${kid}1`, `${kid}2`] : []);
        b.closeComponent();
      }
    }
    dispose(): void {
      log.push(`dispose:${this.name}`);
    }
  }
  function hostOf(render: (b: RenderTreeBuilder) => void): abstract new () => ComponentBase {
    return class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        render(b);
      }
    };
  }

  it("disposes parents before children, breadth-first", async () => {
    let show = true;
    const { renderer, state } = mount(
      hostOf((b) => {
        if (!show) return;
        b.openComponent(0, defineComponent(Node));
        b.addAttribute(1, "name", "root");
        b.addAttribute(2, "kids", ["a", "b"]);
        b.closeComponent();
      }),
    );
    await renderer.waitUntilIdle();
    show = false;
    state.component.stateHasChangedInternal();
    await renderer.waitUntilIdle();
    expect(log).toEqual(["dispose:root", "dispose:a", "dispose:b", "dispose:a1", "dispose:a2", "dispose:b1", "dispose:b2"]);
  });

  it("calls only disposeAsync when both exist, and waitUntilIdle awaits it", async () => {
    const done = deferred();
    let show = true;
    class Both extends ComponentBase {
      dispose(): void {
        log.push("dispose");
      }
      async disposeAsync(): Promise<void> {
        log.push("disposeAsync:start");
        await done.promise;
        log.push("disposeAsync:end");
      }
    }
    const { renderer, state } = mount(
      hostOf((b) => {
        if (!show) return;
        b.openComponent(0, defineComponent(Both));
        b.closeComponent();
      }),
    );
    await renderer.waitUntilIdle();
    show = false;
    state.component.stateHasChangedInternal();
    const idle = renderer.waitUntilIdle();
    await flush();
    expect(log).toEqual(["disposeAsync:start"]);
    done.resolve();
    await idle;
    expect(log).toEqual(["disposeAsync:start", "disposeAsync:end"]);
  });

  it("routes sync and async disposal failures and still disposes the rest", async () => {
    const syncError = new Error("dispose");
    const asyncError = new Error("disposeAsync");
    let show = true;
    class SyncFail extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Node));
        b.addAttribute(1, "name", "under-sync");
        b.closeComponent();
      }
      dispose(): void {
        throw syncError;
      }
    }
    class AsyncFail extends ComponentBase {
      async disposeAsync(): Promise<void> {
        await flush();
        throw asyncError;
      }
    }
    const { renderer, state, errors } = mount(
      hostOf((b) => {
        if (!show) return;
        b.openComponent(0, defineComponent(SyncFail));
        b.closeComponent();
        b.openComponent(1, defineComponent(AsyncFail));
        b.closeComponent();
      }),
    );
    await renderer.waitUntilIdle();
    show = false;
    state.component.stateHasChangedInternal();
    await renderer.waitUntilIdle();
    expect(log).toEqual(["dispose:under-sync"]);
    expect(errors.map((e) => [e.error, e.phase])).toEqual([
      [syncError, "dispose"],
      [asyncError, "dispose"],
    ]);
    expect(unhandled).toEqual([]);
  });

  it("a disposed component ignores its async lifecycle's completion", async () => {
    const load = deferred();
    let show = true;
    let renders = 0;
    class Pending extends ComponentBase {
      protected override async onInitialized(): Promise<void> {
        await load.promise;
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        renders++;
        b.addContent(0, "p");
      }
    }
    const { renderer, state, errors } = mount(
      hostOf((b) => {
        if (!show) return;
        b.openComponent(0, defineComponent(Pending));
        b.closeComponent();
      }),
    );
    await flush();
    show = false;
    state.component.stateHasChangedInternal();
    await flush();
    load.resolve();
    await renderer.waitUntilIdle();
    expect({ renders, errors }).toEqual({ renders: 1, errors: [] });
  });
});

describe("unknown parameters (Blazor's SetParameterProperties)", () => {
  class Named extends ComponentBase {
    @Parameter() label = "";
    notAParameter = 1;
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.addContent(0, this.label);
    }
  }
  function hostWith(name: string, value: unknown, type: abstract new () => ComponentBase = Named): abstract new () => ComponentBase {
    return class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(type));
        b.addAttribute(1, name, value as never);
        b.closeComponent();
      }
    };
  }

  it("matches declared parameters case-insensitively", async () => {
    const { renderer, container, errors } = mount(hostWith("LABEL", "ok"));
    await renderer.waitUntilIdle();
    expect({ text: container.textContent, errors }).toEqual({ text: "ok", errors: [] });
  });

  it("reports an undeclared parameter (phase lifecycle) and does not initialize the component", async () => {
    let initialized = false;
    class Tracked extends Named {
      protected override onInitialized(): void {
        initialized = true;
      }
    }
    const { renderer, container, errors } = mount(hostWith("lable", "typo", Tracked));
    await renderer.waitUntilIdle();
    expect(errors.map((e) => [(e.error as Error).message, e.phase])).toEqual([
      ["Object of type 'Tracked' does not have a property matching the name 'lable'.", "lifecycle"],
    ]);
    expect({ initialized, text: container.textContent }).toEqual({ initialized: false, text: "" });
  });

  it("names a matching property that is not a parameter", async () => {
    const { renderer, errors } = mount(hostWith("NotAParameter", 2));
    await renderer.waitUntilIdle();
    expect((errors[0]?.error as Error).message).toBe(
      "Object of type 'Named' has a property matching the name 'NotAParameter', but it is not declared as @Parameter() or @CascadingParameter().",
    );
  });

  it("captureUnmatchedValues takes unknown names instead", async () => {
    class Capturing extends ComponentBase {
      @Parameter({ captureUnmatchedValues: true }) rest: Record<string, unknown> = {};
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, JSON.stringify(this.rest));
      }
    }
    const { renderer, container, errors } = mount(hostWith("data-x", 1, Capturing));
    await renderer.waitUntilIdle();
    expect({ text: container.textContent, errors }).toEqual({ text: '{"data-x":1}', errors: [] });
  });

  it("drops the compiler's ValueExpression when the component does not declare it", async () => {
    const { renderer, container, errors } = mount(hostWith("ValueExpression", "field"));
    await renderer.waitUntilIdle();
    expect({ text: container.textContent, errors }).toEqual({ text: "", errors: [] });
  });
});
