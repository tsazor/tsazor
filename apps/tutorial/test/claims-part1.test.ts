/**
 * Claims of the lesson texts of Part 1, chapters 2–7 (state, parameters,
 * logic, events, bindings, styles), pinned to the real compiler, runtime and
 * type check. Each `describe` names the lesson whose text makes the claim.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { render, type ComponentBase, type Renderer } from "@tsazor/testing";
import { buildProject, type Files } from "../src/engine/compile-project";
import { scopeCss } from "../src/engine/scoped-css";
import { TypeChecker } from "../src/engine/type-check";
import { loadTypeEnvironment } from "../build/type-env";
import { loadContent } from "../build/content";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gateDir = path.join(appRoot, ".gate", "claims-part1");
const checker = new TypeChecker(loadTypeEnvironment(appRoot));
let counter = 0;

afterAll(() => rmSync(gateDir, { recursive: true, force: true }));

interface Mounted {
  container: HTMLElement;
  renderer: Renderer;
  instance: ComponentBase & Record<string, unknown>;
  /** Markup without the renderer's boundary comments and scope attributes. */
  html(): string;
  /** Lets timers and promises run, then waits for the renderer. */
  settle(ms?: number): Promise<void>;
  dispose(): void;
}

/** Compiles (asserting no compile errors), mounts, and returns handles for interaction. */
async function mount(files: Files): Promise<Mounted> {
  const build = buildProject(files);
  expect(build.diagnostics.filter((d) => d.severity === "error"), JSON.stringify(build.diagnostics)).toEqual([]);
  const dir = path.join(gateDir, String(counter++));
  mkdirSync(dir, { recursive: true });
  for (const module of Object.values(build.modules)) {
    writeFileSync(path.join(dir, `${module.file}.js`), module.code.replace(/(["'])\$app\/([^"']+)\1/g, "$1./$2.js$1"));
  }
  const module = (await import(pathToFileURL(path.join(dir, "App.tsazor.js")).href)) as { default: never };
  const result = await render(module.default);
  return {
    container: result.container,
    renderer: result.renderer,
    instance: result.instance as ComponentBase & Record<string, unknown>,
    html: () =>
      result.container.innerHTML.replace(/<!--\/?bl-tsazor:[^>]*-->/g, "").replace(/\s+b-[0-9a-f]{8}=""/g, ""),
    settle: async (ms = 0) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      await result.renderer.waitUntilIdle();
    },
    dispose: () => result.dispose(),
  };
}

const app = (markup: string, code = ""): Files => ({ "App.tsazor": `${markup}\n@code {\n${code}\n}\n` });
const codes = (files: Files): string[] => buildProject(files).diagnostics.map((d) => `${d.severity}:${d.code}`);
const messages = (files: Files): string => buildProject(files).diagnostics.map((d) => `${d.code} ${d.message}`).join("\n");
const typeCodes = (files: Files): string[] => checker.check(files).map((d) => d.code);
const click = (m: Mounted, selector = "button"): void => (m.container.querySelector(selector) as HTMLElement).click();
function setValue(m: Mounted, selector: string, value: string, event = "change"): void {
  const element = m.container.querySelector(selector) as HTMLInputElement;
  element.value = value;
  element.dispatchEvent(new Event(event, { bubbles: true }));
}

/* Chapter 2 — State & rendering ------------------------------------------------- */

describe("fields-are-state", () => {
  it("a handler that changes a field re-renders; only the changed text is touched", async () => {
    const m = await mount(app(`<button @onclick="increment">Clicked @count</button>`, "count = 0;\nincrement() { this.count++; }"));
    const button = m.container.querySelector("button")!;
    click(m);
    await m.settle();
    expect(m.html()).toBe("<button>Clicked 1</button>");
    expect(m.container.querySelector("button")).toBe(button); // same element, updated in place
  });
});

describe("when-components-render", () => {
  const timer = (body: string) =>
    app(`<button @onclick="start">s</button><p>@seconds</p>`, `seconds = 0;\nstart() { setTimeout(() => { this.seconds++; ${body} }, 1); }`);

  it("a change in a timer callback does not render; stateHasChanged() does", async () => {
    const silent = await mount(timer(""));
    click(silent);
    await silent.settle(20);
    expect(silent.html()).toContain("<p>0</p>");
    expect(silent.instance.seconds).toBe(1);

    const loud = await mount(timer("this.stateHasChanged();"));
    click(loud);
    await loud.settle(20);
    expect(loud.html()).toContain("<p>1</p>");
  });

  it("several stateHasChanged() calls in a row render once; shouldRender is consulted", async () => {
    const m = await mount(
      app(`<p>@counted</p>`, `renders = 0;\nget counted() { return ++this.renders; }\nhit() { this.stateHasChanged(); this.stateHasChanged(); this.stateHasChanged(); }`),
    );
    expect(m.instance.renders).toBe(1);
    (m.instance.hit as () => void).call(m.instance);
    await m.settle();
    expect(m.instance.renders).toBe(2);

    const blocked = await mount(app(`<p>@n</p>`, "n = 0;\noverride shouldRender() { return false; }\nhit() { this.n++; this.stateHasChanged(); }"));
    (blocked.instance.hit as () => void).call(blocked.instance);
    await blocked.settle();
    expect(blocked.html()).toBe("<p>0</p>");
  });
});

describe("derived-values", () => {
  it("a field initializer is computed once, a getter on every render", async () => {
    const m = await mount(
      app(`<button @onclick="increment">+</button><p>@doubled @getterDoubled</p>`, "count = 1;\ndoubled = this.count * 2;\nget getterDoubled() { return this.count * 2; }\nincrement() { this.count++; }"),
    );
    click(m);
    await m.settle();
    expect(m.html()).toContain("<p>2 4</p>");
  });

  it("the type check infers the getter's type from its body", () => {
    expect(typeCodes(app(`<p>@doubled.toFixed(1)</p>`, "count = 1;\nget doubled() { return this.count * 2; }"))).toEqual([]);
    expect(typeCodes(app(`<p>@doubled.toUpperCase()</p>`, "count = 1;\nget doubled() { return this.count * 2; }"))).toEqual(["TS2339"]);
  });
});

describe("async-work", () => {
  it("an async handler renders at its first await and again when it settles", async () => {
    const m = await mount({
      "App.tsazor": `@import { gate } from "./gate"\n<button @onclick="roll">r</button><p>@message</p>\n@code {\n    message = "idle";\n    async roll() {\n        this.message = "Rolling…";\n        await gate.promise;\n        this.message = "done";\n    }\n}\n`,
      "gate.ts": `let open!: () => void;\nexport const gate = { promise: new Promise<void>((resolve) => { open = resolve; }), open: () => open() };\n`,
    });
    click(m);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(m.html()).toContain("<p>Rolling…</p>");
    const gateModule = (await import(pathToFileURL(path.join(gateDir, String(counter - 1), "gate.ts.js")).href)) as { gate: { open(): void } };
    gateModule.gate.open();
    await m.settle();
    expect(m.html()).toContain("<p>done</p>");
  });
});

describe("external-data", () => {
  const lesson = loadContent(path.join(appRoot, "content"))
    .parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.lessons))
    .find((l) => l.slug === "external-data")!;
  /** The lesson's ticker module as the mounted build loaded it. */
  const tickerOf = async (): Promise<{ ticker: { price: number; listeners: number } }> =>
    (await import(pathToFileURL(path.join(gateDir, String(counter - 1), "ticker.ts.js")).href)) as { ticker: { price: number; listeners: number } };

  it("without observe the price is frozen; with observe it moves and the subscription goes with the component", async () => {
    const frozen = await mount(lesson.a);
    await frozen.settle(1100);
    expect(frozen.html()).toContain("ACME: 100.00");
    expect(frozen.html()).toContain("Listening: 0");
    frozen.dispose();

    expect(typeCodes(lesson.b!)).toEqual([]);
    const m = await mount(lesson.b!);
    const { ticker } = await tickerOf();
    expect(ticker.listeners).toBe(1);
    await m.settle(1100);
    expect(m.html()).toContain("ACME: 100.50");
    // Hide and show: a new component, still one listener.
    click(m);
    await m.settle();
    expect(ticker.listeners).toBe(0);
    click(m);
    await m.settle();
    expect(m.html()).toContain("Listening: 1");
    m.dispose();
    expect(ticker.listeners).toBe(0);
  });

  const store = `type Listener = (value?: number) => void;\nconst listeners = new Set<Listener>();\nexport const store = {\n    value: 0,\n    renders: 0,\n    subscribe(listener: Listener) { listeners.add(listener); return () => listeners.delete(listener); },\n    emit(value: number) { store.value = value; for (const l of listeners) l(value); },\n};\n`;
  const storeOf = async (): Promise<{ store: { value: number; renders: number; emit(value: number): void } }> =>
    (await import(pathToFileURL(path.join(gateDir, String(counter - 1), "store.ts.js")).href)) as { store: { value: number; renders: number; emit(value: number): void } };

  it("a burst of notifications renders once; onNext runs before the render, with the value", async () => {
    const files: Files = {
      "App.tsazor": `@import { store } from "./store"\n<p>@seen.join(",")|@(store.renders++)</p>\n@code {\n    seen: number[] = [];\n    override onInitialized() {\n        this.observe(store, (value) => this.seen.push(value!));\n    }\n}\n`,
      "store.ts": store,
    };
    expect(typeCodes(files)).toEqual([]);
    const m = await mount(files);
    const { store: s } = await storeOf();
    const before = s.renders;
    s.emit(1);
    s.emit(2);
    s.emit(3);
    await m.settle();
    expect(s.renders - before).toBe(1);
    expect(m.html()).toBe(`<p>1,2,3|${before}</p>`);
  });

  it("observe returns a function that stops early; (signal, notify) aborts its signal; disposeSignal aborts on removal", async () => {
    const files: Files = {
      "App.tsazor": `<button @onclick="() => show = !show">t</button>\n@if (show) {\n    <Child />\n}\n@code {\n    show = true;\n}\n`,
      "Child.tsazor": `@import { store } from "./store"\n<p>@store.value</p>\n@code {\n    static log: string[] = [];\n    stop = () => {};\n    override onInitialized() {\n        this.stop = this.observe(store);\n        this.observe((signal, notify) => { signal.addEventListener("abort", () => Child.log.push("hatch aborted")); void notify; });\n        this.disposeSignal.addEventListener("abort", () => Child.log.push("disposed"));\n    }\n}\n`,
      "store.ts": store,
    };
    expect(typeCodes(files)).toEqual([]);
    const m = await mount(files);
    const childModule = (await import(pathToFileURL(path.join(gateDir, String(counter - 1), "Child.tsazor.js")).href)) as { default: { log: string[] } };
    const { store: s } = await storeOf();
    const child = m.renderer.getComponentState(2)!.component as unknown as { stop(): void };
    child.stop();
    s.emit(5);
    await m.settle();
    expect(m.html()).toContain("<p>0</p>"); // stopped: no re-render
    click(m);
    await m.settle();
    // disposeSignal aborts first, then the observed subscriptions end.
    expect(childModule.default.log).toEqual(["disposed", "hatch aborted"]);
  });

  it("observe in onParametersSet warns (development) when it observes the same source again", async () => {
    const warnings: unknown[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
    try {
      const m = await mount({
        "App.tsazor": `<Child label="@label" /><button @onclick="() => label = 'b'">b</button>\n@code {\n    label = "a";\n}\n`,
        "Child.tsazor": `@import { store } from "./store"\n<p>@label</p>\n@code {\n    @Parameter() label = "";\n    override onParametersSet() {\n        this.observe(store);\n    }\n}\n`,
        "store.ts": store,
      });
      click(m);
      await m.settle();
      expect(warnings.join("\n")).toContain("the same source is observed twice");
      m.dispose();
    } finally {
      console.warn = original;
    }
  });
});

describe("lifecycle", () => {
  const files: Files = {
    "App.tsazor": `<button @onclick="() => show = !show">t</button>\n@if (show) {\n    <Child label="@label" />\n}\n@code {\n    show = true;\n    label = "a";\n}\n`,
    "Child.tsazor": `<p>@label @initialized</p>\n@code {\n    @Parameter() label = "";\n    initialized = "no";\n    static log: string[] = [];\n    override onInitialized() { this.initialized = "yes"; Child.log.push("init"); }\n    override onParametersSet() { Child.log.push("params:" + this.label); }\n    override onAfterRender(firstRender: boolean) { Child.log.push("after:" + firstRender); }\n    dispose() { Child.log.push("dispose"); }\n}\n`,
  };

  it("onInitialized runs before the first render, onParametersSet per parameter set, onAfterRender(firstRender) once true, dispose on removal", async () => {
    const m = await mount(files);
    expect(m.html()).toContain("<p>a yes</p>"); // state set in onInitialized is in the first render
    m.instance.label = "b";
    m.instance.stateHasChangedInternal();
    await m.settle();
    click(m);
    await m.settle();
    const childModule = (await import(pathToFileURL(path.join(gateDir, String(counter - 1), "Child.tsazor.js")).href)) as { default: { log: string[] } };
    expect(childModule.default.log).toEqual(["init", "params:a", "after:true", "params:b", "after:false", "dispose"]);
    expect(m.html()).toBe("<button>t</button>");
  });

  it("`override` makes the type check verify the hook's name", () => {
    expect(typeCodes(app("<p>x</p>", "override onInitialised() {}"))).toEqual(["TS4117"]);
    expect(typeCodes(app("<p>x</p>", "override onInitialized() {}"))).toEqual([]);
  });
});

/* Chapter 3 — Parameters ------------------------------------------------------- */

describe("declaring-parameters", () => {
  it("passing an undeclared parameter is TZS025", () => {
    const files = { "App.tsazor": `<Nested answer="42" />`, "Nested.tsazor": `<p>@answer</p>\n@code {\n    answer?: number;\n}` };
    expect(codes(files)).toEqual(["error:TZS025"]);
    expect(messages(files)).toContain("does not have a parameter 'answer'");
  });

  it("a number parameter takes the attribute as an expression, a string parameter as text", async () => {
    const m = await mount({
      "App.tsazor": `<Nested answer="42" /><Nested answer="6 * 7" /><Text answer="42" />`,
      "Nested.tsazor": `<p>@answer @(typeof answer)</p>\n@code {\n    @Parameter() answer?: number;\n}`,
      "Text.tsazor": `<p>@answer @(typeof answer)</p>\n@code {\n    @Parameter() answer?: string;\n}`,
    });
    expect(m.html()).toBe("<p>42 number</p><p>42 number</p><p>42 string</p>");
  });

  it("types are not optional: an untyped parameter and a value that doesn't fit are errors before the app runs", () => {
    const nested = (declaration: string) => `<p>@answer</p>
@code {
    ${declaration}
}`;
    expect(typeCodes({ "App.tsazor": `<Nested answer="42" />`, "Nested.tsazor": nested("@Parameter() answer;") })).toEqual(["TS7008"]);
    expect(typeCodes({ "App.tsazor": `<Nested answer="@("42")" />`, "Nested.tsazor": nested("@Parameter() answer?: number;") })).toEqual(["TS1360"]);
    // A default value gives the field its type too.
    expect(typeCodes({ "App.tsazor": `<Nested answer="42" />`, "Nested.tsazor": nested("@Parameter() answer = 0;") })).toEqual([]);
    expect(typeCodes({ "App.tsazor": `<Nested answer="@("42")" />`, "Nested.tsazor": nested("@Parameter() answer = 0;") })).toEqual(["TS1360"]);
  });

  it("text for a number parameter is read as code — the error says so", () => {
    const files = { "App.tsazor": `<Nested answer="hello" />`, "Nested.tsazor": `<p>@answer</p>\n@code {\n    @Parameter() answer?: number;\n}` };
    const [diagnostic, ...rest] = checker.check(files);
    expect(rest).toEqual([]);
    expect(diagnostic!.code).toBe("TS2339");
    expect(diagnostic!.message).toBe(
      "Property 'hello' does not exist on type 'App'. Note: 'answer' on <Nested> is a 'number' parameter, so its value is read as a TypeScript expression, not as text.",
    );
  });

  it("names match case-insensitively", async () => {
    const m = await mount({ "App.tsazor": `<Nested Answer="42" />`, "Nested.tsazor": `<p>@answer</p>\n@code {\n    @Parameter() answer?: number;\n}` });
    expect(m.html()).toBe("<p>42</p>");
  });
});

describe("default-values", () => {
  it("the initializer is the default; a parameter the parent stops passing keeps its value", async () => {
    const m = await mount({
      "App.tsazor": `@if (pass) {\n    <Nested answer="42" />\n} else {\n    <Nested />\n}\n<Nested />\n@code {\n    pass = true;\n}`,
      "Nested.tsazor": `<p>@answer @(typeof answer)</p>\n@code {\n    @Parameter() answer = "a mystery";\n}`,
    });
    expect(m.html()).toBe("<p>42 string</p><p>a mystery string</p>");
    // Same position, attribute dropped: the retained instance keeps "42" (Blazor semantics).
    const keep = await mount({
      "App.tsazor": `<Nested answer="@value" />\n@code {\n    value?: string = "42";\n}`,
      "Nested.tsazor": `<p>@answer</p>\n@code {\n    @Parameter() answer = "a mystery";\n}`,
    });
    expect(keep.html()).toBe("<p>42</p>");
  });

  it("a retained child that no longer gets the attribute keeps the last value", async () => {
    // Rendered by hand: the same component frame first with, then without the parameter.
    const { ComponentBase: Base, Parameter: Param } = await import("@tsazor/runtime");
    class Nested extends Base {
      answer = "a mystery";
      protected override buildRenderTree(b: import("@tsazor/runtime").RenderTreeBuilder): void {
        b.addContent(0, this.answer);
      }
    }
    (await import("@tsazor/runtime")).defineParameter(Nested, "answer");
    void Param;
    class Parent extends Base {
      pass = true;
      protected override buildRenderTree(b: import("@tsazor/runtime").RenderTreeBuilder): void {
        b.openComponent(0, Nested);
        if (this.pass) b.addAttribute(1, "answer", "42");
        b.closeComponent();
      }
    }
    const result = await render(Parent);
    expect(result.container.textContent).toBe("42");
    (result.instance as unknown as { pass: boolean }).pass = false;
    await result.rerender();
    expect(result.container.textContent).toBe("42");
    result.dispose();
  });
});

describe("typed-checks", () => {
  const lesson = loadContent(path.join(appRoot, "content"))
    .parts[0]!.chapters.flatMap((chapter) => chapter.lessons)
    .find((candidate) => candidate.slug === "typed-checks")!;

  it("the start state runs, but the check reports TS2339 (unknown member) and TS1360 (wrong parameter type) on their lines", async () => {
    const m = await mount(lesson.a);
    expect(m.html()).toContain("Welcome back, !");
    expect(m.html()).toContain("1 new messages");
    const types = checker.check(lesson.a);
    expect(types.map((d) => `${d.file}:${d.line} ${d.code}`)).toEqual(["App.tsazor:1 TS2339", "App.tsazor:2 TS1360"]);
    expect(types[0]!.message).toContain("'nmae'");
    expect(types[1]!.message).toBe("Type 'string' does not satisfy the expected type 'number'.");
    // The squiggle covers the attribute.
    expect(types[1]!.column).toBe("<Badge ".length);
    expect(checker.check(lesson.b!)).toEqual([]);
  });
});

describe("attribute-splatting", () => {
  const fancy = (button: string) => `${button}\n@code {\n    @Parameter() label = "";\n    @Parameter({ captureUnmatchedValues: true }) attributes?: Record<string, unknown>;\n}`;

  it("without a capture parameter, extra attributes and @onclick are TZS025", () => {
    const files = { "App.tsazor": `<Fancy label="x" title="t" @onclick="push" />\n@code {\n    push() {}\n}`, "Fancy.tsazor": `<button>@label</button>\n@code {\n    @Parameter() label = "";\n}` };
    expect(codes(files)).toEqual(["error:TZS025", "error:TZS025"]);
  });

  it("captured attributes are splatted, the handler runs on the parent, which re-renders", async () => {
    const m = await mount({
      "App.tsazor": `<Fancy label="Push" title="t" @onclick="push" />\n<p>@pushes</p>\n@code {\n    pushes = 0;\n    push() { this.pushes++; }\n}`,
      "Fancy.tsazor": fancy(`<button class="fancy" @attributes="attributes">@label</button>`),
    });
    expect(m.html()).toContain('<button class="fancy" title="t">Push</button>');
    click(m);
    await m.settle();
    expect(m.html()).toContain("<p>1</p>");
  });

  it("the last attribute wins; no extras is fine at runtime and in the check", async () => {
    const before = await mount({ "App.tsazor": `<Fancy label="x" class="big" />`, "Fancy.tsazor": fancy(`<button class="fancy" @attributes="attributes">@label</button>`) });
    expect(before.html()).toBe('<button class="big">x</button>');
    const after = await mount({ "App.tsazor": `<Fancy label="x" class="big" />`, "Fancy.tsazor": fancy(`<button @attributes="attributes" class="fancy">@label</button>`) });
    expect(after.html()).toBe('<button class="fancy">x</button>');
    const none = { "App.tsazor": `<Fancy label="x" />`, "Fancy.tsazor": fancy(`<button class="fancy" @attributes="attributes">@label</button>`) };
    expect((await mount(none)).html()).toBe('<button class="fancy">x</button>');
    expect(typeCodes(none)).toEqual([]);
  });
});

/* Chapter 4 — Logic -------------------------------------------------------------- */

describe("if-else", () => {
  it("else / else if; control bodies are code: locals feed the markup, @: is a text line", async () => {
    const m = await mount(
      app(
        `@if (n > 1) {\n    <p>many</p>\n} else if (n === 1) {\n    const word = "one";\n    <p>@word</p>\n    @:just @word\n} else {\n    <p>none</p>\n}`,
        "n = 1;",
      ),
    );
    expect(m.html()).toBe("<p>one</p>just one");
  });

  it("narrowing: the type check accepts a member access inside @if, not outside", () => {
    const code = `user: { email?: string } = {};`;
    expect(typeCodes(app(`@if (user.email) {\n    <p>@user.email.toUpperCase()</p>\n}`, code))).toEqual([]);
    expect(typeCodes(app(`<p>@user.email.toUpperCase()</p>`, code))).toEqual(["TS2532"]); // possibly undefined
  });
});

describe("foreach", () => {
  it("for…of over arrays, Maps and Sets, with destructuring; for…in iterates keys", async () => {
    const m = await mount(
      app(
        `@foreach (const [index, item] of items.entries()) {\n    <i>@index:@item</i>\n}\n@foreach (const [k, v] of map) {\n    <b>@k=@v</b>\n}\n@foreach (const s of set) {\n    <u>@s</u>\n}\n@foreach (const key in items) {\n    <s>@key</s>\n}`,
        `items = ["a", "b"];\nmap = new Map([["x", 1]]);\nset = new Set(["y"]);`,
      ),
    );
    expect(m.html()).toBe("<i>0:a</i><i>1:b</i><b>x=1</b><u>y</u><s>0</s><s>1</s>");
  });

  it("C# headers are TZS021 naming the TS form; var is warning TZS022; @for/@while/@do are TS loops", async () => {
    const csharp = app(`@foreach (var item in items) {\n    <li>@item</li>\n}`, `items = ["a"];`);
    expect(codes(csharp)).toEqual(["error:TZS021"]);
    expect(messages(csharp)).toContain("const item of items");
    expect(codes(app(`@foreach (var item of items) {\n    <li>@item</li>\n}`, `items = ["a"];`))).toEqual(["warning:TZS022"]);
    const m = await mount(
      app(`@for (let i = 0; i < 2; i++) {\n    <i>@i</i>\n}\n@{ let n = 0; }\n@while (n < 2) {\n    <b>@n</b>\n    n++;\n}\n@do {\n    <u>@n</u>\n    n++;\n} while (n < 3);`),
    );
    expect(m.html()).toBe("<i>0</i><i>1</i><b>0</b><b>1</b><u>2</u>");
  });
});

describe("keyed-blocks", () => {
  const files = (key: string): Files => ({
    "App.tsazor": `<button @onclick="removeFirst">x</button>\n@foreach (const thing of things) {\n    <Thing name="@thing.name"${key} />\n}\n@code {\n    things = [{ id: 1, name: "apple" }, { id: 2, name: "banana" }, { id: 3, name: "carrot" }];\n    removeFirst() { this.things = this.things.slice(1); }\n}`,
    "Thing.tsazor": `<p>@emoji @name</p>\n@code {\n    @Parameter() name = "";\n    emoji = "";\n    override onInitialized() { this.emoji = this.name[0]!.toUpperCase(); }\n}`,
  });

  it("without @key, instances are matched by position (the last one goes); with @key, by key", async () => {
    const positional = await mount(files(""));
    click(positional);
    await positional.settle();
    expect(positional.html()).toBe("<button>x</button><p>A banana</p><p>B carrot</p>");
    const keyed = await mount(files(` @key="thing.id"`));
    click(keyed);
    await keyed.settle();
    expect(keyed.html()).toBe("<button>x</button><p>B banana</p><p>C carrot</p>");
  });

  it("duplicate keys are an error", async () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      await mount(app(`@foreach (const n of items) {\n    <p @key="n">@n</p>\n}`, "items = [1, 1];"));
    } finally {
      console.error = original;
    }
    expect((errors as unknown[][]).flat().map(String).join("\n")).toContain("More than one sibling of element 'p' has the same key value, '1'.");
  });
});

describe("loading-data", () => {
  it("an async onInitialized renders the loading state, then the data", async () => {
    const files: Files = {
      "App.tsazor": `@import { load } from "./data"\n@if (items === undefined) {\n    <p>Loading…</p>\n} else {\n    <p>@items.length</p>\n}\n@code {\n    items?: string[];\n    override async onInitialized() {\n        this.items = await load();\n    }\n}`,
      "data.ts": `export let release!: (items: string[]) => void;\nexport function load(): Promise<string[]> {\n    return new Promise((resolve) => { release = resolve; });\n}\n`,
    };
    const build = buildProject(files);
    const dir = path.join(gateDir, String(counter++));
    mkdirSync(dir, { recursive: true });
    for (const module of Object.values(build.modules)) {
      writeFileSync(path.join(dir, `${module.file}.js`), module.code.replace(/(["'])\$app\/([^"']+)\1/g, "$1./$2.js$1"));
    }
    const { Renderer } = await import("@tsazor/runtime");
    const App = ((await import(pathToFileURL(path.join(dir, "App.tsazor.js")).href)) as { default: never }).default;
    const data = (await import(pathToFileURL(path.join(dir, "data.ts.js")).href)) as { release: (items: string[]) => void };
    const container = document.createElement("div");
    const renderer = new Renderer();
    renderer.renderInContainer(App, container);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).toBe("Loading…");
    data.release(["a", "b"]);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("2");
  });

  it("the type check rejects iterating the possibly-undefined field, and accepts it narrowed", () => {
    const code = "items?: string[];";
    expect(typeCodes(app(`@foreach (const item of items) {\n    <p>@item</p>\n}`, code))).toEqual(["TS2532"]); // possibly undefined
    expect(typeCodes(app(`@if (items === undefined) {\n    <p>…</p>\n} else {\n    @foreach (const item of items) {\n        <p>@item</p>\n    }\n}`, code))).toEqual([]);
  });
});

/* Chapter 5 — Events ------------------------------------------------------------- */

describe("dom-events", () => {
  it("the handler receives the native DOM event", async () => {
    const m = await mount(app(`<div @onpointermove="move">@x × @y @kind</div>`, "x = 0;\ny = 0;\nkind = \"\";\nmove(event: MouseEvent) {\n    this.x = event.clientX;\n    this.y = event.clientY;\n    this.kind = event instanceof Event ? event.type : \"?\";\n}"));
    m.container.querySelector("div")!.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 20 }));
    await m.settle();
    expect(m.html()).toBe("<div>10 × 20 pointermove</div>");
  });

  it("the check trusts the annotation (it is not compared with the event name)", () => {
    expect(typeCodes(app(`<div @onpointermove="move">x</div>`, "move(event: KeyboardEvent) { void event.key; }"))).toEqual([]);
  });
});

describe("inline-handlers", () => {
  it("arrow functions with arguments; const and let loop variables are captured per iteration", async () => {
    const m = await mount(
      app(
        `@foreach (const color of colors) {\n    <button class="a" @onclick="() => picked = color">@color</button>\n}\n@for (let i = 0; i < colors.length; i++) {\n    <button class="b" @onclick="() => pick(colors[i])">@i</button>\n}\n<p>@picked</p>`,
        `colors = ["red", "gold", "blue"];\npicked = "";\npick(color: string) { this.picked = color; }`,
      ),
    );
    (m.container.querySelectorAll("button.a")[1] as HTMLElement).click();
    await m.settle();
    expect(m.html()).toContain("<p>gold</p>");
    (m.container.querySelectorAll("button.b")[2] as HTMLElement).click();
    await m.settle();
    expect(m.html()).toContain("<p>blue</p>");
  });

  it("var in a counting loop warns (TZS022); value-returning lambdas and an event parameter type-check", () => {
    expect(codes(app(`@for (var i = 0; i < 2; i++) {\n    <button @onclick="() => n = i">x</button>\n}`, "n = 0;"))).toEqual(["warning:TZS022"]);
    expect(typeCodes(app(`<button @onclick="() => count++">+</button>`, "count = 0;"))).toEqual([]);
    expect(typeCodes(app(`<button @onclick="(event) => pick(event.shiftKey)">x</button>`, "pick(shift: boolean) { void shift; }"))).toEqual([]);
  });
});

describe("event-modifiers", () => {
  it(":stopPropagation stops the bubbling; without it both handlers run (inner first)", async () => {
    const markup = (modifier: string) => `<div class="card" @onclick="open"><button @onclick="archive"${modifier}>a</button></div><p>@(log.join(", "))</p>`;
    const code = `log: string[] = [];\nopen() { this.log.push("opened"); }\narchive() { this.log.push("archived"); }`;
    const bubbling = await mount(app(markup(""), code));
    click(bubbling);
    await bubbling.settle();
    expect(bubbling.html()).toContain("<p>archived, opened</p>");
    const stopped = await mount(app(markup(" @onclick:stopPropagation"), code));
    click(stopped);
    await stopped.settle();
    expect(stopped.html()).toContain("<p>archived</p>");
  });

  it(":preventDefault works without a handler and takes a condition; preventDefault() in a handler works synchronously", async () => {
    // (The form gets a mount of its own: happy-dom's HTMLFormElement reports no
    // nextSibling, which breaks DOM updates of its following siblings — see
    // port-findings J.)
    const form = await mount(app(`<form @onsubmit:preventDefault></form>`));
    const submit = new Event("submit", { bubbles: true, cancelable: true });
    form.container.querySelector("form")!.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);

    const m = await mount(app(`<a href="#x" @onclick:preventDefault="block">a</a><button @onclick="handle">b</button>`, "block = false;\nhandle(event: MouseEvent) { event.preventDefault(); }"));
    const link = new MouseEvent("click", { bubbles: true, cancelable: true });
    m.container.querySelector("a")!.dispatchEvent(link);
    expect(link.defaultPrevented).toBe(false);
    m.instance.block = true;
    m.instance.stateHasChangedInternal();
    await m.settle();
    const blocked = new MouseEvent("click", { bubbles: true, cancelable: true });
    m.container.querySelector("a")!.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);
    const own = new MouseEvent("click", { bubbles: true, cancelable: true });
    m.container.querySelector("button")!.dispatchEvent(own);
    expect(own.defaultPrevented).toBe(true); // already when dispatchEvent returns
  });

  it("on a component, a modifier is an ordinary attribute that lands in @attributes", async () => {
    const m = await mount({
      "App.tsazor": `<Link @onclick:preventDefault />`,
      "Link.tsazor": `<a href="#x" @attributes="attributes">a</a>\n@code {\n    @Parameter({ captureUnmatchedValues: true }) attributes?: Record<string, unknown>;\n}`,
    });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    m.container.querySelector("a")!.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });
});

describe("component-events", () => {
  const inner = (declaration: string, call: string) =>
    `<button @onclick="sayHello">s</button>\n@code {\n    ${declaration}\n    async sayHello() {\n        ${call}\n    }\n}`;

  it("an EventCallback re-renders the parent; a plain function parameter does not", async () => {
    const callback = await mount({
      "App.tsazor": `<Inner onMessage="handle" /><p>@text</p>\n@code {\n    text = "";\n    handle(message: string) { this.text = message; }\n}`,
      "Inner.tsazor": inner("@Parameter() onMessage?: EventCallback<string>;", `await this.onMessage?.invokeAsync("Hello!");`),
    });
    click(callback);
    await callback.settle();
    expect(callback.html()).toContain("<p>Hello!</p>");

    const plain = await mount({
      "App.tsazor": `<Inner onMessage="handle" /><p>@text</p>\n@code {\n    text = "";\n    handle(message: string) { this.text = message; }\n}`,
      "Inner.tsazor": inner("@Parameter() onMessage?: (text: string) => void;", `this.onMessage?.("Hello!");`),
    });
    click(plain);
    await plain.settle();
    expect(plain.instance.text).toBe("Hello!");
    expect(plain.html()).toContain("<p></p>");
  });

  it("EventCallback.empty as the default type-checks and does nothing", async () => {
    const files = {
      "App.tsazor": `<Inner /><p>ok</p>`,
      "Inner.tsazor": `@import { EventCallback } from "@tsazor/runtime"\n${inner("@Parameter() onMessage: EventCallback<string> = EventCallback.empty;", `await this.onMessage.invokeAsync("x");`)}`,
    };
    expect(typeCodes(files)).toEqual([]);
    const m = await mount(files);
    click(m);
    await m.settle();
    expect(m.html()).toContain("<p>ok</p>");
  });
});

/* Chapter 6 — Bindings ----------------------------------------------------------- */

describe("text-inputs", () => {
  it("@bind writes back on change, not on input", async () => {
    const m = await mount(app(`<input @bind="name" /><h1>Hello @name!</h1>`, `name = "world";`));
    setValue(m, "input", "Tsazor", "input");
    await m.settle();
    expect(m.html()).toContain("Hello world!");
    setValue(m, "input", "Tsazor");
    await m.settle();
    expect(m.html()).toContain("Hello Tsazor!");
  });

  it("non-assignable targets: calls and ?. are compile errors, a getter is a type error", () => {
    expect(codes(app(`<input @bind="get()" />`, `get() { return ""; }`))).toEqual(["error:TZS008"]);
    expect(codes(app(`<input @bind="user?.name" />`, `user?: { name: string };`))).toEqual(["error:TZS008"]);
    expect(codes(app(`@foreach (const item of items) {\n    <input @bind="item" />\n}`, `items = ["a"];`))).toEqual(["error:TZS008"]);
    expect(codes(app(`@foreach (const item of items) {\n    <input @bind="item.name" />\n}`, `items = [{ name: "a" }];`))).toEqual([]);
    const getter = app(`<input @bind="label" />`, `get label() { return "x"; }`);
    expect(codes(getter)).toEqual([]);
    expect(typeCodes(getter)).toEqual(["TS2540"]);
  });
});

describe("numeric-inputs", () => {
  it("number and range inputs convert with Number(); garbage keeps the old value", async () => {
    const m = await mount(app(`<input type="number" @bind="a" /><input type="range" @bind="b" /><p>@(a + b)</p>`, "a = 1;\nb = 2;"));
    setValue(m, "input[type=range]", "5");
    await m.settle();
    expect(m.html()).toContain("<p>6</p>");
    setValue(m, "input[type=number]", "abc");
    await m.settle();
    expect(m.instance.a).toBe(1);
  });

  it("a number field bound to a text input is a type error", () => {
    expect(typeCodes(app(`<input @bind="a" />`, "a = 1;"))).toEqual(["TS2322"]);
    expect(typeCodes(app(`<input type="number" @bind="a" /><input type="range" @bind="a" />`, "a = 1;"))).toEqual([]);
  });
});

describe("checkbox-inputs", () => {
  it("@bind on a checkbox binds checked", async () => {
    const m = await mount(app(`<input type="checkbox" @bind="yes" /><button disabled="@(!yes)">s</button>`, "yes = false;"));
    expect(m.html()).toContain("<button disabled=");
    const box = m.container.querySelector("input")!;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    await m.settle();
    expect(m.instance.yes).toBe(true);
    expect(m.html()).toContain("<button>s</button>");
  });
});

describe("select-bindings", () => {
  const files = app(
    `<label><select @bind="selected">@foreach (const q of questions) {<option value="@q.id">@q.text</option>}</select></label>`,
    `questions = [{ id: "school", text: "S" }, { id: "mother", text: "M" }];\nselected = "mother";`,
  );

  it("the value is applied after the generated options; a change writes the option's string value", async () => {
    const m = await mount(files);
    const select = m.container.querySelector("select")!;
    expect(select.value).toBe("mother");
    select.value = "school";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await m.settle();
    expect(m.instance.selected).toBe("school");
  });

  it("binding a number field to a select is a type error", () => {
    expect(typeCodes(app(`<select @bind="n"><option value="1">1</option></select>`, "n = 1;"))).toEqual(["TS2322"]);
  });
});

describe("bind-event-and-after", () => {
  it(":event picks the DOM event; :after runs after the assignment, awaited, with the intermediate render", async () => {
    const m = await mount({
      "App.tsazor": `@import { gate } from "./gate"\n<input @bind="query" @bind:event="oninput" @bind:after="search" /><p>@status</p>\n@code {\n    query = "";\n    status = "";\n    async search() {\n        this.status = "Searching " + this.query;\n        await gate.promise;\n        this.status = "Found " + this.query;\n    }\n}\n`,
      "gate.ts": `let open!: () => void;\nexport const gate = { promise: new Promise<void>((resolve) => { open = resolve; }), open: () => open() };\n`,
    });
    const gateModule = (await import(pathToFileURL(path.join(gateDir, String(counter - 1), "gate.ts.js")).href)) as { gate: { open(): void } };
    setValue(m, "input", "ap", "input");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(m.html()).toContain("<p>Searching ap</p>");
    gateModule.gate.open();
    await m.settle();
    expect(m.html()).toContain("<p>Found ap</p>");
  });

  it(":after with :set is TZS008; :after takes a lambda", async () => {
    expect(codes(app(`<input @bind:get="q" @bind:set="setQ" @bind:after="done" />`, `q = "";\nsetQ(v: string) { this.q = v; }\ndone() {}`))).toEqual(["error:TZS008"]);
    const m = await mount(app(`<input @bind="q" @bind:after="() => mark(true)" /><p>@marked</p>`, `q = "";\nmarked = false;\nmark(value: boolean) { this.marked = value; }`));
    setValue(m, "input", "x");
    await m.settle();
    expect(m.html()).toContain("<p>true</p>");
  });
});

describe("bind-format", () => {
  it("F2 formats the display and parses the input; F0/F3/0.000 likewise", async () => {
    const m = await mount(app(`<input type="number" @bind="price" @bind:format="F2" /><p>@price</p>`, "price = 4.5;"));
    const input = m.container.querySelector("input")!;
    expect(input.value).toBe("4.50");
    setValue(m, "input", "3.14159");
    await m.settle();
    expect(m.html()).toContain("<p>3.14159</p>");
    expect(input.value).toBe("3.14");
    for (const [format, text] of [["F0", "5"], ["F3", "4.500"], ["0.000", "4.500"]] as const) {
      const other = await mount(app(`<input type="number" @bind="price" @bind:format="${format}" />`, "price = 4.5;"));
      expect(other.container.querySelector("input")!.value, format).toBe(text);
    }
  });

  it("a date input binds through yyyy-MM-dd and parses back as a local date", async () => {
    const m = await mount(app(`<input type="date" @bind="day" /><p>@day.getFullYear()-@(day.getMonth() + 1)-@day.getDate() @day.getHours()</p>`, "day = new Date(2026, 9, 2);"));
    const input = m.container.querySelector("input")!;
    expect(input.value).toBe("2026-10-02");
    setValue(m, "input", "2025-12-24");
    await m.settle();
    expect(m.html()).toContain("<p>2025-12-24 0</p>");
  });

  it("a format on a text input warns TZS008 (no effect); @bind:culture compiles clean (E8)", () => {
    expect(codes(app(`<input @bind="day" @bind:format="dd.MM.yyyy" />`, "day = new Date();"))).toEqual(["warning:TZS008"]);
    // E8: a culture-aware number bind exists (Part 3 covers it) — it compiles
    // without diagnostics; a culture on non-number binds is the TZS008 warning.
    expect(codes(app(`<input type="number" @bind="n" @bind:culture="de" />`, "de = new CultureInfo('de-DE'); n = 1;"))).toEqual([]);
    expect(codes(app(`<input type="date" @bind="day" @bind:culture="de" />`, "de = new CultureInfo('de-DE'); day = new Date();"))).toEqual(["warning:TZS008"]);
  });
});

/** The explicit pair (Blazor track) and the `@Bindable()` short form (both tracks) — the same component. */
const pairStepper = `<button @onclick="() => change(1)">+</button><span>@value</span>\n@code {\n    @Parameter() value = 0;\n    @Parameter() valueChanged?: EventCallback<number>;\n    async change(delta: number) {\n        await this.valueChanged?.invokeAsync(this.value + delta);\n    }\n}`;
const bindableStepper = `<button @onclick="() => change(1)">+</button><span>@value</span>\n@code {\n    @Bindable() accessor value = 0;\n    change(delta: number) {\n        this.value += delta;\n    }\n}`;

describe("component-bindings — @Bindable()", () => {
  it("the lesson's Stepper is the @Bindable short form", () => {
    const lesson = loadContent(path.join(appRoot, "content"))
      .parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.lessons))
      .find((l) => l.slug === "component-bindings")!;
    expect(lesson.a["Stepper.tsazor"]).toContain("@Bindable() accessor value = 0;");
  });

  it("unbound, the component keeps its own value; the parent stays", async () => {
    const m = await mount({ "App.tsazor": `<Stepper value="@guests" /><p>@guests</p>\n@code {\n    guests = 2;\n}`, "Stepper.tsazor": bindableStepper });
    click(m);
    await m.settle();
    expect(m.html()).toBe("<button>+</button><span>3</span><p>2</p>");
  });

  it("assigning the value it already has invokes nothing", async () => {
    const files = {
      "App.tsazor": `<Stepper @bind-value="guests" @bind-value:after="changed" /><p>@calls</p>\n@code {\n    guests = 2;\n    calls = 0;\n    changed() { this.calls++; }\n}`,
      "Stepper.tsazor": `<button @onclick="same">=</button>\n@code {\n    @Bindable() accessor value = 0;\n    same() { this.value = this.value; }\n}`,
    };
    const m = await mount(files);
    click(m);
    await m.settle();
    expect(m.html()).toContain("<p>0</p>");
  });

  it("a plain field is TZS030 (the editor's fix inserts 'accessor')", () => {
    const files = { "App.tsazor": `<p>@value</p>\n@code {\n    @Bindable() value = 0;\n}` };
    expect(codes(files)).toEqual(["error:TZS030"]);
    expect(messages(files)).toContain("@Bindable() needs an auto-accessor: write 'accessor value'");
  });

  it("the callback is a typed member: awaiting it explicitly type-checks", () => {
    const files = { "App.tsazor": `<p>@value</p>\n@code {\n    @Bindable() accessor value = 0;\n    async jump(next: number) {\n        await this.valueChanged?.invokeAsync(next);\n    }\n}` };
    expect(codes(files)).toEqual([]);
    expect(typeCodes(files)).toEqual([]);
  });

  it("{ changed } names the callback for :event; { expression: true } adds valueExpression", async () => {
    const m = await mount({
      "App.tsazor": `<Picker @bind-value="model.size" @bind-value:event="onPick" /><p>@model.size</p>\n@code {\n    model = { size: 1 };\n}`,
      "Picker.tsazor": `<button @onclick="() => value++">@valueExpression</button>\n@code {\n    @Bindable({ changed: "onPick", expression: true }) accessor value = 0;\n}`,
    });
    click(m);
    await m.settle();
    expect(m.html()).toBe("<button>size</button><p>2</p>");
  });

  it("a callback that fails reaches the ErrorBoundary, like an event handler's", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const m = await mount({
        "App.tsazor": `<ErrorBoundary><ChildContent><Stepper @bind-value:get="guests" @bind-value:set="fail" /></ChildContent><ErrorContent>caught: @context</ErrorContent></ErrorBoundary>\n@code {\n    guests = 2;\n    fail(_value: number) { throw "nope"; }\n}`,
        "Stepper.tsazor": bindableStepper,
      });
      click(m);
      await m.settle();
      expect(m.html()).toBe("caught: nope");
    } finally {
      console.error = original;
    }
  });
});

describe.each([
  ["the explicit pair", pairStepper],
  ["@Bindable()", bindableStepper],
])("component-bindings — %s", (_form, stepper) => {
  for (const usage of [`<Stepper @bind-value="guests" />`, `<Stepper @bind-Value="guests" />`, `<Stepper value="@guests" valueChanged="(value) => guests = value" />`]) {
    it(`${usage} binds both ways and type-checks`, async () => {
      const files = { "App.tsazor": `${usage}<p>@guests</p>\n@code {\n    guests = 2;\n}`, "Stepper.tsazor": stepper };
      expect(typeCodes(files)).toEqual([]);
      const m = await mount(files);
      click(m);
      await m.settle();
      expect(m.html()).toBe("<button>+</button><span>3</span><p>3</p>");
    });
  }

  it("@bind-value:after runs after the parent's field was assigned", async () => {
    const files = { "App.tsazor": `<Stepper @bind-value="guests" @bind-value:after="changed" /><p>@note</p>\n@code {\n    guests = 2;\n    note = "";\n    changed() { this.note = "now " + this.guests; }\n}`, "Stepper.tsazor": stepper };
    expect(typeCodes(files)).toEqual([]);
    const m = await mount(files);
    click(m);
    await m.settle();
    expect(m.html()).toContain("<p>now 3</p>");
  });

  it("a parent's new value reaches the child, which renders again", async () => {
    const m = await mount({ "App.tsazor": `<Stepper value="@guests" /><button class="set" @onclick="() => guests = 7">7</button>\n@code {\n    guests = 2;\n}`, "Stepper.tsazor": stepper });
    click(m, "button.set");
    await m.settle();
    expect(m.html()).toContain("<span>7</span>");
  });

  it("without the binding, the parent never hears about the change", async () => {
    const m = await mount({ "App.tsazor": `<Stepper value="@guests" /><p>@guests</p>\n@code {\n    guests = 2;\n}`, "Stepper.tsazor": stepper });
    click(m);
    await m.settle();
    // The pair only proposes (the child shows 2); @Bindable keeps its own value (3).
    expect(m.html()).toBe(`<button>+</button><span>${stepper === pairStepper ? 2 : 3}</span><p>2</p>`);
  });

  it(":get/:set — a setter that normalizes wins over the child's value", async () => {
    const files = { "App.tsazor": `<Stepper @bind-value:get="guests" @bind-value:set="store" /><p>@guests</p>\n@code {\n    guests = 2;\n    store(value: number) { this.guests = Math.min(value, 2); }\n}`, "Stepper.tsazor": stepper };
    expect(typeCodes(files)).toEqual([]);
    const m = await mount(files);
    click(m);
    await m.settle();
    expect(m.html()).toBe("<button>+</button><span>2</span><p>2</p>");
  });
});

/* Chapter 7 — Classes & styles --------------------------------------------------- */

describe("class-expressions", () => {
  it("null in a mixed class value renders as nothing; a getter can build the list", async () => {
    const m = await mount(
      app(`<button class="card @(flipped ? "flipped" : null)" @onclick="flip">x</button><i class="@cardClass">y</i>`, `flipped = false;\ndisabled = true;\nflip() { this.flipped = !this.flipped; }\nget cardClass() {\n    return ["card", this.flipped && "flipped", this.disabled && "disabled"].filter(Boolean).join(" ");\n}`),
    );
    expect(m.html()).toBe('<button class="card ">x</button><i class="card disabled">y</i>');
    click(m);
    await m.settle();
    expect(m.html()).toBe('<button class="card flipped">x</button><i class="card flipped disabled">y</i>');
  });
});

describe("inline-styles", () => {
  it("style values mix text and expressions; numbers render culture-independently", async () => {
    const m = await mount(app(`<p style="color: hsl(@hue 80% 45%); font-size: @(size)rem">x</p><i style="--hue: @hue">y</i>`, "hue = 200;\nsize = 2.5;"));
    expect(m.html()).toBe('<p style="color: hsl(200 80% 45%); font-size: 2.5rem">x</p><i style="--hue: 200">y</i>');
  });

  it("without parentheses, `@sizerem` reads a member called sizerem (empty, and TS2339)", async () => {
    const files = app(`<p style="font-size: @sizerem">x</p>`, "size = 2;");
    expect((await mount(files)).html()).toBe('<p style="font-size: ">x</p>');
    expect(typeCodes(files)).toEqual(["TS2339"]);
  });
});

describe("deep-styles", () => {
  it("`.boxes ::deep .box` scopes only the part before ::deep; a leading ::deep anchors to the scope attribute", () => {
    expect(scopeCss(".boxes ::deep .box { color: red; }", "b-1")).toContain(".boxes[b-1] .box {");
    expect(scopeCss("::deep .box { color: red; }", "b-1")).toContain("[b-1] .box {");
    const build = buildProject({ "App.tsazor": `<div class="boxes"><Box /></div>`, "App.tsazor.css": ".box { color: red; }\n.boxes ::deep .box { color: blue; }", "Box.tsazor": `<div class="box">b</div>` });
    expect(build.css).toMatch(/\.box\[b-[0-9a-f]{8}\] \{ color: red; \}/);
    expect(build.css).toMatch(/\.boxes\[b-[0-9a-f]{8}\] \.box \{ color: blue; \}/);
  });
});
