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

  it("highlights CSS and TS blocks with the lezer grammars", () => {
    expect(highlight("p { color: red; }", "css")).toContain("tok-");
    expect(highlight("const x = 1;", "ts")).toContain('<span class="tok-keyword">const</span>');
  });
});
