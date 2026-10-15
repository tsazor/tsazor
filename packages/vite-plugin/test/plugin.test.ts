import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tsazor } from "../src";
import { generateRoutesModule } from "../src/routes";
import { lazyRouteFilter } from "../src/lazy-routes";
import { processScopedCss, scopeHashFor, scopeSelector } from "../src/scoped-css";

const COUNTER = /* tsazor */ `
@page "/counter"
@inject NavigationManager Nav
@inject CounterService CounterService

<h1>Counter</h1>

<Greeter Name="@Nav.title" />

<p>Current count: @currentCount</p>
<button @onclick="incrementCount">Click me</button>

@code {
    private currentCount = 0;
    private incrementCount() {
        this.currentCount++;
    }
}
`;

const FETCH_DATA = /* tsazor */ `
@page "/fetchdata"
@layout MainLayout

<h1>Weather</h1>
<p>@summary</p>

@code {
    private string summary = "Sunny";
}
`;

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-plugin-"));
  await mkdir(path.join(root, "Shared"), { recursive: true });
  await mkdir(path.join(root, "Pages"), { recursive: true });
  await mkdir(path.join(root, "services"), { recursive: true });
  await writeFile(
    path.join(root, "_Imports.tsazor"),
    '@using ./Shared\n@using ./services\n@import { formatDate, Status } from "./helpers"\n',
  );
  await writeFile(
    path.join(root, "helpers.ts"),
    'export enum Status { Open = "open", Done = "done" }\nexport function formatDate(value: string): string { return "on " + value; }\n',
  );
  await writeFile(path.join(root, "MainLayout.tsazor"), "<div>@Body</div>\n");
  await writeFile(
    path.join(root, "Shared", "Greeter.tsazor"),
    "<p>Hello, @Name!</p>\n\n@code {\n    @Parameter() Name?: string;\n}\n",
  );
  await writeFile(path.join(root, "services", "CounterService.ts"), "export class CounterService {}\n");
  await writeFile(path.join(root, "Pages", "Counter.tsazor"), COUNTER);
  await writeFile(path.join(root, "Pages", "FetchData.tsazor"), FETCH_DATA);
  await writeFile(path.join(root, "Pages", "Home.tsazor"), '@page "/"\n@page "/home"\n@layout MainLayout\n<h1>Home</h1>\n');
  await writeFile(
    path.join(root, "Shared", "Greeter.tsazor.css"),
    "h1 { color: red; }\n.list > .item:hover { color: blue; }\n/* .a { } */\n@keyframes spin { from { opacity: 1; } }\n",
  );
  await writeFile(
    path.join(root, "Shared", "Greeter.tsazor.ts"),
    'import { ComponentBase, Parameter } from "@tsazor/runtime";\n\nexport default class Greeter extends ComponentBase {\n    @Parameter() Name = "";\n    count = 0;\n}\n',
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function createPlugin(options: { optimize?: boolean } = {}) {
  const { tsazor } = await import("../src");
  const plugin = tsazor({ root, ...options });
  (plugin.configResolved as unknown as (config: { root: string }) => void)({ root });
  return plugin;
}

describe("tsazor vite plugin", () => {
  it("compiles a .tsazor file into JS with a runtime import and HMR appendix", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, COUNTER, path.join(root, "Pages", "Counter.tsazor"));
    expect(result).not.toBeNull();
    expect(result!.code).toContain("class Counter");
    expect(result!.code).toContain('from "@tsazor/runtime"');
    expect(result!.code).toContain("import.meta.hot");
    expect(result!.code).toContain("globalThis.__tsazor?.hmrSwap(previous, mod.default)");
    expect(result!.code).toContain("previousDefault ??= Counter");
  });

  it("resolves component tags through _Imports.tsazor @using directories", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, COUNTER, path.join(root, "Pages", "Counter.tsazor"));
    expect(result!.code).toContain('from "../Shared/Greeter.tsazor"');
  });

  it("resolves @inject types from bare and path-like usings", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, COUNTER, path.join(root, "Pages", "Counter.tsazor"));
    expect(result!.code).toContain('from "@tsazor/runtime"');
    // services/CounterService.ts has a named export only: the import must be named (review I3).
    expect(result!.code).toContain('import { CounterService } from "../services/CounterService"');
    expect(result!.code).not.toContain("import CounterService from");
  });

  it("inherits @import from _Imports.tsazor with the specifier rebased to the file", async () => {
    const plugin = await createPlugin();
    const source = '<p>@formatDate(day) @Status.Open</p>\n\n@code {\n    day = "monday";\n}\n';
    const result = await plugin.transform?.call({} as never, source, path.join(root, "Pages", "Report.tsazor"));
    expect(result!.code).toMatch(/import \{ formatDate, Status \} from "\.\.\/helpers";/);
    // Imported names are free names — never baked to this.X (review I2).
    expect(result!.code).toContain("formatDate(this.day)");
    expect(result!.code).toContain("Status.Open");
    expect(result!.code).not.toContain("this.Status");
    expect(result!.code).not.toContain("this.formatDate");
  });

  it("does not import a PascalCase member that shares a runtime type name (review I1)", async () => {
    const plugin = await createPlugin();
    const source = "<p>@Token</p>\n\n@code {\n    @Parameter() Token?: string;\n}\n";
    const result = await plugin.transform?.call({} as never, source, path.join(root, "Pages", "Tokened.tsazor"));
    expect(result!.code).not.toMatch(/import \{[^}]*\bToken\b[^}]*\} from "@tsazor\/runtime"/);
    expect(result!.code).toContain("this.Token");
  });

  it("fails the importing module for an invalid @import in _Imports.tsazor", async () => {
    const dir = path.join(root, "BrokenImports");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "_Imports.tsazor"), '@import { formatDate from "../helpers"\n');
    const plugin = await createPlugin();
    await expect(plugin.transform?.call({} as never, "<p>x</p>", path.join(dir, "Page.tsazor"))).rejects.toThrow(/TZS016/);
  });

  it("rejects a tag that resolves in two @using sources (TZS017)", async () => {
    const dir = path.join(root, "Ambiguous");
    await mkdir(path.join(dir, "A"), { recursive: true });
    await mkdir(path.join(dir, "B"), { recursive: true });
    await writeFile(path.join(dir, "_Imports.tsazor"), "@using ./A\n@using ./B\n");
    await writeFile(path.join(dir, "A", "Chip.tsazor"), "<span>a</span>\n");
    await writeFile(path.join(dir, "B", "Chip.tsazor"), "<span>b</span>\n");
    const plugin = await createPlugin();
    await expect(plugin.transform?.call({} as never, "<Chip />", path.join(dir, "Page.tsazor"))).rejects.toThrow(/TZS017/);
  });

  it("emits a chained sourcemap pointing at the .tsazor file", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, COUNTER, path.join(root, "Pages", "Counter.tsazor"));
    const map = JSON.parse(result!.map as string) as { sources: string[]; sourcesContent: string[] | null; mappings: string };
    expect(map.sources[0]).toBe("Counter.tsazor");
    expect(map.sourcesContent).toEqual([COUNTER]);
    expect(map.mappings.length).toBeGreaterThan(10);
  });

  it("maps code inside a hoisted event handler (H1) back to its .tsazor position", async () => {
    const source = "@foreach (const row of rows) {\n    <a @onclick=\"e => select(e, row)\">@row</a>\n}\n@code { rows = [1]; select(e: unknown, r: number) {} }\n";
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, source, path.join(root, "Pages", "Rows.tsazor"));
    const code = result!.code as string;
    expect(code).toContain("bindWith(this, Rows.prototype.__tsazor_h0, [row])");
    const lines = code.split("\n");
    const line = lines.findIndex((l) => l.includes("this.select(e, row)"));
    expect(line).toBeGreaterThanOrEqual(0);
    const { TraceMap, originalPositionFor } = await import("@jridgewell/trace-mapping");
    const traced = originalPositionFor(new TraceMap(result!.map as string), { line: line + 1, column: lines[line]!.indexOf("select") });
    // `select` in `@onclick="e => select(e, row)"`: line 2, column 22.
    expect({ line: traced.line, column: traced.column }).toEqual({ line: 2, column: 22 });
  });

  it("optimize: false emits a closure per render and no markup blocks (D-R4)", async () => {
    const source = "@foreach (const row of rows) {\n    <a @onclick=\"() => select(row)\">x</a>\n}\n<p><b>static</b></p>\n@code { rows = [1]; select(r: number) {} }\n";
    const plugin = tsazor({ root, optimize: false });
    (plugin.configResolved as unknown as (config: { root: string }) => void)({ root });
    const code = (await plugin.transform?.call({} as never, source, path.join(root, "Pages", "Hints.tsazor")))!.code as string;
    expect(code).toContain("bind(this, () => this.select(row))");
    expect(code).not.toContain("__tsazor_h0");
    expect(code).not.toContain("addMarkupContent");
  });

  it("compiles _Imports.tsazor to an empty module", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, "@using ./Shared\n", path.join(root, "_Imports.tsazor"));
    expect(result!.code.trim()).toBe("export default null;");
  });

  it("throws located errors for compiler diagnostics (dev-server overlay)", async () => {
    const plugin = await createPlugin();
    await expect(
      plugin.transform?.call({} as never, "<div>\n  <p>unclosed\n", path.join(root, "Pages", "Broken.tsazor")),
    ).rejects.toThrow(/TZS002/);
  });

  it("writes a diagnostic as tsazor check does: file(line,column) CODE message, 1-based (T6)", async () => {
    const plugin = await createPlugin();
    const failure = await Promise.resolve(plugin.transform?.call({} as never, "<p>@(1 + </p>\n", path.join(root, "Pages", "Broken.tsazor"))).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure?.message).toMatch(/^\[tsazor\] compile errors\n {2}Pages\/Broken\.tsazor\(1,4\) TZS003 /);
  });

  it("serves esbuild's decorator helpers once: a component imports them from virtual:tsazor-decorators", async () => {
    const plugin = await createPlugin();
    expect(plugin.resolveId?.call({} as never, "virtual:tsazor-decorators")).toBe("\0virtual:tsazor-decorators");
    const helpers = (await plugin.load?.call({} as never, "\0virtual:tsazor-decorators")) as string;
    expect(helpers).toContain("var __decorateElement");
    expect(helpers).toMatch(/\nexport \{ __[\w, ]+ \};\n$/);
    // A decorator esbuild lowers (an accessor's): its helpers come from the shared module.
    const source = "<p>@count</p>\n@code {\n    @State() accessor count = 0;\n}\n";
    const result = (await plugin.transform?.call({} as never, source, path.join(root, "Pages", "Counted.tsazor"))) as { code: string };
    expect(result.code).toMatch(/^import \{ __[\w, ]+ \} from "virtual:tsazor-decorators";/);
    expect(result.code).not.toContain("var __decorateElement");

    // A built library's own helper module re-exports the app's; a copy another esbuild wrote differently stays.
    const library = path.join(root, "node_modules", "lib", "dist", "_decorators.js");
    const shared = (await plugin.transform?.call({} as never, helpers, library)) as { code: string };
    expect(shared.code).toMatch(/^import \{ __[\w, ]+ \} from "virtual:tsazor-decorators";\s*export \{ __[\w, ]+ \};\n$/);
    const other = helpers.replace("var __decorateElement = ", "var __decorateElement = /* another esbuild */ ");
    const kept = (await plugin.transform?.call({} as never, other, library)) as { code: string };
    expect(kept.code).toContain("var __decorateElement = /* another esbuild */");
  });

  it("resolves the virtual routes module id", async () => {
    const plugin = await createPlugin();
    expect(plugin.resolveId?.call({} as never, "virtual:tsazor-routes")).toBe("\0virtual:tsazor-routes");
    expect(plugin.resolveId?.call({} as never, "./Other.ts")).toBeNull();
  });

  it("generates a route manifest from @page files with layouts", async () => {
    const plugin = await createPlugin();
    const module = await plugin.load?.call({} as never, "\0virtual:tsazor-routes");
    expect(module).not.toBeNull();
    expect(module).toContain('import Counter from "/Pages/Counter.tsazor"');
    expect(module).toContain('import FetchData from "/Pages/FetchData.tsazor"');
    expect(module).toContain('import FetchDataLayout from "/MainLayout.tsazor"');
    expect(module).toContain('{ template: "/counter", type: Counter },');
    expect(module).toContain('{ template: "/fetchdata", type: FetchData, layout: FetchDataLayout },');
  });

  it("registers every @page template of a page as a route (one import)", async () => {
    const plugin = await createPlugin();
    const module = (await plugin.load?.call({} as never, "\0virtual:tsazor-routes")) as string;
    expect(module).toContain('{ template: "/", type: Home, layout: HomeLayout },');
    expect(module).toContain('{ template: "/home", type: Home, layout: HomeLayout },');
    expect(module.match(/import Home from "\/Pages\/Home.tsazor";/g)?.length).toBe(1);
    expect(module.match(/import HomeLayout from/g)?.length).toBe(1);
  });

  it("emits authorize: {} into the manifest for @authorize pages", () => {
    const module = generateRoutesModule(root, [
      { template: "/myorders", componentPath: path.join(root, "Pages", "MyOrders.tsazor"), authorize: true },
      { template: "/", componentPath: path.join(root, "Pages", "Index.tsazor") },
    ]);
    expect(module).toContain('{ template: "/myorders", type: MyOrders, authorize: {} },');
    expect(module).toContain('{ template: "/", type: Index },');
  });

  it("emits lazy entries (one loader per page, layout loaded with it) for pages lazyRoutes matches", () => {
    const isLazy = lazyRouteFilter(["Pages/Admin/**"], root);
    const module = generateRoutesModule(
      root,
      [
        { template: "/", componentPath: path.join(root, "Pages", "Index.tsazor") },
        { template: "/admin/orders", componentPath: path.join(root, "Pages", "Admin", "Orders.tsazor"), authorize: true, authorizeRequirements: { roles: ["Admin"] } },
        { template: "/admin/orders/{id:int}", componentPath: path.join(root, "Pages", "Admin", "Orders.tsazor"), authorize: true, authorizeRequirements: { roles: ["Admin"] } },
        { template: "/admin/users", componentPath: path.join(root, "Pages", "Admin", "Users.tsazor"), layoutPath: path.join(root, "Shared", "AdminLayout.tsazor") },
      ],
      isLazy,
    );
    expect(module).toContain('import Index from "/Pages/Index.tsazor";');
    expect(module).toContain('const loadOrders = () => import("/Pages/Admin/Orders.tsazor").then((page) => ({ type: page.default }));');
    expect(module.match(/const loadOrders/g)?.length).toBe(1);
    expect(module).toContain('{ template: "/admin/orders", load: loadOrders, authorize: {"roles":["Admin"]} },');
    expect(module).toContain('{ template: "/admin/orders/{id:int}", load: loadOrders, authorize: {"roles":["Admin"]} },');
    expect(module).toContain(
      'const loadUsers = () => Promise.all([import("/Pages/Admin/Users.tsazor"), import("/Shared/AdminLayout.tsazor")]).then(([page, layout]) => ({ type: page.default, layout: layout.default }));',
    );
    expect(module).not.toMatch(/import Orders|import Users|import AdminLayout/);
  });

  it("lazyRoutes: true makes every page lazy; absent, none", () => {
    expect(lazyRouteFilter(true, root)(path.join(root, "Pages", "Index.tsazor"))).toBe(true);
    expect(lazyRouteFilter(undefined, root)(path.join(root, "Pages", "Index.tsazor"))).toBe(false);
    expect(lazyRouteFilter(["Pages/Admin/**"], root)(path.join(root, "Pages", "Index.tsazor"))).toBe(false);
  });

  it("emits the scoped-CSS import and scope attribute when a sidecar exists", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, "<p>Hello, @Name!</p>", path.join(root, "Shared", "Greeter.tsazor"));
    expect(result!.code).toContain('import "./Greeter.tsazor.css";');
    expect(result!.code).toMatch(/__builder\.addAttribute\(1, "b-[0-9a-f]{8}", ""\)/);
  });

  it("keeps files without a sidecar free of scope emission", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, COUNTER, path.join(root, "Pages", "Counter.tsazor"));
    expect(result!.code).not.toContain(".tsazor.css");
    expect(result!.code).not.toMatch(/__builder\.addAttribute\(\d+, "b-/);
  });

  it("rewrites sidecar CSS selectors to the scope attribute", async () => {
    const plugin = await createPlugin();
    const cssPath = path.join(root, "Shared", "Greeter.tsazor.css");
    const hash = scopeHashFor(root, cssPath.slice(0, -4));
    const source = "h1 { color: red; } .list > .item:hover { color: blue; }\n";
    const result = await plugin.transform?.call({} as never, source, cssPath);
    expect(result!.code).toContain(`h1[${hash}] { color: red; }`);
    expect(result!.code).toContain(`.list[${hash}] > .item[${hash}]:hover { color: blue; }`);
  });

  it("imports the .ts code-behind and makes the generated class extend it", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, "<p>Hello, @Name!</p>", path.join(root, "Shared", "Greeter.tsazor"));
    expect(result!.code).toContain('import GreeterBase from "./Greeter.tsazor.ts";');
    expect(result!.code).toContain("export default class Greeter extends GreeterBase {");
    expect(result!.code).not.toContain("extends ComponentBase");
  });

  it("applies Tsazor's field decorators after the class; optimize: false lowers them as written", async () => {
    const source = "<p>Hello, @Name!</p>\n\n@code {\n    @Parameter() Name?: string;\n}\n";
    const file = path.join(root, "Pages", "Hello.tsazor");
    const compact = (await (await createPlugin()).transform?.call({} as never, source, file)) as { code: string };
    expect(compact.code).not.toContain("@Parameter()");
    expect(compact.code).toContain("__tsazor_decorateFields(Hello, { Name: [Parameter()] });");
    expect(compact.code).not.toContain("__decorateElement");
    const lowered = (await (await createPlugin({ optimize: false })).transform?.call({} as never, source, file)) as { code: string };
    expect(lowered.code).toMatch(/__decorateElement\(\w+, 5, "Name", \w+, Hello\)/);
    expect(lowered.code).not.toContain("decorateFields");
  });

  it("applies Tsazor's field decorators after the class in the app's own .ts files too", async () => {
    const plugin = await createPlugin();
    const model = 'import { Required } from "@tsazor/runtime";\nexport class Order {\n  @Required() name = "";\n}\n';
    const result = (await plugin.transform?.call({} as never, model, path.join(root, "models.ts"))) as { code: string; map: null };
    expect(result.code).toContain("} __tsazor_decorateFields(Order, { name: [Required()] });");
    expect(result.map).toBeNull();
    // Nothing to compact: untouched.
    expect(await plugin.transform?.call({} as never, "export const x = 1;\n", path.join(root, "plain.ts"))).toBeNull();
  });

  it("makes Vite lower standard decorators in the app's own .ts files (dev targets esnext)", async () => {
    const { createServer } = await import("vite");
    // An app tsconfig with an ES2022 target (as in the repo apps): without the
    // plugin, Vite would serve the decorator as written.
    await mkdir(path.join(root, "app-ts"), { recursive: true });
    await writeFile(path.join(root, "app-ts", "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022" } }));
    await writeFile(
      path.join(root, "app-ts", "Decorated.ts"),
      "function tag() { return (_value: unknown, _context: ClassFieldDecoratorContext) => {}; }\nexport class Decorated { @tag() field = 1; }\n",
    );
    const server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      appType: "custom",
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [tsazor({ root })],
    });
    try {
      const result = await server.transformRequest("/app-ts/Decorated.ts");
      expect(result!.code).not.toContain("@tag()");
      expect(result!.code).toContain("__decorateElement");
    } finally {
      await server.close();
    }
  });

  it("keeps .tsazor files without a .ts sidecar on ComponentBase", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, COUNTER, path.join(root, "Pages", "Counter.tsazor"));
    expect(result!.code).toContain("export default class Counter extends __tsazor_ComponentBase {");
    expect(result!.code).not.toMatch(/import \w+Base from "\.\/.*\.ts";/);
  });
});

describe("scoped-css rewriter (unit)", () => {
  it("derives a deterministic hash from the project-relative POSIX path", () => {
    const hash = scopeHashFor("D:/proj", "D:/proj\\src\\".replace(/\\/g, "/") + "Comp.tsazor");
    expect(hash).toMatch(/^b-[0-9a-f]{8}$/);
    expect(hash).toBe(scopeHashFor("D:\\proj", "D:\\proj\\src\\Comp.tsazor"));
    expect(scopeHashFor("D:/proj", "D:/proj/src/Other.tsazor")).not.toBe(hash);
  });

  it("scopes compound selectors before pseudo-classes", () => {
    expect(scopeSelector(".a > .b:hover", "b-1")).toBe(".a[b-1] > .b[b-1]:hover");
    expect(scopeSelector("p::after", "b-1")).toBe("p[b-1]::after");
    // Attribute selectors precede the scope attribute (pseudo boundary starts later).
    expect(scopeSelector('input[type="x"] a:focus', "b-1")).toBe('input[type="x"][b-1] a[b-1]:focus');
  });

  it("handles ::deep in all three positions", () => {
    expect(scopeSelector("::deep .child", "b-1")).toBe("[b-1] .child");
    expect(scopeSelector(".parent ::deep .child", "b-1")).toBe(".parent[b-1] .child");
    expect(scopeSelector(".a > ::deep .b", "b-1")).toBe(".a[b-1] > .b");
    expect(scopeSelector("::deep", "b-1")).toBe("[b-1]");
  });

  it("traverses @media and leaves @keyframes untouched", async () => {
    const css = `@media (min-width: 600px) { h1 { color: red; } }\n@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }\n`;
    const result = await processScopedCss(css, "b-1", "/tmp/Greeter.tsazor.css");
    expect(result).toContain("@media (min-width: 600px) { h1[b-1] { color: red; } }");
    expect(result).toContain("from { transform: rotate(0deg); }"); // NOT percent[b-1]
    expect(result).toContain("to" + " { transform: rotate(360deg); }");
  });

  it("ignores selector-like content in comments", async () => {
    const result = await processScopedCss("/* .spoof:hover {} */ h1 { color: red; }", "b-1", "/tmp/Greeter.tsazor.css");
    expect(result).toContain("/* .spoof:hover {} */");
    expect(result).toContain("h1[b-1] { color: red; }");
  });
});