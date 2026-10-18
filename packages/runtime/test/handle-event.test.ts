/**
 * Blazor's IHandleEvent: a component decides how its events are handled (`handleEventAsync`). ComponentBase's renders
 * after the handler's synchronous part and once more when an async handler completes; a component that overrides it
 * — Blazor's `@implements IHandleEvent` — runs the handler without a render (a MudBlazor port's
 * `EventUtil.AsNonRenderingEventHandler` had nothing to map to). The handler keeps its receiver as `this`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, EventCallback, EventCallbackWorkItem, type RenderTreeBuilder } from "../src/index";
import { Renderer } from "../src/internal";

afterEach(() => {
  document.body.innerHTML = "";
});

async function mount<T extends ComponentBase>(component: new () => T): Promise<{ renderer: Renderer; instance: T }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new Renderer();
  const state = renderer.renderInContainer(component, container);
  await renderer.waitUntilIdle();
  return { renderer, instance: state.component as T };
}

async function click(renderer: Renderer): Promise<void> {
  document.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true }));
  await renderer.waitUntilIdle();
}

class Counter extends ComponentBase {
  count = 0;
  renders = 0;
  protected increment(): void {
    this.count++;
  }
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.renders++;
    b.openElement(0, "button");
    b.addAttribute(1, "onclick", EventCallback.bind(this, this.increment));
    b.addContent(2, String(this.count));
    b.closeElement();
  }
}

describe("handleEventAsync (Blazor's IHandleEvent)", () => {
  it("ComponentBase's renders after a synchronous handler, and twice around an async one", async () => {
    const { renderer, instance } = await mount(Counter);
    await click(renderer);
    expect([instance.count, instance.renders, document.querySelector("button")!.textContent]).toEqual([1, 2, "1"]);

    let finish!: () => void;
    class Busy extends Counter {
      busy = false;
      protected override increment(): Promise<void> {
        this.busy = true;
        return new Promise<void>((resolve) => (finish = resolve)).then(() => {
          this.busy = false;
          this.count++;
        });
      }
    }
    document.body.innerHTML = "";
    const busy = await mount(Busy);
    document.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true }));
    await Promise.resolve();
    expect(busy.instance.busy).toBe(true);
    finish();
    await busy.renderer.waitUntilIdle();
    expect([busy.instance.count, busy.instance.renders]).toEqual([1, 3]);
  });

  it("overridden, it runs the handler without a render — the handler keeps `this`, gets the argument", async () => {
    const seen: unknown[] = [];
    class Quiet extends Counter {
      protected override handleEventAsync(callback: EventCallbackWorkItem, arg: unknown): Promise<void> {
        seen.push(arg instanceof Event ? arg.type : arg);
        return callback.invokeAsync(arg);
      }
    }
    const { renderer, instance } = await mount(Quiet);
    await click(renderer);
    await click(renderer);
    expect([instance.count, instance.renders, document.querySelector("button")!.textContent]).toEqual([2, 1, "0"]);
    expect(seen).toEqual(["click", "click"]);
  });

  it("a synchronous handler's task is the settled EventCallbackWorkItem.completed; an async one's its own", async () => {
    const sync = new EventCallbackWorkItem(null, () => 1);
    expect(sync.invokeAsync()).toBe(EventCallbackWorkItem.completed);
    const async = new EventCallbackWorkItem(null, async () => 1);
    const task = async.invokeAsync();
    expect(task).not.toBe(EventCallbackWorkItem.completed);
    await expect(task).resolves.toBeUndefined();
  });
});
