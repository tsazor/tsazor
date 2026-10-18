/**
 * `@EditorRequired()` (Blazor's `[EditorRequired]`) through `tsazor check` against the real runtime declarations: the
 * marker type-checks on a parameter, and a tag that leaves the parameter out is TZS037, a warning on the tag; a value
 * from an attribute, `@bind-` or element content is enough, and the runtime's InputRadioGroup/InputRadio resolve.
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

const FIELD = [
  "@import type { RenderFragment } from \"@tsazor/runtime\"",
  "<label>@Label <input value=\"@Value\" /></label>",
  "@ChildContent",
  "",
  "@code {",
  "    @EditorRequired() @Parameter() Label = \"\";",
  "    @Parameter() Value = \"\";",
  "    @Parameter() ValueChanged?: EventCallback<string>;",
  "    @EditorRequired() @Parameter() ChildContent?: RenderFragment;",
  "}",
  "",
].join("\n");

const PAGE = [
  "<Field Label=\"Name\">hint</Field>",
  "<Field @bind-Value=\"name\" />",
  "<InputRadioGroup @bind-Value=\"size\">",
  "    <InputRadio Value=\"1\" /> <InputRadio Value=\"2\" />",
  "</InputRadioGroup>",
  "",
  "@code {",
  "    private name = \"\";",
  "    private size = 1;",
  "}",
  "",
].join("\n");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-editor-required-"));
  const rt = path.join(root, "node_modules", "@tsazor", "runtime");
  mkdirSync(rt, { recursive: true });
  writeFileSync(path.join(rt, "package.json"), JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }));
  // The real runtime declarations (built by the gate before the tests run).
  writeFileSync(path.join(rt, "index.d.ts"), `export * from "${runtimeDist.replace(/\.js$/, "")}";\n`);
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, lib: ["ES2022", "DOM"], skipLibCheck: true } }),
  );
  await writeFile(path.join(root, "Field.tsazor"), FIELD);
  await writeFile(path.join(root, "Page.tsazor"), PAGE);
  diagnostics = (await checkProject(root)).diagnostics;
}, 60_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const of = (file: string): CheckDiagnostic[] => diagnostics.filter((d) => path.basename(d.file) === file);

describe("tsazor check — @EditorRequired()", () => {
  it("the marker type-checks on a parameter", () => {
    expect(of("Field.tsazor")).toEqual([]);
  });

  it("a tag without the parameter gets TZS037 (a warning on the tag); the radios check clean", () => {
    expect(of("Page.tsazor").map((d) => [d.code, d.severity, d.line, d.message])).toEqual([
      [
        "TZS037",
        "warning",
        2,
        "Editor-required parameter not provided. Component 'Field' expects a value for the parameter 'Label', but a value may not have been provided.",
      ],
      [
        "TZS037",
        "warning",
        2,
        "Editor-required parameter not provided. Component 'Field' expects a value for the parameter 'ChildContent', but a value may not have been provided.",
      ],
    ]);
  });
});
