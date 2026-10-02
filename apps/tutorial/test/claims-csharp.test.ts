/**
 * Claims of the Blazor track's chapter "TypeScript for C# developers",
 * pinned to the real compiler, runtime and type check (the lesson apps run
 * the way the preview runs them, test/harness.ts) — and, for the statements
 * about the language itself, to TypeScript and the JavaScript runtime. Each
 * `describe` names the lesson whose text makes the claim.
 */
import path from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";
import { buildProject, type Files } from "../src/engine/compile-project";
import { TypeChecker } from "../src/engine/type-check";
import { loadTypeEnvironment } from "../build/type-env";
import { loadContent } from "../build/content";
import { mountWritten, writeModules, type Mounted } from "./harness";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gateDir = path.join(appRoot, ".gate", "claims-csharp");
const checker = new TypeChecker(loadTypeEnvironment(appRoot));
const content = loadContent(path.join(appRoot, "content"));
const lessons = content.parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.lessons));
const lesson = (slug: string) => lessons.find((candidate) => candidate.slug === slug)!;
let counter = 0;

afterAll(() => rmSync(gateDir, { recursive: true, force: true }));

/** Compiles (asserting no compile errors) and mounts like the preview. */
async function mount(files: Files): Promise<Mounted> {
  const build = buildProject(files);
  expect(build.diagnostics.filter((d) => d.severity === "error"), JSON.stringify(build.diagnostics)).toEqual([]);
  const dir = path.join(gateDir, String(counter++));
  writeModules(build, dir);
  const mounted = await mountWritten(build, dir);
  await mounted.settle();
  return mounted;
}

/**
 * The visible text, roughly as a reader sees it: the compiler drops the
 * whitespace between tags, so block-ish elements are followed by a space.
 */
function textNodes(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  for (const element of [...clone.querySelectorAll("h1, h2, p, li, tr, th, td, ol, ul, table, button")]) {
    element.after(document.createTextNode(" "));
  }
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Mounts, returns the visible text, disposes. */
async function textOf(files: Files, settleMs = 0): Promise<string> {
  const m = await mount(files);
  await m.settle(settleMs);
  const text = textNodes(m.container);
  m.dispose();
  return text;
}

/** Type-check codes of one module `x.ts` (next to a trivial App). */
const tsCodes = (source: string, extra: Files = {}): string[] =>
  checker
    .check({ "App.tsazor": "<p></p>\n", "x.ts": source, ...extra })
    .filter((d) => d.file === "x.ts")
    .map((d) => d.code);
const tsMessages = (source: string, extra: Files = {}): string =>
  checker
    .check({ "App.tsazor": "<p></p>\n", "x.ts": source, ...extra })
    .map((d) => `${d.code} ${d.message}`)
    .join("\n");
const typeCodes = (files: Files): string[] => checker.check(files).map((d) => d.code);
const replace = (files: Files, file: string, from: string, to: string): Files => {
  expect(files[file], file).toContain(from);
  return { ...files, [file]: files[file]!.replace(from, to) };
};

describe("the chapter", () => {
  it("is the first chapter of Part 1, in the Blazor track only", () => {
    const chapter = content.parts[0]!.chapters[0]!;
    expect(chapter.title).toBe("TypeScript for C# developers");
    expect(chapter.lessons.map((l) => l.slug)).toEqual([
      "types-and-nullability",
      "tasks-and-promises",
      "linq-and-arrays",
      "structural-typing",
      "properties-and-access",
      "attributes-and-decorators",
      "namespaces-and-modules",
      "records-enums-unions",
      "the-real-traps",
    ]);
    for (const l of chapter.lessons) expect(Object.keys(l.text), l.slug).toEqual(["blazor"]);
  });
});

/* types-and-nullability -------------------------------------------------------- */

describe("types-and-nullability", () => {
  it("|| falls back on Grace's 0 items, ?? doesn't; ?. + ?? handle the missing shipping", async () => {
    const before = await textOf(lesson("types-and-nullability").a);
    expect(before).toContain("2 Grace 1 Arlington —");
    const after = await textOf(lesson("types-and-nullability").b!);
    expect(after).toContain("2 Grace 0 Arlington —");
    expect(after).toContain("1 Ada 3 London Ring twice");
    expect(after).toContain("3 Linus 1 (pickup) —");
  });

  it("every falsy value triggers ||; ?? and ?. treat null and undefined alike", () => {
    const falsy: unknown[] = [0, "", false, NaN, null, undefined];
    for (const value of falsy) expect(value || "fallback").toBe("fallback");
    const nothing: Array<{ city: string } | null | undefined> = [null, undefined];
    for (const value of nothing) {
      expect(value ?? "fallback").toBe("fallback");
      expect(value?.city).toBeUndefined();
    }
    expect(0 ?? 1).toBe(0);
  });

  it("strict mode: an unchecked optional access is TS18048; a check narrows (cityOf compiles)", () => {
    const files = lesson("types-and-nullability").a;
    expect(typeCodes(files)).toEqual([]);
    const unchecked = replace(files, "orders.ts", "if (order.shipping !== undefined) {\n        return order.shipping.city;\n    }", "return order.shipping.city;");
    expect(typeCodes(unchecked)).toEqual(["TS18048"]);
    expect(checker.check(unchecked)[0]!.message).toContain("possibly 'undefined'");
  });

  it("inference: let total = 0 is a number; a const can't be reassigned, its object can change", () => {
    expect(tsCodes(`let total = 0;\ntotal = "x";\nexport {};`)).toEqual(["TS2322"]);
    expect(tsCodes(`const o = { n: 1 };\no.n = 2;\nexport {};`)).toEqual([]);
    expect(tsCodes(`const o = { n: 1 };\no = { n: 2 };\nexport {};`)).toEqual(["TS2588"]);
  });
});

/* tasks-and-promises ------------------------------------------------------------ */

describe("tasks-and-promises", () => {
  it("the start shows only the user; Promise.all loads the orders too", async () => {
    expect(await textOf(lesson("tasks-and-promises").a, 100)).toBe("Hello, Ada Orders: not loaded");
    expect(await textOf(lesson("tasks-and-promises").b!, 100)).toBe("Hello, Ada Orders: 2");
  });

  it("Promise.all gives a typed tuple", () => {
    const shop = lesson("tasks-and-promises").b!["shop.ts"]!;
    expect(
      tsCodes(`import { loadUser, loadOrders } from "./shop";\nexport async function f() {\n    const [user, orders] = await Promise.all([loadUser(), loadOrders()]);\n    const name: string = user.name;\n    const first: number | undefined = orders[0]?.total;\n    return [name, first];\n}\n`, { "shop.ts": shop }),
    ).toEqual([]);
  });

  it("a promise is already running when you get it (hot, like a Task)", async () => {
    let started = false;
    const work = async (): Promise<number> => {
      started = true;
      await Promise.resolve();
      return 1;
    };
    const promise = work();
    expect(started).toBe(true);
    expect(await promise).toBe(1);
  });

  it("the code after an await runs later, after the caller has moved on", async () => {
    const order: string[] = [];
    const run = async (): Promise<void> => {
      order.push("before await");
      await Promise.resolve();
      order.push("after await");
    };
    const done = run();
    order.push("caller continues");
    await done;
    expect(order).toEqual(["before await", "caller continues", "after await"]);
  });

  it("Promise.all rejects as soon as one fails; allSettled reports every outcome", async () => {
    let slowDone = false;
    const slow = new Promise<string>((resolve) => setTimeout(() => ((slowDone = true), resolve("slow")), 50));
    await expect(Promise.all([slow, Promise.reject(new Error("down"))])).rejects.toThrow("down");
    expect(slowDone).toBe(false);
    const settled = await Promise.allSettled([slow, Promise.reject(new Error("down"))]);
    expect(settled.map((s) => s.status)).toEqual(["fulfilled", "rejected"]);
  });

  it("try/catch around an await catches the rejection", async () => {
    const fail = async (): Promise<void> => {
      throw new Error("nope");
    };
    let caught = "";
    try {
      await fail();
    } catch (error) {
      caught = (error as Error).message;
    }
    expect(caught).toBe("nope");
  });

  it("there's no async void: an async function returns a Promise (TS1064)", () => {
    expect(tsCodes(`export async function save(): void {}`)).toEqual(["TS1064"]);
    expect(tsCodes(`export async function save(): Promise<void> {}`)).toEqual([]);
  });

  it("a forgotten await is not a type error", () => {
    const shop = lesson("tasks-and-promises").b!["shop.ts"]!;
    expect(tsCodes(`import { loadUser } from "./shop";\nexport async function f() {\n    loadUser();\n}\n`, { "shop.ts": shop })).toEqual([]);
  });
});

/* linq-and-arrays --------------------------------------------------------------- */

describe("linq-and-arrays", () => {
  it("filter/reduce/some/find work in the start; the solution's top three are sorted descending", async () => {
    const before = await textOf(lesson("linq-and-arrays").a);
    expect(before).toContain("Open total: 425");
    expect(before).toContain("Any order over 200: true");
    expect(before).toContain("First closed order: Grace");
    expect(before).toMatch(/Top open customers:$/);
    expect(await textOf(lesson("linq-and-arrays").b!)).toContain("Top open customers: Barbara, Ada, Linus");
  });

  it("no deferred execution: map runs immediately and returns a new array", () => {
    let calls = 0;
    const source = [1, 2, 3];
    const mapped = source.map((n) => (calls++, n * 2));
    expect(calls).toBe(3);
    expect(mapped).not.toBe(source);
    expect(mapped).toEqual([2, 4, 6]);
  });

  it("sort() sorts in place, as strings without a comparer; toSorted() returns a copy", () => {
    const numbers = [10, 9, 1];
    const result = numbers.sort();
    expect(result).toBe(numbers);
    expect(numbers).toEqual([1, 10, 9]);
    const original = [10, 9, 1];
    const sorted = original.toSorted((a, b) => a - b);
    expect(sorted).toEqual([1, 9, 10]);
    expect(original).toEqual([10, 9, 1]);
  });

  it("find returns undefined when nothing matches; reduce without a seed throws on an empty array", () => {
    expect([1, 2].find((n) => n > 5)).toBeUndefined();
    expect(() => ([] as number[]).reduce((sum, n) => sum + n)).toThrow(TypeError);
    expect(([] as number[]).reduce((sum, n) => sum + n, 0)).toBe(0);
  });

  it("toSorted type-checks (the tutorial checks with the ES2023 library); with ES2022's it doesn't", () => {
    const source = `export const s = [3, 1].toSorted((a, b) => a - b);\n`;
    expect(tsCodes(source)).toEqual([]);
    mkdirSync(gateDir, { recursive: true });
    const file = path.join(gateDir, "lib-es2022.ts");
    writeFileSync(file, source);
    const withLib = (lib: string[]) =>
      ts
        .getPreEmitDiagnostics(ts.createProgram([file], { lib, strict: true, noEmit: true, types: [], target: ts.ScriptTarget.ES2022 }))
        .map((d) => `TS${d.code}`);
    // TS2550 "Do you need to change your target library?" (+ the comparer's then-untyped parameters).
    expect(withLib(["lib.es2022.d.ts"])[0]).toBe("TS2550");
    expect(withLib(["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"])).toEqual([]);
  });
});

/* structural-typing ------------------------------------------------------------- */

describe("structural-typing", () => {
  it("a Product (no implements) and a plain object are Named; longest works with both", async () => {
    expect(await textOf(lesson("structural-typing").a)).toBe("Hello, Ada! Longest name: Analytical Engine");
    expect(await textOf(lesson("structural-typing").b!)).toBe("Hello, Ada! Hello, Analytical Engine! Hello, Grace! Longest name: Analytical Engine");
  });

  const named = `interface Named { name: string; }\n`;

  it("implements only asks the compiler to check the class early (TS2420)", () => {
    expect(tsCodes(`interface Named { name: string; }`+"\nexport class Dog implements Named { legs = 4; }\n")).toEqual(["TS2420"]);
  });

  it("interfaces don't exist at runtime: instanceof Named and new T() are TS2693", () => {
    expect(tsCodes(`${named}export function f(x: unknown) { return x instanceof Named; }\n`)).toEqual(["TS2693"]);
    expect(tsMessages(`${named}export function f(x: unknown) { return x instanceof Named; }\n`)).toContain("only refers to a type");
    expect(tsCodes(`export function make<T>(): T { return new T(); }\n`)).toEqual(["TS2693"]);
  });

  it("a type guard tests for a shape; instanceof still works for classes", () => {
    expect(tsCodes(`${named}export function isNamed(x: unknown): x is Named {\n    return typeof x === "object" && x !== null && typeof (x as Named).name === "string";\n}\n`)).toEqual([]);
    class Customer {
      constructor(readonly name: string) {}
    }
    expect(new Customer("Ada") instanceof Customer).toBe(true);
    expect({ name: "Ada" } instanceof Customer).toBe(false);
  });

  it("same shape, same type: aliases mix freely, branded types don't", () => {
    expect(tsCodes(`type CustomerId = string;\ntype OrderId = string;\nfunction load(id: CustomerId) { return id; }\nconst order: OrderId = "o-1";\nexport const x = load(order);\n`)).toEqual([]);
    expect(
      tsCodes(`type CustomerId = string & { readonly __brand: "CustomerId" };\ntype OrderId = string & { readonly __brand: "OrderId" };\nfunction load(id: CustomerId) { return id; }\nconst order = "o-1" as OrderId;\nexport const x = load(order);\n`),
    ).toEqual(["TS2345"]);
  });

  it("a fresh object literal with an extra property is TS2353; a variable with one is fine", () => {
    const greet = `${named}function greet(who: Named) { return who.name; }\n`;
    expect(tsCodes(`${greet}export const x = greet({ name: "Grace", age: 36 });\n`)).toEqual(["TS2353"]);
    expect(tsCodes(`${greet}const grace = { name: "Grace", age: 36 };\nexport const x = greet(grace);\n`)).toEqual([]);
  });

  it("JSON is usable as typed data through an interface, no DTO class", () => {
    expect(tsCodes(`interface Order { id: number; }\nconst order: Order = JSON.parse('{"id":1}');\nexport const id: number = order.id;\n`)).toEqual([]);
  });
});

/* properties-and-access --------------------------------------------------------- */

describe("properties-and-access", () => {
  it("the start has no fahrenheit (TS2339, renders undefined); the solution's setter goes through celsius", async () => {
    const a = lesson("properties-and-access").a;
    expect(typeCodes(a)).toEqual(["TS2339", "TS2339"]);
    expect(await textOf(a)).toContain("20 °C · °F"); // undefined renders as nothing
    const start = await mount(a);
    (start.container.querySelector("button") as HTMLElement).click();
    await start.settle();
    expect(start.container.querySelector(".reading")!.textContent).toBe("20 °C · NaN °F");
    start.dispose();
    const m = await mount(lesson("properties-and-access").b!);
    expect(m.container.querySelector(".reading")!.textContent).toBe("20 °C · 68 °F");
    (m.container.querySelector("button") as HTMLElement).click();
    await m.settle();
    expect(m.container.querySelector(".reading")!.textContent).toBe("25 °C · 77 °F");
    m.dispose();
  });

  it("the range check applies to the fahrenheit setter too", async () => {
    const withAttempt = {
      ...lesson("properties-and-access").b!,
      "App.tsazor": `@import { Thermostat } from "./thermostat"\n<p>@result</p>\n@code {\n    result = "";\n    override onInitialized() {\n        try {\n            new Thermostat("x").fahrenheit = 100;\n            this.result = "set";\n        } catch (error) {\n            this.result = (error as Error).name;\n        }\n    }\n}\n`,
    };
    expect(await textOf(withAttempt)).toBe("RangeError");
  });

  it("members are public by default; private/readonly are compile-time checks (TS2341, TS2540)", () => {
    expect(tsCodes(`class A { n = 1; }\nexport const x = new A().n;\n`)).toEqual([]);
    expect(tsCodes(`class A { private n = 1; }\nexport const x = new A().n;\n`)).toEqual(["TS2341"]);
    expect(tsCodes(`class A { readonly n = 1; }\nnew A().n = 2;\nexport {};\n`)).toEqual(["TS2540"]);
    expect(tsCodes(`class A { #n = 1; }\nexport const x = new A().#n;\n`)).toEqual(["TS18013"]);
  });

  it("at runtime, a private field is an ordinary property (JSON.stringify); a #field is invisible", () => {
    class Account {
      private balance = 10;
      #pin = 1234;
      get hasPin(): boolean {
        return this.#pin > 0;
      }
    }
    const account = new Account();
    expect(JSON.stringify(account)).toBe('{"balance":10}');
    expect((account as unknown as Record<string, unknown>).balance).toBe(10);
    expect(Object.keys(account)).toEqual(["balance"]);
    expect(account.hasPin).toBe(true);
  });

  it("inside a class, this. is never optional", () => {
    expect(tsCodes(`class A {\n    n = 1;\n    f() { return n; }\n}\nexport {};\n`)).toEqual(["TS2663"]);
  });
});

/* attributes-and-decorators ----------------------------------------------------- */

describe("attributes-and-decorators", () => {
  it("@logged replaces the methods: the call log fills up", async () => {
    expect(await textOf(lesson("attributes-and-decorators").a)).toBe("2 + 3 = 5, 4 × 5 = 20 Call log");
    expect(await textOf(lesson("attributes-and-decorators").b!)).toBe("2 + 3 = 5, 4 × 5 = 20 Call log add(2, 3) → 5 multiply(4, 5) → 20");
  });

  it("a decorator runs once, when the class is defined — not per instance or call", async () => {
    const files: Files = {
      "count.ts": `export let runs = 0;\nexport let seen = "";\nexport function counted<T>(method: T, context: ClassMethodDecoratorContext): T {\n    runs++;\n    seen = \`\${context.kind}:\${String(context.name)}:\${typeof context.metadata}\`;\n    return method;\n}\n`,
      "thing.ts": `import { counted } from "./count";\nexport class Thing {\n    @counted\n    go(): number { return 1; }\n}\n`,
      "App.tsazor": `@import { Thing } from "./thing"\n@import { runs, seen } from "./count"\n<p>@total @runs @seen</p>\n@code {\n    total = new Thing().go() + new Thing().go() + new Thing().go();\n}\n`,
    };
    expect(typeCodes(files)).toEqual([]);
    // The context carries the name, the kind and a metadata bag (Symbol.metadata: installed by @tsazor/runtime).
    expect(await textOf(files)).toBe("3 1 method:go:object");
  });

  it("decorators aren't valid on parameters or free functions (TS1206)", () => {
    const deco = `function d(value: unknown, _context: unknown) { return value; }\n`;
    expect(tsCodes(`${deco}export class A {\n    m(@d x: number) { return x; }\n}\n`)).toContain("TS1206");
    expect(tsCodes(`${deco}@d\nexport function f() {}\n`)).toContain("TS1206");
  });

  it("@Parameter() and the validation decorators are standard field decorators from @tsazor/runtime", () => {
    expect(
      tsCodes(`import { ComponentBase, Parameter, Required, StringLength } from "@tsazor/runtime";\nexport class Card extends ComponentBase {\n    @Parameter() title = "";\n    @Parameter({ captureUnmatchedValues: true }) rest: Record<string, unknown> = {};\n}\nexport class Signup {\n    @Required() @StringLength(80) name = "";\n}\n`),
    ).toEqual([]);
  });
});

/* namespaces-and-modules -------------------------------------------------------- */

describe("namespaces-and-modules", () => {
  it("the start prints bare numbers; the exported formatter prints amounts", async () => {
    expect(await textOf(lesson("namespaces-and-modules").a)).toBe("Invoice Net 42.5 VAT 8.5 Total 51");
    expect(await textOf(lesson("namespaces-and-modules").b!)).toBe("Invoice Net €42.50 VAT €8.50 Total €51.00");
  });

  it("importing a function that isn't exported is TS2459", () => {
    const files = replace(lesson("namespaces-and-modules").a, "invoice.ts", 'import { VAT_RATE } from "./money";', 'import { VAT_RATE, formatMoney } from "./money";');
    const types = checker.check(files);
    expect(types.map((d) => d.code)).toEqual(["TS2459"]);
    expect(types[0]!.message).toContain("declares 'formatMoney' locally, but it is not exported");
  });

  it("a module's top-level code runs once, however many files import it", async () => {
    const files: Files = {
      "counter.ts": `export const loads: string[] = [];\nloads.push("loaded");\n`,
      "a.ts": `import { loads } from "./counter";\nexport const a = loads.length;\n`,
      "b.ts": `import { loads } from "./counter";\nexport const b = loads.length;\n`,
      "App.tsazor": `@import { a } from "./a"\n@import { b } from "./b"\n@import { loads } from "./counter"\n<p>@a @b @loads.length</p>\n`,
    };
    expect(await textOf(files)).toBe("1 1 1");
  });

  it("import type disappears from the compiled JavaScript", () => {
    const build = buildProject({
      "orders.ts": `export interface Order { id: number; }\n`,
      "x.ts": `import type { Order } from "./orders";\nexport const order: Order = { id: 1 };\n`,
      "App.tsazor": `@import { order } from "./x"\n<p>@order.id</p>\n`,
    });
    const x = Object.values(build.modules).find((m) => m.file === "x.ts")!;
    expect(x.code).not.toContain("orders");
  });
});

/* records-enums-unions ---------------------------------------------------------- */

describe("records-enums-unions", () => {
  it("the typo hides behind string; with the union, Grace's order is on its way", async () => {
    const before = await textOf(lesson("records-enums-unions").a);
    expect(before).toContain("#2 Grace: ❓ Unknown");
    expect(before).toContain("After shipping #1: ❓ Unknown");
    const after = await textOf(lesson("records-enums-unions").b!);
    expect(after).toContain("#2 Grace: 🚚 On its way");
    expect(after).toContain("After shipping #1: 🚚 On its way");
  });

  it("with the union, the typo is TS2678; without default, a fourth status is TS2366", () => {
    const b = lesson("records-enums-unions").b!;
    expect(typeCodes(b)).toEqual([]);
    const typo = replace(b, "orders.ts", 'case "shipped":', 'case "shiped":');
    const types = checker.check(typo);
    expect(types.map((d) => d.code)).toContain("TS2678");
    expect(types.find((d) => d.code === "TS2678")!.message).toContain(`'"shiped"' is not comparable to type 'OrderStatus'`);
    const fourth = replace(b, "orders.ts", '"open" | "shipped" | "delivered"', '"open" | "shipped" | "delivered" | "returned"');
    expect(typeCodes(fourth)).toEqual(["TS2366"]);
  });

  it("objects compare by reference; the spread copy leaves the original alone", () => {
    const a: object = { id: 1 };
    const b: object = { id: 1 };
    expect(a === b).toBe(false);
    const order = { id: 1, status: "open" };
    const shipped = { ...order, status: "shipped" };
    expect(order.status).toBe("open");
    expect(shipped).toEqual({ id: 1, status: "shipped" });
  });

  it("as const: a runtime list and the union type from one declaration", () => {
    const source = `export const STATUSES = ["open", "shipped"] as const;\nexport type OrderStatus = (typeof STATUSES)[number];\n`;
    expect(tsCodes(`${source}export const ok: OrderStatus = "shipped";\n`)).toEqual([]);
    expect(tsCodes(`${source}export const bad: OrderStatus = "lost";\n`)).toEqual(["TS2322"]);
  });

  it("an enum generates JavaScript code; a union type disappears", () => {
    const js = (source: string) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.trim();
    expect(js(`export enum Status { Open, Shipped }`)).toContain('Status[Status["Open"] = 0] = "Open"');
    expect(js(`export type Status = "open" | "shipped";`)).toBe("export {};");
  });
});

/* the-real-traps ---------------------------------------------------------------- */

describe("the-real-traps", () => {
  const files = lesson("the-real-traps");

  it("start: a function callback has no this (TypeError at runtime, TS2683 in the check)", async () => {
    expect(typeCodes(files.a)).toEqual(["TS2683"]);
    expect(checker.check(files.a)[0]!.message).toContain("'this' implicitly has type 'any'");
    expect(await textOf(files.a)).toMatch(/^TypeError: /);
  });

  it("an arrow function keeps this — and then the doubles show: 0.30000000000000004", async () => {
    const arrow = replace(files.a, "basket.ts", "prices.forEach(function (price) {", "prices.forEach((price) => {");
    expect(typeCodes(arrow)).toEqual([]);
    expect(await textOf(arrow)).toMatch(/^Total: 0\.30000000000000004 /);
  });

  it("the solution counts cents: Total: 0.30", async () => {
    expect(await textOf(files.b!)).toMatch(/^Total: 0\.30 /);
  });

  it("the numbers-and-dates list renders 3.5, 3, MAX_SAFE_INTEGER and October 2nd", async () => {
    const text = await textOf(files.b!);
    expect(text).toContain("7 / 2 → 3.5, Math.trunc(7 / 2) → 3");
    expect(text).toContain("Number.MAX_SAFE_INTEGER → 9007199254740991");
    expect(text).toContain("new Date(2026, 9, 2) → Fri Oct 02 2026");
  });

  it("a method passed by name loses its this; an arrow wrapper doesn't", () => {
    class Clock {
      ticks = 0;
      tick(): void {
        this.ticks++;
      }
    }
    const clock = new Clock();
    const byName = clock.tick;
    expect(() => byName()).toThrow(TypeError);
    const wrapped = () => clock.tick();
    wrapped();
    expect(clock.ticks).toBe(1);
  });

  it("@onclick=\"save\" in markup keeps this (the compiler binds it)", async () => {
    const m = await mount({ "App.tsazor": `<button @onclick="save">@saved</button>\n@code {\n    saved = 0;\n    save() {\n        this.saved++;\n    }\n}\n` });
    (m.container.querySelector("button") as HTMLElement).click();
    await m.settle();
    expect(m.container.querySelector("button")!.textContent).toBe("1");
    m.dispose();
  });

  it("number is a double: 0.1 + 0.2, 7 / 2; integers are exact up to MAX_SAFE_INTEGER", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(String(0.1 + 0.2)).toBe("0.30000000000000004");
    expect(7 / 2).toBe(3.5);
    expect(Number.MAX_SAFE_INTEGER).toBe(2 ** 53 - 1);
    expect(Number.MAX_SAFE_INTEGER + 1 === Number.MAX_SAFE_INTEGER + 2).toBe(true);
    expect(10 + 20).toBe(30);
  });

  it("== converts before it compares; x == null matches null and undefined only", () => {
    const zeroString: unknown = "0";
    const empty: unknown = "";
    const zero: unknown = 0;
    expect(zeroString == zero).toBe(true);
    expect(empty == zero).toBe(true);
    expect(zeroString === zero).toBe(false);
    const values: unknown[] = [null, undefined, 0, "", false];
    expect(values.map((v) => v == null)).toEqual([true, true, false, false, false]);
  });

  it("with known types, \"0\" == 0 is already a type error (TS2367)", () => {
    expect(tsCodes(`export const same = "0" == 0;\n`)).toEqual(["TS2367"]);
    expect(tsCodes(`const data: any = JSON.parse("0");\nexport const same = data == "0";\n`)).toEqual([]);
  });

  it("Date: months from 0, mutable, and a date-only string is midnight UTC", () => {
    const date = new Date(2026, 9, 2);
    expect(date.getMonth()).toBe(9);
    expect(date.toDateString()).toBe("Fri Oct 02 2026");
    date.setDate(3);
    expect(date.getDate()).toBe(3);
    expect(new Date("2026-10-02").getTime()).toBe(Date.UTC(2026, 9, 2));
    // In New York (UTC-4 in October), midnight UTC is still October 1st.
    expect(new Date("2026-10-02").toLocaleDateString("en-US", { timeZone: "America/New_York" })).toBe("10/1/2026");
  });

  it("Intl.NumberFormat formats money", () => {
    expect(new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(0.3)).toBe("€0.30");
  });
});
