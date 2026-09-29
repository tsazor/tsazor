import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tasor } from "../src";
import { generateRoutesModule } from "../src/routes";
import { processScopedCss, scopeHashFor, scopeSelector } from "../src/scoped-css";

const COUNTER = /* tazor */ `
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

const FETCH_DATA = /* tazor */ `
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
  root = await mkdtemp(path.join(tmpdir(), "tasor-plugin-"));
  await mkdir(path.join(root, "Shared"), { recursive: true });
  await mkdir(path.join(root, "Pages"), { recursive: true });
  await mkdir(path.join(root, "services"), { recursive: true });
  await writeFile(path.join(root, "_Imports.tazor"), "@using ./Shared\n@using ./services\n");
  await writeFile(path.join(root, "MainLayout.tazor"), "<div>@Body</div>\n");
  await writeFile(
    path.join(root, "Shared", "Greeter.tazor"),
    "<p>Hello, @Name!</p>\n\n@code {\n    @Parameter() Name?: string;\n}\n",
  );
  await writeFile(path.join(root, "services", "CounterService.ts"), "export class CounterService {}\n");
  await writeFile(path.join(root, "Pages", "Counter.tazor"), COUNTER);
  await writeFile(path.join(root, "Pages", "FetchData.tazor"), FETCH_DATA);
  await writeFile(
    path.join(root, "Shared", "Greeter.tazor.css"),
    "h1 { color: red; }\n.list > .item:hover { color: blue; }\n/* .a { } */\n@keyframes spin { from { opacity: 1; } }\n",
  );
  await writeFile(
    path.join(root, "Shared", "Greeter.tazor.ts"),
    'import { ComponentBase, Parameter } from "@tasor/runtime";\n\nexport default class Greeter extends ComponentBase {\n    @Parameter() Name = "";\n    count = 0;\n}\n',
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function createPlugin() {
  const { tasor } = await import("../src");
  const plugin = tasor({ root });
  (plugin.configResolved as unknown as (config: { root: string }) => void)({ root });
  return plugin;
}

describe("tasor vite plugin", () => {
  it("compiles a .tazor file into JS with a runtime import and HMR appendix", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, COUNTER, path.join(root, "Pages", "Counter.tazor"));
    expect(result).not.toBeNull();
    expect(result!.code).toContain("class Counter");
    expect(result!.code).toContain('from "@tasor/runtime"');
    expect(result!.code).toContain("import.meta.hot");
    expect(result!.code).toContain("globalThis.__tasor?.hmrSwap(previous, mod.default)");
    expect(result!.code).toContain("previousDefault ??= Counter");
  });

  it("resolves component tags through _Imports.tazor @using directories", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, COUNTER, path.join(root, "Pages", "Counter.tazor"));
    expect(result!.code).toContain('from "../Shared/Greeter.tazor"');
  });

  it("resolves @inject types from bare and path-like usings", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, COUNTER, path.join(root, "Pages", "Counter.tazor"));
    expect(result!.code).toContain('from "@tasor/runtime"');
    expect(result!.code).toContain('import CounterService from "../services/CounterService"');
  });

  it("emits a chained sourcemap pointing at the .tazor file", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, COUNTER, path.join(root, "Pages", "Counter.tazor"));
    const map = JSON.parse(result!.map as string) as { sources: string[]; mappings: string };
    expect(map.sources[0]).toBe("Counter.tazor");
    expect(map.mappings.length).toBeGreaterThan(10);
  });

  it("compiles _Imports.tazor to an empty module", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, "@using ./Shared\n", path.join(root, "_Imports.tazor"));
    expect(result!.code.trim()).toBe("export default null;");
  });

  it("throws located errors for compiler diagnostics (dev-server overlay)", async () => {
    const plugin = await createPlugin();
    await expect(
      plugin.transform?.call({} as never, "<div>\n  <p>unclosed\n", path.join(root, "Pages", "Broken.tazor")),
    ).rejects.toThrow(/TZR002/);
  });

  it("resolves the virtual routes module id", async () => {
    const plugin = await createPlugin();
    expect(plugin.resolveId?.call({} as never, "virtual:tasor-routes")).toBe("\0virtual:tasor-routes");
    expect(plugin.resolveId?.call({} as never, "./Other.ts")).toBeNull();
  });

  it("generates a route manifest from @page files with layouts", async () => {
    const plugin = await createPlugin();
    const module = await plugin.load?.call({} as never, "\0virtual:tasor-routes");
    expect(module).not.toBeNull();
    expect(module).toContain('import Counter from "/Pages/Counter.tazor"');
    expect(module).toContain('import FetchData from "/Pages/FetchData.tazor"');
    expect(module).toContain('import FetchDataLayout from "/MainLayout.tazor"');
    expect(module).toContain('{ template: "/counter", type: Counter },');
    expect(module).toContain('{ template: "/fetchdata", type: FetchData, layout: FetchDataLayout },');
  });

  it("emits authorize: {} into the manifest for @authorize pages", () => {
    const module = generateRoutesModule(root, [
      { template: "/myorders", componentPath: path.join(root, "Pages", "MyOrders.tazor"), authorize: true },
      { template: "/", componentPath: path.join(root, "Pages", "Index.tazor") },
    ]);
    expect(module).toContain('{ template: "/myorders", type: MyOrders, authorize: {} },');
    expect(module).toContain('{ template: "/", type: Index },');
  });

  it("emits the scoped-CSS import and scope attribute when a sidecar exists", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, "<p>Hello, @Name!</p>", path.join(root, "Shared", "Greeter.tazor"));
    expect(result!.code).toContain('import "./Greeter.tazor.css";');
    expect(result!.code).toMatch(/b\.addAttribute\(1, "b-[0-9a-f]{8}", ""\)/);
  });

  it("keeps files without a sidecar free of scope emission", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, COUNTER, path.join(root, "Pages", "Counter.tazor"));
    expect(result!.code).not.toContain(".tazor.css");
    expect(result!.code).not.toMatch(/b\.addAttribute\(\d+, "b-/);
  });

  it("rewrites sidecar CSS selectors to the scope attribute", async () => {
    const plugin = await createPlugin();
    const cssPath = path.join(root, "Shared", "Greeter.tazor.css");
    const hash = scopeHashFor(root, cssPath.slice(0, -4));
    const source = "h1 { color: red; } .list > .item:hover { color: blue; }\n";
    const result = await plugin.transform?.call({} as never, source, cssPath);
    expect(result!.code).toContain(`h1[${hash}] { color: red; }`);
    expect(result!.code).toContain(`.list[${hash}] > .item[${hash}]:hover { color: blue; }`);
  });

  it("imports the .ts code-behind and makes the generated class extend it", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, "<p>Hello, @Name!</p>", path.join(root, "Shared", "Greeter.tazor"));
    expect(result!.code).toContain('import GreeterBase from "./Greeter.tazor.ts";');
    expect(result!.code).toContain("export default class Greeter extends GreeterBase {");
    expect(result!.code).not.toContain("extends ComponentBase");
  });

  it("keeps .tazor files without a .ts sidecar on ComponentBase", async () => {
    const plugin = await createPlugin();
    const result = await plugin.transform?.call({} as never, COUNTER, path.join(root, "Pages", "Counter.tazor"));
    expect(result!.code).toContain("export default class Counter extends ComponentBase {");
    expect(result!.code).not.toMatch(/import \w+Base from "\.\/.*\.ts";/);
  });
});

describe("scoped-css rewriter (unit)", () => {
  it("derives a deterministic hash from the project-relative POSIX path", () => {
    const hash = scopeHashFor("D:/proj", "D:/proj\\src\\".replace(/\\/g, "/") + "Comp.tazor");
    expect(hash).toMatch(/^b-[0-9a-f]{8}$/);
    expect(hash).toBe(scopeHashFor("D:\\proj", "D:\\proj\\src\\Comp.tazor"));
    expect(scopeHashFor("D:/proj", "D:/proj/src/Other.tazor")).not.toBe(hash);
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
    const result = await processScopedCss(css, "b-1", "/tmp/Greeter.tazor.css");
    expect(result).toContain("@media (min-width: 600px) { h1[b-1] { color: red; } }");
    expect(result).toContain("from { transform: rotate(0deg); }"); // NOT percent[b-1]
    expect(result).toContain("to" + " { transform: rotate(360deg); }");
  });

  it("ignores selector-like content in comments", async () => {
    const result = await processScopedCss("/* .spoof:hover {} */ h1 { color: red; }", "b-1", "/tmp/Greeter.tazor.css");
    expect(result).toContain("/* .spoof:hover {} */");
    expect(result).toContain("h1[b-1] { color: red; }");
  });
});