/**
 * Claims of the lesson texts of Part 3, pinned to the real compiler, runtime
 * and type check — run the way the preview runs them (test/harness.ts: routes
 * from the build's @page manifest, a NavigationManager over an in-memory
 * history, intercepted anchors). Chapter 14: routing — pages, route
 * parameters, NavLink, navigation, query parameters, not found. Chapter 15:
 * forms — EditForm, rule decorators, validation messages, the invalid submit, field classes,
 * validators with context, InputFile. Each `describe` names the lesson whose
 * text makes the claim.
 */
import path from "node:path";
import { rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { RenderError } from "@tsazor/testing";
import { InputFileChangeEventArgs } from "@tsazor/runtime";
import { buildProject, type Files } from "../src/engine/compile-project";
import { TypeChecker } from "../src/engine/type-check";
import { loadTypeEnvironment } from "../build/type-env";
import { loadContent } from "../build/content";
import { mountWritten, writeModules, type Mounted } from "./harness";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gateDir = path.join(appRoot, ".gate", "claims-part3");
const checker = new TypeChecker(loadTypeEnvironment(appRoot));
const lessons = loadContent(path.join(appRoot, "content")).parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.lessons));
const lesson = (slug: string) => lessons.find((candidate) => candidate.slug === slug)!;
let counter = 0;
let lastDir = "";
const live: Mounted[] = [];

afterAll(() => rmSync(gateDir, { recursive: true, force: true }));
// A failing assertion skips dispose() — and a live app keeps its document-level
// click listener, which would intercept (and swallow) the next test's clicks.
afterEach(() => {
  for (const mounted of live.splice(0)) mounted.dispose();
});

/** Compiles (asserting no compile errors) and mounts like the preview. */
async function mount(files: Files, onError?: (error: RenderError) => void): Promise<Mounted> {
  const build = buildProject(files);
  expect(build.diagnostics.filter((d) => d.severity === "error"), JSON.stringify(build.diagnostics)).toEqual([]);
  lastDir = path.join(gateDir, String(counter++));
  writeModules(build, lastDir);
  const mounted = await mountWritten(build, lastDir, onError ? { onError } : {});
  live.push(mounted);
  return mounted;
}
/** A module of the last mounted build (to read statics). */
const moduleOf = async <T,>(file: string): Promise<T> => (await import(pathToFileURL(path.join(lastDir, `${file}.js`)).href)) as T;
const types = (files: Files) => checker.check(files);
const typeCodes = (files: Files): string[] => types(files).map((d) => d.code);
const click = (m: Mounted, selector = "button"): void => (m.container.querySelector(selector) as HTMLElement).click();

/* Chapter 14 — Routing ----------------------------------------------------------------- */

describe("pages", () => {
  const { a, b } = lesson("pages");

  it("the build collects every @page into the route manifest — template and module", () => {
    const build = buildProject(b);
    expect(build.routes).toHaveLength(2);
    expect(build.routes.map((route) => [route.template, route.module])).toEqual(
      expect.arrayContaining([
        ["/", "$app/Home.tsazor"],
        ["/about", "$app/About.tsazor"],
      ]),
    );
  });

  it("an anchor click is intercepted: the router renders the other page and the URL moves (no reload)", async () => {
    const files = { ...b, "About.tsazor": `@page "/about"\n@inject NavigationManager navigation\n<h2>About the bakery</h2>\n<p>@(this.navigation.baseRelativePath)</p>\n` };
    const m = await mount(files);
    expect(m.html()).toContain("The Daily Loaf");
    click(m, "nav a:nth-child(2)");
    await m.settle();
    expect(m.html()).toContain("<h2>About the bakery</h2>");
    expect(m.html()).toContain("<p>about</p>");
    m.dispose();
  });

  it("a URL that matches no route renders the NotFound fragment; the start state hard-codes one page", async () => {
    const broken = { ...b, "App.tsazor": b["App.tsazor"]!.replace('<a href="/about">About</a>', '<a href="/bread">Bread</a>') };
    const m = await mount(broken);
    click(m, "nav a:nth-child(2)");
    await m.settle();
    expect(m.html()).toContain("<p>Nothing here.</p>");
    m.dispose();
    const start = await mount(a);
    expect(start.html()).toContain("The Daily Loaf");
    expect(start.html()).not.toContain("About the bakery");
    start.dispose();
  });
});

describe("route-parameters", () => {
  const { a, b } = lesson("route-parameters");
  const openOrder = async (m: Mounted): Promise<string> => {
    click(m, "nav a:nth-child(2)");
    await m.settle();
    click(m, ".orders a");
    await m.settle();
    const html = m.html();
    m.dispose();
    return html;
  };

  it("{id:int} hands the page a real number; without a @page the router can't find it", async () => {
    const numbered = { ...b, "Order.tsazor": `@page "/orders/{id:int}"\n<h2>Order #@id @(id + 1)</h2>\n\n@code {\n    @Parameter() id = 0;\n}\n` };
    expect(await openOrder(await mount(numbered))).toContain("<h2>Order #101 102</h2>");
    expect(await openOrder(await mount(a))).toContain("<p>Nothing here.</p>");
  });

  it("the route value matches the field case-insensitively", async () => {
    const cased = { ...b, "Order.tsazor": b["Order.tsazor"]!.replace("{id:int}", "{Id:int}") };
    expect(await openOrder(await mount(cased))).toContain("<h2>Order #101</h2>");
  });

  it("a segment that fails the constraint matches nothing", async () => {
    const files = { ...b, "App.tsazor": b["App.tsazor"]!.replace("</nav>", '    <a href="/orders/bread">Bread</a>\n</nav>') };
    const m = await mount(files);
    click(m, "nav a:nth-child(3)");
    await m.settle();
    expect(m.html()).toContain("<p>Nothing here.</p>");
    m.dispose();
  });

  it("an optional segment supplies null; a catch-all swallows slashes", async () => {
    const files: Files = {
      "App.tsazor": `<nav><a href="/page">p</a><a href="/page/7">p7</a><a href="/files/a/b/c.txt">f</a></nav>\n<Router>\n    <Found Context="routeData">\n        <RouteView RouteData="@routeData" />\n    </Found>\n    <NotFound>\n        <p class="nf">?</p>\n    </NotFound>\n</Router>\n`,
      "Page.tsazor": `@page "/page/{n:int?}"\n<p>page: @(n === null ? "none" : n + 1)</p>\n\n@code {\n    @Parameter() n: number | null = null;\n}\n`,
      "Files.tsazor": `@page "/files/{*path}"\n<p>files: @path</p>\n\n@code {\n    @Parameter() path = "";\n}\n`,
    };
    const m = await mount(files);
    click(m, "nav a:nth-child(1)");
    await m.settle();
    expect(m.html()).toContain("<p>page: none</p>");
    click(m, "nav a:nth-child(2)");
    await m.settle();
    expect(m.html()).toContain("<p>page: 8</p>");
    click(m, "nav a:nth-child(3)");
    await m.settle();
    expect(m.html()).toContain("<p>files: a/b/c.txt</p>");
    m.dispose();
  });
});

describe("nav-link", () => {
  const { a, b } = lesson("nav-link");

  it("the matching link gains the active class and aria-current; the home link needs All", async () => {
    const m = await mount(b);
    // "/" on mount: the Home link (Match All) is active from the start.
    expect(m.html()).toContain('<a href="/" class="active" aria-current="page">Home</a>');
    click(m, "nav a:nth-child(2)");
    await m.settle();
    expect(m.html()).toContain('<a href="/orders" class="active" aria-current="page">Orders</a>');
    expect(m.html()).toContain('<a href="/" class="">Home</a>');
    m.dispose();
    // Plain anchors (the start state) never light up.
    const start = await mount(a);
    click(start, "nav a:nth-child(2)");
    await start.settle();
    expect(start.html()).not.toContain('class="active"');
    start.dispose();
  });

  it("a prefix link to / matches everywhere without Match All", async () => {
    const files = {
      ...b,
      "App.tsazor": b["App.tsazor"]!.replace(' Match="@NavLinkMatch.All"', "").replace('@import { NavLinkMatch } from "@tsazor/runtime"\n\n', ""),
    };
    const m = await mount(files);
    click(m, "nav a:nth-child(2)");
    await m.settle();
    expect((m.html().match(/aria-current="page"/g) ?? []).length).toBe(2);
    m.dispose();
  });

  it("prefix matches only at a separator: /ordersabc leaves /orders idle", async () => {
    const files = { ...b, "App.tsazor": b["App.tsazor"]!.replace("</nav>", '    <a href="/ordersabc">x</a>\n</nav>') };
    const m = await mount(files);
    click(m, "nav a:nth-child(4)");
    await m.settle();
    expect(m.html()).toContain("<p>Nothing here.</p>");
    expect(m.html()).not.toContain('class="active"');
    m.dispose();
  });

  it("NavLinkMatch is a value: without the @import the type check reports the missing member", () => {
    const files = { ...b, "App.tsazor": b["App.tsazor"]!.replace('@import { NavLinkMatch } from "@tsazor/runtime"\n\n', "") };
    expect(typeCodes(files)).toContain("TS2339");
  });
});

describe("navigation", () => {
  const { b } = lesson("navigation");

  it("navigateTo walks the router path: the page the URL names", async () => {
    const m = await mount(b);
    click(m, "nav a:nth-child(2)");
    await m.settle();
    click(m, ".orders a");
    await m.settle();
    expect(m.html()).toContain("<h2>Order #101</h2>");
    click(m, "button");
    await m.settle();
    expect(m.html()).toContain("<h2>Orders</h2>");
    m.dispose();
  });

  it("LocationChanged fires on every navigation; a location-changing handler cancels", async () => {
    // Home exists from the start, so it wires its listener before any
    // navigation; the Orders page carries the lock.
    const files = {
      ...b,
      "Home.tsazor": `@page "/"\n@import Orders from "./Orders.tsazor"\n@inject NavigationManager navigation\n<h1>The Daily Loaf</h1>\n\n@code {\n    static log: string[] = [];\n\n    override onInitialized() {\n        this.navigation.addLocationChanged((_sender, event) => Home.log.push(event.location));\n        this.navigation.registerLocationChangingHandler((context) => {\n            if (Orders.locked) context.preventNavigation();\n        });\n    }\n}\n`,
      "Orders.tsazor": `@page "/orders"\n<h2>Orders</h2>\n<button class="lock" @onclick="lock">lock</button>\n\n@code {\n    static locked = false;\n\n    lock() {\n        Orders.locked = true;\n    }\n}\n`,
    };
    const m = await mount(files);
    click(m, "nav a:nth-child(2)");
    await m.settle();
    expect(m.html()).toContain("<h2>Orders</h2>");
    const home = await moduleOf<{ default: { log: string[] } }>("Home.tsazor");
    expect(home.default.log).toHaveLength(1);
    expect(home.default.log[0]).toMatch(/\/orders$/);
    click(m, ".lock");
    await m.settle();
    click(m, "nav a:nth-child(1)");
    await m.settle();
    expect(home.default.log).toHaveLength(1); // no navigation, no event
    expect(m.html()).toContain("<h2>Orders</h2>");
    m.dispose();
  });
});

describe("query-parameters", () => {
  const { a, b } = lesson("query-parameters");

  it("the URL drives the list: ?state=open filters, the bare URL supplies null", async () => {
    const m = await mount(b);
    click(m, "nav a:nth-child(2)");
    await m.settle();
    expect(m.html()).toContain("Jonas");
    click(m, ".filters a:nth-child(2)");
    await m.settle();
    const html = m.html();
    expect(html).toContain("Marta");
    expect(html).not.toContain("Jonas");
    click(m, ".filters a:nth-child(1)");
    await m.settle();
    expect(m.html()).toContain("Jonas");
    m.dispose();
  });

  it("keys match case-insensitively; type converts; multiple arrays, without it the first value wins; absent is null", async () => {
    const files: Files = {
      "App.tsazor": `<nav><a href="/q">bare</a><a href="/q?NUM=3">num</a><a href="/q?tags=a&amp;tags=b&amp;verbose=true">tags</a></nav>\n<Router>\n    <Found Context="routeData">\n        <RouteView RouteData="@routeData" />\n    </Found>\n    <NotFound>\n        <p>?</p>\n    </NotFound>\n</Router>\n`,
      "Q.tsazor": `@page "/q"\n@import { SupplyParameterFromQuery } from "@tsazor/runtime"\n<p>@(num === null ? "null" : num + 1) | @(tags === null ? "null" : tags.join("+")) | @(first === null ? "null" : first) | @(verbose === null ? "null" : verbose ? "on" : "off")</p>\n\n@code {\n    @Parameter() @SupplyParameterFromQuery({ type: "int" }) num: number | null = null;\n    @Parameter() @SupplyParameterFromQuery({ multiple: true }) tags: string[] | null = null;\n    @Parameter() @SupplyParameterFromQuery({ name: "tags" }) first: string | null = null;\n    @Parameter() @SupplyParameterFromQuery({ type: "bool" }) verbose: boolean | null = null;\n}\n`,
    };
    const m = await mount(files);
    click(m, "nav a:nth-child(1)");
    await m.settle();
    expect(m.html()).toContain("<p>null | null | null | null</p>");
    click(m, "nav a:nth-child(2)");
    await m.settle();
    expect(m.html()).toContain("<p>4 | null | null | null</p>");
    click(m, "nav a:nth-child(3)");
    await m.settle();
    expect(m.html()).toContain("<p>null | a+b | a | on</p>");
    m.dispose();
  });

  it("a @SupplyParameterFromQuery field without @Parameter() throws the documented error", async () => {
    const files = { ...b, "Orders.tsazor": b["Orders.tsazor"]!.replace("@Parameter() @SupplyParameterFromQuery()", "@SupplyParameterFromQuery()") };
    const errors: RenderError[] = [];
    const m = await mount(files, (error) => errors.push(error));
    click(m, "nav a:nth-child(2)");
    await m.settle();
    expect(errors.map((e) => (e.error as Error).message)).toContain(
      "The field 'state' on 'Orders' is marked @SupplyParameterFromQuery() but not declared as @Parameter().",
    );
    m.dispose();
  });
});

describe("not-found", () => {
  const { a, b } = lesson("not-found");

  it("an unmatched URL renders the NotFound slot's component; its link home is ordinary navigation", async () => {
    const start = await mount(a);
    click(start, "nav a:nth-child(3)");
    await start.settle();
    expect(start.html()).toContain('<p class="missing">?</p>');
    start.dispose();
    const m = await mount(b);
    click(m, "nav a:nth-child(3)");
    await m.settle();
    expect(m.html()).toContain("Lost in the oven");
    click(m, "main a");
    await m.settle();
    expect(m.html()).toContain("The Daily Loaf");
    m.dispose();
  });

  it("the lost page can name the failed path: baseRelativePath still holds it", async () => {
    const files = {
      ...b,
      "Lost.tsazor": `@inject NavigationManager navigation\n<h2>Lost in the oven</h2>\n<p>There is nothing at <code>/@(this.navigation.baseRelativePath)</code>.</p>\n<p><a href="/">Take me home</a></p>\n`,
    };
    const m = await mount(files);
    click(m, "nav a:nth-child(3)");
    await m.settle();
    expect(m.html()).toContain("There is nothing at <code>/bread</code>.");
    m.dispose();
  });
});

/* Chapter 15 — Forms ------------------------------------------------------------------- */

/** Opens the /bread page (the menu's third link) and waits for the render. */
const openBread = async (m: Mounted): Promise<void> => {
  click(m, "nav a:nth-child(3)");
  await m.settle();
};
/** Sets a value and raises the change event the way the user's edit does. */
const edit = (element: HTMLInputElement | HTMLSelectElement, value: string): void => {
  element.value = value;
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

describe("edit-form", () => {
  const { a, b } = lesson("edit-form");

  it("the submit travels through the form: OnValidSubmit runs, the class lands on the form element", async () => {
    const m = await mount(b);
    await openBread(m);
    expect(m.html()).toContain('<form class="order">');
    expect(m.html()).not.toContain("Reserved:");
    click(m);
    await m.settle();
    // With no rules declared everything is valid — the lesson's point.
    expect(m.html()).toContain("Reserved: 1 × sourdough for .");
    m.dispose();
    // The hand-rolled start state reaches the same text with its own handler.
    const start = await mount(a);
    await openBread(start);
    click(start);
    await start.settle();
    expect(start.html()).toContain("Reserved: 1 × sourdough for .");
    start.dispose();
  });

  it("InputNumber renders a number input; pass-through attributes land on the element", async () => {
    const files = { ...b, "Bread.tsazor": b["Bread.tsazor"]!.replace('<InputText @bind="order.name" />', '<InputText @bind="order.name" placeholder="Your name" />') };
    const m = await mount(files);
    await openBread(m);
    const html = m.html();
    expect(html).toContain('type="number"');
    expect(html).toContain('placeholder="Your name"');
    m.dispose();
  });

  it("OnSubmit takes over entirely: EditForm refuses it next to the routed callbacks", async () => {
    const files = { ...b, "Bread.tsazor": b["Bread.tsazor"]!.replace('OnValidSubmit="handleOrder"', 'OnSubmit="handleOrder" OnValidSubmit="handleOrder"') };
    const errors: RenderError[] = [];
    const m = await mount(files, (error) => errors.push(error));
    // The form only renders on its page — the error comes with it.
    await openBread(m);
    expect(errors.map((e) => (e.error as Error).message)).toContain(
      "When supplying an OnSubmit parameter to EditForm, do not also supply OnValidSubmit or OnInvalidSubmit.",
    );
    m.dispose();
  });
});

describe("rules-on-the-model", () => {
  const { b } = lesson("rules-on-the-model");

  it("with the validator and no message components, an invalid submit is blocked silently", async () => {
    const m = await mount(b);
    await openBread(m);
    click(m);
    await m.settle();
    const html = m.html();
    expect(html).not.toContain("Reserved:");
    expect(html).not.toContain("validation-message");
    edit(m.container.querySelector(".order input") as HTMLInputElement, "Marta");
    await m.settle();
    click(m);
    await m.settle();
    expect(m.html()).toContain("Reserved: 1 × sourdough for Marta.");
    m.dispose();
  });

  it("the validator tag auto-imports like every component; the rule decorators are code and need theirs", async () => {
    // The page carries no @import for DataAnnotationsValidator — and works.
    expect(b["Bread.tsazor"]).not.toContain("@import { DataAnnotationsValidator");
    expect(types(b)).toEqual([]);
    const m = await mount(b);
    await openBread(m);
    click(m);
    await m.settle();
    expect(m.html()).not.toContain("Reserved:");
    m.dispose();
    // The decorators are names in code: without the import the model fails.
    const noDecoratorImport = { ...b, "BreadOrder.ts": b["BreadOrder.ts"]!.replace('import { MaxLength, Range, Required } from "@tsazor/runtime";\n', "") };
    expect(typeCodes(noDecoratorImport)).toContain("TS2552");
  });
});

describe("validation-messages", () => {
  const { b } = lesson("validation-messages");

  it("a failed submit shows the ready-made message and blocks the success paragraph", async () => {
    const m = await mount(b);
    await openBread(m);
    // While the field is valid the message renders nothing at all.
    expect(m.html()).not.toContain("validation-message");
    click(m);
    await m.settle();
    const html = m.html();
    expect(html).toContain('<span class="validation-message">The name field is required.</span>');
    expect(html).not.toContain("Reserved:");
    m.dispose();
  });

  it("Range carries its own ready-made text on its own field", async () => {
    const m = await mount(b);
    await openBread(m);
    edit(m.container.querySelector('.order input[type="number"]') as HTMLInputElement, "20");
    await m.settle();
    click(m);
    await m.settle();
    expect(m.html()).toContain("The field quantity must be between 1 and 10.");
    m.dispose();
  });

  it("stacked rules all speak: two failed rules, two messages for one field", async () => {
    const files = {
      ...b,
      "BreadOrder.ts": b["BreadOrder.ts"]!
        .replace("import { MaxLength, Range, Required }", "import { MinLength, Range, RegularExpression, Required }")
        .replace("@Required() @MaxLength(40)", '@Required() @MinLength(5) @RegularExpression("^[A-Z]+$")')
        .replace('name = "";', 'name = "abc";'),
    };
    const m = await mount(files);
    await openBread(m);
    click(m);
    await m.settle();
    const html = m.html();
    expect(html).toContain("The field name must be a string or array type with a minimum length of '5'.");
    expect(html).toContain("The field name must match the regular expression '^[A-Z]+$'.");
    m.dispose();
  });

  it("a fixed field drops its message and the submit goes through", async () => {
    const m = await mount(b);
    await openBread(m);
    click(m);
    await m.settle();
    expect(m.html()).toContain("The name field is required.");
    edit(m.container.querySelector(".order input") as HTMLInputElement, "Marta");
    await m.settle();
    expect(m.html()).not.toContain("The name field is required.");
    click(m);
    await m.settle();
    expect(m.html()).toContain("Reserved: 1 × sourdough for Marta.");
    m.dispose();
  });

  it("the summary renders nothing while the form is valid", async () => {
    const m = await mount(b);
    await openBread(m);
    expect(m.html()).not.toContain("validation-summary");
    m.dispose();
  });

  it("the summary lists every message after a failed submit", async () => {
    const m = await mount(b);
    await openBread(m);
    click(m);
    await m.settle();
    expect(m.html()).toContain('<ul class="validation-summary"><li>The name field is required.</li></ul>');
    m.dispose();
  });
});

describe("invalid-submit", () => {
  const { b } = lesson("invalid-submit");

  it("OnInvalidSubmit receives the context and counts its fields; the summary lists every message", async () => {
    const m = await mount(b);
    await openBread(m);
    click(m);
    await m.settle();
    const html = m.html();
    expect(html).toContain('<ul class="validation-summary"><li>The name field is required.</li></ul>');
    expect(html).toContain('<p class="status">1 field(s) need a look.</p>');
    expect(html).not.toContain("Reserved:");
    m.dispose();
  });

  it("fix and resubmit — summary and status clear, the reserve goes through", async () => {
    const m = await mount(b);
    await openBread(m);
    click(m);
    await m.settle();
    edit(m.container.querySelector(".order input") as HTMLInputElement, "Marta");
    await m.settle();
    click(m);
    await m.settle();
    const html = m.html();
    expect(html).toContain("Reserved: 1 × sourdough for Marta.");
    expect(html).not.toContain("validation-summary");
    expect(html).not.toContain("need a look");
    m.dispose();
  });
});

describe("field-styles", () => {
  const { b } = lesson("field-styles");

  it("four states, four classes — no page code involved", async () => {
    const m = await mount(b);
    await openBread(m);
    const inputs = () => [...m.container.querySelectorAll(".order input")] as HTMLInputElement[];
    expect(inputs()[0].className).toBe("valid"); // untouched, no messages yet
    click(m);
    await m.settle();
    expect(inputs()[0].className).toBe("invalid"); // failed submit, never touched
    edit(inputs()[1], "20");
    await m.settle();
    expect(inputs()[1].className).toBe("modified invalid");
    edit(inputs()[0], "Marta");
    await m.settle();
    expect(inputs()[0].className).toBe("modified valid");
    m.dispose();
  });

  it("the scope stops at component boundaries: ::deep keeps a scoped anchor before the raw part", () => {
    const build = buildProject(b);
    expect(build.css).toMatch(/label\[b-[0-9a-f]{8}\] input\.invalid/);
    expect(build.css).toMatch(/label\[b-[0-9a-f]{8}\] select\.invalid/);
    expect(build.css).toMatch(/\[b-[0-9a-f]{8}\] \.validation-message/);
    expect(build.css).toMatch(/\.summary\[b-[0-9a-f]{8}\] \.validation-summary/);
  });
});

describe("custom-rules", () => {
  const { b } = lesson("custom-rules");

  it("a context rule fires on the change itself — nobody waits for the submit", async () => {
    const m = await mount(b);
    await openBread(m);
    edit(m.container.querySelector(".order select") as HTMLSelectElement, "rye");
    await m.settle();
    expect(m.html()).toContain("Rye is sold out today — pick another bread.");
    m.dispose();
  });

  it("function rules and model rules coexist — the submit is blocked while either layer objects", async () => {
    const m = await mount(b);
    await openBread(m);
    edit(m.container.querySelector(".order select") as HTMLSelectElement, "rye");
    await m.settle();
    click(m);
    await m.settle();
    const html = m.html();
    expect(html).toContain("The name field is required.");
    expect(html).toContain("Rye is sold out today — pick another bread.");
    expect(html).toContain('<p class="status">2 field(s) need a look.</p>');
    expect(html).not.toContain("Reserved:");
    m.dispose();
  });

  it("pick another bread and the map lets go: the message goes, the submit goes through", async () => {
    const m = await mount(b);
    await openBread(m);
    const select = m.container.querySelector(".order select") as HTMLSelectElement;
    edit(select, "rye");
    await m.settle();
    edit(select, "sourdough");
    await m.settle();
    expect(m.html()).not.toContain("Rye is sold out");
    edit(m.container.querySelector(".order input") as HTMLInputElement, "Marta");
    await m.settle();
    click(m);
    await m.settle();
    expect(m.html()).toContain("Reserved: 1 × sourdough for Marta.");
    m.dispose();
  });
});

describe("attaching-a-file", () => {
  const { b } = lesson("attaching-a-file");

  it("InputFile renders the file input with its pass-through attributes; the guards keep Blazor's messages", async () => {
    const m = await mount(b);
    await openBread(m);
    const html = m.html();
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/*"');
    expect(html).toContain("No picture chosen.");
    m.dispose();
    const file = (name: string) => new File(["x"], name);
    expect(new InputFileChangeEventArgs([file("a.png")]).file.name).toBe("a.png");
    const multi = new InputFileChangeEventArgs([file("a.png"), file("b.png")]);
    expect(() => multi.file).toThrow("More than one file was supplied. Call GetMultipleFiles to receive multiple files.");
    expect(multi.getMultipleFiles()).toHaveLength(2);
    expect(() => multi.getMultipleFiles(1)).toThrow("The maximum number of files accepted is 1, but 2 were supplied.");
  });

  it("the change hands the handler the browser's File", async () => {
    const m = await mount(b);
    await openBread(m);
    const input = m.container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["crumb"], "dream-loaf.png", { type: "image/png" })] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await m.settle();
    expect(m.html()).toContain("dream-loaf.png (5 bytes)");
    m.dispose();
  });
});