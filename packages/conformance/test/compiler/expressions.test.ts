/**
 * Expression rewriting: free identifiers that are component members become
 * `this.X`; locals, parameters, globals, property keys, type positions and
 * literals stay untouched. Review §1: C4, C5, C6, C18, null in mixed attributes.
 */
import { describe, expect, it } from "vitest";
import { mount } from "../harness.js";

describe("C4 — template literals", () => {
  it("rewrites members inside ${} spans", async () => {
    const m = await mount("<p>@(`Hi ${user.name}`)</p>\n@code { private user = { name: \"Ada\" }; }");
    expect(m.html()).toBe("<p>Hi Ada</p>");
  });

  it("handles nested template literals", async () => {
    const m = await mount("<p>@(`a ${`b ${c}`}`)</p>\n@code { private c = \"C\"; }");
    expect(m.html()).toBe("<p>a b C</p>");
  });
});

describe("C5 — expression forms", () => {
  it("object literal shorthand and keys", async () => {
    const m = await mount(`<p>@(JSON.stringify({ id, label: name }))</p>\n@code { private id = 1; private name = "n"; }`);
    expect(m.html()).toBe('<p>{"id":1,"label":"n"}</p>');
  });

  it("numeric literals with exponent, hex and bigint suffix", async () => {
    const m = await mount(`<p>@(1e3 + 0xFF + Number(10n))</p>`);
    expect(m.html()).toBe("<p>1265</p>");
  });

  it("regex literals are left alone", async () => {
    const m = await mount(`<p>@(/^a+$/.test(word) ? "y" : "n")</p>\n@code { private word = "aaa"; }`);
    expect(m.html()).toBe("<p>y</p>");
  });

  it("spread arguments", async () => {
    const m = await mount(`<p>@sum(...values)</p>\n@code { private values = [1, 2, 3]; private sum(...n: number[]) { return n.reduce((a, b) => a + b, 0); } }`);
    expect(m.html()).toBe("<p>6</p>");
  });

  it("arrow parameters do not shadow members outside the arrow", async () => {
    const m = await mount(`<p>@(items.filter(x => x.ok).length + x)</p>\n@code { private items = [{ ok: true }]; private x = 10; }`);
    expect(m.html()).toBe("<p>11</p>");
  });

  it("default parameter values reference members", async () => {
    const m = await mount(`<p>@(((v = fallback) => v)())</p>\n@code { private fallback = "F"; }`);
    expect(m.html()).toBe("<p>F</p>");
  });

  it("typed arrow parameters and return types", async () => {
    const m = await mount(`<p>@(((v: string): string => v + suffix)("a"))</p>\n@code { private suffix = "!"; }`);
    expect(m.html()).toBe("<p>a!</p>");
  });

  it("type assertions keep the type position", async () => {
    const m = await mount(`<p>@((data as { name: string }).name)</p>\n@code { private data: unknown = { name: "Ada" }; }`);
    expect(m.html()).toBe("<p>Ada</p>");
  });

  it("JS globals are not members", async () => {
    const m = await mount(`<p>@parseInt("42")|@encodeURIComponent("a b")|@isNaN(Number("x"))</p>`);
    expect(m.html()).toBe("<p>42|a%20b|true</p>");
  });

  it("JS globals are not members (string results)", async () => {
    const m = await mount(`<p>@parseInt("42")|@encodeURIComponent("a b")|@String(isNaN(Number("x")))|@Math.max(1, 2)</p>`);
    expect(m.html()).toBe("<p>42|a%20b|true|2</p>");
  });

  it("members named like contextual keywords", async () => {
    const m = await mount(`<p>@(from)-@(of)</p>\n@code { private from = "A"; private of = "B"; }`);
    expect(m.html()).toBe("<p>A-B</p>");
  });
});

describe("C6 — statements inside @{ }", () => {
  it("destructuring declarations", async () => {
    const m = await mount(`@{ const { a, b } = pair; }<p>@a@b</p>\n@code { private pair = { a: 1, b: 2 }; }`);
    expect(m.html()).toBe("<p>12</p>");
  });

  it("local function declarations", async () => {
    const m = await mount(`@{ function twice(n: number) { return n * 2; } }<p>@twice(21)</p>`);
    expect(m.html()).toBe("<p>42</p>");
  });

  it("generic type arguments", async () => {
    const m = await mount(`@{ const map = new Map<string, number>([["k", 7]]); }<p>@map.get("k")</p>`);
    expect(m.html()).toBe("<p>7</p>");
  });
});

describe("C18 — method groups keep their receiver", () => {
  it("@onclick=\"item.toggle\" calls toggle on item", async () => {
    const m = await mount(`
<button @onclick="item.toggle">t</button><p>@item.on</p>
@code {
    private item = { on: false, toggle() { this.on = !this.on; } };
}`);
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.html()).toBe("<button>t</button><p>true</p>");
  });

  it("@onclick=\"item.toggle\" calls toggle on item (string state)", async () => {
    const m = await mount(`
<button @onclick="item.toggle">t</button><p>@String(item.on)</p>
@code {
    private item = { on: false, toggle() { this.on = !this.on; } };
}`);
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.html()).toBe("<button>t</button><p>true</p>");
  });

  it("a method group with a computed receiver evaluates it once, at render", async () => {
    const m = await mount(`
@foreach (const item of items) {
    <button @onclick="pick(item).toggle">t</button>
}
<p>@picks|@String(items[1]!.on)</p>
@code {
    private picks = 0;
    private items = [0, 1].map(() => ({ on: false, toggle() { this.on = !this.on; } }));
    private pick(item: { on: boolean; toggle(): void }) { this.picks++; return item; }
}`);
    m.container.querySelectorAll("button")[1]!.click();
    await m.settle();
    // Two picks per render (one per button), rendered twice (initial + after the click).
    expect(m.container.querySelector("p")!.textContent).toBe("4|true");
  });

  it("a member method group keeps the component receiver and re-renders it", async () => {
    const m = await mount(`<button @onclick="bump">b</button><p>@count</p>\n@code { private count = 0; private bump() { this.count++; } }`);
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.container.querySelector("p")!.textContent).toBe("1");
  });
});

describe("mixed attribute values", () => {
  it("null renders as empty, not the string \"null\"", async () => {
    const m = await mount(`<a class="btn @(active ? "on" : null)">x</a>\n@code { private active = false; }`);
    expect(m.container.querySelector("a")!.getAttribute("class")).not.toContain("null");
  });
});
