/**
 * `@Bindable()` (Tsazor extension) through the type layer (`tsazor check`)
 * against the real runtime declarations: the synthesized change callback is
 * a typed member of the component, `@bind-Value` on a @Bindable component
 * resolves (2.1 metadata) and its value is checked against the parameter
 * type (2.4), and a plain field is TZS030.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkProject, type CheckDiagnostic } from "../src/check";

const runtimeDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../runtime/dist/index.js").replace(/\\/g, "/");

let root = "";
let diagnostics: CheckDiagnostic[] = [];

const STEPPER = [
  '<button @onclick="inc">@Value</button>',
  "",
  "@code {",
  "    @Bindable() accessor Value = 0;",
  "",
  "    inc(): void {",
  "        this.Value += 1;",
  "    }",
  "",
  "    async jump(): Promise<void> {",
  "        await this.ValueChanged?.invokeAsync(this.Value + 10);",
  "    }",
  "}",
  "",
].join("\n");

const PICKER = [
  "<span>@Value</span>",
  "",
  "@code {",
  '    @Bindable({ changed: "OnPick", expression: true }) accessor Value: string = "";',
  "",
  "    pick(next: string): void {",
  "        void this.OnPick?.invokeAsync(next);",
  "        const field: string | undefined = this.ValueExpression;",
  "        void field;",
  "    }",
  "}",
  "",
].join("\n");

const GOOD = [
  '<Stepper @bind-Value="guests" @bind-Value:after="changed" />',
  '<Picker @bind-Value="name" @bind-Value:event="OnPick" />',
  "",
  "@code {",
  "    private guests = 2;",
  '    private name = "a";',
  "    private changed(): void {}",
  "}",
  "",
].join("\n");

const WRONG_TYPE = [
  '<Stepper @bind-Value="label" />',
  "",
  "@code {",
  '    private label = "two";',
  "}",
  "",
].join("\n");

const FIELD = [
  "<span>@Value</span>",
  "",
  "@code {",
  "    @Bindable() Value = 0;",
  "}",
  "",
].join("\n");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-bindable-"));
  const rt = path.join(root, "node_modules", "@tsazor", "runtime");
  mkdirSync(rt, { recursive: true });
  writeFileSync(path.join(rt, "package.json"), JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }));
  // The real runtime declarations (built by the gate before the tests run).
  writeFileSync(path.join(rt, "index.d.ts"), `export * from "${runtimeDist.replace(/\.js$/, "")}";\n`);
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, lib: ["ES2022", "DOM"], skipLibCheck: true } }),
  );
  await writeFile(path.join(root, "Stepper.tsazor"), STEPPER);
  await writeFile(path.join(root, "Picker.tsazor"), PICKER);
  await writeFile(path.join(root, "Good.tsazor"), GOOD);
  await writeFile(path.join(root, "WrongType.tsazor"), WRONG_TYPE);
  await writeFile(path.join(root, "Field.tsazor"), FIELD);
  diagnostics = (await checkProject(root)).diagnostics;
}, 60_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const of = (file: string): CheckDiagnostic[] => diagnostics.filter((d) => path.basename(d.file) === file);

describe("tsazor check — @Bindable()", () => {
  it("the synthesized callback (and expression) members are typed; the component checks clean", () => {
    expect(of("Stepper.tsazor")).toEqual([]);
    expect(of("Picker.tsazor")).toEqual([]);
  });

  it("@bind-Value (with :after and :event) on @Bindable components resolves and type-checks", () => {
    expect(of("Good.tsazor")).toEqual([]);
  });

  it("a bound value of the wrong type is a TS error on the bind", () => {
    const found = of("WrongType.tsazor");
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]!.code).toMatch(/^TS/);
    expect(found[0]!.line).toBe(1);
    expect(found[0]!.message).toContain("number");
  });

  it("a plain field is TZS030", () => {
    const codes = of("Field.tsazor").map((d) => d.code);
    expect(codes).toContain("TZS030");
    expect(of("Field.tsazor").find((d) => d.code === "TZS030")!.line).toBe(4);
  });
});
