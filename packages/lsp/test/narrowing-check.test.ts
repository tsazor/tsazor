/**
 * F15: markup inside an `@if` sees the `@if`'s narrowing, as Razor's nullable analysis does. Child content, slots
 * and templates are functions the compiler makes, and a bound member's setter is one too; the check reads them where
 * the markup stands (codegen's deferred()). What a deferred body assigns doesn't narrow the code after it, real
 * errors inside it stay errors, and a lambda the author writes keeps TypeScript's rule: it runs later, so a member
 * it reads is unnarrowed there.
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

const CARD = [
  "<div>@ChildContent @Footer?.(\"x\")</div>",
  "",
  '@import type { EventCallback, RenderFragment } from "@tsazor/runtime";',
  "@code {",
  "    @Parameter() ChildContent?: RenderFragment;",
  "    @Parameter() Footer?: (value: string) => RenderFragment;",
  "    @Parameter() Value?: string;",
  "    @Parameter() ValueChanged?: EventCallback<string>;",
  "}",
  "",
].join("\n");

const NARROWED = [
  "@if (node) {",
  "    <Card>@node.name</Card>",
  "    <Card><Footer>@node.name @context</Footer></Card>",
  "    <Card><Card>@node.name</Card></Card>",
  '    <input @bind="node.name" />',
  '    <input type="checkbox" @bind="node.done" />',
  '    <Card @bind-Value="node.name" />',
  '    <Card @bind-Value="node.name" @bind-Value:after="saved" />',
  "}",
  "@if (node?.child) {",
  "    <Card>@node.child.name</Card>",
  "}",
  "",
  '@import type { Node } from "./node";',
  "@code {",
  "    private node: Node | null = null;",
  "    private saved(): void {}",
  "}",
  "",
].join("\n");

// A bind writes the member it narrows: the narrowing holds after it.
const KEPT = [
  "@if (value) {",
  '    <Card @bind-Value="value" />',
  '    <input @bind="value" />',
  "    <p>@value.length</p>",
  "}",
  "@if (node && node.when) {",
  '    <input type="date" @bind="node.when" />',
  "    <p>@node.when.getFullYear()</p>",
  "}",
  "",
  '@import type { Node } from "./node";',
  "@code {",
  "    private value: string | null = null;",
  "    private node: Node | null = null;",
  "}",
  "",
].join("\n");

const UNSAFE = [
  "<Card>@node.name</Card>",
  "@if (node) {",
  "    <Card>@node.nope</Card>",
  '    <button @onclick="() => show(node.name)">Show</button>',
  "}",
  "@{ let label: string | null = null; }",
  '<Card>@{ label = "x"; }</Card>',
  "<p>@label.length</p>",
  "",
  '@import type { Node } from "./node";',
  "@code {",
  "    private node: Node | null = null;",
  "    private show(_name: string): void {}",
  "}",
  "",
].join("\n");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-narrowing-"));
  const rt = path.join(root, "node_modules", "@tsazor", "runtime");
  mkdirSync(rt, { recursive: true });
  writeFileSync(path.join(rt, "package.json"), JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }));
  // The real runtime declarations (built by the gate before the tests run).
  writeFileSync(path.join(rt, "index.d.ts"), `export * from "${runtimeDist.replace(/\.js$/, "")}";\n`);
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, lib: ["ES2022", "DOM"], skipLibCheck: true } }),
  );
  await writeFile(path.join(root, "node.ts"), "export interface Node { name: string; done: boolean; when: Date | null; child?: Node; }\n");
  await writeFile(path.join(root, "Card.tsazor"), CARD);
  await writeFile(path.join(root, "Narrowed.tsazor"), NARROWED);
  await writeFile(path.join(root, "Kept.tsazor"), KEPT);
  await writeFile(path.join(root, "Unsafe.tsazor"), UNSAFE);
  diagnostics = (await checkProject(root)).diagnostics;
}, 60_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const of = (file: string): string[] => diagnostics.filter((d) => path.basename(d.file) === file).map((d) => `${d.line}: ${d.code}`);

describe("tsazor check — the narrowing of an @if reaches the markup inside it (F15)", () => {
  it("child content, a slot template, nested content and the setters of binds", () => {
    expect(of("Card.tsazor")).toEqual([]);
    expect(of("Narrowed.tsazor")).toEqual([]);
  });

  it("a bind of the narrowed member keeps the narrowing after it", () => {
    expect(of("Kept.tsazor")).toEqual([]);
  });

  it("outside the @if, a typo inside it, an author's lambda, and an assignment in deferred content stay errors", () => {
    expect(of("Unsafe.tsazor")).toEqual([
      "1: TS2531",
      // A real error inside deferred content.
      "3: TS2339",
      // The author's lambda runs later: TypeScript's rule.
      "4: TS2531",
      // The child content may not run (or run later): its assignment doesn't narrow `label`.
      "8: TS18047",
    ]);
  });
});
