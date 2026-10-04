/**
 * Claims of the lesson texts of Part 3, pinned to the real compiler, runtime
 * and type check — run the way the preview runs them (test/harness.ts: routes
 * from the build's @page manifest, a NavigationManager over an in-memory
 * history, intercepted anchors). Chapter 14: routing — pages, route
 * parameters, NavLink, navigation, query parameters, not found, hash routing. Chapter 15:
 * forms — EditForm, rule decorators, validation messages, the invalid submit, field classes,
 * validators with context, InputFile. Chapter 16: auth. Chapter 17: talking
 * to a backend — loading, reloading on new parameters, sending, ProblemDetails,
 * the generated client. Chapter 18: testing — render, parameters, fakes for
 * services and the server, forms. Chapter 19: localization — translated text,
 * switching the language, prices and dates. Each `describe` names the lesson whose text makes the
 * claim.
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
import { mountWritten, runWrittenTests, writeModules, type Mounted } from "./harness";

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

describe("hash-routing", () => {
  const { a, b } = lesson("hash-routing");
  const openOrders = (m: Mounted): string[] => [...m.container.querySelectorAll(".orders li")].map((li) => li.textContent ?? "");
  /** Clicks `selector`; true when the app took the click over (a route), false when the browser would load a document. */
  const clickIsRoute = (m: Mounted, selector: string): boolean => {
    let routed = false;
    // Registered after the NavigationManager's listener, so it sees its decision; then stops the real load.
    const after = (event: Event): void => {
      routed = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", after);
    (m.container.querySelector(selector) as HTMLElement).click();
    document.removeEventListener("click", after);
    return routed;
  };

  it("the start routes by path: NavLink renders /orders", async () => {
    const m = await mount(a);
    expect(m.container.querySelector("nav a:nth-child(2)")?.getAttribute("href")).toBe("/orders");
  });

  it("hash mode: NavLink renders #/ links by itself, the #/ filter links route — query included", async () => {
    expect(types(b)).toEqual([]);
    const m = await mount(b);
    expect([...m.container.querySelectorAll("nav a")].map((link) => link.getAttribute("href"))).toEqual(["#/", "#/orders", "#/bread"]);
    click(m, "nav a:nth-child(2)");
    await m.settle();
    expect(clickIsRoute(m, ".filters a:nth-child(2)")).toBe(true);
    await m.settle();
    expect(openOrders(m)).toEqual(["#101 Marta (open)", "#103 Bea (open)"]);
  });

  it("only #/ links are routes: an unchanged /orders?state=open would load a new document", async () => {
    const m = await mount({ ...b, "Orders.tsazor": a["Orders.tsazor"]! });
    click(m, "nav a:nth-child(2)");
    await m.settle();
    expect(clickIsRoute(m, ".filters a:nth-child(2)")).toBe(false);
  });

  it("the lost page's #/ link leads home", async () => {
    const m = await mount(b);
    click(m, "nav a:nth-child(3)");
    await m.settle();
    expect(m.html()).toContain("Lost in the oven");
    click(m, "main a");
    await m.settle();
    expect(m.html()).toContain("The Daily Loaf");
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
/* Chapter 16 — Auth -------------------------------------------------------------------- */

describe("signing-in", () => {
  const { a, b } = lesson("signing-in");

  it("Program.ts registers one provider under both keys — it type-checks without a cast", () => {
    expect(types(a)).toEqual([]);
    expect(types(b)).toEqual([]);
  });

  it("the start: Sign in calls an empty method — the header doesn't change", async () => {
    const m = await mount(a);
    expect(m.html()).toContain(">Sign in</button>");
    click(m, ".user button");
    await m.settle();
    expect(m.html()).toContain(">Sign in</button>");
    expect(m.html()).not.toContain("Hi, ");
  });

  it("the solution: notify, and the header switches both ways", async () => {
    const m = await mount(b);
    click(m, ".user button");
    await m.settle();
    expect(m.html()).toContain("Hi, Marta");
    expect(m.html()).toContain(">Sign out</button>");
    click(m, ".user button");
    await m.settle();
    expect(m.html()).toContain(">Sign in</button>");
  });

  it("without the notification the header misses the sign-in", async () => {
    const files = { ...b, "BakeryAuth.ts": b["BakeryAuth.ts"]!.replace("this.notifyAuthenticationStateChanged(this.current);", "") };
    const m = await mount(files);
    click(m, ".user button");
    await m.settle();
    expect(m.html()).not.toContain("Hi, Marta");
  });
});

describe("authorize-view", () => {
  const { b } = lesson("authorize-view");

  it("Authorized / NotAuthorized switch with the provider's notification", async () => {
    expect(types(b)).toEqual([]);
    const m = await mount(b);
    expect(m.html()).toContain("Sign in to see your usual order.");
    click(m, ".user button");
    await m.settle();
    expect(m.html()).toContain("Welcome back, Marta! Your usual sourdough is waiting.");
    expect(m.html()).not.toContain("Sign in to see");
  });

  it("the simplest form: content without sections shows to signed-in users, with context", async () => {
    const files = {
      ...b,
      "Home.tsazor": '@page "/"\n<AuthorizeView>\n    <p class="welcome">Welcome back, @context.user.name!</p>\n</AuthorizeView>\n',
    };
    expect(types(files)).toEqual([]);
    const m = await mount(files);
    expect(m.html()).not.toContain("welcome");
    click(m, ".user button");
    await m.settle();
    expect(m.html()).toContain("Welcome back, Marta!");
  });
});

describe("roles", () => {
  const { b } = lesson("roles");
  const signInAs = (m: Mounted, index: 1 | 2): void => click(m, `.user button:nth-of-type(${index})`);

  it("AuthorizeView Roles shows the link to bakers only", async () => {
    expect(types(b)).toEqual([]);
    const m = await mount(b);
    expect(m.html()).not.toContain('href="/orders"');
    signInAs(m, 1);
    await m.settle();
    expect(m.html()).toContain("Hi, Marta");
    expect(m.html()).not.toContain('href="/orders"');
    click(m, ".user button");
    await m.settle();
    signInAs(m, 2);
    await m.settle();
    expect(m.html()).toContain("Hi, Bea");
    expect(m.html()).toContain('href="/orders"');
  });

  it("Roles takes a comma-separated list; one role is enough", async () => {
    const files = { ...b, "App.tsazor": b["App.tsazor"]!.replace('Roles="baker"', 'Roles="owner, baker"') };
    const m = await mount(files);
    signInAs(m, 2);
    await m.settle();
    expect(m.html()).toContain('href="/orders"');
  });
});

describe("protected-pages", () => {
  const { a, b } = lesson("protected-pages");

  it("the start: hiding the link doesn't protect the page", async () => {
    const m = await mount(a);
    click(m, ".staff a");
    await m.settle();
    expect(m.html()).toContain("#101 Marta");
  });

  it("@authorize + AuthorizeRouteView: denied for anonymous and for Marta, the list for Bea — live on sign-in", async () => {
    expect(types(b)).toEqual([]);
    const m = await mount(b);
    click(m, ".staff a");
    await m.settle();
    expect(m.html()).toContain("Bakers only");
    expect(m.html()).not.toContain("#101 Marta");
    click(m, ".user button:nth-of-type(1)");
    await m.settle();
    expect(m.html()).toContain("Bakers only");
    click(m, ".user button");
    await m.settle();
    click(m, ".user button:nth-of-type(2)");
    await m.settle();
    expect(m.html()).not.toContain("Bakers only");
    expect(m.html()).toContain("#101 Marta");
  });

  it("a bare @authorize means signed-in users only", async () => {
    const files = { ...b, "Orders.tsazor": b["Orders.tsazor"]!.replace('@authorize({ roles: ["baker"] })', "@authorize") };
    const m = await mount(files);
    click(m, ".staff a");
    await m.settle();
    expect(m.html()).toContain("Bakers only");
    click(m, ".user button:nth-of-type(1)");
    await m.settle();
    expect(m.html()).toContain("#101 Marta");
  });
});

describe("the-user-in-code", () => {
  const { b } = lesson("the-user-in-code");
  const nameInput = (m: Mounted) => m.container.querySelector(".order input") as HTMLInputElement;

  it("the cascaded state prefills the name after sign-in", async () => {
    expect(types(b)).toEqual([]);
    const m = await mount(b);
    click(m, ".user button");
    await m.settle();
    click(m, "nav a:nth-child(2)");
    await m.settle();
    expect(nameInput(m).value).toBe("Marta");
  });

  it("onParametersSet runs again when the user changes — signing in on the form fills it", async () => {
    const m = await mount(b);
    click(m, "nav a:nth-child(2)");
    await m.settle();
    expect(nameInput(m).value).toBe("");
    click(m, ".user button");
    await m.settle();
    expect(nameInput(m).value).toBe("Marta");
  });

  it("a typed name is kept", async () => {
    const m = await mount(b);
    click(m, "nav a:nth-child(2)");
    await m.settle();
    edit(nameInput(m), "Jonas");
    await m.settle();
    click(m, ".user button");
    await m.settle();
    expect(nameInput(m).value).toBe("Jonas");
  });
});

/* Chapter 17 — Talking to a backend ----------------------------------------------------- */

/** The in-memory server answers after 300 ms ("the network"). */
const SERVER = 400;
/** Signs in as baker (the last header button) and opens Orders (the menu's third link). */
const openOrdersAsBaker = async (m: Mounted): Promise<void> => {
  click(m, ".user button:last-of-type");
  await m.settle();
  click(m, "nav a:nth-child(3)");
  await m.settle();
};
const orderLines = (m: Mounted): string[] => [...m.container.querySelectorAll(".orders li")].map((li) => li.textContent ?? "");
/** Signs in as Marta, opens Bread, orders `quantity` × `bread` and waits for the server. */
const reserve = async (m: Mounted, bread?: string, quantity?: number): Promise<void> => {
  click(m, ".user button");
  await m.settle();
  click(m, "nav a:nth-child(2)");
  await m.settle();
  if (bread) edit(m.container.querySelector(".order select") as HTMLSelectElement, bread);
  if (quantity) edit(m.container.querySelector(".order input[type=number]") as HTMLInputElement, String(quantity));
  await m.settle();
  click(m, ".order button[type=submit]");
  await m.settle(SERVER);
};

describe("from-the-server", () => {
  const { a, b } = lesson("from-the-server");

  it("the start: three orders typed into the page", async () => {
    const m = await mount(a);
    await openOrdersAsBaker(m);
    expect(orderLines(m)).toHaveLength(3);
  });

  it("the solution: Loading… until the answer, then five orders — and nothing goes over the network", async () => {
    expect(types(b)).toEqual([]);
    const network = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error("the network was used"));
    try {
      const m = await mount(b);
      click(m, ".user button:last-of-type");
      await m.settle();
      click(m, "nav a:nth-child(3)");
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(m.html()).toContain("Loading…");
      await m.settle(SERVER);
      expect(m.html()).not.toContain("Loading…");
      expect(orderLines(m)).toEqual(["#101 Marta (open)", "#102 Jonas (picked-up)", "#103 Bea (open)", "#104 Omar (open)", "#105 Lena (picked-up)"]);
    } finally {
      globalThis.fetch = network;
    }
  });
});

describe("when-parameters-change", () => {
  const { a, b } = lesson("when-parameters-change");

  it("the start: Open keeps the page — onInitialized doesn't run again, the list stays", async () => {
    const m = await mount(a);
    await openOrdersAsBaker(m);
    await m.settle(SERVER);
    click(m, ".filters a:nth-child(2)");
    await m.settle(SERVER);
    expect(orderLines(m)).toHaveLength(5);
  });

  it("the solution: onParametersSet asks the server again — only the open orders come back", async () => {
    expect(types(b)).toEqual([]);
    const m = await mount(b);
    await openOrdersAsBaker(m);
    await m.settle(SERVER);
    click(m, ".filters a:nth-child(2)");
    await m.settle(SERVER);
    expect(orderLines(m)).toEqual(["#101 Marta (open)", "#103 Bea (open)", "#104 Omar (open)"]);
    click(m, ".filters a:nth-child(1)");
    await m.settle(SERVER);
    expect(orderLines(m)).toHaveLength(5);
  });
});

describe("sending-data", () => {
  const { b } = lesson("sending-data");

  it("the server saves the order and answers with it — the order is on the bakers' list", async () => {
    expect(types(b)).toEqual([]);
    const m = await mount(b);
    await reserve(m);
    expect(m.container.querySelector(".success")?.textContent).toBe("Reserved as order #106: 1 × sourdough for Marta.");
    click(m, ".user button"); // Sign out
    await m.settle();
    await openOrdersAsBaker(m);
    await m.settle(SERVER);
    expect(orderLines(m)).toContain("#106 Marta (open)");
  });
});

describe("when-the-server-says-no", () => {
  const { a, b } = lesson("when-the-server-says-no");

  it("the start: the refusal is an uncaught TsazorHttpError carrying the ProblemDetails", async () => {
    const errors: RenderError[] = [];
    const m = await mount(a, (error) => errors.push(error));
    await reserve(m, "ciabatta", 5);
    expect(m.container.querySelector(".success, .status")).toBeNull();
    const error = errors.map((e) => e.error).find((e) => e instanceof Error && e.name === "TsazorHttpError") as { status: number; body: unknown } | undefined;
    expect(error?.status).toBe(409);
    expect(error?.body).toEqual({ type: "https://bakery.example/problems/sold-out", title: "Not enough bread", status: 409, detail: "Only 2 ciabatta left today." });
  });

  it("the solution shows the detail; two ciabatta still work", async () => {
    expect(types(b)).toEqual([]);
    const m = await mount(b);
    await reserve(m, "ciabatta", 5);
    expect(m.container.querySelector(".status")?.textContent).toBe("Only 2 ciabatta left today.");
    edit(m.container.querySelector(".order input[type=number]") as HTMLInputElement, "2");
    await m.settle();
    click(m, ".order button[type=submit]");
    await m.settle(SERVER);
    expect(m.container.querySelector(".status")).toBeNull();
    expect(m.container.querySelector(".success")?.textContent).toContain("2 × ciabatta");
  });

  it("error.body is unknown — reading .detail directly is a type error", () => {
    const files = { ...b, "Bread.tsazor": b["Bread.tsazor"]!.replace("asProblemDetails(error.body)?.detail", "error.body.detail") };
    expect(typeCodes(files)).toContain("TS18046");
  });
});

describe("a-typed-client", () => {
  const { b } = lesson("a-typed-client");

  it("bakery.ts and models.ts are exactly what the generator writes for the bakery's OpenAPI document", async () => {
    const { generateClient } = await import("@tsazor/dotnet/generator");
    const { readFileSync } = await import("node:fs");
    const document = JSON.parse(readFileSync(path.join(appRoot, "test", "fixtures", "bakery.openapi.json"), "utf8"));
    const files = Object.fromEntries(generateClient(document, { clientName: "BakeryClient" }).files.map((file) => [file.path, file.content]));
    expect(Object.keys(files).sort()).toEqual(["bakery.ts", "models.ts"]);
    expect(b["bakery.ts"]).toBe(files["bakery.ts"]);
    expect(b["models.ts"]).toBe(files["models.ts"]);
  });

  it("the client returns the refusal instead of throwing; problemMessage picks the detail", async () => {
    expect(types(b)).toEqual([]);
    const errors: RenderError[] = [];
    const m = await mount(b, (error) => errors.push(error));
    await reserve(m, "ciabatta", 5);
    expect(errors).toEqual([]);
    expect(m.container.querySelector(".status")?.textContent).toBe("Only 2 ciabatta left today.");
  });

  it("a body that doesn't fit NewOrder is a type error", () => {
    const files = { ...b, "Bread.tsazor": b["Bread.tsazor"]!.replace("createOrder(this.order)", 'createOrder({ name: "Marta", bread: "rye" })') };
    expect(typeCodes(files)).toContain("TS2345");
  });
});

/* Chapter 18 — Testing ------------------------------------------------------------------ */

/** Runs a lesson project's tests as the preview does. */
const testReport = async (files: Files) => {
  const build = buildProject(files);
  expect(build.diagnostics.filter((d) => d.severity === "error"), JSON.stringify(build.diagnostics)).toEqual([]);
  const dir = path.join(gateDir, String(counter++));
  writeModules(build, dir);
  return runWrittenTests(build, dir);
};

describe("parameters-in-tests", () => {
  const { b } = lesson("parameters-in-tests");

  it("parameters are typed: a misspelled name and a wrong type are errors before the test runs", () => {
    expect(types(b)).toEqual([]);
    const misspelled = { ...b, "PriceTag.test.ts": b["PriceTag.test.ts"]!.replace("{ cents: 340 }", "{ cent: 340 }") };
    expect(typeCodes(misspelled)).toContain("TS2561"); // "… Did you mean 'cents'?"
    const wrongType = { ...b, "PriceTag.test.ts": b["PriceTag.test.ts"]!.replace("{ cents: 340 }", '{ cents: "340" }') };
    expect(typeCodes(wrongType)).toContain("TS2322");
  });
});

describe("fakes-for-services", () => {
  const { a, b } = lesson("fakes-for-services");

  it("the start fails with the missing service's name", async () => {
    expect(await testReport(a)).toEqual([{ name: "OpenSign > is open at eight in the morning", passed: false, error: "Service not registered: BakeryClock" }]);
  });

  it("a plain object with now() is accepted as a BakeryClock; the fake decides the answer", async () => {
    expect(types(b)).toEqual([]);
    const report = await testReport(b);
    expect(report.map((result) => result.passed)).toEqual([true, true]);
  });
});

describe("faking-the-server", () => {
  const { b } = lesson("faking-the-server");

  it("the tests pass without the network", async () => {
    expect(types(b)).toEqual([]);
    const network = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error("the network was used"));
    try {
      const report = await testReport(b);
      expect(report.map((result) => [result.name, result.passed])).toEqual([
        ["TodaysBread > lists today's breads", true],
        ["TodaysBread > says so when the server fails", true],
      ]);
    } finally {
      globalThis.fetch = network;
    }
  });
});

describe("testing-a-form", () => {
  const { b } = lesson("testing-a-form");

  it("change + the submit button run the form's rules; the message is the rule's own", async () => {
    const report = await testReport(b);
    expect(report.every((result) => result.passed)).toBe(true);
  });
});

/* Chapter 19 — Localization ------------------------------------------------------------- */

describe("translated-text", () => {
  const { b } = lesson("translated-text");

  it("a missing translation falls back to the default language, then to the key — never an error", async () => {
    const texts = b["Texts.ts"]!.replace('    Greeting: "Guten Morgen, {name}!",\n', "");
    const files = {
      ...b,
      "Texts.ts": texts,
      "App.tsazor": b["App.tsazor"]!.replace('<h1>@L.get("Title")</h1>', '<h1>@L.get("Title")</h1><p class="missing">@L.get("Nowhere")</p>'),
      "Program.ts": b["Program.ts"]!.replace('defaultCulture: "en-US"', 'defaultCulture: "de-DE"').replace('{ "en-US": english, "de-DE": german }', '{ "de-DE": german, "en-US": english }'),
    };
    expect(texts).not.toContain("Guten Morgen");
    const warn = console.warn;
    console.warn = () => {};
    try {
      const m = await mount(files);
      // German is the default here; its table lacks Greeting, and nothing has Nowhere.
      expect(m.container.querySelector("h1")?.textContent).toBe("Das tägliche Brot");
      expect(m.container.querySelector(".missing")?.textContent).toBe("Nowhere");
    } finally {
      console.warn = warn;
    }
  });
});

describe("switching-the-language", () => {
  const { a, b } = lesson("switching-the-language");

  it("the start's buttons do nothing; the solution re-renders the page without an explicit render call", async () => {
    const start = await mount(a);
    click(start, ".languages button:nth-child(2)");
    await start.settle();
    expect(start.container.querySelector("h1")?.textContent).toBe("The Daily Loaf");
    start.dispose();
    const m = await mount(b);
    click(m, ".languages button:nth-child(2)");
    await m.settle();
    expect(m.container.querySelector("h1")?.textContent).toBe("Das tägliche Brot");
    expect(m.container.querySelector(".greeting")?.textContent).toBe("Guten Morgen, Marta!");
    expect(b["App.tsazor"]).not.toMatch(/stateHasChanged|observe\(/);
  });

  it("setExplicit (the user's choice) wins over a profile's suggestion later", async () => {
    const { CultureService } = await import("@tsazor/runtime");
    const culture = new CultureService("en-US");
    culture.setExplicit("de-DE");
    expect(culture.setFromProfile("fr-FR")).toBe(false);
    expect(culture.current.name).toBe("de-DE");
  });
});

describe("prices-and-dates", () => {
  const { a, b } = lesson("prices-and-dates");
  const shown = (m: Mounted, selector: string) => (m.container.querySelector(selector)?.textContent ?? "").replace(/ /g, " ");

  it("the start keeps €3.40 and 2026-10-05 in German", async () => {
    const m = await mount(a);
    click(m, ".languages button:nth-child(2)");
    await m.settle();
    expect(shown(m, ".price")).toBe("€3.40");
    expect(shown(m, ".baked")).toBe("Gebacken am 2026-10-05");
  });

  it("formatted with the culture: €3.40 / October 5, 2026 in English, 3,40 € / 5. Oktober 2026 in German", async () => {
    const m = await mount(b);
    expect(shown(m, ".price")).toBe("€3.40");
    expect(shown(m, ".baked")).toBe("Baked on October 5, 2026");
    click(m, ".languages button:nth-child(2)");
    await m.settle();
    expect(shown(m, ".price")).toBe("3,40 €");
    expect(shown(m, ".baked")).toBe("Gebacken am 5. Oktober 2026");
    expect(m.instance.price).toBe(3.4);
  });
});
