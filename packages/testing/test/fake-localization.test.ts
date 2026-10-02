/** createFakeLocalization + render: a component that injects the StringLocalizer. */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, inject, StringLocalizer, type RenderTreeBuilder } from "@tsazor/runtime";
import { createFakeLocalization, render } from "../src";

afterEach(() => {
  document.body.innerHTML = "";
});

const fake = createFakeLocalization({
  tables: { "en-US": { Greeting: "Hello" }, "de-DE": { Greeting: "Hallo" } },
  defaultCulture: "en-US",
});

class Greeter extends ComponentBase {
  private readonly L = inject(StringLocalizer as never) as InstanceType<typeof StringLocalizer>;
  renders = 0;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.renders++;
    b.addContent(0, this.L.get("Greeting"));
  }
}

describe("createFakeLocalization", () => {
  it("registers both services; a culture switch re-renders the injecting component (auto-render)", async () => {
    const result = await render(Greeter, { services: (s) => fake.register(s) });
    expect(result.container.textContent).toBe("Hello");

    const before = result.instance.renders;
    fake.switchTo("de-DE");
    await result.renderer.waitUntilIdle();
    expect(result.container.textContent).toBe("Hallo");
    expect(result.instance.renders - before).toBe(1); // coalesced like a hand-written observe
  });

  it("an unconfigured fixture is invariant and returns the key", async () => {
    const bare = createFakeLocalization();
    const result = await render(Greeter, { services: (s) => bare.register(s) });
    expect(result.container.textContent).toBe("Greeting");
  });
});