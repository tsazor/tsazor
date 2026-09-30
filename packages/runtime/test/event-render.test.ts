/**
 * Event-handler render timing (Blazor's ComponentBase.HandleEventAsync): the
 * owner re-renders after the handler's synchronous part and — for an async
 * handler — again once it completes; a failed async handler renders once.
 */
import { describe, expect, it } from "vitest";
import { ComponentBase, EventCallback, Renderer, type RenderTreeBuilder } from "../src/index";

class Busy extends ComponentBase {
  busy = false;
  done = false;
  release!: () => void;
  fail = false;
  renders: string[] = [];

  private async save(): Promise<void> {
    this.busy = true;
    await new Promise<void>((resolve) => (this.release = resolve));
    if (this.fail) throw new Error("save failed");
    this.busy = false;
    this.done = true;
  }

  private sync(): void {
    this.done = true;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    const label = this.busy ? "busy" : this.done ? "done" : "idle";
    this.renders.push(label);
    b.openElement(0, "button");
    b.addAttribute(1, "id", "async");
    b.addAttribute(2, "onclick", EventCallback.bind(this, this.save));
    b.addContent(3, label);
    b.closeElement();
    b.openElement(4, "button");
    b.addAttribute(5, "id", "sync");
    b.addAttribute(6, "onclick", EventCallback.bind(this, this.sync));
    b.closeElement();
  }
}

async function mountBusy() {
  const container = document.createElement("div");
  const renderer = new Renderer();
  const errors: unknown[] = [];
  renderer.errorHandler = (e) => void errors.push(e.error);
  const state = renderer.renderInContainer(Busy, container);
  await renderer.waitUntilIdle();
  const busy = state.component as Busy;
  busy.renders.length = 0;
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { container, renderer, busy, errors, flush };
}

describe("event handler render timing", () => {
  it("an async handler renders its intermediate state, then its result", async () => {
    const { container, renderer, busy, flush } = await mountBusy();
    container.querySelector<HTMLButtonElement>("#async")!.click();
    await flush();
    expect(container.querySelector("#async")!.textContent).toBe("busy");
    busy.release();
    await renderer.waitUntilIdle();
    expect(container.querySelector("#async")!.textContent).toBe("done");
    expect(busy.renders).toEqual(["busy", "done"]);
  });

  it("a synchronous handler renders exactly once", async () => {
    const { container, renderer, busy } = await mountBusy();
    container.querySelector<HTMLButtonElement>("#sync")!.click();
    await renderer.waitUntilIdle();
    expect(busy.renders).toEqual(["done"]);
  });

  it("a failed async handler renders only after its synchronous part and reports the error", async () => {
    const { container, renderer, busy, errors, flush } = await mountBusy();
    busy.fail = true;
    container.querySelector<HTMLButtonElement>("#async")!.click();
    await flush();
    busy.release();
    await renderer.waitUntilIdle();
    expect(busy.renders).toEqual(["busy"]);
    expect(errors.map(String)).toEqual(["Error: save failed"]);
  });
});
