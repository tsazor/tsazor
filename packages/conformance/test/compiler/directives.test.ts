/**
 * Directives. Review §1: C19 (Blazor-only directives, @attribute, generic
 * @inherits), C21 (user-written buildRenderTree).
 */
import { describe, expect, it } from "vitest";
import { diagnosticsOf, errorCodes, mount } from "../harness.js";

describe("C19 — Blazor-only directives are accepted and ignored", () => {
  for (const directive of [
    "@namespace FluentCMS.Web.UI",
    "@rendermode InteractiveServer",
    "@implements IDisposable",
    "@preservewhitespace true",
  ]) {
    it.fails(directive, async () => {
      const m = await mount(`${directive}\n<p>x</p>`);
      expect(errorCodes(m.diagnostics)).toEqual([]);
      expect(m.html()).toBe("<p>x</p>");
    });
  }
});

describe("C19 — @attribute", () => {
  it.fails("the documented form compiles", async () => {
    const diagnostics = await diagnosticsOf(`@attribute [Marker]\n<p>x</p>\n@code { }`);
    expect(errorCodes(diagnostics)).toEqual([]);
  });
});

describe("C19 — generic @inherits", () => {
  it("inherits from a generic base class", async () => {
    const base = `import { ComponentBase } from "@tsazor/runtime";
export class Base<T> extends ComponentBase { protected label(v: T): string { return "[" + String(v) + "]"; } }
export default Base;
`;
    const m = await mount({
      "Test.tsazor": `@inherits Base<number>\n<p>@label(5)</p>`,
      "Base.ts": base,
    });
    expect(m.html()).toBe("<p>[5]</p>");
  });

  it("with a nested generic type argument (FluentCMS: Base<ICollection<TValue>>)", async () => {
    const base = `import { ComponentBase } from "@tsazor/runtime";
export class Base<T> extends ComponentBase { protected count(v: T): number { return (v as unknown as unknown[]).length; } }
export default Base;
`;
    const m = await mount({
      "Test.tsazor": `@inherits Base<Array<string>>\n<p>@count(["a", "b"])</p>`,
      "Base.ts": base,
    });
    expect(m.html()).toBe("<p>2</p>");
  });
});

describe("C21 — user-written buildRenderTree", () => {
  it.fails("is reported instead of being silently replaced", async () => {
    const diagnostics = await diagnosticsOf(`
@code {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, "mine");
    }
}`);
    expect(errorCodes(diagnostics).length).toBeGreaterThan(0);
  });
});
