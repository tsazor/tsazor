import { describe, expect, it } from "vitest";
import { generateCode } from "../src/codegen";
import { DiagnosticBag, type SourcePos, type SourceRange, type TszDiagnostic } from "../src/diagnostics";
import { parseDocument } from "../src/parser";
import { metadataOf, withComponents } from "./component-metadata";

/**
 * A7: every diagnostic carries the range of the offending construct
 * (`pos` = start, `endPos` = exclusive end), and the mechanical C# ⇒ TS
 * forms (TZS021, TZS022) carry a fix (replacement range + text).
 */

function compileDiagnostics(source: string, options?: Partial<Parameters<typeof generateCode>[1]>): readonly TszDiagnostic[] {
  const diagnostics = new DiagnosticBag();
  const doc = parseDocument(source, diagnostics);
  generateCode(doc, { className: "Demo", ...options }, diagnostics);
  return diagnostics.all;
}

/** Absolute offset of a 1-based line / 0-based column. */
function offsetOf(source: string, pos: SourcePos): number {
  let offset = 0;
  for (let line = 1; line < pos.line; line++) offset = source.indexOf("\n", offset) + 1;
  return offset + pos.column;
}

/** The source text a range covers. */
function textOf(source: string, range: SourceRange): string {
  return source.slice(offsetOf(source, range.pos), offsetOf(source, range.endPos));
}

/** The covered text of the first diagnostic with `code`. */
function covered(source: string, code: string, options?: Partial<Parameters<typeof generateCode>[1]>): string {
  const diagnostic = compileDiagnostics(source, options).find((d) => d.code === code);
  expect(diagnostic, `expected ${code}`).toBeDefined();
  return textOf(source, diagnostic!);
}

/** Applies a diagnostic's fix (edits back to front). */
function applyFix(source: string, diagnostic: TszDiagnostic): string {
  const edits = [...diagnostic.fix!.edits].sort((a, b) => offsetOf(source, b.pos) - offsetOf(source, a.pos));
  let out = source;
  for (const edit of edits) {
    out = out.slice(0, offsetOf(out, edit.pos)) + edit.text + out.slice(offsetOf(out, edit.endPos));
  }
  return out;
}

describe("diagnostic ranges (A7)", () => {
  it("every diagnostic has an end at or after its start", () => {
    const source = '@else\n<div @foo="x">\n@(a\n';
    for (const d of compileDiagnostics(source)) {
      expect(offsetOf(source, d.endPos)).toBeGreaterThanOrEqual(offsetOf(source, d.pos));
    }
  });

  it("TZS001: the dangling keyword, the unknown directive attribute, the @inject directive", () => {
    expect(covered("@else { }", "TZS001")).toBe("@else");
    expect(covered('<div @foo="x"></div>', "TZS001")).toBe('@foo="x"');
    expect(covered("@inject Service  \n<p/>", "TZS001")).toBe("@inject Service");
  });

  it("TZS002: the start tag name of an unclosed element, a stray closing tag", () => {
    expect(covered("<div><span></div>", "TZS002")).toBe("<span");
    expect(covered("<p>x</p></b>", "TZS002")).toBe("</b>");
  });

  it("TZS003/TZS004: the unbalanced opener, the stray brace, the bad transition", () => {
    expect(covered("<p>@(a + </p>", "TZS003")).toBe("@(");
    expect(covered("x }", "TZS003")).toBe("}");
    expect(covered("<p>@!</p>", "TZS004")).toBe("@!");
  });

  it("TZS004 in an attribute value too (it was silently text): a template literal gets the fix to '@(`…`)'", () => {
    // A MudBlazor port's charts rendered `transform="@`translate(…)`"` as their own source.
    const source = '<g transform="@`translate(${x}, 0)`"></g>\n@code { private x = 1; }';
    expect(covered(source, "TZS004")).toBe("@`translate(${x}, 0)`");
    const [diagnostic] = compileDiagnostics(source).filter((d) => d.code === "TZS004");
    expect(applyFix(source, diagnostic!)).toBe('<g transform="@(`translate(${x}, 0)`)"></g>\n@code { private x = 1; }');
    expect(covered('<p title="@!x"></p>', "TZS004")).toBe("@!");
    expect(covered('<p title="a @ b"></p>', "TZS004")).toBe("@ ");
    // An e-mail address, `@@` and an expression stay as they were.
    for (const value of ["mail@example.com", "@@x", "@x", "@(x + 1)"]) {
      expect(compileDiagnostics(`<p title="${value}"></p>\n@code { private x = 1; }`).filter((d) => d.code === "TZS004"), value).toEqual([]);
    }
  });

  it("TZS038: a comment outside every element, with the fix to '@* … *@'; a call after @code", () => {
    // A MudBlazor port's copyright headers rendered on every page; its module-level registrations never ran.
    const line = "// Copyright (c) Contoso\n<p>Hello</p>\n";
    const [comment] = compileDiagnostics(line).filter((d) => d.code === "TZS038");
    expect([comment!.severity, textOf(line, comment!)]).toEqual(["warning", "// Copyright (c) Contoso"]);
    expect(applyFix(line, comment!)).toBe("@* Copyright (c) Contoso *@\n<p>Hello</p>\n");
    const block = "/** The card. */\n<div>x</div>\n";
    expect(applyFix(block, compileDiagnostics(block).find((d) => d.code === "TZS038")!)).toBe("@** The card. *@\n<div>x</div>\n");
    const call = '<p>x</p>\n@code {\n    n = 1;\n}\nregisterThing("Text", Foo);\n';
    expect(covered(call, "TZS038")).toBe('registerThing("Text", Foo);');
    // Content inside an element, and markup after @code, are what they look like.
    for (const source of ["<p>a // b</p>\n<pre>/* x */</pre>\n", "@code {\n    n = 1;\n}\n<p>after (ok);</p>\nHello world\n"]) {
      expect(compileDiagnostics(source).filter((d) => d.code === "TZS038"), source).toEqual([]);
    }
  });

  it("TZS038: text after an expression that starts with an operator — in content, and in a value with the fix '@(…)'", () => {
    // A Radzen port met `title="@label ?? undefined"` about 30 times: Razor reads `@label` and renders the rest.
    const members = "\n@code { private label = \"\"; private count = 1; private ok = true; private from = 1; private to = 2; }";
    const attribute = `<p title="@label ?? undefined">x</p>${members}`;
    const [inValue] = compileDiagnostics(attribute).filter((d) => d.code === "TZS038");
    expect(inValue!.message).toContain("Text after '@label' that starts with an operator (??) is markup text, as in Razor: '?? undefined' renders.");
    expect(applyFix(attribute, inValue!)).toBe(`<p title="@(label ?? undefined)">x</p>${members}`);
    expect(covered(`<p>@count ?? "none"</p>${members}`, "TZS038")).toBe('?? "none"');
    expect(covered(`<p>@ok ? "yes" : "no"</p>${members}`, "TZS038")).toBe('? "yes" : "no"');
    // A dash between two values, prose, and an expression written whole are content.
    for (const source of ["<p>@from - @to</p>", "<p>@label, are you there?</p>", '<p title="@(label ?? count)">ok</p>']) {
      expect(compileDiagnostics(`${source}${members}`).filter((d) => d.code === "TZS038"), source).toEqual([]);
    }
    // A component's value parameter reads the whole value as an expression; a string parameter reads text.
    const chart = withComponents({ Chart: metadataOf("Chart", { title: "string", enabled: "value" }) });
    expect(compileDiagnostics(`<Chart Enabled="@ok === false" />${members}`, chart).filter((d) => d.code === "TZS038")).toEqual([]);
    expect(compileDiagnostics(`<Chart Title="@label ?? undefined" />${members}`, chart).filter((d) => d.code === "TZS038")).toHaveLength(1);
  });

  it("TZS004 on a component's attribute only where the value is read as text — a value parameter reads an expression", () => {
    const chart = withComponents({ Chart: metadataOf("Chart", { title: "string", count: "value", enabled: "value" }) });
    const tzs004 = (source: string) => compileDiagnostics(`${source}\n@code { private x = 1; private busy = false; }`, chart).filter((d) => d.code === "TZS004").map((d) => d.message);
    expect(tzs004('<Chart Title="@`n: ${x}`" />')).toEqual([
      "Invalid implicit expression. Unexpected character after '@'. A template literal in an attribute value is an expression: write '@(`…`)'.",
    ]);
    // Razor's optional transition before a non-string parameter's expression.
    expect(tzs004('<Chart Count="@4000" Enabled="@!busy" />')).toEqual([]);
    expect(tzs004('<Chart Count="@`${x}`.length" />')).toEqual([]);
  });

  it("TZS005/TZS017: the component tag name", () => {
    expect(covered("<Card Title=\"x\" />", "TZS005")).toBe("Card");
    const ambiguous = { resolveComponent: () => ({ specifier: "./Card.tsazor", ambiguous: ["./A", "./B"] }) };
    expect(covered("<div>\n  <Card />\n</div>", "TZS017", ambiguous)).toBe("Card");
  });

  it("TZS006: the opener of an unclosed block", () => {
    expect(covered("@{ const a = 1;", "TZS006")).toBe("@{");
    expect(covered("@if (a) {\n<p>x</p>", "TZS006")).toBe("{");
    expect(covered("@code", "TZS006")).toBe("@code");
  });

  it("TZS008/TZS009: the whole attribute", () => {
    expect(covered('<input @bind="a?.b" />', "TZS008")).toBe('@bind="a?.b"');
    expect(covered('<button @onclick:prevent="x">b</button>', "TZS008")).toBe('@onclick:prevent="x"');
    expect(covered("<div @key></div>", "TZS009")).toBe("@key");
    // A folded modifier keeps its own span. `@bind:format` now applies to any
    // value bind (K.7), so the inert-format warning sits on a checkbox's checked.
    expect(covered('<input type="checkbox" @bind="v" @bind:format="yyyy" />', "TZS008")).toBe('@bind:format="yyyy"');
  });

  it("TZS011/TZS014/TZS016/TZS018: the directive", () => {
    expect(covered("@inherits LayoutComponentBase\n<p/>", "TZS011", { codeBehindClass: "Base" })).toBe("@inherits LayoutComponentBase");
    expect(covered("@rendermode InteractiveServer\r\n<p/>", "TZS014")).toBe("@rendermode InteractiveServer");
    expect(covered("@import X\n", "TZS016")).toBe("@import X");
    expect(covered("@using ./Missing\n", "TZS018", { resolveUsing: () => "missing" })).toBe("@using ./Missing");
  });

  it("TZS012/TZS013: the C# statement header, the misplaced directive", () => {
    expect(covered("@lock (gate) { <p/> }", "TZS012")).toBe("@lock (gate)");
    expect(covered("<p>@await Load()</p>", "TZS012")).toBe("@await Load()");
    expect(covered('<div>\n  @page "/x"\n</div>', "TZS013")).toBe('@page "/x"');
  });

  it("TZS015: the TS syntax error, the bare text, the @foreach header", () => {
    expect(covered("@if (a) { Hello }", "TZS015")).toBe("Hello");
    expect(covered("@{ const x = ; }", "TZS015")).toBe(";");
    expect(covered("@foreach (let i = 0; i < 3; i++) { <i/> }", "TZS015")).toBe("@foreach (let i = 0; i < 3; i++)");
  });

  it("TZS019/TZS020: the @authorize argument, the member name", () => {
    expect(covered("@authorize({ roles: 1 })\n", "TZS019")).toBe("({ roles: 1 })");
    expect(covered("@code {\n  buildRenderTree() {}\n}", "TZS020")).toBe("buildRenderTree");
  });

  it("TZS023: the falling-through case label", () => {
    expect(covered("@switch (x) {\n  case 1:\n    <p>a</p>\n  case 2:\n    <p>b</p>\n    break;\n}", "TZS023")).toBe("case 1:");
  });
});

describe("syntax errors in markup expressions (A7, TZS024)", () => {
  const errors = (source: string) => compileDiagnostics(source).filter((d) => d.severity === "error");

  it("a C# interpolated string reports its template-literal fix (TZS024)", () => {
    const source = '<p>@($"Hi {name}, {count:C}")</p>';
    const found = errors(source);
    expect(found.map((d) => d.code)).toEqual(["TZS024"]);
    // The message names the result: the command line shows no quick fix.
    expect(found[0]!.message).toContain('C# interpolated string $"Hi {name}, {count:C}" — use the template literal `Hi ${name}, ${count}`');
    const fix = found[0]!.fix!;
    expect(fix.title).toContain("Use a template literal");
    expect(fix.edits).toEqual([
      {
        pos: { line: 1, column: 5 },
        endPos: { line: 1, column: 28 },
        text: "`Hi ${name}, ${count}`",
      },
    ]);
  });

  it.each([
    ["explicit @(…)", "<p>@(count +)</p>", "+", "Expression expected."],
    ["attribute expression", '<div class="@(a b)"></div>', "b", "')' expected."],
    ["implicit expression", "<p>@format(a b)</p>", "b", "',' expected."],
    ["implicit expression in an attribute", '<div title="@format(a b)"></div>', "b", "',' expected."],
    // An error past the end of the code lands on its last character.
    ["mixed attribute value", '<div class="x @(on ? "a" :)"></div>', ":", "Expression expected."],
    ["event handler", '<button @onclick="() => save(">b</button>', "(", "')' expected."],
    ["@key", '<li @key="item."></li>', ".", "Identifier expected."],
    ["@bind value side", '<input @bind="a." />', ".", "Identifier expected."],
    ["@bind:after", '<input @bind="a" @bind:after="() =>" />', ">", "Expression expected."],
    ["@if condition", "@if (a && ) { <p/> }", "&", "Expression expected."],
    ["@switch case label", "@switch (x) {\n  case 1 +:\n    break;\n}", "+", "Expression expected."],
  ])("%s", (_, source, text, message) => {
    const found = errors(source);
    expect(found.map((d) => d.code)).toEqual(["TZS024"]);
    expect(found[0]!.message).toBe(`Invalid TypeScript expression. ${message}`);
    expect(textOf(source, found[0]!)).toBe(text);
  });

  it("a counting @for header with invalid TS is TZS015 on the error token", () => {
    const source = "@for (let i = 0; i < 3 i++) { <i/> }";
    const found = errors(source);
    expect(found.map((d) => d.code)).toEqual(["TZS015"]);
    expect(textOf(source, found[0]!)).toBe("i");
  });

  it("valid expressions stay silent (arrows, generics, satisfies, templates, regex)", () => {
    expect(errors(
      '<p>@(items.map((x) => x * 2).join(", "))</p><p>@(value as Map<string, number>)</p><p>@(`${a}-${b}`)</p>' +
        '<button @onclick="async () => { await save(); }">s</button><p>@(/a+/.test(s))</p><p>@({ a: 1 } satisfies object)</p>',
    )).toEqual([]);
  });
});

describe("diagnostic fixes (A7)", () => {
  it("TZS021 @foreach: the range is the whole header, the fix rewrites the code inside the parentheses", () => {
    const source = "@foreach (var item in items) {\n  <li>@item</li>\n}";
    const [diagnostic] = compileDiagnostics(source).filter((d) => d.code === "TZS021");
    expect(textOf(source, diagnostic!)).toBe("@foreach (var item in items)");
    expect(diagnostic!.fix?.title).toBe("Use '@foreach (const item of items)'");
    expect(diagnostic!.fix?.edits.map((edit) => [textOf(source, edit), edit.text])).toEqual([["var item in items", "const item of items"]]);
    const fixed = applyFix(source, diagnostic!);
    expect(fixed).toBe("@foreach (const item of items) {\n  <li>@item</li>\n}");
    expect(compileDiagnostics(fixed)).toEqual([]);
  });

  it("TZS021 @foreach with deconstruction and a typed variable", () => {
    for (const [source, fixed] of [
      ["@foreach (var (k, v) in pairs) { <i>@k</i> }", "@foreach (const [k, v] of pairs) { <i>@k</i> }"],
      ["@foreach (string s in names) { <i>@s</i> }", "@foreach (const s of names) { <i>@s</i> }"],
    ] as const) {
      const diagnostic = compileDiagnostics(source).find((d) => d.code === "TZS021")!;
      expect(applyFix(source, diagnostic)).toBe(fixed);
    }
  });

  it("TZS021 where-constraint: the clause, fixed to 'extends'; no fix for C#-only constraints", () => {
    const source = "@typeparam TItem where TItem : IItem\n<p/>";
    const diagnostic = compileDiagnostics(source).find((d) => d.code === "TZS021")!;
    expect(textOf(source, diagnostic)).toBe("where TItem : IItem");
    expect(applyFix(source, diagnostic)).toBe("@typeparam TItem extends IItem\n<p/>");
    expect(compileDiagnostics("@typeparam T where T : struct\n").find((d) => d.code === "TZS021")!.fix).toBeUndefined();
  });

  it("TZS021 @attribute: the directive, replaced by its TS form", () => {
    const authorize = '@attribute [Authorize(Roles = "Admin, Editor")]\n<p/>';
    const a = compileDiagnostics(authorize).find((d) => d.code === "TZS021")!;
    expect(textOf(authorize, a)).toBe('@attribute [Authorize(Roles = "Admin, Editor")]');
    expect(applyFix(authorize, a)).toBe('@authorize({ roles: ["Admin", "Editor"] })\n<p/>');

    const anonymous = "@page \"/\"\n@attribute [AllowAnonymous]\n<p/>";
    const b = compileDiagnostics(anonymous).find((d) => d.code === "TZS021")!;
    expect(applyFix(anonymous, b)).toBe("@page \"/\"\n@allowAnonymous\n<p/>");

    const route = '@attribute [Route("/x")]\n';
    expect(applyFix(route, compileDiagnostics(route).find((d) => d.code === "TZS021")!)).toBe('@page "/x"\n');

    // Not mechanical: a decorator or a removal is the author's call; a list needs one edit per attribute.
    expect(compileDiagnostics("@attribute [StreamRendering]\n")[0]!.fix).toBeUndefined();
    expect(compileDiagnostics("@attribute [Authorize, AllowAnonymous]\n").every((d) => d.fix === undefined)).toBe(true);
  });

  it("TZS022: the 'var' keyword, fixed to 'let' (statements and loop headers)", () => {
    const source = "@{ var total = 0; }\n@for (var i = 0; i < 3; i++) { <i>@i</i> }";
    const warnings = compileDiagnostics(source).filter((d) => d.code === "TZS022");
    expect(warnings.map((d) => textOf(source, d))).toEqual(["var", "var"]);
    expect(warnings.map((d) => d.fix?.edits[0]?.text)).toEqual(["let", "let"]);
    let fixed = applyFix(source, warnings[1]!);
    fixed = applyFix(fixed, warnings[0]!);
    expect(fixed).toBe("@{ let total = 0; }\n@for (let i = 0; i < 3; i++) { <i>@i</i> }");
    expect(compileDiagnostics(fixed)).toEqual([]);
  });
});
