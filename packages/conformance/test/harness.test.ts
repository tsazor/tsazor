import { describe, expect, it } from "vitest";
import { diagnosticsOf, mount } from "./harness.js";

describe("harness", () => {
  it("compiles, mounts and re-renders a counter through the plugin pipeline", async () => {
    const m = await mount(`
<p>Count: @count</p>
<button @onclick="increment">+</button>
@code {
    private count = 0;
    private increment() { this.count++; }
}`);
    expect(m.html()).toBe("<p>Count: 0</p><button>+</button>");
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.html()).toBe("<p>Count: 1</p><button>+</button>");
  });

  it("resolves sibling components and passes parameters", async () => {
    const m = await mount({
      "Test.tsazor": `<Greeter Name="@who" />\n@code { private who = "Ada"; }`,
      "Greeter.tsazor": `<b>Hi @Name</b>\n@code { @Parameter() Name = ""; }`,
    });
    expect(m.html()).toBe("<b>Hi Ada</b>");
  });

  it("reports diagnostics", async () => {
    const diagnostics = await diagnosticsOf(`<div>`);
    expect(diagnostics.some((d) => d.severity === "error")).toBe(true);
  });
});
