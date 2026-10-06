/**
 * Claims of the lesson texts of Part 2 (chapters 8–14: reusing content,
 * cascading values, services, element references, special components,
 * organizing code, attachments), pinned to the real compiler, runtime and type check —
 * run the way the preview runs them (test/harness.ts). Each `describe`
 * names the lesson whose text makes the claim.
 */
import path from "node:path";
import { rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { render, ServiceCollection, type RenderError } from "@tsazor/testing";
import { buildProject, type Files } from "../src/engine/compile-project";
import { TypeChecker } from "../src/engine/type-check";
import { loadTypeEnvironment } from "../build/type-env";
import { loadContent } from "../build/content";
import { mountWritten, writeModules, type Mounted } from "./harness";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gateDir = path.join(appRoot, ".gate", "claims-part2");
const checker = new TypeChecker(loadTypeEnvironment(appRoot));
const lessons = loadContent(path.join(appRoot, "content")).parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.lessons));
const lesson = (slug: string) => lessons.find((candidate) => candidate.slug === slug)!;
let counter = 0;
let lastDir = "";

afterAll(() => rmSync(gateDir, { recursive: true, force: true }));

/** Compiles (asserting no compile errors) and mounts like the preview. */
async function mount(files: Files, onError?: (error: RenderError) => void): Promise<Mounted> {
  const build = buildProject(files);
  expect(build.diagnostics.filter((d) => d.severity === "error"), JSON.stringify(build.diagnostics)).toEqual([]);
  lastDir = path.join(gateDir, String(counter++));
  writeModules(build, lastDir);
  return mountWritten(build, lastDir, onError ? { onError } : {});
}
/** A module of the last mounted build (to read statics, stores, …). */
const moduleOf = async <T,>(file: string): Promise<T> => (await import(pathToFileURL(path.join(lastDir, `${file}.js`)).href)) as T;

const app = (markup: string, code = ""): Files => ({ "App.tsazor": `${markup}\n@code {\n${code}\n}\n` });
const codes = (files: Files): string[] => buildProject(files).diagnostics.map((d) => `${d.severity}:${d.code}`);
const messages = (files: Files): string => buildProject(files).diagnostics.map((d) => `${d.code} ${d.message}`).join("\n");
const types = (files: Files) => checker.check(files);
const typeCodes = (files: Files): string[] => types(files).map((d) => d.code);
const click = (m: Mounted, selector = "button"): void => (m.container.querySelector(selector) as HTMLElement).click();
const RF = `@import type { RenderFragment } from "@tsazor/runtime"\n`;
const card = `${RF}<div class="card"><h2>@title</h2>@childContent</div>\n@code {\n    @Parameter() title = "";\n    @Parameter() childContent?: RenderFragment;\n}\n`;

/* Chapter 8 — Reusing content ------------------------------------------------------ */

describe("child-content", () => {
  it("element content goes to childContent; without the parameter it's TZS025", async () => {
    const m = await mount(lesson("child-content").b!);
    expect(m.html()).toContain('<h2>Did you know?</h2><p>An octopus has <strong>three</strong> hearts.</p>');
    m.dispose();
    const files = { ...lesson("child-content").a, "App.tsazor": `<Card title="x"><p>y</p></Card>\n` };
    expect(codes(files)).toEqual(["error:TZS025"]);
    expect(messages(files)).toContain("Component 'Card' does not have a parameter 'ChildContent': it takes no element content.");
  });

  it("the content belongs to the parent: its members, its re-render, its scope — not the card's", async () => {
    const files = {
      "App.tsazor": `<Card title="t"><button @onclick="() => n++">@name @n</button></Card>\n@code {\n    name = "app";\n    n = 0;\n}\n`,
      "Card.tsazor": card,
      "Card.tsazor.css": "button { color: red; }",
    };
    const m = await mount(files);
    click(m);
    await m.settle();
    expect(m.html()).toContain("<button>app 1</button>");
    // The card's scope attribute is on the card's own elements only.
    const scoped = m.container.innerHTML;
    const scope = /<div [^>]*\b(b-[0-9a-f]{8})=""/.exec(scoped)![1]!;
    expect(scoped).not.toContain(`<button ${scope}`);
    m.dispose();
  });

  it("narrowing from @if doesn't reach deferred child content; a local does", () => {
    const narrowed = (body: string) => ({ "App.tsazor": `@if (user) {\n${body}\n}\n@code {\n    user?: { name: string } = { name: "Ada" };\n}\n`, "Card.tsazor": card });
    const lost = types(narrowed(`    <Card title="Profile">\n        <p>@user.name</p>\n    </Card>`));
    expect(lost.map((d) => `${d.line} ${d.code} ${d.message}`)).toEqual(["3 TS2532 Object is possibly 'undefined'."]);
    expect(typeCodes(narrowed(`    const current = user;\n    <Card title="Profile">\n        <p>@current.name</p>\n    </Card>`))).toEqual([]);
  });
});

describe("named-fragments", () => {
  const panel = lesson("named-fragments").b!["Panel.tsazor"]!;

  it("each element sets its fragment; an unset footer is left out", async () => {
    const m = await mount(lesson("named-fragments").b!);
    expect(m.html()).toMatch(/<header>\s*Weekly report\s*<\/header>/);
    expect(m.html()).toContain("<footer><button>Export</button></footer>");
    m.dispose();
    const without = await mount({ "App.tsazor": `<Panel><Header>H</Header><ChildContent><p>b</p></ChildContent></Panel>`, "Panel.tsazor": panel });
    expect(without.html()).not.toContain("<footer>");
    without.dispose();
  });

  it("loose content next to parts is TZS027; a part twice or also as attribute TZS028; an unknown part TZS025 with a suggestion", () => {
    const at = (markup: string) => ({ "App.tsazor": markup, "Panel.tsazor": panel });
    expect(codes(at(`<Panel><Header>H</Header><p>loose</p></Panel>`))).toEqual(["error:TZS027"]);
    expect(messages(at(`<Panel><Header>H</Header><p>loose</p></Panel>`))).toContain("wrap the rest in '<ChildContent>…</ChildContent>'");
    expect(codes(at(`<Panel><Header>H</Header><Header>I</Header></Panel>`))).toEqual(["error:TZS028"]);
    expect(codes(at(`<Panel header="@x"><Header>H</Header></Panel>\n@code {\n    x = null;\n}`))).toContain("error:TZS028");
    expect(codes(at(`<Panel><Headr>H</Headr></Panel>`))).toContain("error:TZS025");
    expect(messages(at(`<Panel><Headr>H</Headr></Panel>`))).toContain("Did you mean 'Header'?");
  });
});

describe("templated-components", () => {
  const { a, b } = lesson("templated-components");

  it("the start renders [object Object] and the check reports TS2345 on @item", async () => {
    const m = await mount(a);
    expect(m.html()).toContain("<li>[object Object]</li>");
    m.dispose();
    expect(types(a).map((d) => `${d.file}:${d.line} ${d.code}`)).toEqual(["List.tsazor:5 TS2345"]);
  });

  it("the template renders each item; TItem is inferred, so a typo in the context is TS2551", async () => {
    const m = await mount(b);
    expect(m.html()).toContain("<strong>Ada</strong> · <a href=\"mailto:ada@example.com\">ada@example.com</a>");
    m.dispose();
    const typo = { ...b, "App.tsazor": b["App.tsazor"]!.replace("@todo.title", "@todo.titel") };
    const found = types(typo);
    expect(found.map((d) => d.code)).toEqual(["TS2551"]);
    expect(found[0]!.message).toContain("Did you mean 'title'?");
  });

  it("an explicit TItem attribute works; without Context the argument is `context`; childContent can be the template", async () => {
    const list = b["List.tsazor"]!;
    const explicit = {
      "App.tsazor": `@import type { Todo } from "./todo"\n<List TItem="Todo" items="@todos">\n    <ItemTemplate>@context.title</ItemTemplate>\n</List>\n@code {\n    todos: Todo[] = [{ title: "a" }];\n}\n`,
      "List.tsazor": list,
      "todo.ts": "export interface Todo { title: string }\n",
    };
    expect(typeCodes(explicit)).toEqual([]);
    expect(typeCodes({ ...explicit, "App.tsazor": explicit["App.tsazor"].replace("@context.title", "@context.titel") })).toEqual(["TS2551"]);
    const m = await mount(explicit);
    expect(m.html()).toContain("<li>a</li>");
    m.dispose();
    const asChild = {
      "App.tsazor": `<List items="@todos" Context="todo"><b>@todo.title</b></List>\n@code {\n    todos = [{ title: "x" }];\n}\n`,
      "List.tsazor": `${RF}@typeparam TItem\n<ul>\n    @foreach (const item of items) {\n        <li>@childContent?.(item)</li>\n    }\n</ul>\n@code {\n    @Parameter() items: TItem[] = [];\n    @Parameter() childContent?: (item: TItem) => RenderFragment;\n}\n`,
    };
    expect(typeCodes(asChild)).toEqual([]);
    const c = await mount(asChild);
    expect(c.html()).toBe("<ul><li><b>x</b></li></ul>");
    c.dispose();
  });

  it("nested templates with one context name are TZS029; constraints are TS syntax, `where` is TZS021", () => {
    const list = b["List.tsazor"]!;
    const nested = { "App.tsazor": `<List items="@rows"><ItemTemplate><List items="@context"><ItemTemplate>@context</ItemTemplate></List></ItemTemplate></List>\n@code {\n    rows = [["a"]];\n}\n`, "List.tsazor": list };
    expect(codes(nested)).toContain("error:TZS029");
    expect(messages(nested)).toContain('Context="another_name"');
    expect(codes({ "App.tsazor": "@typeparam TItem extends { id: string }\n<p>x</p>" })).toEqual([]);
    expect(codes({ "App.tsazor": "@typeparam TItem where TItem : class\n<p>x</p>" })).toContain("error:TZS021");
  });
});

/* Chapter 9 — Cascading values ------------------------------------------------------- */

describe("cascading-values", () => {
  const { a, b } = lesson("cascading-values");

  it("the consumer updates while the component in between doesn't re-render; without a cascade the initializer applies", async () => {
    const files = { ...b, "Toolbar.tsazor": `<nav class="toolbar"><ThemedButton label="Save" /></nav>\n@code {\n    static renders = 0;\n    override onAfterRender() { Toolbar.renders++; }\n}\n` };
    const m = await mount(files);
    const toolbar = await moduleOf<{ default: { renders: number } }>("Toolbar.tsazor");
    expect(m.html()).toContain('class="themed light"');
    const before = toolbar.default.renders;
    const box = m.container.querySelector("input") as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    await m.settle();
    expect(m.html()).toContain('class="themed dark"');
    expect(toolbar.default.renders).toBe(before);
    m.dispose();
    const start = await mount(a);
    expect(start.html()).toContain('class="themed light"');
    start.dispose();
  });

  it("IsFixed: consumers don't follow changes; changing IsFixed throws", async () => {
    const files = { ...b, "App.tsazor": b["App.tsazor"]!.replace('<CascadingValue Value="@theme">', '<CascadingValue Value="@theme" IsFixed="true">') };
    const m = await mount(files);
    const box = m.container.querySelector("input") as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    await m.settle();
    expect(m.html()).toContain('class="themed light"');
    m.dispose();
    const errors: RenderError[] = [];
    const flip = await mount(
      { ...b, "App.tsazor": `<button @onclick="() => fixed = !fixed">f</button>\n<CascadingValue Value="@theme" IsFixed="@fixed"><Toolbar /></CascadingValue>\n@code {\n    fixed = false;\n    theme = "light";\n}\n` },
      (error) => errors.push(error),
    );
    click(flip);
    await flip.settle();
    expect(errors.map((e) => String((e.error as Error).message))).toContain("The value of IsFixed cannot be changed dynamically.");
    flip.dispose();
  });
});

describe("named-cascades", () => {
  const { a, b } = lesson("named-cascades");
  const leaf = (decl: string) => `<span>@theme|@language</span>\n@code {\n${decl}\n}\n`;

  it("unnamed parameters both take the nearest unnamed cascade; names fix it, case-insensitively", async () => {
    const start = await mount(a);
    expect(start.html()).toContain("(theme: de, language: de)");
    start.dispose();
    const m = await mount(b);
    expect(m.html()).toContain("Hallo! <small>(theme: dark, language: de)</small>");
    m.dispose();
    const cased = await mount({ ...b, "Greeting.tsazor": leaf(`    @CascadingParameter({ name: "THEME" }) theme = "";\n    @CascadingParameter({ name: "Language" }) language = "";`) });
    expect(cased.html()).toBe("<span>dark|de</span>");
    cased.dispose();
  });

  it("an unnamed parameter never matches a named cascade; a string and a number cascade collide without names", async () => {
    const unnamed = await mount({ ...b, "Greeting.tsazor": leaf(`    @CascadingParameter() theme = "none";\n    @CascadingParameter() language = "none";`) });
    expect(unnamed.html()).toBe("<span>none|none</span>");
    unnamed.dispose();
    const mixed = await mount({
      "App.tsazor": `<CascadingValue Value="@label"><CascadingValue Value="@count"><Leaf /></CascadingValue></CascadingValue>\n@code {\n    label = "x";\n    count = 3;\n}\n`,
      "Leaf.tsazor": `<span>@label|@count</span>\n@code {\n    @CascadingParameter() label: unknown = "";\n    @CascadingParameter() count: unknown = 0;\n}\n`,
    });
    expect(mixed.html()).toBe("<span>3|3</span>");
    mixed.dispose();
  });

  it("matching by type: an instance of the class (or a subclass) is found", async () => {
    const m = await mount({
      "App.tsazor": `@import { AdminSession } from "./session"\n<CascadingValue Value="@theme"><CascadingValue Value="@session"><Leaf /></CascadingValue></CascadingValue>\n@code {\n    theme = "dark";\n    session = new AdminSession("ada");\n}\n`,
      "Leaf.tsazor": `@import { Session } from "./session"\n<span>@session?.user</span>\n@code {\n    @CascadingParameter({ type: Session }) session?: Session;\n}\n`,
      "session.ts": `export class Session {\n    constructor(readonly user: string) {}\n}\nexport class AdminSession extends Session {}\n`,
    });
    expect(m.html()).toBe("<span>ada</span>");
    m.dispose();
  });
});

/* Chapter 10 — Services ----------------------------------------------------------------- */

describe("injecting-services", () => {
  const { a, b } = lesson("injecting-services");

  it("new Cart() is the badge's own; @inject gets the app's one", async () => {
    for (const [files, expected] of [[a, "🛒 0"], [b, "🛒 1"]] as const) {
      const m = await mount(files);
      click(m, ".products button");
      await m.settle();
      expect(m.html()).toContain(`<span class="badge">${expected}</span>`);
      m.dispose();
    }
  });

  it("@inject fields are set before onInitialized; inject() in @code needs an @import", async () => {
    const files = {
      ...b,
      "App.tsazor": `@import { Cart } from "./Cart"\n@inject Cart cart\n<p>@seen @other.count</p>\n@code {\n    seen = "";\n    other = inject(Cart);\n    override onInitialized() {\n        this.seen = String(this.cart === this.other);\n    }\n}\n`,
    };
    expect(typeCodes(files)).toEqual([]);
    const m = await mount(files);
    expect(m.html()).toBe("<p>true 0</p>");
    m.dispose();
    const withoutImport = { ...b, "App.tsazor": `<p>@other.count</p>\n@code {\n    other = inject(Cart);\n}\n` };
    expect(typeCodes(withoutImport)).toContain("TS2304");
  });

  it("an @inject type resolves like a tag — also from a @using folder", async () => {
    const files = {
      "App.tsazor": `@using ./services\n@inject Clock clock\n<p>@clock.now</p>\n`,
      "services/Clock.ts": `export class Clock {\n    now = "noon";\n}\n`,
    };
    expect(typeCodes(files)).toEqual([]);
    const build = buildProject(files);
    writeModules(build, (lastDir = path.join(gateDir, String(counter++))));
    const { default: App } = await moduleOf<{ default: never }>("App.tsazor");
    const { Clock } = await moduleOf<{ Clock: new () => unknown }>("services/Clock.ts");
    const result = await render(App, { services: (s) => s.registerType(Clock as never) });
    expect(result.container.innerHTML.replace(/<!--[^>]*-->/g, "")).toBe("<p>noon</p>");
    result.dispose();
  });

  it("factories get dependencies; tests swap services with render(App, { services })", async () => {
    const build = buildProject(b);
    writeModules(build, (lastDir = path.join(gateDir, String(counter++))));
    const { Cart } = await moduleOf<{ Cart: new () => { add(item: string): void; count: number } }>("Cart.ts");
    const { default: App } = await moduleOf<{ default: never }>("App.tsazor");
    const fake = new Cart();
    fake.add("x");
    fake.add("y");
    const result = await render(App, { services: (s) => s.registerValue(Cart, fake) });
    expect(result.container.innerHTML).toContain("🛒 2");
    result.dispose();

    class Checkout {
      constructor(readonly cart: InstanceType<typeof Cart>) {}
    }
    const provider = new ServiceCollection().registerType(Cart).register(Checkout, (s) => new Checkout(s.get(Cart))).build();
    expect(provider.get(Checkout).cart).toBe(provider.get(Cart));
    // Registering an implementation under a base class type-checks (the token may be abstract).
    expect(
      typeCodes({
        "App.tsazor": "<p>x</p>",
        "setup.ts": `import { ServiceCollection } from "@tsazor/runtime";\nabstract class Store { abstract get(): string; }\nclass MemoryStore extends Store { get() { return "m"; } }\nexport const services = new ServiceCollection().register(Store, () => new MemoryStore());\n`,
      }),
    ).toEqual([]);
  });
});

describe("service-lifetimes", () => {
  const { a, b } = lesson("service-lifetimes");

  it("a singleton is shared by both boards; a transient is per injection", async () => {
    for (const [files, expected] of [[a, ["1", "1"]], [b, ["1", "0"]]] as const) {
      const m = await mount(files);
      click(m, ".board button");
      await m.settle();
      expect([...m.container.querySelectorAll(".points")].map((p) => p.textContent)).toEqual(expected);
      m.dispose();
    }
  });

  it("scoped behaves like a singleton in an app; registerType hands the services to the constructor", async () => {
    const files = { ...b, "Program.ts": b["Program.ts"]!.replace('"transient"', '"scoped"') };
    const m = await mount(files);
    click(m, ".board button");
    await m.settle();
    expect([...m.container.querySelectorAll(".points")].map((p) => p.textContent)).toEqual(["1", "1"]);
    m.dispose();
    class NeedsServices {
      constructor(readonly services: unknown) {}
    }
    const provider = new ServiceCollection().registerType(NeedsServices).build();
    expect(provider.get(NeedsServices).services).toBe(provider);
  });

  it("the provider's .NET behaviors: cycles, disposal order, disposed access, unregistered", () => {
    class A {}
    const cyclic = new ServiceCollection().register(A, (s) => s.get(A)).build();
    expect(() => cyclic.get(A)).toThrow("A circular dependency was detected for the service of type 'A'.");

    const log: string[] = [];
    class First {
      dispose() { log.push("first"); }
    }
    class Second {
      dispose() { log.push("second"); }
    }
    const provider = new ServiceCollection().registerType(First).registerType(Second).build();
    provider.get(First);
    provider.get(Second);
    provider.dispose();
    expect(log).toEqual(["second", "first"]);
    expect(() => provider.get(First)).toThrow("Cannot access a disposed object.");

    class Missing {}
    const empty = new ServiceCollection().build();
    expect(() => empty.get(Missing)).toThrow("Service not registered: Missing");
    expect(empty.tryGet(Missing)).toBeUndefined();
  });
});

/* Chapter 11 — Element references --------------------------------------------------------- */

describe("element-refs", () => {
  const { a, b } = lesson("element-refs");

  it("the reference is the DOM element: showModal() opens the dialog, close() closes it", async () => {
    const start = await mount(a);
    click(start, ".danger");
    await start.settle();
    expect(start.container.querySelector("dialog")!.open).toBe(false);
    start.dispose();
    const m = await mount(b);
    click(m, ".danger");
    await m.settle();
    const dialog = m.container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    (dialog.querySelector("button") as HTMLElement).click();
    await m.settle();
    expect(dialog.open).toBe(false);
    expect(m.html()).toContain("<p>Nothing happened.</p>");
    m.dispose();
  });

  it("undefined in onInitialized, set in onAfterRender; the check types the field against the tag", async () => {
    const m = await mount(app(`<input @ref="input" /><p>@log</p>`, `    input?: HTMLInputElement;\n    log = "";\n    override onInitialized() { this.log += "init:" + (this.input === undefined) + ";"; }\n    override onAfterRender(first: boolean) { if (first) { this.log += "after:" + (this.input instanceof HTMLInputElement); this.stateHasChanged(); } }`));
    await m.settle();
    expect(m.html()).toContain("<p>init:true;after:true</p>");
    m.dispose();
    expect(typeCodes(b)).toEqual([]);
    expect(typeCodes({ "App.tsazor": b["App.tsazor"]!.replace("dialog?: HTMLDialogElement;", "dialog?: HTMLInputElement;").replace("this.dialog?.showModal();", "").replaceAll("this.dialog?.close();", "") })).not.toEqual([]);
  });

  it("a listener with { signal: this.disposeSignal } goes away with the component", async () => {
    const m = await mount({
      "App.tsazor": `<button @onclick="() => show = false">hide</button>\n@if (show) {\n    <Keys />\n}\n@code {\n    show = true;\n}\n`,
      "Keys.tsazor": `<p>keys</p>\n@code {\n    static presses = 0;\n    override onInitialized() {\n        window.addEventListener("keydown", () => Keys.presses++, { signal: this.disposeSignal });\n    }\n}\n`,
    });
    const keys = await moduleOf<{ default: { presses: number } }>("Keys.tsazor");
    window.dispatchEvent(new KeyboardEvent("keydown"));
    expect(keys.default.presses).toBe(1);
    click(m);
    await m.settle();
    window.dispatchEvent(new KeyboardEvent("keydown"));
    expect(keys.default.presses).toBe(1);
    m.dispose();
  });

  it("disposeSignal aborts before dispose() runs", async () => {
    const m = await mount({
      "App.tsazor": `<button @onclick="() => show = false">hide</button>\n@if (show) {\n    <Child />\n}\n@code {\n    show = true;\n}\n`,
      "Child.tsazor": `<p>c</p>\n@code {\n    static log: string[] = [];\n    override onInitialized() {\n        this.disposeSignal.addEventListener("abort", () => Child.log.push("aborted"));\n    }\n    dispose() {\n        Child.log.push("dispose:" + this.disposeSignal.aborted);\n    }\n}\n`,
    });
    const child = await moduleOf<{ default: { log: string[] } }>("Child.tsazor");
    click(m);
    await m.settle();
    expect(child.default.log).toEqual(["aborted", "dispose:true"]);
    m.dispose();
  });
});

describe("component-refs", () => {
  const { a, b } = lesson("component-refs");

  it("a method called from outside doesn't render by itself; with stateHasChanged it does", async () => {
    const halfway = await mount({ ...a, "App.tsazor": b["App.tsazor"]! });
    click(halfway, ".toolbar button");
    await halfway.settle();
    expect((halfway.container.querySelector("textarea") as HTMLTextAreaElement).value).not.toContain("— Ada");
    halfway.dispose();
    const m = await mount(b);
    click(m, ".toolbar button");
    await m.settle();
    expect((m.container.querySelector("textarea") as HTMLTextAreaElement).value).toContain("— Ada");
    m.dispose();
  });

  it("the component reference is set by the time onAfterRender runs", async () => {
    const { b } = lesson("component-refs");
    const files = {
      ...b,
      "App.tsazor": `@import Editor from "./Editor.tsazor"\n<Editor @ref="editor" /><p>@seen</p>\n@code {\n    editor?: Editor;\n    seen = "";\n    override onInitialized() { this.seen += "init:" + (this.editor === undefined) + ";"; }\n    override onAfterRender(first: boolean) {\n        if (first) { this.seen += "after:" + (this.editor !== undefined); this.stateHasChanged(); }\n    }\n}\n`,
    };
    const m = await mount(files);
    await m.settle();
    expect(m.html()).toContain("<p>init:true;after:true</p>");
    m.dispose();
  });

  it("the type needs an @import: without it TS2304", () => {
    const found = types({ ...b, "App.tsazor": b["App.tsazor"]!.replace('@import Editor from "./Editor.tsazor"\n', "") });
    expect(found.map((d) => `${d.code} ${d.message}`)).toEqual(["TS2304 Cannot find name 'Editor'."]);
  });
});

/* Chapter 12 — Special components ----------------------------------------------------------- */

describe("error-boundaries", () => {
  const { a, b } = lesson("error-boundaries");
  const quiet = async <T,>(work: () => Promise<T>): Promise<{ result: T; logged: unknown[][] }> => {
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => logged.push(args);
    try {
      return { result: await work(), logged };
    } finally {
      console.error = original;
    }
  };

  it("without a boundary the error is reported and the app keeps working; with one, the error view replaces the widget", async () => {
    const { result: start, logged } = await quiet(async () => {
      const m = await mount(a);
      click(m, ".refresh");
      await m.settle();
      return m;
    });
    expect(String(logged[0]?.[0])).toContain("Event handler of component");
    expect(start.html()).toContain("Sunny, 21 °C");
    start.dispose();

    const { result: m } = await quiet(async () => {
      const mounted = await mount(b);
      click(mounted, ".refresh");
      await mounted.settle();
      return mounted;
    });
    expect(m.html()).toContain("<p>The weather widget failed: The weather service is down.</p>");
    expect(m.html()).toContain("<h2>Notes</h2>");
    click(m, ".failed button");
    await m.settle();
    expect(m.html()).toContain("Sunny, 21 °C");
    m.dispose();
  });

  it("catches async handlers and lifecycle errors below it", async () => {
    const thrower = (member: string) => `<p>child</p><button class="go" @onclick="go">go</button>\n@code {\n${member}\n}\n`;
    const boundary = (inner: string) => `<ErrorBoundary><ChildContent>${inner}</ChildContent><ErrorContent Context="e"><p class="caught">@e.message</p></ErrorContent></ErrorBoundary>`;
    const { result } = await quiet(async () => {
      const asyncCase = await mount({ "App.tsazor": boundary("<Child />"), "Child.tsazor": thrower(`    async go() {\n        await Promise.resolve();\n        throw new Error("async");\n    }`) });
      click(asyncCase, ".go");
      await asyncCase.settle(5);
      const asyncHtml = asyncCase.html();
      asyncCase.dispose();
      const init = await mount({ "App.tsazor": boundary("<Child />"), "Child.tsazor": thrower(`    go() {}\n    override onInitialized() {\n        throw new Error("init");\n    }`) });
      const initHtml = init.html();
      init.dispose();
      return { asyncHtml, initHtml };
    });
    expect(result.asyncHtml).toContain('<p class="caught">async</p>');
    expect(result.initHtml).toContain('<p class="caught">init</p>');
  });

  it("the default UI, maximumErrorCount, and a custom boundary's onError", async () => {
    const { result } = await quiet(async () => {
      const m = await mount({ "App.tsazor": `<ErrorBoundary><Child /></ErrorBoundary>`, "Child.tsazor": `<p>x</p>\n@code {\n    override onInitialized() {\n        throw new Error("x");\n    }\n}\n` });
      const html = m.html();
      m.dispose();
      return html;
    });
    expect(result).toBe('<div class="blazor-error-boundary"></div>');
    const { ErrorBoundary, ErrorBoundaryBase } = await import("@tsazor/runtime");
    expect(new ErrorBoundary().maximumErrorCount).toBe(100);
    const custom = await mount({
      "App.tsazor": `<Quiet><Child /></Quiet>`,
      "Quiet.tsazor.ts": `import { ErrorBoundaryBase } from "@tsazor/runtime";\n\nexport default class QuietBase extends ErrorBoundaryBase {\n    static seen: string[] = [];\n    protected override onError(error: unknown): void {\n        QuietBase.seen.push((error as Error).message);\n    }\n}\n`,
      "Quiet.tsazor": `@if (currentException === null) {\n    @childContent\n} else {\n    <p class="quiet">quietly failed</p>\n}\n`,
      "Child.tsazor": `<p>x</p>\n@code {\n    override onInitialized() {\n        throw new Error("hush");\n    }\n}\n`,
    });
    const quietModule = await moduleOf<{ default: { seen: string[] } }>("Quiet.tsazor.ts");
    expect(custom.html()).toBe('<p class="quiet">quietly failed</p>');
    expect(quietModule.default.seen).toEqual(["hush"]);
    custom.dispose();
    void ErrorBoundaryBase;
  });
});

describe("dynamic-component", () => {
  const { a, b } = lesson("dynamic-component");

  it("Type picks the component, Parameters sets its parameters", async () => {
    const start = await mount(a);
    expect(start.html()).toContain('<pre class="raw">quote: {"text":"Best croissants in town.","author":"A happy customer"}</pre>');
    start.dispose();
    const m = await mount(b);
    expect(m.html()).toContain("<h1>Welcome to the bakery</h1><p>Fresh bread every morning from six o'clock.</p>");
    expect(m.html()).toMatch(/<p>“Best croissants in town\.”<\/p>\s*<footer>— A happy customer<\/footer>/);
    m.dispose();
  });

  it("an unknown key throws Blazor's message (to the nearest boundary); other attributes are TZS025; Type is required", async () => {
    const files = {
      ...b,
      "App.tsazor": `@import Quote from "./Quote.tsazor"\n<ErrorBoundary><ChildContent><DynamicComponent Type="@Quote" Parameters="@({ colour: 'red' })" /></ChildContent><ErrorContent Context="e"><p class="caught">@e.message</p></ErrorContent></ErrorBoundary>\n`,
    };
    const original = console.error;
    console.error = () => {};
    try {
      const m = await mount(files);
      expect(m.html()).toContain(`<p class="caught">Object of type 'Quote' does not have a property matching the name 'colour'.</p>`);
      m.dispose();
    } finally {
      console.error = original;
    }
    expect(codes({ ...b, "App.tsazor": `@import Quote from "./Quote.tsazor"\n<DynamicComponent Type="@Quote" text="x" />` })).toEqual(["error:TZS025"]);
    const errors: RenderError[] = [];
    const missing = await mount({ "App.tsazor": `<DynamicComponent Type="@none" />\n@code {\n    none = null;\n}\n` }, (error) => errors.push(error));
    expect(errors.map((e) => (e.error as Error).message)).toEqual(["DynamicComponent requires a non-null value for the parameter Type."]);
    missing.dispose();
  });

  it("the same Type keeps the instance; a different Type replaces it", async () => {
    const m = await mount({
      "App.tsazor": `@import One from "./One.tsazor"\n@import Two from "./Two.tsazor"\n<button class="same" @onclick="() => label = 'b'">s</button><button class="swap" @onclick="() => type = Two">w</button>\n<DynamicComponent Type="@type" Parameters="@({ label })" />\n@code {\n    type: unknown = One;\n    label = "a";\n}\n`,
      "One.tsazor": `<p>one @label @id</p>\n@code {\n    static created = 0;\n    static disposed = 0;\n    @Parameter() label = "";\n    id = ++One.created;\n    dispose() { One.disposed++; }\n}\n`,
      "Two.tsazor": `<p>two @label</p>\n@code {\n    @Parameter() label = "";\n}\n`,
    });
    const one = await moduleOf<{ default: { created: number; disposed: number } }>("One.tsazor");
    click(m, ".same");
    await m.settle();
    expect(m.html()).toContain("<p>one b 1</p>");
    expect(one.default.created).toBe(1);
    click(m, ".swap");
    await m.settle();
    expect(m.html()).toContain("<p>two b</p>");
    expect(one.default.disposed).toBe(1);
    m.dispose();
  });
});

describe("page-title", () => {
  const { a, b } = lesson("page-title");
  const removeStaticTitles = (): void => {
    for (const title of [...document.head.querySelectorAll("title")]) title.remove();
  };

  it("PageTitle sets document.title and follows the component; HeadContent renders into the head; both leave with it", async () => {
    const start = await mount(a);
    expect(document.title).toBe("");
    start.dispose();
    const m = await mount(b);
    try {
      expect(document.title).toBe("(2) Inbox");
      expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Your mail, 2 unread");
      click(m, "button");
      await m.settle();
      expect(document.title).toBe("(0) Inbox");
    } finally {
      m.dispose();
    }
    expect(document.title).toBe("");
    expect(document.head.querySelector("meta")).toBeNull();
  });

  it("the last rendered PageTitle wins; when it goes, the previous one comes back", async () => {
    const m = await mount({
      "App.tsazor": `<PageTitle>App</PageTitle>\n<button @onclick="() => open = !open">t</button>\n@if (open) {\n    <Dialog />\n}\n@code {\n    open = true;\n}\n`,
      "Dialog.tsazor": `<PageTitle>Dialog</PageTitle><p>d</p>`,
    });
    try {
      expect(document.title).toBe("Dialog");
      click(m);
      await m.settle();
      expect(document.title).toBe("App");
    } finally {
      m.dispose();
    }
  });

  it("when the last PageTitle goes, the document's own title comes back", async () => {
    const title = document.createElement("title");
    title.textContent = "Static title";
    document.head.appendChild(title);
    const m = await mount({ "App.tsazor": `<button @onclick="() => show = false">x</button>\n@if (show) {\n    <PageTitle>Mine</PageTitle>\n}\n@code {\n    show = true;\n}\n` });
    try {
      await m.settle();
      expect(document.title).toBe("Mine");
      click(m);
      await m.settle();
      expect(document.title).toBe("Static title");
    } finally {
      m.dispose();
      removeStaticTitles();
    }
  });
});

describe("sections", () => {
  const { a, b } = lesson("sections");

  it("the content shows at the outlet and stays the page's: its handlers run on the page", async () => {
    const start = await mount(a);
    expect(start.container.querySelector(".actions")!.innerHTML.replace(/<!--[^>]*-->/g, "")).toBe("");
    start.dispose();
    const m = await mount(b);
    expect(m.container.querySelector(".actions button")?.textContent).toBe("Save");
    click(m, ".actions button");
    await m.settle();
    expect(m.html()).toContain('<p class="status">Saved.</p>');
    m.dispose();
  });

  it("last rendered wins, the previous returns; removal clears; one outlet per name; SectionId works", async () => {
    const m = await mount({
      "App.tsazor": `<div class="out"><SectionOutlet SectionName="s" /></div>\n<A />\n@if (showB) {\n    <B />\n}\n<button @onclick="() => showB = !showB">b</button>\n@code {\n    showB = true;\n}\n`,
      "A.tsazor": `<SectionContent SectionName="s">from A</SectionContent>`,
      "B.tsazor": `<SectionContent SectionName="s">from B</SectionContent>`,
    });
    const out = () => m.container.querySelector(".out")!.textContent;
    expect(out()).toBe("from B");
    click(m);
    await m.settle();
    expect(out()).toBe("from A");
    m.dispose();

    const errors: RenderError[] = [];
    const two = await mount({ "App.tsazor": `<SectionOutlet SectionName="s" /><SectionOutlet SectionName="s" />` }, (error) => errors.push(error));
    expect(errors.map((e) => (e.error as Error).message).join()).toContain("There is already a subscriber to the content with the given section ID 's'.");
    two.dispose();

    const id = await mount({
      "App.tsazor": `@import { toolbar } from "./ids"\n<div class="out"><SectionOutlet SectionId="@toolbar" /></div>\n<SectionContent SectionId="@toolbar">by id</SectionContent>\n`,
      "ids.ts": "export const toolbar = {};\n",
    });
    expect(id.container.querySelector(".out")!.textContent).toBe("by id");
    id.dispose();

    const nowhere = await mount({ "App.tsazor": `<p>page</p><SectionContent SectionName="s">lost</SectionContent>` });
    expect(nowhere.html()).toBe("<p>page</p>");
    nowhere.dispose();
    const wrong: RenderError[] = [];
    const both = await mount({ "App.tsazor": `@import { toolbar } from "./ids"\n<SectionOutlet SectionName="s" SectionId="@toolbar" /><SectionOutlet />`, "ids.ts": "export const toolbar = {};\n" }, (error) => wrong.push(error));
    expect(wrong.map((e) => (e.error as Error).message)).toEqual([
      "SectionOutlet requires that 'SectionName' and 'SectionId' cannot both have non-null values.",
      "SectionOutlet requires a non-null value either for 'SectionName' or 'SectionId'.",
    ]);
    both.dispose();
  });
});

/* Chapter 13 — Organizing code ------------------------------------------------------------------ */

describe("code-behind", () => {
  const { b } = lesson("code-behind");

  it("the markup's class extends the code-behind; a private member the markup reads is TS2341", () => {
    expect(typeCodes(b)).toEqual([]);
    const privateScore = { ...b, "Password.tsazor.ts": b["Password.tsazor.ts"]!.replace("protected get score()", "private get score()") };
    const found = types(privateScore);
    expect(found.map((d) => `${d.code} ${d.message}`)).toContain("TS2341 Property 'score' is private and only accessible within class 'PasswordBase'.");
  });

  it("@code merges with the code-behind; @inherits next to a code-behind is TZS011", async () => {
    const files = {
      "App.tsazor": `<p>@a @b</p>\n@code {\n    b = 2;\n}\n`,
      "App.tsazor.ts": `import { ComponentBase } from "@tsazor/runtime";\n\nexport default class AppBase extends ComponentBase {\n    protected a = 1;\n}\n`,
    };
    const m = await mount(files);
    expect(m.html()).toBe("<p>1 2</p>");
    m.dispose();
    expect(codes({ ...files, "App.tsazor": `@inherits LayoutComponentBase\n${files["App.tsazor"]}` })).toContain("warning:TZS011");
  });
});

describe("imports-file", () => {
  it("relative paths are rewritten for subfolders; @using works from it; a component's own import wins", async () => {
    const files = {
      "_Imports.tsazor": `@import { label } from "./labels"\n@using ./widgets\n`,
      "labels.ts": `export const label = "shared";\n`,
      "other.ts": `export const label = "own";\n`,
      "App.tsazor": `<p>@label</p><Badge /><Own />`,
      "widgets/Badge.tsazor": `<b>@label</b>`,
      "Own.tsazor": `@import { label } from "./other"\n<i>@label</i>`,
    };
    expect(typeCodes(files)).toEqual([]);
    const m = await mount(files);
    expect(m.html()).toBe("<p>shared</p><b>shared</b><i>own</i>");
    m.dispose();
  });

  it("nested _Imports files stack; unused inherited imports are dropped from the output; @authorize doesn't inherit", () => {
    const files = {
      "_Imports.tsazor": `@import { a } from "./values"\n`,
      "sub/_Imports.tsazor": `@import { b } from "../values"\n`,
      "values.ts": `export const a = "A";\nexport const b = "B";\n`,
      "App.tsazor": `<Leaf />`,
      "sub/Leaf.tsazor": `<p>@a@b</p>`,
      "Plain.tsazor": `<p>plain</p>`,
    };
    expect(typeCodes({ ...files, "App.tsazor": `@using ./sub\n<Leaf />` })).toEqual([]);
    const build = buildProject({ ...files, "App.tsazor": `@using ./sub\n<Leaf />` });
    expect(build.modules["$app/sub/Leaf.tsazor"]!.code).toContain('from "$app/values.ts"');
    expect(build.modules["$app/Plain.tsazor"]!.code).not.toContain("values");
    expect(codes({ "_Imports.tsazor": "@authorize\n", "App.tsazor": "<p>x</p>" })).toEqual(["warning:TZS014"]);
    // Mistakes in _Imports.tsazor are reported on it (engine: as @tsazor/workspace does).
    const broken = buildProject({ "_Imports.tsazor": "@import formatMoney\n@using ./nowhere\n", "App.tsazor": "<p>x</p>" }).diagnostics;
    expect(broken.map((d) => `${d.file} ${d.severity} ${d.code}`)).toEqual(["_Imports.tsazor error TZS016", "_Imports.tsazor warning TZS018"]);
  });
});

describe("logic-in-modules", () => {
  it("the extracted function renders the same receipt; App reuses it for its heading", async () => {
    const { a, b } = lesson("logic-in-modules");
    const receipt = (m: Mounted) => m.container.querySelector("table")!.outerHTML.replace(/<!--[^>]*-->/g, "").replace(/\s+b-[0-9a-f]{8}=""/g, "");
    const start = await mount(a);
    const before = receipt(start);
    start.dispose();
    const m = await mount(b);
    expect(receipt(m)).toBe(before);
    expect(m.html()).toContain("<h1>Your basket · €39.60</h1>");
    m.dispose();
  });
});

describe("containers", () => {
  it("the view needs no subscription: one listener instead of one per item, same behavior", async () => {
    const { a, b } = lesson("containers");
    // The store, instrumented: how many subscriptions are open.
    const counted = (files: Files): Files => ({
      ...files,
      "TodoStore.ts": files["TodoStore.ts"]!
        .replace("export class TodoStore {", "export class TodoStore {\n    static open = 0;")
        .replace("this.#listeners.add(listener);\n        return () => this.#listeners.delete(listener);", "this.#listeners.add(listener);\n        TodoStore.open++;\n        return () => { TodoStore.open--; return this.#listeners.delete(listener); };"),
    });
    const run = async (files: Files): Promise<{ open: number; html: string }> => {
      const m = await mount(counted(files));
      const { TodoStore } = await moduleOf<{ TodoStore: { open: number } }>("TodoStore.ts");
      const open = TodoStore.open;
      const box = m.container.querySelector(".todo:nth-child(2) input") as HTMLInputElement;
      box.checked = !box.checked;
      box.dispatchEvent(new Event("change", { bubbles: true }));
      await m.settle();
      const html = m.html();
      m.dispose();
      return { open, html };
    };
    const before = await run(a);
    const after = await run(b);
    expect(before.open).toBe(4); // the list + one per item
    expect(after.open).toBe(1);
    expect(after.html.match(/class="todo done"/g)?.length, after.html).toBe(2); // the plants + the bakery
    expect(after.html).toBe(before.html);
  });

  it("a plain EventCallback needs no argument; a typed one does", () => {
    const callback = (type: string, call: string) => ({ "App.tsazor": `<p>x</p>\n@code {\n    @Parameter() onToggle?: ${type};\n    go() { void this.onToggle?.invokeAsync(${call}); }\n}\n` });
    expect(typeCodes(callback("EventCallback", ""))).toEqual([]);
    expect(typeCodes(callback("EventCallback<string>", ""))).toEqual(["TS2554"]);
    expect(typeCodes(callback("EventCallback<string>", '"x"'))).toEqual([]);
  });
});

/* Chapter 14 — Attachments --------------------------------------------------------- */

describe("attachments", () => {
  const { a, b } = lesson("attachments");

  it("the attachment focuses the input each time the @if brings it back; the start does not", async () => {
    const start = await mount(a);
    click(start, ".open");
    await start.settle();
    expect(document.activeElement).not.toBe(start.container.querySelector("input"));
    expect(start.html()).toContain("Click the box first…");
    start.dispose();
    const m = await mount(b);
    for (let round = 0; round < 2; round++) {
      click(m, ".open");
      await m.settle();
      expect(document.activeElement).toBe(m.container.querySelector("input"));
      expect(m.html()).toContain("Type away.");
      click(m, ".close");
      await m.settle();
    }
    m.dispose();
  });

  it("the tooltip shows on hover; removing the button runs the cleanup (tooltip and listeners gone)", async () => {
    const m = await mount(b);
    click(m, ".open");
    await m.settle();
    const close = m.container.querySelector(".close") as HTMLElement;
    close.dispatchEvent(new MouseEvent("mouseenter"));
    expect(document.body.querySelector(".tooltip")?.textContent).toBe("Close the search");
    close.click();
    await m.settle();
    expect(document.body.querySelector(".tooltip")).toBeNull();
    close.dispatchEvent(new MouseEvent("mouseenter"));
    expect(document.body.querySelector(".tooltip")).toBeNull();
    m.dispose();
  });

  it("a factory call in markup re-attaches every render; a field stays attached", async () => {
    const counter = (markup: string): Files =>
      app(`${markup}<button class="again" @onclick="() => renders++">@renders</button>`, `    renders = 0;\n    attaches = 0;\n    held = this.tip("x");\n    tip(text: string) { return (element: HTMLElement) => { this.attaches++; element.title = text; }; }`);
    for (const [markup, expected] of [[`<p @attach="tip('x')">p</p>`, 3], [`<p @attach="held">p</p>`, 1]] as const) {
      const m = await mount(counter(markup));
      click(m, ".again");
      await m.settle();
      click(m, ".again");
      await m.settle();
      expect(m.instance["attaches"], markup).toBe(expected);
      m.dispose();
    }
  });

  it("several attachments per element; the check types the parameter by the tag", async () => {
    const m = await mount(app(`<input @attach="one" @attach:shortcut="two" />`, `    log: string[] = [];\n    one = (input: HTMLInputElement) => { this.log.push("one " + input.tagName); };\n    two = (input: HTMLInputElement) => { this.log.push("two " + input.tagName); };`));
    expect(m.instance["log"]).toEqual(["one INPUT", "two INPUT"]);
    m.dispose();
    expect(typeCodes(b)).toEqual([]);
    expect(typeCodes({ ...b, "App.tsazor": b["App.tsazor"]!.replace('<button class="close" @onclick="close" @attach="closeTip">', '<button class="close" @onclick="close" @attach="autofocus">') })).toEqual(["TS2345"]);
    expect(codes(app(`<input @attach="one" @attach="one" />`, "    one = () => {};"))).toEqual(["error:TZS008"]);
  });
});
