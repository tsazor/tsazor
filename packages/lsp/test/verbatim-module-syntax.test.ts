/**
 * `verbatimModuleSyntax` (Vite's TypeScript templates turn it on): what the compiler imports itself must be a type
 * import where it names a type only — a runtime type a parameter is checked against (`RouteData`, `ComponentType`)
 * and a tag's type argument resolved through `@using` (`TItem="Person"`, an interface). A MudBlazor port met TS1484
 * on both runtime types; the type argument wasn't imported at all.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkProject, type CheckDiagnostic } from "../src/check";

const runtimeDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../runtime/dist/index.js").replace(/\\/g, "/");

let root = "";
let diagnostics: CheckDiagnostic[] = [];

const FILES: Record<string, string> = {
  "App.tsazor": [
    '<Router Routes="@routes">',
    '    <Found Context="routeData">',
    '        <RouteView RouteData="@routeData" />',
    "    </Found>",
    "</Router>",
    "",
    "@code {",
    "    private routes = [];",
    "}",
    "",
  ].join("\n"),
  "Host.tsazor": [
    '@import Counter from "./Counter.tsazor"',
    '<DynamicComponent Type="@picked" Parameters="@parameters" />',
    "",
    "@code {",
    "    private picked = Counter;",
    "    private parameters: Record<string, unknown> = {};",
    "}",
    "",
  ].join("\n"),
  "Counter.tsazor": "<p>@count</p>\n\n@code {\n    @Parameter() count = 0;\n}\n",
  "Models/Person.ts": "export interface Person {\n    name: string;\n}\n",
  "Grid.tsazor": [
    "@typeparam TItem",
    '@import type { RenderFragment } from "@tsazor/runtime"',
    "@foreach (const item of Items) {",
    "    @Row?.(item)",
    "}",
    "",
    "@code {",
    "    @Parameter() Items: TItem[] = [];",
    "    @Parameter() Row?: (item: TItem) => RenderFragment;",
    "}",
    "",
  ].join("\n"),
  "People.tsazor": [
    "@using ./Models",
    '<Grid TItem="Person" Items="@people" Context="p"><Row>@p.name</Row></Grid>',
    "",
    "@code {",
    '    private people = [{ name: "Ada" }];',
    "}",
    "",
  ].join("\n"),
};

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-verbatim-"));
  const rt = path.join(root, "node_modules", "@tsazor", "runtime");
  mkdirSync(rt, { recursive: true });
  writeFileSync(path.join(rt, "package.json"), JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }));
  // The real runtime declarations (built by the gate before the tests run).
  writeFileSync(path.join(rt, "index.d.ts"), `export * from "${runtimeDist.replace(/\.js$/, "")}";\n`);
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, lib: ["ES2022", "DOM"], skipLibCheck: true,
        verbatimModuleSyntax: true, isolatedModules: true,
      },
    }),
  );
  mkdirSync(path.join(root, "Models"));
  for (const [name, text] of Object.entries(FILES)) await writeFile(path.join(root, name), text);
  diagnostics = (await checkProject(root)).diagnostics;
}, 60_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("tsazor check — verbatimModuleSyntax", () => {
  it("the compiler's own imports of types are type imports: RouteData, ComponentType, a type argument through @using", () => {
    expect(diagnostics.map((d) => `${path.basename(d.file)} ${d.code} ${d.message}`)).toEqual([]);
  });
});
