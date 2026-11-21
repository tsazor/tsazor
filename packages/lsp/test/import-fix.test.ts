/**
 * F29: a type in `@code` that markup would find by name (a component through `@using`) is TS2304, as in
 * any TypeScript; the message names the exact `@import`, and the quick fix inserts it after the
 * directives.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TsazorTypeService } from "../src/ts-service";
import { tsDiagnostics, tsImportFixes } from "../src/ts-features";

let root = "";
let service: TsazorTypeService;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-import-"));
  const runtime = path.join(root, "node_modules", "@tsazor", "runtime");
  await mkdir(runtime, { recursive: true });
  await writeFile(path.join(runtime, "package.json"), JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }));
  await writeFile(
    path.join(runtime, "index.d.ts"),
    "export declare interface RenderTreeBuilder { openElement(seq: number, tag: string): void; closeElement(): void; addAttribute(seq: number, name: string, value?: unknown): void; addContent(seq: number, value: unknown): void; openComponent(seq: number, type: unknown): void; closeComponent(): void; addComponentReferenceCapture(seq: number, capture: (component: unknown) => void): void; }\n" +
      "export declare class ComponentBase { protected buildRenderTree(b: RenderTreeBuilder): void {} }\n",
  );
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, target: "ES2022", module: "ESNext", moduleResolution: "bundler" } }));
  await mkdir(path.join(root, "Base"), { recursive: true });
  await writeFile(path.join(root, "Base", "FilesTable.tsazor"), "<table></table>\n\n@code {\n    load(): void {}\n}\n");
  service = new TsazorTypeService(root);
});

afterAll(async () => {
  service?.dispose?.();
  await rm(root, { recursive: true, force: true });
});

describe("the @import a type in @code lacks (F29)", () => {
  const source = ["@using ./Base", "", '<FilesTable @ref="table" />', "", "@code {", "    private table?: FilesTable;", "}", ""].join("\n");

  it("names the exact @import in TS2304's message", async () => {
    const file = path.join(root, "Probe.tsazor");
    await writeFile(file, source);
    const entry = (await service.ensureTsazor(file, source))!;
    const missing = tsDiagnostics(service, entry).filter((d) => d.code === 2304);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.line).toBe(5);
    expect(missing[0]!.message).toBe(
      "Cannot find name 'FilesTable'. Hint: markup finds `FilesTable` by name, but in `@code` a type comes from an import, as in any TypeScript: " +
        '`@import type FilesTable from "./Base/FilesTable.tsazor"` (quick fix).',
    );
  });

  it("inserts it after the directives as a quick fix, and the file then checks clean", async () => {
    const file = path.join(root, "Probe2.tsazor");
    await writeFile(file, source);
    const entry = (await service.ensureTsazor(file, source))!;
    const fixes = tsImportFixes(service, entry, { start: { line: 5, character: 0 }, end: { line: 5, character: 30 } });
    expect(fixes.map((fix) => [fix.title, fix.edits])).toEqual([
      ['Add @import type FilesTable from "./Base/FilesTable.tsazor"', [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: '@import type FilesTable from "./Base/FilesTable.tsazor"\n' }]],
    ]);
    const lines = source.split("\n");
    lines.splice(1, 0, '@import type FilesTable from "./Base/FilesTable.tsazor"');
    const fixed = lines.join("\n");
    await writeFile(file, fixed);
    const after = (await service.ensureTsazor(file, fixed))!;
    expect(tsDiagnostics(service, after).map((d) => `${d.code} ${d.message}`)).toEqual([]);
    expect(tsImportFixes(service, entry, { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } })).toEqual([]);
  });
});

describe("the @import an enum in markup lacks (G2)", () => {
  // A port of Radzen: `Shade="Shade.Dark"` without the enum's import read `Shade` as a member, and the error named
  // the component's type ("Property 'Shade' does not exist on type 'Page'") instead of the import.
  it("names the exact @import in TS2339's message and offers it as a quick fix; a lowercase file keeps its case", async () => {
    await mkdir(path.join(root, "Tones"), { recursive: true });
    await writeFile(path.join(root, "Tones", "shade.ts"), 'export enum Shade {\n  Light = "light",\n  Dark = "dark",\n}\n');
    const source = ["@using ./Tones", "", "<p>@Shade.Dark</p>", ""].join("\n");
    const file = path.join(root, "Tinted.tsazor");
    await writeFile(file, source);
    const entry = (await service.ensureTsazor(file, source))!;
    const missing = tsDiagnostics(service, entry).filter((d) => d.code === 2339);
    expect(missing.map((d) => d.message)).toEqual([
      "Property 'Shade' does not exist on type 'Tinted'. Hint: `Shade` is no member of the component — an import is missing, as in any TypeScript: " +
        '`@import { Shade } from "./Tones/shade"` (quick fix).',
    ]);
    const fixes = tsImportFixes(service, entry, { start: { line: 2, character: 0 }, end: { line: 2, character: 20 } });
    expect(fixes.map((fix) => fix.title)).toEqual(['Add @import { Shade } from "./Tones/shade"']);
  });
});
