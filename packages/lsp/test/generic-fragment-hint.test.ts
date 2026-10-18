/**
 * `RenderFragment<TItem>` called in a generic component (`@ChildContent?.(item)`) is a conditional type TypeScript
 * keeps open while `TItem` is: both errors it gives say so and name the form that works, `(item: TItem) =>
 * RenderFragment` — which checks clean (a MudBlazor port's F1702 cast the function instead).
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

const list = (type: string): string =>
  [
    "@typeparam TItem",
    '@import type { RenderFragment } from "@tsazor/runtime"',
    "<ul>",
    "@foreach (const item of Items) {",
    "    <li>@ChildContent?.(item)</li>",
    "}",
    "</ul>",
    "",
    "@code {",
    "    @Parameter() Items: TItem[] = [];",
    `    @Parameter() ChildContent?: ${type};`,
    "}",
    "",
  ].join("\n");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-generic-fragment-"));
  const rt = path.join(root, "node_modules", "@tsazor", "runtime");
  mkdirSync(rt, { recursive: true });
  writeFileSync(path.join(rt, "package.json"), JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }));
  // The real runtime declarations (built by the gate before the tests run).
  writeFileSync(path.join(rt, "index.d.ts"), `export * from "${runtimeDist.replace(/\.js$/, "")}";\n`);
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, lib: ["ES2022", "DOM"], skipLibCheck: true } }),
  );
  await writeFile(path.join(root, "Open.tsazor"), list("RenderFragment<TItem>"));
  await writeFile(path.join(root, "Factory.tsazor"), list("(item: TItem) => RenderFragment"));
  diagnostics = (await checkProject(root)).diagnostics;
}, 60_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("tsazor check — RenderFragment<TItem> in a generic component", () => {
  it("both errors name the form that works; that form checks clean", () => {
    const open = diagnostics.filter((d) => path.basename(d.file) === "Open.tsazor");
    expect(open.map((d) => d.code)).toEqual(["TS2345", "TS2345"]);
    for (const d of open) expect(d.message).toContain("declare the parameter as `(item: TItem) => RenderFragment`");
    expect(diagnostics.filter((d) => path.basename(d.file) === "Factory.tsazor")).toEqual([]);
  });
});
