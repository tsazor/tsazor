/**
 * 2.5 — the `.razor` → `.tsazor` codemod core (packages/compiler/src/
 * codemod.ts): the compiler's fix payloads (TZS021, TZS022, TZS024) applied
 * to a fixpoint, plus the PascalCase API forms. The CLI's file walk/writes
 * live in @tsazor/cli; here is the pure transform.
 */
import { describe, expect, it } from "vitest";
import { codemodSource, apiFormEdits, blankCodeBlocks, applyTextEdits } from "../src/codemod";
import { compile } from "../src/index";

const compileAll = (source: string) =>
  compile(source, {
    className: "X",
    fileName: "t.tsazor",
    generateSourceMap: false,
    resolveComponent: () => null,
    resolveType: () => null,
  });

describe("codemodSource", () => {
  it("rewrites the C# foreach header to const…of", () => {
    const source = '<ul>\n@foreach (var item in Items)\n{\n    <li>@item.Name</li>\n}\n</ul>';
    const result = codemodSource(source);
    expect(result.text).toBe('<ul>\n@foreach (const item of Items)\n{\n    <li>@item.Name</li>\n}\n</ul>');
    expect(result.applied.map((d) => d.code)).toEqual(["TZS021"]);
    // The transformed markup compiles without the C#-form diagnostic.
    expect(compileAll(result.text.replace("var item", "")).diagnostics.errors.some((d) => d.code === "TZS021")).toBe(false);
  });

  it("rewrites C# interpolated strings inside markup expressions", () => {
    const source = '<p>@($"Hi {name}, {count:C}")</p>';
    const result = codemodSource(source, "interp.tsazor");
    expect(result.text).toBe("<p>@(`Hi ${name}, ${count}`)</p>");
    expect(result.applied.map((d) => d.code)).toEqual(["TZS024"]);
    expect(compileAll(result.text).diagnostics.errors).toHaveLength(0);
  });

  it("rewrites the C# attribute list to the directive (A6 mapping)", () => {
    const source = '@attribute [Authorize(Roles = "Admin")]\n<h1>Admin</h1>';
    const result = codemodSource(source);
    expect(result.text).toBe('@authorize({ roles: ["Admin"] })\n<h1>Admin</h1>');
    expect(result.applied.map((d) => d.code)).toEqual(["TZS021"]);
  });

  it("keeps C# in @code (Phase 3) and rewrites only the markup", () => {
    const source = '@code {\n    public string Name = "x.Length > 0";\n}\n<p>@($"a{b}")</p>';
    const result = codemodSource(source);
    expect(result.text).toContain('public string Name = "x.Length > 0";');
    expect(result.text).toContain("@(`a${b}`)");
    expect(result.apiReplacements).toHaveLength(0);
  });

  it("rewrites the PascalCase API forms outside @code", () => {
    const source = '<p>@(name.ToString())@(x.Length > 0)</p>';
    const result = codemodSource(source);
    expect(result.text).toBe("<p>@(name.toString())@(x.length > 0)</p>");
    expect(result.apiReplacements.map((a) => a.name).sort()).toEqual(["Length", "ToString"]);
  });

  it("leaves diagnostics without a fix in remaining (TZS005 unresolved)", () => {
    const source = "<NotAComponent />\n@foreach (var item in Items) { <li/> }";
    const result = codemodSource(source);
    expect(result.applied.map((d) => d.code)).toEqual(["TZS021"]);
    expect(result.remaining.some((d) => d.code === "TZS005")).toBe(true);
  });

  it("a crash leaves the source untouched and reports it", () => {
    // An unclosed interpolated string in a context the parser cannot recover
    // from compiles to no fix — the transform must never invent changes.
    const source = '<p>@($"{a")</p>';
    const result = codemodSource(source);
    expect(result.text).toBe(source);
    expect(result.applied).toHaveLength(0);
  });
});

describe("blankCodeBlocks", () => {
  it("blanks C# bodies, keeping line numbers and column offsets", () => {
    const source = '<p>@x</p>\n@code {\n    int a;\n}\n<p>@y</p>';
    const blanked = blankCodeBlocks(source);
    expect(blanked.length).toBe(source.length);
    blanked.split("\n").forEach((line, index) => {
      expect(line.length).toBe(source.split("\n")[index]!.length);
    });
    expect(blanked).toContain("<p>@x</p>");
    expect(blanked).not.toContain("int a;");
  });
});

describe("applyTextEdits", () => {
  it("applies edits spanning one line, descending", () => {
    const source = '<p t=@($"a{b}")></p>';
    const edits = [
      { pos: { line: 1, column: 7 }, endPos: { line: 1, column: 14 }, text: "`a${b}`" },
      { pos: { line: 1, column: 0 }, endPos: { line: 1, column: 5 }, text: "<h1>" },
    ];
    expect(applyTextEdits(source, edits)).toBe("<h1>@(`a${b}`)></p>");
  });
});

describe("apiFormEdits", () => {
  it("skips .Count and @code bodies", () => {
    const source = '@code {\n    int Length;\n}\n<p>@(x.Count)@(y.Length)</p>';
    const edits = apiFormEdits(source);
    expect(edits.map((e) => e.name)).toEqual(["Length"]);
  });
});