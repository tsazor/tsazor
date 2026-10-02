/**
 * `@Bindable()` (Tsazor extension): an auto-accessor parameter that
 * desugars to `@Parameter() value` + `@Parameter() valueChanged?:
 * EventCallback<T>`; a local assignment invokes the callback, a parameter
 * write from the parent does not.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Bindable,
  ComponentBase,
  ErrorBoundary,
  EventCallback,
  Renderer,
  defineComponent,
  type RenderFragment,
  type RenderTreeBuilder,
} from "../src/index";
import { getParameterInfo } from "../src/components/parameter-metadata";

afterEach(() => {
  document.body.innerHTML = "";
});

class Stepper extends ComponentBase {
  @Bindable() accessor value = 0;
  renders = 0;

  step(delta: number): void {
    this.value += delta;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.renders++;
    b.openElement(0, "button");
    b.addAttribute(1, "onclick", EventCallback.bind(this, () => this.step(1)));
    b.addContent(2, `v${this.value}`);
    b.closeElement();
  }
}

/** A parent binding `Stepper` like `@bind-Value="guests"` compiles to. */
class Parent extends ComponentBase {
  guests = 5;
  calls: number[] = [];
  bound = true;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, defineComponent(Stepper));
    b.addAttribute(1, "value", this.guests);
    if (this.bound) {
      b.addAttribute(2, "valueChanged", EventCallback.bind(this, (v: number) => {
        this.calls.push(v);
        this.guests = v;
      }));
    }
    b.closeComponent();
    b.openElement(3, "p");
    b.addContent(4, `p${this.guests}`);
    b.closeElement();
  }
}

async function mount<T extends ComponentBase>(type: new () => T): Promise<{ container: HTMLElement; renderer: Renderer; root: T }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new Renderer();
  const state = renderer.renderInContainer(type, container);
  await renderer.waitUntilIdle();
  return { container, renderer, root: state.component as T };
}

describe("@Bindable()", () => {
  it("registers the value and the synthesized change callback as parameters", () => {
    const info = getParameterInfo(Stepper);
    expect([...info.all.keys()]).toEqual(["value", "valueChanged"]);
    expect(info.all.get("value")!.store).toBeTypeOf("symbol");
    expect(info.caseFolded.get("valuechanged")).toBe("valueChanged");
  });

  it("names the callback by `changed` and adds `<name>Expression` with `expression: true`", () => {
    class Picker extends ComponentBase {
      @Bindable({ changed: "onPick", expression: true }) accessor value = "";
    }
    expect([...getParameterInfo(Picker).all.keys()]).toEqual(["value", "onPick", "valueExpression"]);
  });

  it("a parameter write from the parent sets the value without invoking the callback", async () => {
    const { container, root } = await mount(Parent);
    expect(container.textContent).toBe("v5p5");
    expect(root.calls).toEqual([]);
  });

  it("a local assignment sets the value and invokes the callback; the parent re-renders", async () => {
    const { container, renderer, root } = await mount(Parent);
    container.querySelector("button")!.click();
    await renderer.waitUntilIdle();
    expect(root.calls).toEqual([6]);
    expect(container.textContent).toBe("v6p6");
  });

  it("skips the callback for an Object.is-equal value", async () => {
    const { renderer, root } = await mount(Parent);
    const child = renderer.getComponentState(2)!.component as Stepper;
    child.value = 5;
    child.value = 5;
    await renderer.waitUntilIdle();
    expect(root.calls).toEqual([]);
    child.value = Number.NaN;
    child.value = Number.NaN;
    await renderer.waitUntilIdle();
    expect(root.calls).toEqual([Number.NaN]);
  });

  it("works unbound: the value changes locally (uncontrolled)", async () => {
    const { container, renderer } = await mount(Stepper);
    container.querySelector("button")!.click();
    await renderer.waitUntilIdle();
    container.querySelector("button")!.click();
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("v2");
  });

  it("the synthesized parameter is a real member: awaiting it explicitly works", async () => {
    class Explicit extends ComponentBase {
      @Bindable() accessor value = 0;
      declare valueChanged?: EventCallback<number>;
      async bump(): Promise<void> {
        await this.valueChanged?.invokeAsync(this.value + 10);
      }
    }
    class Host extends ComponentBase {
      v = 1;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Explicit));
        b.addAttribute(1, "value", this.v);
        b.addAttribute(2, "valueChanged", EventCallback.bind(this, (x: number) => { this.v = x; }));
        b.closeComponent();
      }
    }
    const { renderer, root } = await mount(Host);
    const child = renderer.getComponentState(2)!.component as Explicit;
    await child.bump();
    await renderer.waitUntilIdle();
    expect(root.v).toBe(11);
    expect(child.value).toBe(11);
  });

  it("accepts a plain function as the callback (hand-built trees)", async () => {
    const seen: number[] = [];
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Stepper));
        b.addAttribute(1, "valueChanged", (v: number) => seen.push(v));
        b.closeComponent();
      }
    }
    const { container, renderer } = await mount(Host);
    container.querySelector("button")!.click();
    await renderer.waitUntilIdle();
    expect(seen).toEqual([1]);
  });

  it("routes a failing callback to the nearest ErrorBoundary (the event handler path)", async () => {
    class Failing extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Stepper));
        b.addAttribute(1, "valueChanged", EventCallback.bind(this, async () => {
          await Promise.resolve();
          throw new Error("parent failed");
        }));
        b.closeComponent();
      }
    }
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, ErrorBoundary);
        const content: RenderFragment = (inner) => {
          inner.openComponent(0, defineComponent(Failing));
          inner.closeComponent();
        };
        b.addAttribute(1, "childContent", content);
        b.addAttribute(2, "errorContent", (error: unknown) => ((inner: RenderTreeBuilder) => inner.addContent(0, `caught: ${(error as Error).message}`)) as RenderFragment);
        b.closeComponent();
      }
    }
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container, renderer } = await mount(Host);
    container.querySelector("button")!.click();
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("caught: parent failed");
    consoleError.mockRestore();
  });

  it("throws on a plain field (standard field decorators cannot intercept assignments)", () => {
    expect(() => {
      class Broken extends ComponentBase {
        // @ts-expect-error -- a field is not an accessor (TZS030 in .tsazor)
        @Bindable() value = 0;
      }
      return Broken;
    }).toThrow("@Bindable() needs an auto-accessor: write 'accessor value'");
  });

  it("survives a hot swap: the new class reads (and writes) the instance's value", async () => {
    class V1 extends ComponentBase {
      @Bindable() accessor value = 0;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, `v1:${this.value}`);
      }
    }
    class V2 extends ComponentBase {
      @Bindable() accessor value = 0;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, `v2:${this.value}`);
      }
    }
    const { container, renderer } = await mount(V1);
    const instance = renderer.getComponentState(1)!.component as V1;
    instance.value = 4;
    expect(renderer.hmrSwap(V1, V2)).toBe(1);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("v2:4");
    (instance as unknown as V2).value = 5;
    expect((instance as unknown as V2).value).toBe(5);
  });

  it("does not render by itself: an assignment outside an event needs stateHasChanged or track", async () => {
    const { renderer, container } = await mount(Stepper);
    const child = renderer.getComponentState(1)!.component as Stepper;
    const renders = child.renders;
    child.value = 7;
    await renderer.waitUntilIdle();
    expect(child.renders).toBe(renders);
    expect(container.textContent).toBe("v0");
  });
});
