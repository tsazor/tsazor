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
