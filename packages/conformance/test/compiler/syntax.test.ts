/**
 * Razor markup syntax fidelity. Review §1: C8, C9, C14, void/uppercase tags,
 * bare `<` in text, braces in child content, whitespace, @foreach headers.
 */
import { describe, expect, it } from "vitest";
import { diagnosticsOf, errorCodes, mount } from "../harness.js";

describe("C8 — Razor comments", () => {
  it("@* … *@ renders nothing and compiles cleanly", async () => {
    const m = await mount(`<p>a @* hidden *@ b</p>`);
    expect(errorCodes(m.diagnostics)).toEqual([]);
    expect(m.text()).toBe("a b");
  });

  it("multi-line comments may contain markup and @", async () => {
    const m = await mount(`<p>x</p>\n@*\n  <div>@broken(</div>\n*@\n<p>y</p>`);
    expect(m.html()).toBe("<p>x</p><p>y</p>");
  });
});

describe("C9 — @ preceded by an alphanumeric is literal (email rule)", () => {
  it("in text", async () => {
    const m = await mount(`<p>info@example.com</p>`);
    expect(m.html()).toBe("<p>info@example.com</p>");
  });

  it("in attribute values", async () => {
    const m = await mount(`<a href="mailto:info@example.com">mail</a>`);
    expect(m.container.querySelector("a")!.getAttribute("href")).toBe("mailto:info@example.com");
  });
});

describe("C14 — unquoted attribute values", () => {
  it("keeps name=value and bare boolean attributes", async () => {
    const m = await mount(`<input type=checkbox disabled>`);
    const input = m.container.querySelector("input")!;
    expect(input.getAttribute("type")).toBe("checkbox");
    expect(input.hasAttribute("disabled")).toBe(true);
  });

  it("accepts an unquoted @expression value", async () => {
    const m = await mount(`<a href=@url>x</a>\n@code { private url = "/home"; }`);
    expect(m.container.querySelector("a")!.getAttribute("href")).toBe("/home");
  });
});

describe("HTML tag handling", () => {
  it("void element with explicit close tag", async () => {
    const m = await mount(`<div><input></input></div>`);
    expect(m.html()).toBe("<div><input></div>");
  });

  it("uppercase HTML tag is an element, not a component", async () => {
    const m = await mount(`<DIV>x</DIV>`);
    expect(m.html()).toBe("<div>x</div>");
  });

  it("bare < followed by a space is text", async () => {
    const m = await mount(`<p>a < b</p>`);
    expect(m.text()).toBe("a < b");
  });

  it("literal braces in component child content", async () => {
    const m = await mount({
      "Test.tsazor": `<Card>{ json }</Card>`,
      "Card.tsazor": `<div>@ChildContent</div>\n@code { @Parameter() ChildContent?: RenderFragment; }`,
    });
    expect(m.text()).toBe("{ json }");
  });
});

describe("whitespace", () => {
  it("a single-line @foreach emits no whitespace text nodes", async () => {
    const m = await mount(`<ul>@foreach (const x of xs) { <li>@x</li> }</ul>\n@code { private xs = ["a", "b"]; }`);
    const ul = m.container.querySelector("ul")!;
    const textNodes = [...ul.childNodes].filter((n) => n.nodeType === 3);
    expect(textNodes.map((n) => n.textContent)).toEqual([]);
  });
});

describe("@foreach header forms (TypeScript)", () => {
  it("for…of over values", async () => {
    const m = await mount(`@foreach (const s of xs) {\n<i>@s</i>\n}\n@code { private xs = ["a", "b"]; }`);
    expect(m.diagnostics).toEqual([]);
    expect(m.html()).toBe("<i>a</i><i>b</i>");
  });

  it("array destructuring (C#'s tuple deconstruction)", async () => {
    const m = await mount(`@foreach (const [k, v] of pairs) {\n<i>@k@v</i>\n}\n@code { private pairs: [string, number][] = [["a", 1], ["b", 2]]; }`);
    expect(m.html()).toBe("<i>a1</i><i>b2</i>");
  });

  it("object destructuring with let", async () => {
    const m = await mount(`@foreach (let { id, label } of rows) {\n<i>@id:@label</i>\n}\n@code { private rows = [{ id: 1, label: "x" }, { id: 2, label: "y" }]; }`);
    expect(m.html()).toBe("<i>1:x</i><i>2:y</i>");
  });

  it("for…in iterates keys, as in TypeScript", async () => {
    const m = await mount(`@foreach (const key in totals) {\n<i>@key=@totals[key]</i>\n}\n@code { private totals: Record<string, number> = { a: 1, b: 2 }; }`);
    expect(m.diagnostics).toEqual([]);
    expect(m.html()).toBe("<i>a=1</i><i>b=2</i>");
  });

  it.each([
    ["var x in xs", "@foreach (const x of xs)"],
    ["string s in xs", "@foreach (const s of xs)"],
    ["var (k, v) in pairs", "@foreach (const [k, v] of pairs)"],
  ])("the C# header '%s' is TZS021 naming '%s'", async (header, form) => {
    const diagnostics = await diagnosticsOf(`@foreach (${header}) {\n<i>x</i>\n}\n@code { private xs = []; private pairs = []; }`);
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([["TZS021", "error"]]);
    expect(diagnostics[0]!.message).toContain(`'${form}' — in TypeScript, for…in iterates keys`);
  });
});
