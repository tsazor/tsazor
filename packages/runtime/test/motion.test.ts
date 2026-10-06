import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addAnimate,
  addTransition,
  ComponentBase,
  configureTransitions,
  Renderer,
  RenderTreeBuilder,
  type Animate,
  type Transition,
} from "../src/index";
import { crossfade, fade } from "../src/transition";
import { flip } from "../src/animate";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  configureTransitions({ reducedMotion: "respect" });
});

interface Mounted<T> {
  container: HTMLElement;
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
    component,
    async rerender() {
      (component as unknown as { stateHasChangedInternal(): void }).stateHasChangedInternal();
      await renderer.waitUntilIdle();
    },
  };
}

/** A transition that logs its calls and ticks; `duration` ms long. */
function recording(log: string[], label: string, duration = 100): Transition {
  return (element, { direction }) => {
    log.push(`${label} ${direction} ${element.textContent}`);
    return { duration, tick: (t) => log.push(`${label} t=${t.toFixed(2)}`) };
  };
}

function texts(container: HTMLElement): string[] {
  return [...container.querySelectorAll("p, li")].map((element) => element.textContent ?? "");
}

describe("@transition / @in / @out (F4)", () => {
  it("plays an intro when the component's render adds the element, not on its first render", async () => {
    const log: string[] = [];
    const events: string[] = [];
    class Page extends ComponentBase {
      visible = true;
      readonly appear = recording(log, "in");
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        if (this.visible) {
          b.openElement(0, "p");
          addTransition(b, 1, "@in", this.appear);
          b.addContent(2, "hello");
          b.closeElement();
        }
      }
    }
    const { container, component, rerender } = await mount(Page);
    expect(log).toEqual([]);
    component.visible = false;
    await rerender();
    component.visible = true;
    await rerender();
    container.querySelector("p")!.addEventListener("introend", () => events.push("introend"));
    expect(log).toEqual(["in in hello", "in t=0.00"]);
    vi.advanceTimersByTime(100);
    expect(log.at(-1)).toBe("in t=1.00");
    expect(events).toEqual(["introend"]);
  });

  it("keeps a leaving element in the DOM until its outro ends; indices skip it meanwhile", async () => {
    const log: string[] = [];
    class List extends ComponentBase {
      items = ["a", "b", "c"];
      readonly leave = recording(log, "out", 200);
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "ul");
        for (const item of this.items) {
          b.openElement(1, "li");
          b.setKey(item);
          addTransition(b, 2, "@out", this.leave);
          b.addContent(3, item);
          b.closeElement();
        }
        b.closeElement();
      }
    }
    const { container, component, rerender } = await mount(List);
    component.items = ["a", "c"];
    await rerender();
    expect(log[0]).toBe("out out b");
    expect(texts(container)).toEqual(["a", "b", "c"]);
    // The next renders resolve their sibling indices without the leaving "b".
    component.items = ["a", "c", "d"];
    await rerender();
    component.items = ["c", "d"];
    await rerender();
    expect(texts(container)).toEqual(["a", "b", "c", "d"]);
    vi.advanceTimersByTime(200);
    expect(texts(container)).toEqual(["c", "d"]);
    component.items = ["x", "c"];
    await rerender();
    vi.advanceTimersByTime(200);
    expect(texts(container)).toEqual(["x", "c"]);
  });

  it("reverses a running @transition intro from its current t", async () => {
    const log: string[] = [];
    class Page extends ComponentBase {
      visible = false;
      readonly both = recording(log, "both", 100);
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        if (this.visible) {
          b.openElement(0, "p");
          addTransition(b, 1, "@transition", this.both);
          b.addContent(2, "x");
          b.closeElement();
        }
      }
    }
    const { container, component, rerender } = await mount(Page);
    component.visible = true;
    await rerender();
    vi.advanceTimersByTime(40);
    component.visible = false;
    await rerender();
    // The outro starts at t = 0.4 and takes 40% of the duration back to 0.
    expect(log).toContain("both t=0.40");
    expect(container.querySelector("p")).not.toBeNull();
    vi.advanceTimersByTime(40);
    expect(container.querySelector("p")).toBeNull();
  });

  it("plays a local outro of an element inside a removed parent element, keeping the parent", async () => {
    const log: string[] = [];
    class Page extends ComponentBase {
      visible = true;
      readonly out = recording(log, "out", 50);
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        if (this.visible) {
          b.openElement(0, "section");
          b.openElement(1, "p");
          addTransition(b, 2, "@out", this.out);
          b.addContent(3, "inner");
          b.closeElement();
          b.closeElement();
        }
      }
    }
    const { container, component, rerender } = await mount(Page);
    component.visible = false;
    await rerender();
    expect(log[0]).toBe("out out inner");
    expect(container.querySelector("section")).not.toBeNull();
    vi.advanceTimersByTime(50);
    expect(container.querySelector("section")).toBeNull();
  });

  it("plays a child component's outro on its removal only when it is global", async () => {
    const log: string[] = [];
    const make = (name: "@out" | "@out:global") =>
      class Child extends ComponentBase {
        protected override buildRenderTree(b: RenderTreeBuilder): void {
          b.openElement(0, "p");
          addTransition(b, 1, name, recording(log, name, 50));
          b.addContent(2, "child");
          b.closeElement();
        }
      };
    for (const name of ["@out", "@out:global"] as const) {
      log.length = 0;
      const Child = make(name);
      class Page extends ComponentBase {
        visible = true;
        protected override buildRenderTree(b: RenderTreeBuilder): void {
          if (this.visible) {
            b.openComponent(0, Child);
            b.closeComponent();
          }
        }
      }
      const { container, component, rerender } = await mount(Page);
      component.visible = false;
      await rerender();
      if (name === "@out") {
        expect(log).toEqual([]);
        expect(container.querySelector("p")).toBeNull();
      } else {
        expect(log[0]).toBe("@out:global out child");
        expect(container.querySelector("p")).not.toBeNull();
        vi.advanceTimersByTime(50);
        expect(container.querySelector("p")).toBeNull();
      }
    }
  });

  it("plays global intros on a child's first render, but no intros in the app's first batch", async () => {
    const log: string[] = [];
    class Child extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "p");
        addTransition(b, 1, "@in:global", recording(log, "global"));
        addTransition(b, 2, "@out", recording(log, "local"));
        b.addContent(3, "c");
        b.closeElement();
      }
    }
    class Page extends ComponentBase {
      visible = true;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        if (this.visible) {
          b.openComponent(0, Child);
          b.closeComponent();
        }
      }
    }
    const { component, rerender } = await mount(Page);
    expect(log).toEqual([]);
    component.visible = false;
    await rerender();
    component.visible = true;
    await rerender();
    expect(log).toEqual(["global in c", "global t=0.00"]);
  });

  it("respects prefers-reduced-motion: the outro ends at once", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    const log: string[] = [];
    class Page extends ComponentBase {
      visible = true;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        if (this.visible) {
          b.openElement(0, "p");
          addTransition(b, 1, "@out", recording(log, "out", 500));
          b.addContent(2, "x");
          b.closeElement();
        }
      }
    }
    const { container, component, rerender } = await mount(Page);
    component.visible = false;
    await rerender();
    expect(container.querySelector("p")).toBeNull();
    expect(log).toEqual(["out out x", "out t=0.00"]);
    vi.unstubAllGlobals();
  });

  it("fade works bare and with parameters", () => {
    const element = document.createElement("p");
    document.body.appendChild(element);
    const bare = fade(element, { direction: "in" });
    expect(bare.duration).toBe(400);
    expect(bare.css!(0.5, 0.5)).toBe("opacity: 0.5");
    const config = fade({ duration: 100 })(element, { direction: "in" });
    expect(typeof config === "function" ? config() : config).toMatchObject({ duration: 100 });
  });

  it("crossfade pairs a sent element with the received one of the same key", async () => {
    const [send, receive] = crossfade({ fallback: () => ({ duration: 7 }) });
    const a = document.createElement("li");
    const b = document.createElement("li");
    const sent = send({ key: 1 })(a, { direction: "out" });
    const received = receive({ key: 1 })(b, { direction: "in" });
    const alone = receive({ key: 2 })(b, { direction: "in" });
    const resolve = (value: unknown) => (value as () => { duration?: number; css?: unknown })();
    expect(resolve(sent).css).toBeTypeOf("function");
    expect(resolve(received).css).toBeTypeOf("function");
    expect(resolve(alone)).toEqual({ duration: 7 });
  });
});

describe("@animate (F5)", () => {
  it("runs the animation for keyed items that moved, with their boxes before and after", async () => {
    const calls: Array<{ text: string | null; from: number; to: number }> = [];
    // A list item's box: 10px per place in the list.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const y = this.parentElement ? [...this.parentElement.children].indexOf(this) * 10 : 0;
      return { left: 0, top: y, width: 100, height: 10, right: 100, bottom: y + 10, x: 0, y, toJSON() {} } as DOMRect;
    });
    const recordFlip: Animate = (element, { from, to }) => {
      calls.push({ text: element.textContent, from: from.top, to: to.top });
      return flip(element, { from, to });
    };
    class List extends ComponentBase {
      items = ["a", "b"];
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "ul");
        for (const item of this.items) {
          b.openElement(1, "li");
          b.setKey(item);
          addAnimate(b, 2, recordFlip);
          b.addContent(3, item);
          b.closeElement();
        }
        b.closeElement();
      }
    }
    const { component, rerender } = await mount(List);
    component.items = ["b", "a"];
    await rerender();
    expect(calls).toEqual([
      { text: "a", from: 0, to: 10 },
      { text: "b", from: 10, to: 0 },
    ]);
  });
});
