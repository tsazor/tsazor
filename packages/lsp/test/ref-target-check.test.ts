/**
 * `@ref` through `tsazor check`: Razor's lvalue (`@ref="panel.panelRef"` in a loop, `@ref="inputs[0]"`) is typed like
 * a member — the element's interface, the component's class — and a mistyped capture is reported on the reference as
 * written (it mapped past the end of the line: TypeScript reports the assignment at `this.`).
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

const TABS = [
  '@import type Counter from "./Counter.tsazor"',
  "@foreach (const panel of panels) {",
  '    <div @ref="panel.panelRef">@panel.title</div>',
  '    <Counter @ref="panel.counter" />',
  "}",
  '<input @ref="inputs[0]" />',
  '<input @ref="area" />',
  "",
  "@code {",
  "    private panels: { title: string; panelRef?: Element; counter?: Counter }[] = [];",
  "    private inputs: (HTMLInputElement | undefined)[] = [];",
  "    private area?: HTMLTextAreaElement;",
  "}",
  "",
].join("\n");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-ref-target-"));
  const rt = path.join(root, "node_modules", "@tsazor", "runtime");
  mkdirSync(rt, { recursive: true });
  writeFileSync(path.join(rt, "package.json"), JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }));
  // The real runtime declarations (built by the gate before the tests run).
  writeFileSync(path.join(rt, "index.d.ts"), `export * from "${runtimeDist.replace(/\.js$/, "")}";\n`);
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, lib: ["ES2022", "DOM"], skipLibCheck: true } }),
  );
  await writeFile(path.join(root, "Counter.tsazor"), "<p>@count</p>\n\n@code {\n    @Parameter() count = 0;\n}\n");
  await writeFile(path.join(root, "Tabs.tsazor"), TABS);
  diagnostics = (await checkProject(root)).diagnostics;
}, 60_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("tsazor check — @ref targets", () => {
  it("types an lvalue target like a member; a mistyped capture is reported on the reference", () => {
    expect(diagnostics.map((d) => `${path.basename(d.file)}:${d.line}:${d.column} ${d.code}`)).toEqual(["Tabs.tsazor:7:14 TS2739"]);
  });
});
