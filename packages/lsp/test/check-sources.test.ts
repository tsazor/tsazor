/**
 * `tsazor check` covers the real TypeScript sources of the component graph:
 * code-behind classes (`X.tsazor.ts`) and the `.ts` modules the components
 * import. Before, only the shadows were diagnosed — a type error in a
 * code-behind class passed the gate. In that program, a `.tsazor` import in a
 * `.ts` file resolves to the component's shadow (a typed `@ref` field in a
 * code-behind), and the tsconfig's own `.d.ts` files (ambient modules) are
 * part of it.
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
  "  addElementReferenceCapture(seq: number, action: (element: Element) => void): void;",
  "  addComponentReferenceCapture(seq: number, action: (component: unknown) => void): void;",
  "}",
  "export declare class ComponentBase {",
  "  protected buildRenderTree(b: RenderTreeBuilder): void {}",
  "  protected onInitialized(): void {}",
  "}",
  "export declare type Token<T> = abstract new (...args: never[]) => T;",
  "export declare function inject<T>(token: Token<T>): T;",
  "export declare function Parameter(options?: { captureUnmatchedValues?: boolean }): (value: unknown, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext | ClassSetterDecoratorContext) => void;",
  "",
].join("\n");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-check-sources-"));
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
  // Ambient declarations of the project: the build tool's virtual module and
  // the `*.tsazor` shorthand plain tsc sees (a value, not the class).
  await writeFile(
    path.join(root, "src", "env.d.ts"),
    [
      'declare module "virtual:sample-data" {',
      "  export const sampleCount: number;",
      "}",
      'declare module "*.tsazor" {',
      "  const component: unknown;",
      "  export default component;",
      "}",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(root, "src", "data.ts"), 'import { sampleCount } from "virtual:sample-data";\nexport const total: number = sampleCount + 1;\n');
  await writeFile(path.join(root, "src", "Child.tsazor"), "<p>child</p>\n\n@code {\n    reset(): void {}\n}\n");
  await writeFile(path.join(root, "src", "Panel.tsazor"), '@import { total } from "./data"\n<p>@total</p>\n<Child @ref="child" />\n');
  await writeFile(
    path.join(root, "src", "Panel.tsazor.ts"),
    [
      'import { ComponentBase } from "@tsazor/runtime";',
      'import type Child from "./Child.tsazor";',
      "",
      "export default class Panel extends ComponentBase {",
      "    protected child?: Child;",
      "",
      "    protected resetChild(): void {",
      "        this.child?.reset();",
      "    }",
      "",
      "    protected label(): string {",
      "        return 42;",
      "    }",
      "}",
      "",
    ].join("\n"),
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("tsazor check — code-behind and imported sources", () => {
  it("reports a type error in a code-behind class on its own file and line", async () => {
    const result = await checkProject(root);
    const sidecar = result.diagnostics.filter((d) => d.file.endsWith("Panel.tsazor.ts"));
    expect(sidecar.map((d) => [d.code, d.line])).toEqual([["TS2322", 12]]);
  });

  it("types a `.tsazor` import of a .ts file as the component class; tsconfig .d.ts files are in the program", async () => {
    const result = await checkProject(root);
    // No TS2749 ('Child' refers to a value) / TS2339 (reset) and no TS2307 for the virtual module.
    expect(result.diagnostics.filter((d) => !(d.file.endsWith("Panel.tsazor.ts") && d.code === "TS2322"))).toEqual([]);
  });
});

describe("tsazor check — every source the tsconfig includes", () => {
  it("warns about an untyped @CascadingParameter() in a component's .ts class too (TZS039; the Radzen port's tool shells)", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "tsazor-check-cascade-"));
    try {
      await writeFile(
        path.join(project, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, skipLibCheck: true, noEmit: true }, include: ["src"] }),
      );
      await mkdir(path.join(project, "src", "tools"), { recursive: true });
      await writeFile(path.join(project, "src", "Hello.tsazor"), "<p>hello</p>\n");
      await writeFile(
        path.join(project, "src", "tools", "tool-base.ts"),
        [
          "declare function CascadingParameter(options?: { name?: string; type?: unknown }): (value: undefined, context: ClassFieldDecoratorContext) => void;",
          "export class Worksheet {}",
          "export class ToolBase {",
          "  @CascadingParameter() worksheet?: Worksheet;",
          '  @CascadingParameter({ name: "Spreadsheet" }) spreadsheet?: object;',
          "}",
          "",
        ].join("\n"),
      );
      const result = await checkProject(project);
      const warnings = result.diagnostics.filter((d) => d.code === "TZS039");
      expect(warnings.map((d) => [path.basename(d.file), d.line, d.column, d.severity])).toEqual([["tool-base.ts", 4, 3, "warning"]]);
      expect(warnings[0]!.message).toContain("@CascadingParameter({ type: Worksheet })");
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("checks a helper no component imports (a library's index exports it): a Radzen port's F1", async () => {
    const orphan = await mkdtemp(path.join(tmpdir(), "tsazor-check-orphan-"));
    try {
      await writeFile(
        path.join(orphan, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, skipLibCheck: true, noEmit: true }, include: ["src"] }),
      );
      await mkdir(path.join(orphan, "src", "utilities"), { recursive: true });
      await writeFile(path.join(orphan, "src", "Hello.tsazor"), "<p>hello</p>\n");
      await writeFile(path.join(orphan, "src", "utilities", "format.ts"), 'export const width: number = "wide";\n');
      const result = await checkProject(orphan);
      const helper = result.diagnostics.filter((d) => d.file.endsWith("format.ts"));
      expect(helper.map((d) => [d.code, d.line])).toEqual([["TS2322", 1]]);
    } finally {
      await rm(orphan, { recursive: true, force: true });
    }
  });
});
