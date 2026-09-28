/**
 * M7 runtime test: HMR swap — replaces a live component class in place,
 * keeping instances (state retention) and re-rendering with the new markup.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, Renderer, type RenderTreeBuilder } from "../src/index";

let currentInstance: unknown;
let hostInstance: ComponentBase | undefined;

// Simulated recompiled module: recompiled classes keep their file-derived
// name, so both versions share the class name "Counter".
const CounterV1 = class Counter extends ComponentBase {
  count = 3;
  protected override onInitialized(): void {
    currentInstance = this;
  }
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "span");
    b.addContent(1, `V1: ${this.count}`);
    b.closeElement();
  }
};

const CounterV2 = class Counter extends ComponentBase {
  count = 0;
  label = "new";
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "span");
    b.addContent(1, `V2: ${this.count} ${this.label}`);
    b.closeElement();
  }
};

class Host extends ComponentBase {
  protected override onInitialized(): void {
    hostInstance = this;
  }
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, CounterV1);
    b.closeComponent();
  }
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("HMR swap", () => {
  it("keeps the instance and its state while adopting the new markup and fields", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = new Renderer();
    renderer.renderInContainer(Host, container);
    await renderer.waitUntilIdle();

    expect(container.textContent).toBe("V1: 3");
    const instance = currentInstance as ComponentBase;

    const swapped = renderer.hmrSwap(CounterV1, CounterV2);
    expect(swapped).toBe(1);
    await renderer.waitUntilIdle();

    // Same instance object retained (state retention).
    expect(currentInstance).toBe(instance);
    // Existing field value kept, new field seeded from the new constructor.
    expect((instance as unknown as { count: number }).count).toBe(3);
    expect((instance as unknown as { label: string }).label).toBe("new");
    // Markup re-rendered from the new class.
    expect(container.textContent).toBe("V2: 3 new");
  });

  it("lets a parent re-render keep the swapped child (no remount)", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = new Renderer();
    renderer.renderInContainer(Host, container);
    await renderer.waitUntilIdle();

    const instance = currentInstance as ComponentBase;
    renderer.hmrSwap(CounterV1, CounterV2);
    await renderer.waitUntilIdle();

    // Parent re-render: the child frame still carries the old class, but the
    // swapped child state is kept instead of being remounted.
    hostInstance!.stateHasChangedInternal();
    await renderer.waitUntilIdle();
    expect(currentInstance).toBe(instance);
    expect(container.textContent).toBe("V2: 3 new");
  });
});