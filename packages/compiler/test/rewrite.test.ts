import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile";
import { LIB_GLOBALS } from "../src/globals.generated";
import { collectBodyMembers, collectDefaultClassMembers, emptyMembers, rewriteSnippet, type NameResolver, type SnippetKind } from "../src/rewrite";

/** The codegen rule over explicit sets: member ⇒ this.X, import/global ⇒ free, else ⇒ this.X. */
function resolver(options: { locals?: string[]; members?: string[]; imports?: string[] } = {}): NameResolver {
  const locals = new Set(options.locals ?? []);
  const members = new Set(options.members ?? []);
  const imports = new Set(options.imports ?? []);
  return {
    isOuterLocal: (name) => locals.has(name),
    prefixFor: (name, thisRebound) => {
      const receiver = thisRebound ? "__tsazor_this." : "this.";
      if (members.has(name)) return receiver;
      if (imports.has(name) || LIB_GLOBALS.has(name)) return null;
      return receiver;
    },
  };
}

const rw = (code: string, kind: SnippetKind = "expression", options?: Parameters<typeof resolver>[0]): string =>
  rewriteSnippet(code, kind, resolver(options)).text;

describe("rewrite — expressions", () => {
  it("rewrites free names, keeps property names and keys", () => {
    expect(rw("a.b.c + d[e]")).toBe("this.a.b.c + this.d[this.e]");
    expect(rw("({ id: key, [computed]: 1, 'q': v })")).toBe("({ id: this.key, [this.computed]: 1, 'q': this.v })");
    expect(rw("a?.b?.[c]?.(d)")).toBe("this.a?.b?.[this.c]?.(this.d)");
  });

  it("expands shorthand properties (also in assignment patterns)", () => {
    expect(rw("save({ id, name })")).toBe("this.save({ id: this.id, name: this.name })");
    expect(rw("({ a, b = 1 } = obj)")).toBe("({ a: this.a, b: this.b = 1 } = this.obj)");
    expect(rw("({ x }) => ({ x, y })")).toBe("({ x }) => ({ x, y: this.y })");
  });

  it("leaves literals alone: template text, regex (with flags), numbers, bigint", () => {
    expect(rw("`Hi ${user.name} ${`n ${c}`} x`")).toBe("`Hi ${this.user.name} ${`n ${this.c}`} x`");
    expect(rw("/^ab+$/gi.test(word)")).toBe("/^ab+$/gi.test(this.word)");
    expect(rw("1e3 + 0xFF + 10n + 1_000 + .5e-2")).toBe("1e3 + 0xFF + 10n + 1_000 + .5e-2");
    expect(rw("tag`a ${b}`")).toBe("this.tag`a ${this.b}`");
  });

  it("spreads", () => {
    expect(rw("sum(...values, ...[x])")).toBe("this.sum(...this.values, ...[this.x])");
    expect(rw("({ ...rest })")).toBe("({ ...this.rest })");
  });

  it("scopes arrow and function parameters to their function", () => {
    expect(rw("items.filter(x => x.ok).length + x")).toBe("this.items.filter(x => x.ok).length + this.x");
    expect(rw("list.map(({ a, b: [c] }, i) => a + c + i + d)")).toBe("this.list.map(({ a, b: [c] }, i) => a + c + i + this.d)");
    expect(rw("(function f(n) { return n ? f(n - 1) : m; })(3)")).toBe("(function f(n) { return n ? f(n - 1) : __tsazor_this.m; })(3)");
  });

  it("evaluates default parameter values against outer names", () => {
    expect(rw("((v = fallback, w = v) => w)()")).toBe("((v = this.fallback, w = v) => w)()");
  });

  it("never rewrites type positions", () => {
    expect(rw("((v: string, m: Map<string, Item>): Result<T> => v + suffix)")).toBe("((v: string, m: Map<string, Item>): Result<T> => v + this.suffix)");
    expect(rw("(data as { name: Person }).name")).toBe("(this.data as { name: Person }).name");
    expect(rw("<Person>data")).toBe("<Person>this.data");
    expect(rw("cfg satisfies Config")).toBe("this.cfg satisfies Config");
    expect(rw("make<Item>(x)")).toBe("this.make<Item>(this.x)");
    expect(rw("value!.length")).toBe("this.value!.length");
  });

  it("distinguishes typeof in value and type position", () => {
    expect(rw("typeof q === 'string'")).toBe("typeof this.q === 'string'");
    expect(rw("(v as typeof q)")).toBe("(this.v as typeof q)");
  });

  it("keeps imports and JS/DOM globals free; members win over both", () => {
    expect(rw("parseInt(s) + Math.max(a, NaN) + setTimeout.length", "expression")).toBe("parseInt(this.s) + Math.max(this.a, NaN) + setTimeout.length");
    expect(rw("localStorage.getItem(k) ?? encodeURIComponent(document.title)")).toBe("localStorage.getItem(this.k) ?? encodeURIComponent(document.title)");
    expect(rw("undefined ?? globalThis.x")).toBe("undefined ?? globalThis.x");
    expect(rw("Status.Open + format(d)", "expression", { imports: ["Status", "format"] })).toBe("Status.Open + format(this.d)");
    expect(rw("Status + length", "expression", { imports: ["Status"], members: ["Status", "length"] })).toBe("this.Status + this.length");
  });

  it("treats deprecated window properties as members, not globals", () => {
    // window.name / status / event are @deprecated in lib.dom — common member names.
    expect(rw("name + status + event")).toBe("this.name + this.status + this.event");
  });

  it("rewrites new targets: imported stays, member gets this", () => {
    expect(rw("new Foo(new Bar())", "expression", { imports: ["Bar"] })).toBe("new this.Foo(new Bar())");
    expect(rw("new Date()")).toBe("new Date()");
  });

  it("members named like contextual keywords", () => {
    expect(rw("from + of + get + set + as + type + async")).toBe("this.from + this.of + this.get + this.set + this.as + this.type + this.async");
  });

  it("keeps `this`, `super`-free explicit access untouched", () => {
    expect(rw("this.items[i]!.title")).toBe("this.items[this.i]!.title");
  });

  it("respects outer locals", () => {
    expect(rw("item.name + index", "expression", { locals: ["item"] })).toBe("item.name + this.index");
  });

  it("uses the captured component inside non-arrow functions and object methods", () => {
    expect(rw("({ run() { return count; }, get v() { return count; }, w: () => count })")).toBe(
      "({ run() { return __tsazor_this.count; }, get v() { return __tsazor_this.count; }, w: () => this.count })",
    );
  });

  it("reports a method group with its receiver", () => {
    const simple = rewriteSnippet("item.toggle", "expression", resolver({ locals: ["item"] }));
    expect(simple.methodGroup).toMatchObject({ receiver: "item", simpleReceiver: true });
    const member = rewriteSnippet("(model.items[i]!).save", "expression", resolver());
    expect(member.methodGroup).toMatchObject({ receiver: "(this.model.items[this.i]!)", simpleReceiver: true });
    const computed = rewriteSnippet("pick(x).toggle", "expression", resolver());
    expect(computed.methodGroup).toMatchObject({ receiver: "this.pick(this.x)", simpleReceiver: false });
    expect(rewriteSnippet("this.handler", "expression", resolver()).methodGroup).toBeUndefined();
    expect(rewriteSnippet("handler", "expression", resolver()).methodGroup).toBeUndefined();
    expect(rewriteSnippet("a?.b", "expression", resolver()).methodGroup).toBeUndefined();
    expect(rewriteSnippet("() => a.b()", "expression", resolver()).methodGroup).toBeUndefined();
  });
});

describe("rewrite — statements", () => {
  it("declares destructuring, functions and classes in the run's scope", () => {
    expect(rw("const { a, b: [c, ...d] } = pair; use(a, c, d, e);", "statements")).toBe(
      "const { a, b: [c, ...d] } = this.pair; this.use(a, c, d, this.e);",
    );
    expect(rw("function twice(n: number) { return n * factor; } twice(k);", "statements")).toBe(
      "function twice(n: number) { return n * __tsazor_this.factor; } twice(this.k);",
    );
    expect(rw("class Box { v = seed; get() { return this.v + m; } } new Box();", "statements")).toBe(
      "class Box { v = __tsazor_this.seed; get() { return this.v + __tsazor_this.m; } } new Box();",
    );
  });

  it("hoists var and function declarations, keeps let/const block-scoped", () => {
    expect(rw("use(h, f); var h = 1; function f() {}", "statements")).toBe("this.use(h, f); var h = 1; function f() {}");
    expect(rw("{ const inner = 1; use(inner); } use(inner);", "statements")).toBe("{ const inner = 1; this.use(inner); } this.use(this.inner);");
    expect(rw("{ var hoisted = 1; } use(hoisted);", "statements")).toBe("{ var hoisted = 1; } this.use(hoisted);");
  });

  it("scopes loop variables, catch parameters and labels", () => {
    expect(rw("for (const [k, v] of Object.entries(map)) { out(k, v); } out(k);", "statements")).toBe(
      "for (const [k, v] of Object.entries(this.map)) { this.out(k, v); } this.out(this.k);",
    );
    expect(rw("try { run(); } catch (err) { log(err); } log(err);", "statements")).toBe(
      "try { this.run(); } catch (err) { this.log(err); } this.log(this.err);",
    );
    expect(rw("outer: for (let i = 0; i < n; i++) { if (i) continue outer; break outer; }", "statements")).toBe(
      "outer: for (let i = 0; i < this.n; i++) { if (i) continue outer; break outer; }",
    );
    expect(rw("switch (k) { case A: { const t = 1; use(t); } }", "statements")).toBe(
      "switch (this.k) { case this.A: { const t = 1; this.use(t); } }",
    );
  });

  it("enum members see each other", () => {
    expect(rw("enum E { A = 1, B = A * 2, C = base }", "statements")).toBe("enum E { A = 1, B = A * 2, C = this.base }");
  });

  it("skips type-only declarations", () => {
    expect(rw("type T = Foo; interface I { x: Bar } const v: T = make();", "statements")).toBe(
      "type T = Foo; interface I { x: Bar } const v: T = this.make();",
    );
  });
});

describe("rewrite — @for headers", () => {
  it("keeps var as written, reports its keyword and the loop variables", () => {
    const result = rewriteSnippet("var i = 0, n = items.length; i < n; i++", "forHeader", resolver());
    expect(result.text).toBe("var i = 0, n = this.items.length; i < n; i++");
    expect(result.declares).toEqual(["i", "n"]);
    expect(result.varKeywords).toEqual([0]);
    expect(rewriteSnippet("let i = 0; i < 3; i++", "forHeader", resolver()).varKeywords).toEqual([]);
    expect(rewriteSnippet("const f = () => { var x = 1; }; f();", "statements", resolver()).varKeywords).toEqual([18]);
    const forOf = rewriteSnippet("const [k, v] of pairs", "forHeader", resolver());
    expect(forOf.text).toBe("const [k, v] of this.pairs");
    expect(forOf.declares).toEqual(["k", "v"]);
  });
});

describe("rewrite — token entries", () => {
  it("maps every word token after the inserted prefix", () => {
    const result = rewriteSnippet("a + b.c", "expression", resolver({ locals: ["a"] }));
    expect(result.text).toBe("a + this.b.c");
    expect(result.tokens).toEqual([
      { outOffset: 0, srcOffset: 0 },
      { outOffset: 9, srcOffset: 4 },
      { outOffset: 11, srcOffset: 6 },
    ]);
  });
});

describe("member collection", () => {
  it("collects fields, methods, accessors, parameter properties and statics", () => {
    const members = emptyMembers();
    collectBodyMembers("@Parameter() Name = ''; private count = 0; get total() { return 1; } run() {} static K = 1; constructor(private svc: S) { super(); }", members);
    expect([...members.instance].sort()).toEqual(["Name", "count", "run", "svc", "total"]);
    expect([...members.statics]).toEqual(["K"]);
  });

  it("collects the default class of a code-behind module", () => {
    const direct = emptyMembers();
    collectDefaultClassMembers("export default class CounterBase extends ComponentBase { count = 0; increment() {} }", direct);
    expect([...direct.instance]).toEqual(["count", "increment"]);
    const assigned = emptyMembers();
    collectDefaultClassMembers("class Other { x = 1 }\nclass Base { y = 1 }\nexport default Base;", assigned);
    expect([...assigned.instance]).toEqual(["y"]);
  });
});

describe("codegen integration (A4)", () => {
  const gen = (source: string, options: Partial<Parameters<typeof compile>[1]> = {}) =>
    compile(source, { className: "Demo", generateSourceMap: false, ...options }).code;

  it("a declared member wins over an @import of the same name", () => {
    const code = gen('@import { Status } from "./status"\n<p>@Status|@Other</p>\n@code { @Parameter() Status = 1; }', {});
    expect(code).toContain("__builder.addContent(1, this.Status);");
    const free = gen('@import { Status } from "./status"\n<p>@Status</p>');
    expect(free).toContain("__builder.addContent(1, Status);");
  });

  it("code-behind members are members", () => {
    const code = gen("<p>@count|@parseInt</p>", {
      codeBehindClass: "DemoBase",
      codeBehindSource: "export default class DemoBase extends ComponentBase { parseInt = 1; count = 0; }",
    });
    expect(code).toContain("__builder.addContent(1, this.count);");
    expect(code).toContain("__builder.addContent(3, this.parseInt);");
  });

  it("statics are reached through the class", () => {
    expect(gen("<p>@Max</p>\n@code { static Max = 3; }")).toContain("__builder.addContent(1, Demo.Max);");
  });

  it("the component's own class name stays free: `Demo.Max` reaches the static, as in Razor", () => {
    expect(gen("<p>@Demo.Max</p>\n@code { static Max = 3; }")).toContain("__builder.addContent(1, Demo.Max);");
  });

  it("captures the component for member references in local functions", () => {
    const code = gen("@{ function twice() { return factor * 2; } }<p>@twice()</p>\n@code { private factor = 2; }");
    expect(code).toContain("    const __tsazor_this = this;\n");
    expect(code).toContain("function twice() { return __tsazor_this.factor * 2; }");
  });

  it("a user local named like the builder parameter or a runtime API does not collide", () => {
    const code = gen("@{ const { a, b } = pair; const EventCallback = 1; }<button @onclick=\"go\">@a@b</button>\n@code { private pair = { a: 1, b: 2 }; go() {} }");
    expect(code).toContain("const { a, b } = this.pair;");
    expect(code).toContain("__builder.addContent(3, b);");
    expect(code).toContain("__tsazor_EventCallback.bind(this, this.go)");
  });

  it("uses the aliases when an @import type binds a runtime API name", () => {
    const code = gen('@import type { EventCallback } from "@tsazor/runtime"\n<button @onclick="go">x</button>\n@code { go() {} }');
    expect(code).toContain("EventCallback as __tsazor_EventCallback");
    expect(code).toContain("__tsazor_EventCallback.bind(this, this.go)");
  });

  it("resolves a bare event handler like any expression (a local stays local)", () => {
    const code = gen("@foreach (const h of handlers) { <button @onclick=\"h\">x</button> }");
    expect(code).toContain("__tsazor_EventCallback.bind(this, h)");
  });

  it("binds method groups with receivers (C18), also on component on* attributes", () => {
    const code = gen('<button @onclick="item.toggle">x</button><Child OnClick="@item.toggle" />', {
      resolveComponent: () => ({ specifier: "./Child.tsazor" }),
    });
    expect(code).toContain('__builder.addEventHandler(1, "onclick", __tsazor_EventCallback.bind(this, __tsazor_bindMethod(this.item, this.item.toggle)));');
    expect(code).toContain('__builder.addAttribute(4, "OnClick", __tsazor_EventCallback.bind(this, __tsazor_bindMethod(this.item, this.item.toggle)));');
    expect(code).toContain("bindMethod as __tsazor_bindMethod");
  });

  it("emits @for loop variables as written (var keeps its TS meaning)", () => {
    expect(gen("@for (let i = 0; i < n; i++) { <p>@i</p> }")).toContain("for (let i = 0; i < this.n; i++) {");
    expect(gen("@for (var i = 0; i < n; i++) { <p>@i</p> }")).toContain("for (var i = 0; i < this.n; i++) {");
  });

  it("renders null/undefined mixed attribute parts as empty", () => {
    expect(gen('<a class="btn @(on ? "x" : null)">y</a>')).toContain('`btn ${(this.on ? "x" : null) ?? ""}`');
  });

  it("keeps sequence numbers stable across the builder rename", () => {
    const code = gen("<Comp><p>@x</p></Comp><div>@y</div>", { resolveComponent: () => ({ specifier: "./Comp.tsazor" }) });
    expect(code).toContain("__builder.openComponent(0, __tsazor_comp_Comp);");
    expect(code).toContain("__builder.addContent(1, (__builder) => {");
    expect(code).toContain('__builder.openElement(0, "p");');
    expect(code).toContain('__builder.openElement(2, "div");');
  });

  it("still reports invalid TypeScript in code contexts", () => {
    const result = compile("@{ const = ; }", { className: "Demo", generateSourceMap: false });
    expect(result.diagnostics.all.some((d) => d.code === "TZS015")).toBe(true);
  });
});

describe("globals", () => {
  it("src/globals.generated.ts matches the installed TypeScript libs", () => {
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/gen-globals.mjs");
    expect(() => execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" })).not.toThrow();
  });
});
