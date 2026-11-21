/**
 * F3/F17: Razor templates in `@code` (Blazor's templated delegates) — `@<tag>…</tag>` is a RenderFragment, and
 * `(item: T) => @<li>@item.name</li>` a RenderFragment<T>.
 */
import { describe, expect, it } from "vitest";
import { maskedCode, type CodeBlockNode } from "../src/ast";
import { DiagnosticBag } from "../src/diagnostics";
import { parseDocument } from "../src/parser";

function memberBlock(source: string): { block: CodeBlockNode; diagnostics: DiagnosticBag } {
  const diagnostics = new DiagnosticBag();
  const document = parseDocument(source, diagnostics);
  const block = document.body.find((node): node is CodeBlockNode => node.kind === "codeBlock" && node.member === true)!;
  return { block, diagnostics };
}

describe("parsing Razor templates in @code", () => {
  it("reads each template as one element, with markup TypeScript couldn't scan", () => {
    const source = [
      "<p>@body</p>",
      "@code {",
      "    private readonly body: RenderFragment = @<div class=\"note\">Don't { panic }</div>;",
      "    private readonly row: RenderFragment<Item> = (item: Item) => @<li>@item.name</li>;",
      "    @Parameter() title = \"x\";",
      "}",
    ].join("\n");
    const { block, diagnostics } = memberBlock(source);
    expect(diagnostics.all).toEqual([]);
    expect(block.templates?.map((template) => block.code.slice(template.start, template.end))).toEqual([
      "@<div class=\"note\">Don't { panic }</div>",
      "@<li>@item.name</li>",
    ]);
    expect(block.templates?.map((template) => template.children.map((child) => child.kind))).toEqual([["element"], ["element"]]);
    expect(block.code).toContain('@Parameter() title = "x";');
  });

  it("masks the templates for TypeScript, offsets and line breaks kept", () => {
    const { block } = memberBlock("@code {\n    t: RenderFragment = @<p>\n        a\n    </p>;\n    n = 1;\n}");
    const masked = maskedCode(block);
    expect(masked.length).toBe(block.code.length);
    expect(masked.split("\n").length).toBe(block.code.split("\n").length);
    expect(masked).toMatch(/t: RenderFragment = 0\s+;\s+n = 1;/);
  });

  it("points a template in @{ } to @code (TZS015)", () => {
    const diagnostics = new DiagnosticBag();
    parseDocument("@{ const t = @<p>x</p>; }\n<div>@t</div>", diagnostics);
    expect(diagnostics.all.map((d) => [d.code, d.message])).toEqual([["TZS015", expect.stringContaining("a Razor template '@<…>' is a value in @code")]]);
  });

  it("leaves decorators and comparisons alone", () => {
    const { block } = memberBlock("@code {\n    @Parameter() a = 1;\n    b = this.a <this.c ? 1 : 2;\n    c = 2;\n}");
    expect(block.templates).toBeUndefined();
  });
});
