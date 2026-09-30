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

    const { doc: doc2 } = parse("@foreach (var item in items) { <li>@item</li> }");
    const node2 = doc2.body[0]!;
    expect(node2.kind).toBe("for");
    if (node2.kind !== "for") return;
    expect(node2.isForEach).toBe(true);
    expect(node2.code).toBe("var item in items");
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
    const [id, cls, title, key, ref, click] = el.attributes;
    expect(id).toMatchObject({ kind: "static", name: "id", value: "x" });
    expect(cls).toMatchObject({ kind: "mixedValue", name: "class" });
    expect(title).toMatchObject({ kind: "expression", name: "title", code: "title" });
    expect(key).toMatchObject({ kind: "key", code: "k" });
    expect(ref).toMatchObject({ kind: "ref", code: "field" });
    expect(click).toMatchObject({ kind: "eventHandler", name: "onclick", flags: 1 });
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