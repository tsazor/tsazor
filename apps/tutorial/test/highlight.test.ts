import { describe, expect, it } from "vitest";
import { highlight } from "../build/highlight";

describe(".tsazor highlighting", () => {
  it("colors transitions, members, tags, directives and @code", () => {
    const html = highlight('@import { MarkupString } from "@tsazor/runtime"\n<h1 class="x">Hello @name.toUpperCase()!</h1>\n@code {\n    name = "Tsazor";\n}', "tsazor");
    expect(html).toContain('<span class="tok-keyword">@import</span>');
    expect(html).toContain('<span class="tok-string">"@tsazor/runtime"</span>');
    expect(html).toContain('<span class="tok-meta">@</span><span class="tok-variableName">name.toUpperCase(</span>');
    expect(html).toContain('<span class="tok-tagName">&lt;h1</span>');
    expect(html).toContain('<span class="tok-attributeName">class</span>');
    expect(html).toContain('<span class="tok-keyword">@code</span>');
    expect(html).toContain('<span class="tok-string">"Tsazor"</span>');
    // `!` after the expression is text again.
    expect(html).toContain(")</span>!");
  });

  it("treats control-block bodies as code, with markup at tags in statement position", () => {
    const html = highlight(
      [
        "@foreach (const item of items) {",
        "    const label = item.name.toUpperCase();",
        "    if (item.active) {",
        "        <li class=\"on\">@label <b>{x}</b></li>",
        "    } else {",
        "        @:inactive: @label",
        "    }",
        "}",
        "@if (count > 0) {",
        "    <p>Some</p>",
        "} else if (count < 0) {",
        "    <p>Negative</p>",
        "} else {",
        "    <p>None</p>",
        "}",
        "<p>after</p>",
      ].join("\n"),
      "tsazor",
    );
    const lines = html.split("\n");
    // Statements are TypeScript: keywords, locals, calls.
    expect(lines[1]).toContain('<span class="tok-keyword">const</span>');
    expect(lines[1]).toContain('<span class="tok-function">toUpperCase</span>');
    expect(lines[2]).toContain('<span class="tok-keyword">if</span>');
    // Element content is markup: text stays plain, `@label` is an expression.
    expect(lines[3]).toContain('<span class="tok-tagName">&lt;li</span>');
    expect(lines[3]).toContain('<span class="tok-meta">@</span><span class="tok-variableName">label</span>');
    expect(lines[3]).toContain("{x}");
    expect(lines[4]).toContain('<span class="tok-keyword">else</span>');
    expect(lines[5]).toContain('<span class="tok-meta">@:</span>inactive:');
    // `} else if (…) {` continues the control statement; markup resumes after it.
    expect(lines[10]).toContain('<span class="tok-keyword">else if</span>');
    expect(lines[10]).toContain('<span class="tok-variableName">count</span>');
    expect(lines[15]).toBe('<span class="tok-tagName">&lt;p</span><span class="tok-tagName">&gt;</span>after<span class="tok-tagName">&lt;/p</span><span class="tok-tagName">&gt;</span>');
  });

  it("keeps generics in @code apart from tags", () => {
    const html = highlight("@code {\n    items: Array<string> = [];\n}\n<p>x</p>", "tsazor");
    expect(html).toContain('<span class="tok-typeName">Array</span>');
    expect(html).not.toContain('tok-tagName">&lt;string');
    expect(html).toContain('<span class="tok-tagName">&lt;p</span>');
  });

  it("highlights CSS and TS blocks with the lezer grammars", () => {
    expect(highlight("p { color: red; }", "css")).toContain("tok-");
    expect(highlight("const x = 1;", "ts")).toContain('<span class="tok-keyword">const</span>');
  });
});
