/**
 * Directives. Review §1: C19 (Blazor-only directives, @attribute, generic
 * @inherits), C21 (user-written buildRenderTree).
 */
import { describe, expect, it } from "vitest";
import { matchRoute } from "@tsazor/runtime";
import { scanRoutes } from "../../../vite-plugin/src/routes.js";
import { compileFiles, diagnosticsOf, errorCodes, mount } from "../harness.js";

describe("C19 — Blazor-only directives are accepted and ignored", () => {
  for (const directive of [
    "@namespace FluentCMS.Web.UI",
    "@rendermode InteractiveServer",
    "@implements IDisposable",
    "@preservewhitespace true",
  ]) {
    it(directive, async () => {
      const m = await mount(`${directive}\n<p>x</p>`);
      expect(errorCodes(m.diagnostics)).toEqual([]);
      expect(m.html()).toBe("<p>x</p>");
    });
  }
});

describe("C19 — multiple @page directives", () => {
  it("registers every template as a route of the page", async () => {
    const compiled = await compileFiles({ "Test.tsazor": `@page "/a"\n@page "/b/{id:int}"\n<p>x</p>` });
    expect(errorCodes(compiled.diagnostics["Test.tsazor"]!)).toEqual([]);
    const routes = await scanRoutes(compiled.dir);
    expect(routes.map((r) => r.template)).toEqual(["/a", "/b/{id:int}"]);
    const { default: Page } = await import(/* @vite-ignore */ compiled.modules["Test.tsazor"]!);
    const table = routes.map((r) => ({ template: r.template, type: Page }));
    expect(matchRoute(table, "/a")?.route.type).toBe(Page);
    expect(matchRoute(table, "/b/5")?.values.id).toBe(5);
  });
});

describe("C19 — directives only at document level", () => {
  for (const source of [`<div>\n@page "/x"\n</div>`, `<div>@code { private x = 1; }</div>`, `@if (true) {\n    @layout MainLayout\n}`]) {
    it(JSON.stringify(source), async () => {
      expect(errorCodes(await diagnosticsOf(source))).toContain("TZS013");
    });
  }
});

describe("C19 — @typeparam", () => {
  it("accepts a C# constraint clause with a warning", async () => {
    const diagnostics = await diagnosticsOf(`@typeparam TItem where TItem : class\n<p>x</p>`);
    expect(errorCodes(diagnostics)).toEqual([]);
    expect(diagnostics.some((d) => d.code === "TZS014" && d.severity === "warning")).toBe(true);
  });

  it("supports the TS constraint form", async () => {
    const m = await mount(`@typeparam T extends string\n<p>@label</p>\n@code { private label: T = "ok" as T; }`);
    expect(m.html()).toBe("<p>ok</p>");
  });
});

describe("C7 — C# constructs without a TS equivalent are errors", () => {
  for (const source of [
    `@using (var x = make()) {\n    <p>x</p>\n}`,
    `@lock (gate) {\n    <p>x</p>\n}`,
    `<p>@await load()</p>`,
    `@if (true) {\n    using (var x = make()) { }\n}`,
  ]) {
    it(JSON.stringify(source), async () => {
      expect(errorCodes(await diagnosticsOf(source))).toContain("TZS012");
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
