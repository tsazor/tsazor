/**
 * `EventCallback.bindWith` (H1 render hints, docs/design-render-hints.md):
 * the compiler's stable handler form — equality by receiver, factory and
 * arguments; the handler is created on first use; invocation as `bind`.
 */
import { describe, expect, it, vi } from "vitest";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "../src/index";
import { Renderer } from "../src/internal";
import { componentInternals } from "../src/components/component-internals";

class Owner extends ComponentBase {
  picked: unknown[] = [];
  pick(row: unknown): void {
    this.picked.push(row);
  }
  h0(row: unknown) {
    return () => this.pick(row);
  }
  h1(row: unknown) {
    return () => this.pick(row);
  }
}

describe("EventCallback.bindWith", () => {
  const owner = new Owner();
  const other = new Owner();
  const row = { id: 1 };

  it("is equal for the same receiver, factory and arguments (Object.is)", () => {
    const a = EventCallback.bindWith(owner, Owner.prototype.h0, [row, NaN]);
    expect(a.equals(EventCallback.bindWith(owner, Owner.prototype.h0, [row, NaN]))).toBe(true);
    expect(a.equals(EventCallback.bindWith(owner, Owner.prototype.h0, [{ id: 1 }, NaN]))).toBe(false);
    expect(a.equals(EventCallback.bindWith(owner, Owner.prototype.h0, [row]))).toBe(false);
    expect(a.equals(EventCallback.bindWith(owner, Owner.prototype.h1, [row, NaN]))).toBe(false);
    expect(a.equals(EventCallback.bindWith(other, Owner.prototype.h0, [row, NaN]))).toBe(false);
    expect(EventCallback.bindWith(owner, Owner.prototype.h0, [0]).equals(EventCallback.bindWith(owner, Owner.prototype.h0, [-0]))).toBe(false);
  });

  it("is never equal to a bind callback, whose rules stay unchanged", () => {
    const delegate = (): void => {};
    const created = EventCallback.bindWith(owner, Owner.prototype.h0, []);
    expect(created.equals(EventCallback.bind(owner, delegate))).toBe(false);
    expect(EventCallback.bind(owner, delegate).equals(created)).toBe(false);
    expect(EventCallback.bind(owner, delegate).equals(EventCallback.bind(owner, delegate))).toBe(true);
    expect(EventCallback.empty.equals(EventCallback.empty)).toBe(true);
  });

  it("creates the handler on first invocation, once, with the receiver as this", async () => {
    const factory = vi.fn(function (this: Owner, value: unknown) {
      return () => this.pick(value);
    });
    const callback = EventCallback.bindWith(owner, factory, ["x"]);
    expect(callback.hasDelegate).toBe(true);
    expect(factory).not.toHaveBeenCalled();
    owner.picked = [];
    await callback.invokeAsync();
    await callback.invokeAsync();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory.mock.contexts[0]).toBe(owner);
    expect(owner.picked).toEqual(["x", "x"]);
  });

  it("re-renders the owner after the handler, and after an async handler completes", async () => {
    const receiver = new Owner();
    const render = vi.spyOn(componentInternals, "requestRender").mockImplementation(() => {});
    let release!: () => void;
    const callback = EventCallback.bindWith(receiver, function () {
      return () => new Promise<void>((resolve) => (release = resolve));
    }, []);
    const done = callback.invokeAsync();
    expect(render).toHaveBeenCalledTimes(1);
    release();
    await done;
    expect(render).toHaveBeenCalledTimes(2);
    render.mockRestore();
  });

  it("routes a failing handler to the renderer's error handler, like bind", async () => {
    class Failing extends ComponentBase {
      fail(): never {
        throw new Error("boom");
      }
      h0() {
        return () => this.fail();
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "button");
        b.addEventHandler(1, "onclick", EventCallback.bindWith(this, Failing.prototype.h0, []));
        b.closeElement();
      }
    }
    const container = document.createElement("div");
    const renderer = new Renderer();
    const errors: unknown[] = [];
    renderer.errorHandler = (e) => void errors.push(e.error);
    renderer.renderInContainer(Failing, container);
    await renderer.waitUntilIdle();
    container.querySelector("button")!.click();
    await renderer.waitUntilIdle();
    expect(errors.map((e) => (e as Error).message)).toEqual(["boom"]);
  });
});
