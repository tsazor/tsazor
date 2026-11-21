/**
 * No type error is lost on the way back to the source. Before, an error on a
 * generated line without a mapping was dropped: an inherited `@import` with a
 * typo left its names `any` without a word, an `@inject` of a type-only import
 * showed only the follow-up "Object is of type 'unknown'", and a class-level
 * error (a member that clashes with the base class) passed the gate.
 *  - an _Imports.tsazor's own `@import`s are checked in its own shadow, mapped
 *    onto the directives — once, not in every file below;
 *  - the `@inject` member maps onto the directive's type;
 *  - an error that maps nowhere is reported on the file's first line, quoting
 *    the generated line.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkProject, type CheckDiagnostic } from "../src/check";

let root = "";
let diagnostics: CheckDiagnostic[] = [];

const RUNTIME_DTS = [
  "export declare interface RenderTreeBuilder {",
  "  openElement(seq: number, tag: string): void;",
  "  closeElement(): void;",
  "  addAttribute(seq: number, name: string, value?: unknown): void;",
  "  addContent(seq: number, value: unknown): void;",
  "  addMarkupContent(seq: number, value: string | null): void;",
  "}",
  "export declare class ComponentBase {",
  "  protected buildRenderTree(b: RenderTreeBuilder): void {}",
  "}",
  "export declare class Base extends ComponentBase {",
  "  value?: number;",
  "}",
  "export declare type Token<T> = abstract new (...args: never[]) => T;",
  "export declare function inject<T>(token: Token<T>): T;",
  "export declare function Parameter(options?: { captureUnmatchedValues?: boolean }): (value: unknown, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext | ClassSetterDecoratorContext) => void;",
  "",
].join("\n");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-check-unplaced-"));
  await mkdir(path.join(root, "node_modules", "@tsazor", "runtime"), { recursive: true });
  await writeFile(
    path.join(root, "node_modules", "@tsazor", "runtime", "package.json"),
    JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }),
  );
  await writeFile(path.join(root, "node_modules", "@tsazor", "runtime", "index.d.ts"), RUNTIME_DTS);
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, skipLibCheck: true, noEmit: true, noUnusedLocals: true },
      include: ["src"],
    }),
  );
  const src = path.join(root, "src");
  await mkdir(path.join(src, "typo"), { recursive: true });
  await mkdir(path.join(src, "typeonly"), { recursive: true });
  await writeFile(path.join(src, "Store.ts"), "export default class Store {\n    count = 0;\n}\nexport interface Entry {\n    at: number;\n}\n");
  // A typo in an inherited specifier: reported at the _Imports line, not in the files below.
  await writeFile(path.join(src, "typo", "_Imports.tsazor"), '@import type { Entry } from "../Stroe"\n');
  await writeFile(path.join(src, "typo", "First.tsazor"), "<p>first</p>\n\n@code {\n    entry?: Entry;\n}\n");
  await writeFile(path.join(src, "typo", "Second.tsazor"), "<p>second</p>\n\n@code {\n    entry?: Entry;\n}\n");
  // The injected class imported type-only (an unused import in an _Imports is no error either).
  await writeFile(path.join(src, "typeonly", "_Imports.tsazor"), '@import type Store from "../Store"\n@import type { Entry } from "../Store"\n');
  await writeFile(path.join(src, "typeonly", "Counter.tsazor"), "@inject Store store\n\n<p>@store.count</p>\n");
  // A member that clashes with the base class: the class declaration is generated, it maps nowhere.
  await writeFile(
    path.join(src, "Clash.tsazor"),
    '@import { Base } from "@tsazor/runtime"\n@inherits Base\n\n<p>clash</p>\n\n@code {\n    private get value(): number {\n        return 1;\n    }\n}\n',
  );
  // A page importing as if it sat beside the module: the hint names the folder and the specifier that finds it.
  await mkdir(path.join(src, "pages"), { recursive: true });
  await writeFile(path.join(src, "pages", "List.tsazor"), '@import type { Entry } from "./Store"\n<p>list</p>\n\n@code {\n    entry?: Entry;\n}\n');
  // One `../` too many (a MudBlazor port's F105), and a .ts helper naming a component `.js` (its F1000).
  await mkdir(path.join(src, "base"), { recursive: true });
  await writeFile(path.join(src, "base", "paper-base.ts"), "export interface PaperBase {\n    elevation: number;\n}\n");
  await writeFile(path.join(src, "Paper.tsazor"), '@import type { PaperBase } from "../base/paper-base.js"\n<p>paper</p>\n\n@code {\n    base?: PaperBase;\n}\n');
  await writeFile(path.join(src, "base", "paper-ref.ts"), 'import type Paper from "../Paper.js";\n\nexport type PaperRef = Paper | undefined;\n');
  // A package name an agent corrupted (both ports met `@tszor/…`): the hint names the installed one.
  await writeFile(path.join(src, "Typo.tsazor"), '@import { ComponentBase } from "@tszor/runtime"\n<p>typo</p>\n');
  // A C# string: one TZS024 that names the template literal, no type errors after it.
  await writeFile(path.join(src, "Greeting.tsazor"), '<p>@($"Hi {name}")</p>\n\n@code {\n    name = "x";\n}\n');
  diagnostics = (await checkProject(root)).diagnostics;
}, 60_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const of = (file: string): CheckDiagnostic[] => diagnostics.filter((d) => path.relative(path.join(root, "src"), d.file).replace(/\\/g, "/") === file);

describe("tsazor check — no error lost on the way back to the source", () => {
  it("reports an inherited @import's unresolved specifier once, at its _Imports line", () => {
    expect(of("typo/_Imports.tsazor").map((d) => [d.code, d.line, d.column])).toEqual([["TS2307", 1, 29]]);
    expect(of("typo/First.tsazor")).toEqual([]);
    expect(of("typo/Second.tsazor")).toEqual([]);
  });

  it("promotes an inherited @import type binding to a value import when @inject needs it — no error", () => {
    expect(of("typeonly/Counter.tsazor")).toEqual([]);
    expect(of("typeonly/_Imports.tsazor")).toEqual([]);
  });

  it("says where a relative specifier was resolved from, and which one finds the module", () => {
    const [missing] = of("pages/List.tsazor");
    expect(missing?.code).toBe("TS2307");
    expect(missing?.message).toContain("Hint: a relative specifier resolves from the folder of the file it is written in (src/pages/), as in any TypeScript module — '../Store' finds it.");
    expect(of("typo/_Imports.tsazor")[0]!.message).toContain("(src/typo/)");
  });

  it("names the installed package a misspelled one is near", () => {
    expect(of("Typo.tsazor").find((d) => d.code === "TS2307")?.message).toContain("Hint: '@tszor/runtime' is not installed — '@tsazor/runtime' is: a typo?");
  });

  it("names the specifier in the file's own folder, a .ts source by its .js name, and a component's .tsazor from a .ts module", () => {
    expect(of("Paper.tsazor")[0]!.message).toContain("— './base/paper-base.js' finds it.");
    const [helper] = of("base/paper-ref.ts");
    expect(helper?.code).toBe("TS2307");
    expect(helper?.message).toContain("(src/base/), as in any TypeScript module — '../Paper.tsazor' finds it.");
  });

  it("reports a C# string once, as TZS024 with the template literal — the type layer adds nothing", () => {
    expect(of("Greeting.tsazor").map((d) => [d.code, d.line, d.column])).toEqual([["TZS024", 1, 7]]);
    expect(of("Greeting.tsazor")[0]!.message).toContain("use the template literal `Hi ${name}`");
  });

  it("reports an error that maps nowhere on the file's first line, quoting the generated line", () => {
    const clash = of("Clash.tsazor").find((d) => d.code === "TS2415");
    expect(clash).toBeDefined();
    expect([clash!.line, clash!.column]).toEqual([1, 1]);
    expect(clash!.message).toContain("In the code generated from this file: `export default class Clash extends Base {`");
  });
});
