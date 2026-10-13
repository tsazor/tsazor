/**
 * F1: a parameter typed with a computed type — shadcn's `VariantProps<typeof buttonVariants>["variant"]` — takes
 * plain text as text (Razor decides from the real type; the compiler's syntactic categorizer can't evaluate it), and
 * `tsazor check` checks the value against the real type: no TZS026, a wrong value is TS1360 (satisfies) on its attribute.
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
  "export declare class ComponentBase {",
  "  protected buildRenderTree(b: RenderTreeBuilder): void {}",
  "}",
  "export declare function Parameter(options?: { captureUnmatchedValues?: boolean }): (value: unknown, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext | ClassSetterDecoratorContext) => void;",
  "",
].join("\n");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-computed-types-"));
  await mkdir(path.join(root, "node_modules", "@tsazor", "runtime"), { recursive: true });
  await writeFile(
    path.join(root, "node_modules", "@tsazor", "runtime", "package.json"),
    JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }),
  );
  await writeFile(path.join(root, "node_modules", "@tsazor", "runtime", "index.d.ts"), RUNTIME_DTS);
  // cva's shape: a variants function and VariantProps over its props.
  await mkdir(path.join(root, "node_modules", "class-variance-authority"), { recursive: true });
  await writeFile(
    path.join(root, "node_modules", "class-variance-authority", "package.json"),
    JSON.stringify({ name: "class-variance-authority", version: "0.7.1", types: "./index.d.ts" }),
  );
  await writeFile(
    path.join(root, "node_modules", "class-variance-authority", "index.d.ts"),
    "export type VariantProps<T extends (...args: any) => any> = Omit<Exclude<Parameters<T>[0], undefined>, \"class\">;\n",
  );
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, skipLibCheck: true, noEmit: true },
      include: ["src"],
    }),
  );
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "src", "variants.ts"),
    'export const buttonVariants = (props?: { variant?: "default" | "outline" | null; size?: "sm" | "lg" | null; class?: string }): string => props?.variant ?? "default";\n',
  );
  await writeFile(
    path.join(root, "src", "Button.tsazor"),
    [
      '@import type { VariantProps } from "class-variance-authority"',
      '@import { buttonVariants } from "./variants"',
      "<button class=\"@buttonVariants({ variant, size })\">Save</button>",
      "",
      "@code {",
      '    @Parameter() variant?: VariantProps<typeof buttonVariants>["variant"];',
      '    @Parameter() size?: NonNullable<VariantProps<typeof buttonVariants>["size"]>;',
      "}",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "src", "Page.tsazor"),
    ['<Button variant="outline" size="lg" />', '<Button variant="@choice" />', '<Button variant="zzz" />', "", "@code {", '    choice: "default" | "outline" = "default";', "}", ""].join("\n"),
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("computed parameter types (F1)", () => {
  it("take text as text and check it against the real type, without TZS026", async () => {
    const result = await checkProject(root);
    const found = result.diagnostics.map((d) => [path.basename(d.file), d.code, d.line]);
    expect(found).toEqual([["Page.tsazor", "TS1360", 3]]);
  });
});
