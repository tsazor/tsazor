/**
 * F3/F17: Razor templates in `@code` type-check as what they are — a template is a RenderFragment, a lambda over one
 * a RenderFragment<T> whose parameter types the markup — and an error inside one is reported on its line.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkProject } from "../src/check";

let root = "";

const RUNTIME_DTS = [
  "export declare interface RenderTreeBuilder {",
  "  openElement(seq: number, tag: string): void;",
  "  closeElement(): void;",
  "  openComponent(seq: number, componentType: unknown): void;",
  "  closeComponent(): void;",
  "  openRegion(seq: number): void;",
  "  closeRegion(): void;",
  "  addAttribute(seq: number, name: string, value?: unknown): void;",
  "  addContent(seq: number, value: unknown): void;",
  "  addMarkupContent(seq: number, value: string | null): void;",
  "}",
  "export type RenderFragment = (builder: RenderTreeBuilder) => void;",
  "export type RenderFragmentOf<T> = (value: T) => RenderFragment;",
  "export declare class ComponentBase {",
  "  protected buildRenderTree(b: RenderTreeBuilder): void {}",
  "}",
  "export declare function Parameter(options?: { captureUnmatchedValues?: boolean }): (value: unknown, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext | ClassSetterDecoratorContext) => void;",
  "",
].join("\n");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-razor-templates-"));
  await mkdir(path.join(root, "node_modules", "@tsazor", "runtime"), { recursive: true });
  await writeFile(
    path.join(root, "node_modules", "@tsazor", "runtime", "package.json"),
    JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }),
  );
  await writeFile(path.join(root, "node_modules", "@tsazor", "runtime", "index.d.ts"), RUNTIME_DTS);
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, skipLibCheck: true, noEmit: true },
      include: ["src"],
    }),
  );
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "src", "Pets.tsazor"),
    [
      '@import type { RenderFragment, RenderFragmentOf } from "@tsazor/runtime"',
      "<ul>@row(pets[0]!)</ul>",
      "@body",
      "",
      "@code {",
      "    private readonly pets = [{ name: \"Rex\", age: 3 }];",
      "    private readonly body: RenderFragment = @<p>@pets.length pets</p>;",
      "    private readonly row: RenderFragmentOf<{ name: string; age: number }> = (pet) => @<li>@pet.name, @pet.age</li>;",
      "    private readonly broken: RenderFragmentOf<{ name: string }> = (pet) => @<li>@pet.nickname</li>;",
      "}",
      "",
    ].join("\n"),
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("Razor templates in tsazor check (F3)", () => {
  it("type the template's markup, and report an error inside one on its line", async () => {
    const result = await checkProject(root);
    expect(result.diagnostics.map((d) => [path.basename(d.file), d.code, d.line])).toEqual([["Pets.tsazor", "TS2339", 9]]);
  });
});
