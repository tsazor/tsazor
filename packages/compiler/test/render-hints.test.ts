/**
 * H1 render hints (docs/design-render-hints.md): an event-handler lambda
 * becomes a prototype method that creates it from the captured render-time
 * locals, bound with `EventCallback.bindWith` — equal across renders while
 * the captured values are the same. Guards keep today's closure.
 */
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile";
import { DiagnosticBag } from "../src/diagnostics";
import { generateCode } from "../src/codegen";
import { parseDocument } from "../src/parser";
import { metadataOf, withComponents } from "./component-metadata";

function gen(source: string, options?: Partial<Parameters<typeof generateCode>[1]>) {
  const diagnostics = new DiagnosticBag();
  const doc = parseDocument(source, diagnostics);
  const result = generateCode(doc, { className: "Rows", ...options }, diagnostics);
  expect(diagnostics.errors).toEqual([]);
  return result;
}

const MEMBERS = "@code { rows: Array<{ id: number }> = []; count = 0; select(e: unknown, r: unknown) {} pick(x: unknown) {} }";

describe("H1: stable event handlers", () => {
  it("a loop variable capture becomes a method and bindWith", () => {
    const { code } = gen(`@foreach (const row of rows) { <a @onclick="e => select(e, row)">x</a> }\n${MEMBERS}`);
    expect(code).toContain('"onclick", __tsazor_EventCallback.bindWith(this, Rows.prototype.__tsazor_h0, [row]));');
    expect(code).toContain("  __tsazor_h0(row) { return e => this.select(e, row); }");
  });

  it("const locals, destructured loop variables and several captures are parameters in order", () => {
    const { code } = gen(
      `@foreach (const [i, row] of rows.entries()) { @{ const label = "r" + i; } <a @onclick="() => select(label, row)">x</a> }\n${MEMBERS}`,
    );
    expect(code).toContain("bindWith(this, Rows.prototype.__tsazor_h0, [label, row])");
    expect(code).toContain("  __tsazor_h0(label, row) { return () => this.select(label, row); }");
  });

  it("no capture: a method without parameters", () => {
    const { code } = gen(`<button @onclick="() => count++">+</button>\n${MEMBERS}`);
    expect(code).toContain("bindWith(this, Rows.prototype.__tsazor_h0, [])");
    expect(code).toContain("  __tsazor_h0() { return () => this.count++; }");
  });

  it("async lambdas are hoisted the same way", () => {
    const { code } = gen(`@foreach (const row of rows) { <a @onclick="async () => { await select(null, row); }">x</a> }\n${MEMBERS}`);
    expect(code).toContain("  __tsazor_h0(row) { return async () => { await this.select(null, row); }; }");
  });

  it.each([
    ["a let loop variable", `@foreach (let row of rows) { <a @onclick="() => pick(row)">x</a> }`, "() => this.pick(row)"],
    ["a counting-loop variable", `@for (let i = 0; i < 3; i++) { <a @onclick="() => pick(i)">x</a> }`, "() => this.pick(i)"],
    ["a let local", `@{ let n = 1; } <a @onclick="() => pick(n)">x</a>`, "() => this.pick(n)"],
    ["a var local", `@{ var n = 1; } <a @onclick="() => pick(n)">x</a>`, "() => this.pick(n)"],
    ["a local function", `@{ function f() { return 1; } } <a @onclick="() => pick(f)">x</a>`, "() => this.pick(f)"],
    ["arguments", `<a @onclick="() => pick(arguments)">x</a>`, "() => this.pick(arguments)"],
  ])("keeps the closure for %s", (_, markup, handler) => {
    const { code } = gen(`${markup}\n${MEMBERS}`);
    expect(code).toContain(`__tsazor_EventCallback.bind(this, ${handler})`);
    expect(code).not.toContain("__tsazor_h0");
  });

  it("keeps the closure when a nested function uses the captured component", () => {
    const { code } = gen(`<a @onclick="() => [1].forEach(function () { pick(1); })">x</a>\n${MEMBERS}`);
    expect(code).toContain("__tsazor_EventCallback.bind(this, () => [1].forEach(function () { __tsazor_this.pick(1); }))");
    expect(code).not.toContain("__tsazor_h0");
  });

  it("method groups keep their binding", () => {
    const { code } = gen(`@foreach (const row of rows) { <a @onclick="pick">x</a> }\n${MEMBERS}`);
    expect(code).toContain("__tsazor_EventCallback.bind(this, this.pick)");
    expect(code).not.toContain("__tsazor_h0");
  });

  it("a template context is captured unless some code assigns it", () => {
    const list = metadataOf("List", { RowTemplate: { category: "RenderFragment<T>" } });
    const hoisted = gen(`<List><RowTemplate><a @onclick="() => pick(context)">x</a></RowTemplate></List>\n${MEMBERS}`, withComponents({ List: list }));
    expect(hoisted.code).toContain("bindWith(this, Rows.prototype.__tsazor_h0, [context])");
    const assigned = gen(
      `<List><RowTemplate>@{ context = null; }<a @onclick="() => pick(context)">x</a></RowTemplate></List>\n${MEMBERS}`,
      withComponents({ List: list }),
    );
    expect(assigned.code).toContain("__tsazor_EventCallback.bind(this, () => this.pick(context))");
  });

  it("component EventCallback parameters are hoisted", () => {
    const probe = metadataOf("Probe", { onClick: "EventCallback", onPick: "EventCallback<T>" });
    const { code } = gen(
      `@foreach (const row of rows) { <Probe OnClick="() => pick(row)" OnPick="@(x => select(x, row))" /> }\n${MEMBERS}`,
      withComponents({ Probe: probe }),
    );
    expect(code).toContain('"onClick", __tsazor_EventCallback.bindWith(this, Rows.prototype.__tsazor_h0, [row])');
    expect(code).toContain('"onPick", __tsazor_EventCallback.bindWith(this, Rows.prototype.__tsazor_h1, [row])');
    expect(code).toContain("  __tsazor_h1(row) { return x => this.select(x, row); }");
  });

  it("typed shadows keep the closure (diagnostic positions do not move)", () => {
    const source = `@foreach (const row of rows) { <a @onclick="e => select(e, row)">x</a> }\n${MEMBERS}`;
    const shadow = gen(source, { typedShadow: {} }).code;
    expect(shadow).toContain("__tsazor_EventCallback.bind(this, e => this.select(e, row))");
    expect(shadow).not.toContain("__tsazor_h0");
    expect(shadow).toBe(gen(source, { typedShadow: {}, renderHints: false }).code);
  });

  it("renderHints: false and optimize: false emit today's code; optimize: false also turns static markup off", () => {
    const source = `<p><b>static</b></p>\n@foreach (const row of rows) { <a @onclick="() => pick(row)">x</a> }\n${MEMBERS}`;
    const noHints = gen(source, { renderHints: false }).code;
    expect(noHints).toContain("__tsazor_EventCallback.bind(this, () => this.pick(row))");
    expect(noHints).not.toContain("__tsazor_h0");
    expect(noHints).toContain("addMarkupContent");
    const off = gen(source, { optimize: false }).code;
    expect(off).toContain("__tsazor_EventCallback.bind(this, () => this.pick(row))");
    expect(off).not.toContain("addMarkupContent");
    expect(off).toBe(gen(source, { renderHints: false, staticMarkup: false }).code);
  });

  it("a position inside a hoisted handler maps to its .tsazor line and column", () => {
    const source = `@foreach (const row of rows) {\n    <a @onclick="e => select(e, row)">x</a>\n}\n${MEMBERS}`;
    const { code, mappings } = compile(source, { className: "Rows" });
    const lines = code.split("\n");
    const genLine = lines.findIndex((l) => l.startsWith("  __tsazor_h0(")) + 1;
    expect(genLine).toBeGreaterThan(0);
    const text = lines[genLine - 1]!;
    const onLine = mappings!.filter((m) => m.genLine === genLine);
    // The method maps to the lambda; `select` (after its `this.`) and `row` to their tokens.
    expect(onLine).toContainEqual({ genLine, genCol: 2, srcLine: 1, srcCol: 17 });
    expect(onLine.some((m) => m.srcLine === 1 && m.srcCol === 22 && m.genCol <= text.indexOf("select") && m.genCol >= text.indexOf("this.select"))).toBe(true);
    expect(onLine).toContainEqual({ genLine, genCol: text.lastIndexOf("row"), srcLine: 1, srcCol: 32 });
  });
});

describe("H2: skipping unchanged keyed rows", () => {
  const ROW = `@foreach (const row of rows) {\n    <tr @key="row.id" class="@rowClass(row)"><td @onclick="e => select(e, row)">@row.label</td><td>static</td></tr>\n}\n${MEMBERS}`;

  it("evaluates the row's values first and builds the row only when they changed", () => {
    const { code } = gen(ROW);
    expect(code).toContain(
      [
        "    for (const row of this.rows) {",
        "    const __tsazor_v0 = row.id;",
        "    const __tsazor_v1 = this.rowClass(row);",
        "    const __tsazor_v2 = __tsazor_EventCallback.bindWith(this, Rows.prototype.__tsazor_h0, [row]);",
        "    const __tsazor_v3 = row.label;",
        "    if (!__builder.reuseKeyed(__tsazor_r0, __tsazor_v0, [__tsazor_v1, __tsazor_v2, __tsazor_v3])) {",
        '    __builder.openElement(0, "tr");',
        "    __builder.setKey(__tsazor_v0);",
        '    __builder.addAttribute(1, "class", __tsazor_v1);',
        '    __builder.openElement(2, "td");',
        '    __builder.addEventHandler(3, "onclick", __tsazor_v2);',
        "    __builder.addContent(4, __tsazor_v3);",
        "    __builder.closeElement();",
        '    __builder.addMarkupContent(5, "<td>static</td>");',
        "    __builder.closeElement();",
        "    }",
        "    }",
      ].join("\n"),
    );
    // One check per value (the key is matched by the builder): content may not be a fragment (2).
    expect(code).toContain("const __tsazor_r0: readonly number[] = [0, 0, 2];");
  });

  it("mixed attribute values are one value; a child component's parameters must be primitives (1)", () => {
    const probe = metadataOf("Probe", { label: { category: "string", type: "string" }, count: { category: "value", type: "number | null" }, extra: "value" });
    const { code } = gen(
      `@foreach (const row of rows) { <li @key="row.id" class="row-@row.id"><Probe Label="@row.label" Count="5" Extra="@row" /></li> }\n${MEMBERS}`,
      withComponents({ Probe: probe }),
    );
    expect(code).toContain("    const __tsazor_v1 = `row-${(row.id) ?? \"\"}`;");
    expect(code).toContain("    if (!__builder.reuseKeyed(__tsazor_r0, __tsazor_v0, [__tsazor_v1, __tsazor_v2, __tsazor_v3, __tsazor_v4])) {");
    expect(code).toContain('__builder.addAttribute(4, "count", __tsazor_v3);');
    // `extra` has no declared type: checked at runtime.
    expect(code).toContain("const __tsazor_r0: readonly number[] = [0, 1, 1, 1];");
  });

  it("a handler closure H1 cannot hoist makes the row never equal: built every time", () => {
    const { code } = gen(`@foreach (let row of rows) { <tr @key="row.id"><td @onclick="() => pick(row)">x</td></tr> }\n${MEMBERS}`);
    expect(code).toContain("    const __tsazor_v1 = __tsazor_EventCallback.bind(this, () => this.pick(row));\n    {\n");
    expect(code).not.toContain("reuseKeyed");
  });

  const pick = metadataOf("Pick", { value: { category: "value", type: "number" }, item: { category: "value", type: "{ id: number }" }, onPick: "EventCallback", childContent: "RenderFragment" });
  it.each([
    ["no @key", `<tr><td>@row.label</td></tr>`],
    ["the key on an inner element", `<tr><td @key="row.id">@row.label</td></tr>`],
    ["two root elements", `<tr @key="row.id"></tr><tr></tr>`],
    ["a component as the row", `<Pick @key="row.id" Value="@row.id" />`],
    ["@ref", `<tr @key="row.id" @ref="last"></tr>`],
    ["@attach", `<tr @key="row.id" @attach="pick"></tr>`],
    ["@attach on an inner element", `<tr @key="row.id"><td @attach:tip="pick">x</td></tr>`],
    ["@attributes", `<tr @key="row.id" @attributes="extra"></tr>`],
    ["@bind", `<tr @key="row.id"><td><input @bind="count" /></td></tr>`],
    ["an event modifier", `<tr @key="row.id" @onclick="e => select(e, row)" @onclick:preventDefault></tr>`],
    ["an assignment", `<tr @key="row.id">@(count = row.id)</tr>`],
    ["an increment", `<tr @key="row.id" title="@(count++)"></tr>`],
    ["an await", `<tr @key="row.id">@(await load(row))</tr>`],
    ["a delete", `<tr @key="row.id">@(delete row.label)</tr>`],
    ["an assignment in a nested function", `<tr @key="row.id">@rows.map((r) => (count = r.id))</tr>`],
    ["a nested @if (with an inner key)", `<tr @key="row.id">@if (row.id > 1) { <td @key="row.id">x</td> }</tr>`],
    ["a code block", `<tr @key="row.id">@{ const x = row.id; }<td>@x</td></tr>`],
    ["a nested loop", `<tr @key="row.id">@foreach (const c of rows) { <td>@c.id</td> }</tr>`],
    ["a component with an object parameter", `<tr @key="row.id"><td><Pick Item="@row" /></td></tr>`],
    ["a component with a callback", `<tr @key="row.id"><td><Pick OnPick="() => pick(row)" /></td></tr>`],
    ["a component with child content", `<tr @key="row.id"><td><Pick Value="@row.id">text</Pick></td></tr>`],
    ["a component with a key", `<tr @key="row.id"><td><Pick @key="row.id" Value="@row.id" /></td></tr>`],
  ])("today's code for %s", (_, body) => {
    const source = `@foreach (const row of rows) { ${body} }\n@code { rows: Array<{ id: number; label: string }> = []; count = 0; last: unknown; extra = {}; select(e: unknown, r: unknown) {} pick(x: unknown) {} async load(x: unknown) { return x; } }`;
    const diagnostics = new DiagnosticBag();
    const result = generateCode(parseDocument(source, diagnostics), { className: "Rows", ...withComponents({ Pick: pick }) }, diagnostics);
    expect(result.code).not.toContain("reuseKeyed");
    expect(result.code).not.toContain("__tsazor_v0");
  });

  it("the same row with a primitive component parameter is reused (control for the cases above)", () => {
    const source = `@foreach (const row of rows) { <tr @key="row.id"><td><Pick Value="@row.id" /></td></tr> }\n${MEMBERS}`;
    const { code } = gen(source, withComponents({ Pick: pick }));
    expect(code).toContain("if (!__builder.reuseKeyed(__tsazor_r0, __tsazor_v0, [__tsazor_v1])) {");
    expect(code).toContain("const __tsazor_r0: readonly number[] = [1];");
  });

  it("only @foreach rows: a counting loop keeps today's code", () => {
    const { code } = gen(`@for (let i = 0; i < 3; i++) { <tr @key="i">@i</tr> }\n${MEMBERS}`);
    expect(code).not.toContain("reuseKeyed");
  });

  it("typed shadows, renderHints: false and optimize: false emit today's code", () => {
    for (const options of [{ typedShadow: {} }, { renderHints: false }, { optimize: false }]) {
      const { code } = gen(ROW, options);
      expect(code).not.toContain("reuseKeyed");
      expect(code).not.toContain("__tsazor_v0");
      expect(code).not.toContain("__tsazor_r0");
      expect(code).toContain("__builder.setKey(row.id);");
    }
  });

  it("an expression moved ahead of the row maps to its .tsazor line and column", () => {
    const { code, mappings } = compile(ROW, { className: "Rows" });
    const lines = code.split("\n");
    const genLine = lines.findIndex((l) => l.startsWith("    const __tsazor_v1 = ")) + 1;
    expect(genLine).toBeGreaterThan(0);
    const text = lines[genLine - 1]!;
    const onLine = mappings!.filter((m) => m.genLine === genLine);
    const source = ROW.split("\n")[1]!;
    // `rowClass` (after its baked `this.`) on line 2 of the source.
    expect(onLine).toContainEqual({ genLine, genCol: text.indexOf("rowClass"), srcLine: 1, srcCol: source.indexOf("rowClass") });
    // The rows after the inserted lines keep their mappings: `label` of `@row.label`.
    const contentLine = lines.findIndex((l) => l.startsWith("    const __tsazor_v3 = ")) + 1;
    expect(mappings!.filter((m) => m.genLine === contentLine).some((m) => m.srcLine === 1 && m.srcCol === source.indexOf("@row.label") + 1)).toBe(true);
  });
});
