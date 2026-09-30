/**
 * Razor markup syntax fidelity. Review §1: C8, C9, C14, void/uppercase tags,
 * bare `<` in text, braces in child content, whitespace, @foreach headers.
 */
import { describe, expect, it } from "vitest";
import { errorCodes, mount } from "../harness.js";

describe("C8 — Razor comments", () => {
  it.fails("@* … *@ renders nothing and compiles cleanly", async () => {
    const m = await mount(`<p>a @* hidden *@ b</p>`);
    expect(errorCodes(m.diagnostics)).toEqual([]);
    expect(m.text()).toBe("a b");
  });

  it.fails("multi-line comments may contain markup and @", async () => {
    const m = await mount(`<p>x</p>\n@*\n  <div>@broken(</div>\n*@\n<p>y</p>`);
    expect(m.html()).toBe("<p>x</p><p>y</p>");
  });
});

describe("C9 — @ preceded by an alphanumeric is literal (email rule)", () => {
  it.fails("in text", async () => {
    const m = await mount(`<p>info@example.com</p>`);
    expect(m.html()).toBe("<p>info@example.com</p>");
  });

  it.fails("in attribute values", async () => {
    const m = await mount(`<a href="mailto:info@example.com">mail</a>`);
    expect(m.container.querySelector("a")!.getAttribute("href")).toBe("mailto:info@example.com");
  });
});

describe("C14 — unquoted attribute values", () => {
  it.fails("keeps name=value and bare boolean attributes", async () => {
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
  it.fails("void element with explicit close tag", async () => {
    const m = await mount(`<div><input></input></div>`);
    expect(m.html()).toBe("<div><input></div>");
  });

  it("uppercase HTML tag is an element, not a component", async () => {
    const m = await mount(`<DIV>x</DIV>`);
    expect(m.html()).toBe("<div>x</div>");
  });

  it.fails("bare < followed by a space is text", async () => {
    const m = await mount(`<p>a < b</p>`);
    expect(m.text()).toBe("a < b");
  });

  it.fails("literal braces in component child content", async () => {
    const m = await mount({
      "Test.tsazor": `<Card>{ json }</Card>`,
      "Card.tsazor": `<div>@ChildContent</div>\n@code { @Parameter() ChildContent?: RenderFragment; }`,
    });
    expect(m.text()).toBe("{ json }");
  });
});

describe("whitespace", () => {
  it.fails("a single-line @foreach emits no whitespace text nodes", async () => {
    const m = await mount(`<ul>@foreach (var x in xs) { <li>@x</li> }</ul>\n@code { private xs = ["a", "b"]; }`);
    const ul = m.container.querySelector("ul")!;
    const textNodes = [...ul.childNodes].filter((n) => n.nodeType === 3);
    expect(textNodes.map((n) => n.textContent)).toEqual([]);
  });
});

describe("@foreach header forms", () => {
  it.fails("typed loop variable (Razor/C# form)", async () => {
    const m = await mount(`@foreach (string s in xs) {\n<i>@s</i>\n}\n@code { private xs = ["a", "b"]; }`);
    expect(m.html()).toBe("<i>a</i><i>b</i>");
  });

  it.fails("tuple deconstruction", async () => {
    const m = await mount(`@foreach (var (k, v) in pairs) {\n<i>@k@v</i>\n}\n@code { private pairs: [string, number][] = [["a", 1], ["b", 2]]; }`);
    expect(m.html()).toBe("<i>a1</i><i>b2</i>");
  });
});
