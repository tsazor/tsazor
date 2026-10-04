/**
 * F1a — static markup blocks (docs/design-static-markup.md): which subtrees
 * become one addMarkupContent frame, and the exact string.
 */
import { describe, expect, it } from "vitest";
import { DiagnosticBag } from "../src/diagnostics";
import { generateCode } from "../src/codegen";
import { parseDocument } from "../src/parser";

function gen(source: string, options: Partial<Parameters<typeof generateCode>[1]> = {}): string[] {
  const diagnostics = new DiagnosticBag();
  const doc = parseDocument(`${source}\n@code { count = 0; inc() {} }`, diagnostics);
  const result = generateCode(doc, { className: "Demo", ...options }, diagnostics);
  expect(diagnostics.errors).toEqual([]);
  return result.code.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("__builder."));
}
const blocks = (source: string, options?: Partial<Parameters<typeof generateCode>[1]>): string[] =>
  gen(source, options)
    .filter((line) => line.startsWith("__builder.addMarkupContent("))
    .map((line) => JSON.parse(line.slice(line.indexOf(",") + 2, -2)) as string);

describe("F1a — which subtrees become a block", () => {
  it("a whole static subtree is one block; siblings are separate blocks (D-S1)", () => {
    expect(blocks(`<div class="a"><p>Static <b>bold</b></p><span aria-hidden="true">x</span></div>\n<span>single</span>`)).toEqual([
      '<div class="a"><p>Static <b>bold</b></p><span aria-hidden="true">x</span></div>',
      "<span>single</span>",
    ]);
  });

  it("a dynamic descendant keeps its ancestors as element frames; its static siblings become blocks", () => {
    const code = gen(`<div class="b"><span>@count</span><i>static</i></div>`);
    expect(code[0]).toBe('__builder.openElement(0, "div");');
    expect(blocks(`<div class="b"><span>@count</span><i>static</i></div>`)).toEqual(["<i>static</i>"]);
  });

  it("directive attributes, components, expressions and mixed values are not static", () => {
    expect(blocks(`<button @onclick="inc">x</button>`)).toEqual([]);
    expect(blocks(`<p class="a @count">x</p>`)).toEqual([]);
    expect(blocks(`<p title="@count">x</p>`)).toEqual([]);
    expect(blocks(`<Child />`)).toEqual([]);
    expect(blocks(`<p>@if (count > 0) { <b>x</b> }</p>`)).toEqual(["<b>x</b>"]);
  });

  it("form controls, property-backed attributes and style attributes stay element frames (D-S3)", () => {
    expect(blocks(`<input type="text" />`)).toEqual([]);
    expect(blocks(`<textarea>t</textarea>`)).toEqual([]);
    expect(blocks(`<select><option value="1">One</option></select>`)).toEqual([]);
    expect(blocks(`<li value="3">x</li>`)).toEqual([]);
    expect(blocks(`<p style="color: red">styled</p>`)).toEqual([]);
    expect(blocks(`<div><p style="color: red">styled</p></div>`)).toEqual([]);
    expect(blocks(`<a href="#" onclick="go()">x</a>`)).toEqual([]);
  });

  it("shapes the HTML parser would rebuild stay element frames; a static part inside still becomes a block", () => {
    // Each inner block is parsed on its own (in a <template>), so the parser has nothing to repair.
    expect(blocks(`<table><tr><td>x</td></tr></table>`)).toEqual(["<tr><td>x</td></tr>"]); // the <table> would get a <tbody>
    expect(gen(`<table><tr><td>x</td></tr></table>`)[0]).toBe('__builder.openElement(0, "table");');
    expect(blocks(`<table><tbody><tr><td>x</td></tr></tbody></table>`)).toEqual(["<table><tbody><tr><td>x</td></tr></tbody></table>"]);
    expect(blocks(`<p><div>x</div></p>`)).toEqual(["<div>x</div>"]); // <div> would close the <p>
    expect(blocks(`<a href="/"><a href="/x">x</a></a>`)).toEqual(['<a href="/x">x</a>']);
    expect(blocks(`<h1><h2>x</h2></h1>`)).toEqual(["<h2>x</h2>"]);
    expect(blocks(`<pre>\ncode</pre>`)).toEqual([]); // the parser would drop the leading newline
    expect(blocks(`<template><p>x</p></template>`)).toEqual(["<p>x</p>"]); // children of the element, not of .content
    expect(blocks(`<ul><li>a<li>b</li></li></ul>`)).toEqual(["<li>b</li>"]);
  });

  it("a static <td> inside a dynamic <tr> is a block of its own (the template parser accepts it)", () => {
    expect(blocks(`<tr class="@count"><td class="x"><span aria-hidden="true">x</span></td></tr>`)).toEqual([
      '<td class="x"><span aria-hidden="true">x</span></td>',
    ]);
  });

  it("text-only content stays text frames; the escape hatch turns blocks off; typed shadows keep element frames", () => {
    expect(blocks(`Hello`)).toEqual([]);
    expect(blocks(`<p>x</p>`, { staticMarkup: false })).toEqual([]);
    expect(blocks(`<p>x</p>`, { typedShadow: {} })).toEqual([]);
  });
});

describe("F1a — the markup string", () => {
  it("entities and @@ decode to the same DOM text, written escaped", () => {
    expect(blocks(`<p class="c">Mail user@@example.com &amp; more &lt;3</p>`)).toEqual(["<p class=\"c\">Mail user@example.com &amp; more &lt;3</p>"]);
    expect(blocks(`<p title="a &quot;b&quot; &amp; c">x</p>`)).toEqual(['<p title="a &quot;b&quot; &amp; c">x</p>']);
  });

  it("minimized attributes bare, void elements without closing tag, self-closing elements written out", () => {
    expect(blocks(`<details open><summary>s</summary><br /><img src="a.png" alt="" /></details>`)).toEqual([
      '<details open><summary>s</summary><br><img src="a.png" alt=""></details>',
    ]);
    expect(blocks(`<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /><linearGradient id="g" /></svg>`)).toEqual([
      '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"></circle><linearGradient id="g"></linearGradient></svg>',
    ]);
    expect(blocks(`<svg><someCustom /></svg>`)).toEqual([]); // the parser would lower the name
  });

  it("whitespace that spans lines is dropped as by the element frames (D-S2); inline spaces stay", () => {
    expect(blocks(`<ul>\n    <li>a</li>\n    <li>b <b>c</b></li>\n</ul>`)).toEqual(["<ul><li>a</li><li>b <b>c</b></li></ul>"]);
  });

  it("the scope attribute comes first on every element", () => {
    expect(blocks(`<div class="a"><p>x</p></div>`, { scopeHash: "b-1a2b3c4d" })).toEqual(['<div b-1a2b3c4d="" class="a"><p b-1a2b3c4d="">x</p></div>']);
  });
});
