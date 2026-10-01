import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/parser";
import { DiagnosticBag } from "../src/diagnostics";

function parse(source: string) {
  const diagnostics = new DiagnosticBag();
  const doc = parseDocument(source, diagnostics);
  return { doc, diagnostics };
}

describe("parser", () => {
  it("parses text and elements", () => {
    const { doc, diagnostics } = parse("<p>hello</p>");
    expect(diagnostics.all).toHaveLength(0);
    expect(doc.body).toHaveLength(1);
    const el = doc.body[0]!;
    expect(el.kind).toBe("element");
    if (el.kind !== "element") return;
    expect(el.tagName).toBe("p");
    expect(el.children[0]).toMatchObject({ kind: "text", content: "hello" });
  });

  it("parses implicit expressions with chains and calls", () => {
    const { doc } = parse("@Model.Name.Length <hr />@items[0] (@count + 1) trailing");
    const kinds = doc.body.map((n) => n.kind);
    expect(kinds).toEqual(["expression", "text", "element", "expression", "text", "expression", "text"]);
    expect(doc.body[0]).toMatchObject({ kind: "expression", code: "Model.Name.Length" });
    expect(doc.body[3]).toMatchObject({ kind: "expression", code: "items[0]" });
    expect(doc.body[5]).toMatchObject({ kind: "expression", code: "count" });
    expect(doc.body[6]).toMatchObject({ kind: "text", content: " + 1) trailing" });
  });

  it("keeps postfix ! and ?. inside implicit expressions (regression: `!.title` leaked as literal text)", () => {
    const { doc } = parse("@this.items[i]!.title | @user?.profile?.name | @obj?.method() | @flag!");
    const exprs = doc.body.filter((n) => n.kind === "expression").map((n) => (n as { code: string }).code);
    expect(exprs).toEqual(["this.items[i]!.title", "user?.profile?.name", "obj?.method()", "flag"]);
    // A lone `!` without a continuation stays markup text (Razor parity), and
    // `??` still terminates (nullish coalescing is not part of an expression).
    const texts = doc.body.filter((n) => n.kind === "text").map((n) => (n as { content: string }).content);
    const tail = texts[3]!;
    expect(tail).toContain("!");
    const { doc: nullish } = parse("@value ?? fallback");
    expect(nullish.body[0]).toMatchObject({ kind: "expression", code: "value" });
    expect(nullish.body[1]).toMatchObject({ kind: "text", content: " ?? fallback" });
  });

  it("escapes @@ and supports @:text lines", () => {
    const { doc } = parse("@@hello@:world");
    const joined = doc.body.filter((n) => n.kind === "text").map((n) => (n as { content: string }).content).join("");
    expect(joined).toBe("@helloworld");
  });

  it("collects top-level directives", () => {
    const { doc } = parse('@page "/counter"\n@using My.App\n@inherits MyBase\n');
    expect(doc.directives.map((d) => d.name)).toEqual(["page", "using", "inherits"]);
    expect(doc.directives[0]).toMatchObject({ value: '"/counter"' });
  });

  it("marks @code blocks as members", () => {
    const { doc } = parse("@code {\n  count = 0;\n}\n");
    expect(doc.body).toHaveLength(1);
    expect(doc.body[0]).toMatchObject({ kind: "codeBlock", member: true, code: "\n  count = 0;\n" });
  });

  it("parses if/else-if/else chains", () => {
    const { doc } = parse('@if (a) { <p>a</p> }\nelse if (b) { <p>b</p> }\nelse { <p>c</p> }');
    const node = doc.body[0]!;
    expect(node.kind).toBe("if");
    if (node.kind !== "if") return;
    expect(node.branches).toHaveLength(3);
    expect(node.branches[0]!.condition).toBe("a");
    expect(node.branches[1]!.condition).toBe("b");
    expect(node.branches[2]!.condition).toBeNull();
  });

  it("parses for and foreach", () => {
    const { doc } = parse("@for (let i = 0; i < 3; i++) { <li>@i</li> }");
    const node = doc.body[0]!;
    expect(node.kind).toBe("for");
    if (node.kind !== "for") return;
    expect(node.isForEach).toBe(false);
    expect(node.code).toBe("let i = 0; i < 3; i++");

    const { doc: doc2 } = parse("@foreach (const item of items) { <li>@item</li> }");
    const node2 = doc2.body[0]!;
    expect(node2.kind).toBe("for");
    if (node2.kind !== "for") return;
    expect(node2.isForEach).toBe(true);
    expect(node2.code).toBe("const item of items");
  });

  it("parses switch with cases and skips break statements", () => {
    const { doc } = parse('@switch (state) {\n  case "on": <b>ON</b>\n    break;\n  default: <i>off</i>\n    break;\n}');
    const node = doc.body[0]!;
    expect(node.kind).toBe("switch");
    if (node.kind !== "switch") return;
    expect(node.code).toBe("state");
    expect(node.cases).toHaveLength(2);
    expect(node.cases[0]!.code).toBe('"on"');
    expect(node.cases[1]!.code).toBeNull();
    expect(node.cases[0]!.children.some((c) => c.kind === "element")).toBe(true);
  });

  it("parses attribute kinds", () => {
    const { doc } = parse('<div id="x" class="btn @cls" title=@title @key="k" @ref="field" @onclick="Go" @onclick:preventDefault />');
    const el = doc.body[0]!;
    expect(el.kind).toBe("element");
    if (el.kind !== "element") return;
    const [id, cls, title, key, ref, click, modifier] = el.attributes;
    expect(id).toMatchObject({ kind: "static", name: "id", value: "x" });
    expect(cls).toMatchObject({ kind: "mixedValue", name: "class" });
    expect(title).toMatchObject({ kind: "expression", name: "title", code: "title" });
    expect(key).toMatchObject({ kind: "key", code: "k" });
    expect(ref).toMatchObject({ kind: "ref", code: "field" });
    expect(click).toMatchObject({ kind: "eventHandler", name: "onclick", code: "Go" });
    // A modifier is an attribute of its own (Blazor's __internal_preventDefault_onclick).
    expect(modifier).toMatchObject({ kind: "eventModifier", name: "onclick", modifier: "preventDefault" });
    expect(modifier).not.toHaveProperty("code");
  });

  it("parses component tags (uppercase or dotted)", () => {
    const { doc } = parse("<Greeter Name='World' /><My.App.Thing />");
    const [g, t] = doc.body;
    expect(g).toMatchObject({ kind: "element", tagName: "Greeter", isComponent: true, selfClosing: true });
    expect(t).toMatchObject({ kind: "element", tagName: "My.App.Thing", isComponent: true });
  });

  it("parses component child content", () => {
    const { doc } = parse("<Modal Title='Hi'><p>body</p></Modal>");
    const el = doc.body[0]!;
    if (el.kind !== "element") return;
    expect(el.children).toHaveLength(1);
    expect(el.children[0]).toMatchObject({ kind: "element", tagName: "p" });
  });

  it("reports unclosed tags as errors", () => {
    const { diagnostics } = parse("<div><span>text</div>");
    expect(diagnostics.all.some((d) => d.code === "TZS002" && d.severity === "error")).toBe(true);
  });

  it("treats unknown @ tokens as diagnostics", () => {
    const { diagnostics } = parse("@+");
    expect(diagnostics.hasErrors).toBe(true);
  });

  it("parses the @bind family", () => {
    const { doc } = parse('<input @bind="n" @bind:event="oninput" />');
    const el = doc.body[0]!;
    if (el.kind !== "element") return;
    expect(el.attributes).toHaveLength(1);
    expect(el.attributes[0]).toMatchObject({ kind: "bind", expression: "n", event: "oninput" });
  });

  it("folds @bind-Target modifiers onto the target bind", () => {
    const { doc } = parse('<Stepper @bind-Value="v" @bind-Value:event="OnChanged" />');
    const el = doc.body[0]!;
    if (el.kind !== "element") return;
    expect(el.attributes[0]).toMatchObject({ kind: "bind", bindTarget: "Value", expression: "v", event: "OnChanged" });
  });

  it("keeps @bind:get/:set pairs without a base @bind (Blazor .NET 7 semantics)", () => {
    const { doc, diagnostics } = parse('<input @bind:get="a" @bind:set="b" />');
    const el = doc.body[0]!;
    if (el.kind !== "element") return;
    expect(el.attributes[0]).toMatchObject({ kind: "bind", get: "a", set: "b" });
    expect(diagnostics.hasErrors).toBe(false);
  });

  it("reports duplicate bind modifiers", () => {
    const { diagnostics } = parse('<input @bind="n" @bind:event="oninput" @bind:event="onchange" />');
    expect(diagnostics.all.some((d) => d.code === "TZS008" && /Duplicate bind modifier/.test(d.message))).toBe(true);
  });

  it("keeps braces inside element content as literal text (inline CSS/JSON)", () => {
    const { doc, diagnostics } = parse('<style>\n  .a { color: red; }\n</style>');
    expect(diagnostics.hasErrors).toBe(false);
    const el = doc.body[0]!;
    if (el.kind !== "element") return;
    const text = el.children
      .filter((c) => c.kind === "text")
      .map((c) => (c as { content: string }).content)
      .join("");
    expect(text).toContain("{ color: red; }");
  });

  it("reports a stray '}' outside any element as TZS003", () => {
    const { diagnostics } = parse("a } b");
    expect(diagnostics.all.some((d) => d.code === "TZS003")).toBe(true);
  });
});

describe("parser — code-first code contexts (A2)", () => {
  const kinds = (nodes: Array<{ kind: string }>) => nodes.map((n) => n.kind);

  it("parses control bodies as statements + markup in statement position", () => {
    const { doc, diagnostics } = parse("@if (a) {\n  const label = x.toUpperCase();\n  <p>@label</p>\n  count++\n  <b>it's {</b>\n}");
    expect(diagnostics.all).toHaveLength(0);
    const node = doc.body[0]!;
    if (node.kind !== "if") throw new Error("expected if");
    const body = node.branches[0]!.children;
    expect(kinds(body)).toEqual(["statement", "element", "statement", "element"]);
    expect(body[0]).toMatchObject({ kind: "statement", code: "const label = x.toUpperCase();", declares: ["label"] });
    // ASI: `count++` ends at the line break before the tag.
    expect(body[2]).toMatchObject({ kind: "statement", code: "count++" });
  });

  it("parses @{ } as a code-first block with markup and declarations", () => {
    const { doc, diagnostics } = parse("@{\n  const { a, b: [c] } = pair;\n  if (a) {\n    <p>yes</p>\n  }\n}");
    expect(diagnostics.all).toHaveLength(0);
    const block = doc.body[0]!;
    if (block.kind !== "codeBlock") throw new Error("expected codeBlock");
    expect(block.member).toBeUndefined();
    expect(kinds(block.children!)).toEqual(["statement", "if"]);
    expect(block.children![0]).toMatchObject({ declares: ["a", "c"] });
  });

  it("scans code with the TS lexer: braces in strings, templates, regex and comments", () => {
    const { doc, diagnostics } = parse("@{\n  const s = `}${'{'}`; // }\n  const r = /[}]/; /* { */\n}\n<p>after</p>");
    expect(diagnostics.all).toHaveLength(0);
    expect(kinds(doc.body)).toEqual(["codeBlock", "element"]);
  });

  it("parses while, do-while and try/catch/finally", () => {
    const { doc, diagnostics } = parse(
      "@while (i < 3) { <i>@i</i> i++; }\n@do { <b/> } while (again);\n@try { <p/> } catch (Exception e) { <p>@e</p> } finally { done(); }",
    );
    expect(diagnostics.all).toHaveLength(0);
    expect(doc.body[0]).toMatchObject({ kind: "while", condition: "i < 3", isDoWhile: false });
    expect(doc.body[1]).toMatchObject({ kind: "while", condition: "again", isDoWhile: true });
    const tryNode = doc.body[2]!;
    if (tryNode.kind !== "try") throw new Error("expected try");
    // C#-typed catch parameter binds its name.
    expect(tryNode.catchClause).toMatchObject({ param: "e", paramName: "e" });
    expect(kinds(tryNode.finallyChildren!)).toEqual(["statement"]);
  });

  it("keeps stacked switch labels as empty (fall-through) cases", () => {
    const { doc } = parse("@switch (k) {\n  case 1:\n  case 2:\n    <p>low</p>\n    break;\n  default:\n    <p>x</p>\n}");
    const node = doc.body[0]!;
    if (node.kind !== "switch") throw new Error("expected switch");
    expect(node.cases.map((c) => [c.code, kinds(c.children)])).toEqual([
      ["1", []],
      ["2", ["element", "statement"]],
      [null, ["element"]],
    ]);
  });

  it("gives control headers a source position", () => {
    const { doc } = parse("@if (a &&\n    b) { }\n@for (  let i = 0; i < 2; i++) { }");
    const node = doc.body[0]!;
    if (node.kind !== "if" || doc.body[1]!.kind !== "for") throw new Error("expected if + for");
    expect(node.branches[0]!.conditionStart).toEqual({ line: 1, column: 5 });
    expect(doc.body[1]).toMatchObject({ code: "let i = 0; i < 2; i++", codeStart: { line: 3, column: 8 } });
  });

  it("treats bare text in a body as an error (Razor: code context), never silently", () => {
    const { diagnostics } = parse("@if (a) {\n    Loading\n}");
    expect(diagnostics.all.some((d) => d.code === "TZS015" && d.pos.line === 2)).toBe(true);
  });

  it("processes @ transitions on @: lines and keeps the line break", () => {
    const { doc } = parse("@if (a) {\n    @:Hi @name!\n}");
    const node = doc.body[0]!;
    if (node.kind !== "if") throw new Error("expected if");
    expect(node.branches[0]!.children.map((c) => (c.kind === "text" ? c.content : c.kind))).toEqual(["Hi ", "expression", "!\n"]);
  });
});

describe("parser — markup fidelity (A2)", () => {
  it("drops @* *@ comments anywhere", () => {
    const { doc, diagnostics } = parse("<p @* attr *@ class=\"a\">x @* <b>@y(</b> *@ z</p>@if (a) { @* c *@ <i/> }");
    expect(diagnostics.all).toHaveLength(0);
    const p = doc.body[0]!;
    if (p.kind !== "element") throw new Error("expected element");
    expect(p.attributes).toHaveLength(1);
    expect(p.children).toMatchObject([{ kind: "text", content: "x  z" }]);
  });

  it("applies the email rule in text and attribute values", () => {
    const { doc } = parse('<a href="mailto:me@x.org">me@x.org</a><i>@a@b</i>');
    const [a, i] = doc.body;
    if (a?.kind !== "element" || i?.kind !== "element") throw new Error("expected elements");
    expect(a.attributes[0]).toMatchObject({ kind: "static", value: "mailto:me@x.org" });
    expect(a.children).toMatchObject([{ kind: "text", content: "me@x.org" }]);
    // After an expression the next `@` is a transition again.
    expect(i.children.map((c) => c.kind)).toEqual(["expression", "expression"]);
  });

  it("parses unquoted and minimized attributes", () => {
    const { doc } = parse("<input type=checkbox disabled value=a/b>");
    const el = doc.body[0]!;
    if (el.kind !== "element") throw new Error("expected element");
    expect(el.attributes).toMatchObject([
      { kind: "static", name: "type", value: "checkbox" },
      { kind: "static", name: "disabled", minimized: true },
      { kind: "static", name: "value", value: "a/b" },
    ]);
  });

  it("accepts void close tags, bare '<' in text and braces in component content", () => {
    const { doc, diagnostics } = parse("<input></input><p>a < b</p><Card>{ json }</Card>");
    expect(diagnostics.all).toHaveLength(0);
    expect(doc.body.map((n) => n.kind)).toEqual(["element", "element", "element"]);
  });

  it("classifies directives: Blazor-only ones are directives, unknown @word stays an expression", () => {
    const { doc, diagnostics } = parse("@namespace A.B\n@rendermode X\n@foo\n");
    expect(diagnostics.all).toHaveLength(0);
    expect(doc.directives.map((d) => d.name)).toEqual(["namespace", "rendermode"]);
    expect(doc.body[0]).toMatchObject({ kind: "expression", code: "foo" });
  });

  it("rejects directives inside elements and code", () => {
    const { diagnostics } = parse('<div>@page "/x"</div>\n@{ @inject X y }');
    expect(diagnostics.all.filter((d) => d.code === "TZS013")).toHaveLength(2);
  });
});