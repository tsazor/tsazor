/** createFakeStore + render: a component that tracks an external store. */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, type RenderTreeBuilder } from "@tsazor/runtime";
import { createFakeStore, render } from "../src";

afterEach(() => {
  document.body.innerHTML = "";
});

const prices = createFakeStore(100);

class Ticker extends ComponentBase {
  renders = 0;
  protected override onInitialized(): void {
    this.track(prices);
  }
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.renders++;
    b.addContent(0, `$${prices.value}`);
  }
}

describe("createFakeStore", () => {
  it("drives a tracked component; waitUntilIdle sees the coalesced render; dispose unsubscribes", async () => {
    const result = await render(Ticker);
    expect(result.container.textContent).toBe("$100");
    expect(prices.listenerCount).toBe(1);

    const before = result.instance.renders;
    prices.set(101);
    prices.set(102);
    await result.renderer.waitUntilIdle();
    expect(result.container.textContent).toBe("$102");
    expect(result.instance.renders - before).toBe(1);

    result.dispose();
    expect(prices.listenerCount).toBe(0);
  });
});
