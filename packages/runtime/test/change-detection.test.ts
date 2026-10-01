/**
 * B6: parameter change detection (Blazor's ChangeDetection.MayHaveChanged and
 * ParameterView.DefinitelyEquals) and the per-class parameter metadata cache.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, EventCallback, Parameter, Renderer, defineComponent, type RenderFragment, type RenderTreeBuilder } from "../src/index";
import { mayHaveChanged } from "../src/components/change-detection";
import { defineParameter, findParameterMetadata, getParameterInfo } from "../src/components/parameter-metadata";

describe("mayHaveChanged", () => {
  it("known immutable values compare by Object.is", () => {
    expect(mayHaveChanged("a", "a")).toBe(false);
    expect(mayHaveChanged("a", "b")).toBe(true);
    expect(mayHaveChanged(1, 1)).toBe(false);
    expect(mayHaveChanged(NaN, NaN)).toBe(false);
    expect(mayHaveChanged(1, 2)).toBe(true);
    expect(mayHaveChanged(true, true)).toBe(false);
    expect(mayHaveChanged(10n, 10n)).toBe(false);
    const s = Symbol("s");
    expect(mayHaveChanged(s, s)).toBe(false);
  });

  it("null and undefined: equal only to themselves", () => {
    expect(mayHaveChanged(null, null)).toBe(false);
    expect(mayHaveChanged(undefined, undefined)).toBe(false);
    expect(mayHaveChanged(null, undefined)).toBe(true);
    expect(mayHaveChanged(undefined, "")).toBe(true);
    expect(mayHaveChanged(0, null)).toBe(true);
  });

  it("different kinds always differ", () => {
    expect(mayHaveChanged(1, "1")).toBe(true);
    expect(mayHaveChanged(1, 1n)).toBe(true);
  });

  it("objects, arrays, functions and Dates may have changed even when identical", () => {
    const object = {};
    const array: number[] = [];
    const fn = () => {};
    const date = new Date(0);
    expect(mayHaveChanged(object, object)).toBe(true);
    expect(mayHaveChanged(array, array)).toBe(true);
    expect(mayHaveChanged(fn, fn)).toBe(true);
    expect(mayHaveChanged(date, date)).toBe(true);
  });

  it("EventCallback: equal for the same receiver and delegate (Blazor's EventCallback.Equals)", () => {
    class Owner extends ComponentBase {}
    const a = new Owner();
    const b = new Owner();
    const handler = () => {};
    expect(mayHaveChanged(EventCallback.bind(a, handler), EventCallback.bind(a, handler))).toBe(false);
    expect(mayHaveChanged(EventCallback.bind(a, handler), EventCallback.bind(b, handler))).toBe(true);
    expect(mayHaveChanged(EventCallback.bind(a, handler), EventCallback.bind(a, () => {}))).toBe(true);
    // A forwarded callback is re-bound on every render: compare the inner one.
    const inner = EventCallback.bind(b, handler);
    expect(mayHaveChanged(EventCallback.bind(a, inner), EventCallback.bind(a, EventCallback.bind(b, handler)))).toBe(false);
    expect(mayHaveChanged(EventCallback.bind(a, handler), handler)).toBe(true);
  });
});

const log: string[] = [];
afterEach(() => {
  log.length = 0;
});

class Child extends ComponentBase {
  @Parameter() a?: unknown;
  @Parameter() b?: unknown;
  @Parameter() onPick?: unknown;
  @Parameter() childContent?: RenderFragment;
  protected override onParametersSet(): void {
    log.push("pset");
  }
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    log.push("render");
    this.childContent?.(b);
  }
}

/** Mounts a parent that renders one Child with `attributes()`; returns a re-render trigger. */
async function mountChild(attributes: () => Array<[string, unknown]>) {
  class Parent extends ComponentBase {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.openComponent(0, defineComponent(Child));
      let seq = 1;
      for (const [name, value] of attributes()) b.addAttribute(seq++, name, value as never);
      b.closeComponent();
    }
    rerender(): void {
      this.stateHasChanged();
    }
  }
  const renderer = new Renderer();
  renderer.errorHandler = ({ error }) => {
    throw error;
  };
  const container = document.createElement("div");
  const parent = renderer.renderInContainer(Parent, container).component as Parent;
  await renderer.waitUntilIdle();
  log.length = 0;
  return {
    parent,
    async rerender() {
      parent.rerender();
      await renderer.waitUntilIdle();
    },
  };
}

describe("B6 — retained children only get parameters that may have changed", () => {
  it("unchanged primitives: no setParameters, no render", async () => {
    const h = await mountChild(() => [["a", "x"], ["b", 1]]);
    await h.rerender();
    expect(log).toEqual([]);
  });

  it("a changed primitive re-sets all parameters", async () => {
    let n = 1;
    const h = await mountChild(() => [["a", "x"], ["b", n]]);
    n = 2;
    await h.rerender();
    expect(log).toEqual(["pset", "render"]);
  });

  it("an object parameter always counts as changed (it may have been mutated)", async () => {
    const shared = { n: 1 };
    const h = await mountChild(() => [["a", shared]]);
    await h.rerender();
    expect(log).toEqual(["pset", "render"]);
  });

  it("child content (a fresh function per render) always counts as changed", async () => {
    const h = await mountChild(() => [["childContent", ((b: RenderTreeBuilder) => b.addContent(0, "x")) as RenderFragment]]);
    await h.rerender();
    expect(log).toEqual(["pset", "render"]);
  });

  it("an added, removed or reordered parameter counts as changed", async () => {
    let attributes: Array<[string, unknown]> = [["a", 1]];
    const h = await mountChild(() => attributes);
    attributes = [["a", 1], ["b", 2]];
    await h.rerender();
    attributes = [["b", 2], ["a", 1]];
    await h.rerender();
    attributes = [["a", 1]];
    await h.rerender();
    expect(log).toEqual(["pset", "render", "pset", "render", "pset", "render"]);
  });

  it("EventCallback: the same receiver + delegate is unchanged, a fresh lambda is changed", async () => {
    let lambda = false;
    let parent!: ComponentBase;
    const handler = () => {};
    const h = await mountChild(() => [["onPick", EventCallback.bind(parent, lambda ? () => {} : handler)]]);
    parent = h.parent;
    await h.rerender(); // receiver changed from undefined to the parent
    log.length = 0;
    await h.rerender();
    expect(log).toEqual([]);
    lambda = true;
    await h.rerender();
    expect(log).toEqual(["pset", "render"]);
  });

  it("a plain function on an on*-parameter compares like the EventCallback it becomes", async () => {
    const handler = () => {};
    const h = await mountChild(() => [["onPick", handler]]);
    await h.rerender();
    expect(log).toEqual([]);
  });
});

describe("parameter metadata cache", () => {
  it("is built once per class", () => {
    class Cached extends ComponentBase {
      @Parameter() title = "";
    }
    const first = getParameterInfo(Cached);
    expect(getParameterInfo(Cached)).toBe(first);
    expect(findParameterMetadata(Cached)).toBe(first.all);
    expect([...first.caseFolded]).toEqual([["title", "title"]]);
    expect(first.cascading).toEqual([]);
    expect(first.captureUnmatchedProperty).toBeNull();
  });

  it("includes inherited parameters (own class wins) and is rebuilt after a later registration", () => {
    class Base extends ComponentBase {
      @Parameter() shared = "";
    }
    class Derived extends Base {
      @Parameter({ captureUnmatchedValues: true }) rest?: Record<string, unknown>;
    }
    const before = getParameterInfo(Derived);
    expect([...before.all.keys()]).toEqual(["shared", "rest"]);
    expect(before.captureUnmatchedProperty).toBe("rest");
    defineParameter(Base, "late");
    const after = getParameterInfo(Derived);
    expect(after).not.toBe(before);
    expect([...after.all.keys()]).toEqual(["shared", "late", "rest"]);
  });
});
