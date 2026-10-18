/**
 * A fragment whose context is the component itself (`RenderFragment<Upload<T>>`, MudBlazor's file upload hands its
 * own instance to the template): the consumer's context is typed as the tag's component — its members check, a
 * missing one is TS2339. It was `any`: a reference to the component's own class wasn't expressible from the consumer.
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

const UPLOAD = [
  "@typeparam T",
  '@import type { RenderFragment } from "@tsazor/runtime"',
  "<div>@if (CustomContent) { @CustomContent(this) }</div>",
  "",
  "@code {",
  "    @Parameter() Value?: T;",
  "    @Parameter() CustomContent?: RenderFragment<Upload<T>>;",
  "    clear(): void {",
  "        this.Value = undefined;",
  "    }",
  "}",
  "",
].join("\n");

const PAGE = [
  '<Upload T="string" Value="@name">',
  '    <CustomContent Context="up">',
  '        <button @onclick="() => up.clear()">clear @up.Value?.toUpperCase()</button>',
  "        <span>@up.missing</span>",
  "    </CustomContent>",
  "</Upload>",
  "",
  "@code {",
  '    private name = "a";',
  "}",
  "",
].join("\n");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-self-context-"));
  const rt = path.join(root, "node_modules", "@tsazor", "runtime");
  mkdirSync(rt, { recursive: true });
  writeFileSync(path.join(rt, "package.json"), JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }));
  // The real runtime declarations (built by the gate before the tests run).
  writeFileSync(path.join(rt, "index.d.ts"), `export * from "${runtimeDist.replace(/\.js$/, "")}";\n`);
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, lib: ["ES2022", "DOM"], skipLibCheck: true } }),
  );
  await writeFile(path.join(root, "Upload.tsazor"), UPLOAD);
  await writeFile(path.join(root, "Page.tsazor"), PAGE);
  diagnostics = (await checkProject(root)).diagnostics;
}, 60_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("tsazor check — a fragment context that is the component itself", () => {
  it("is the tag's component, with its type arguments: its members check, a missing one is TS2339", () => {
    expect(diagnostics.map((d) => `${path.basename(d.file)}:${d.line} ${d.code} ${d.message.split(" Hint:")[0]}`)).toEqual([
      "Page.tsazor:4 TS2339 Property 'missing' does not exist on type 'Upload<string>'.",
    ]);
  });
});
