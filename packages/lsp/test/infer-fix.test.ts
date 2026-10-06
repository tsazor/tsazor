/**
 * S4: an implicit-any parameter in `@code` (TS7006) gets TypeScript's
 * "Infer parameter types from usage" as a quick fix — the usage in the
 * markup counts, and the edit lands in the .tsazor file.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TsazorTypeService } from "../src/ts-service";
import { tsDiagnostics, tsInferTypeFixes } from "../src/ts-features";

let root = "";
let service: TsazorTypeService;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-infer-"));
  const runtime = path.join(root, "node_modules", "@tsazor", "runtime");
  await mkdir(runtime, { recursive: true });
  await writeFile(path.join(runtime, "package.json"), JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }));
  await writeFile(
    path.join(runtime, "index.d.ts"),
    "export declare interface RenderTreeBuilder { openElement(seq: number, tag: string): void; closeElement(): void; addAttribute(seq: number, name: string, value?: unknown): void; addContent(seq: number, value: unknown): void; }\n" +
      "export declare class ComponentBase { protected buildRenderTree(b: RenderTreeBuilder): void {} }\n",
  );
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, target: "ES2022", module: "ESNext", moduleResolution: "bundler" } }));
  service = new TsazorTypeService(root);
});

afterAll(async () => {
  service?.dispose?.();
  await rm(root, { recursive: true, force: true });
});

describe("infer parameter types from usage (S4)", () => {
  it("offers the fix for TS7006 and maps its edit into @code", async () => {
    const source = ["<p>@label(3)</p>", "", "@code {", "    label(count) {", "        return `${count} items`;", "    }", "}", ""].join("\n");
    const file = path.join(root, "Probe.tsazor");
    await writeFile(file, source);
    const entry = (await service.ensureTsazor(file, source))!;
    expect(tsDiagnostics(service, entry).map((d) => [d.code, d.line])).toContainEqual([7006, 3]);
    const fixes = tsInferTypeFixes(service, entry, { start: { line: 3, character: 0 }, end: { line: 3, character: 20 } });
    expect(fixes).toHaveLength(1);
    expect(fixes[0]!.title).toMatch(/Infer parameter types from usage/);
    expect(fixes[0]!.edits).toEqual([{ range: { start: { line: 3, character: 15 }, end: { line: 3, character: 15 } }, newText: ": number" }]);
  });

  it("offers nothing outside the requested lines", async () => {
    const source = ["<p>@label(3)</p>", "", "@code {", "    label(count) {", "        return count;", "    }", "}", ""].join("\n");
    const file = path.join(root, "Probe2.tsazor");
    await writeFile(file, source);
    const entry = (await service.ensureTsazor(file, source))!;
    expect(tsInferTypeFixes(service, entry, { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } })).toEqual([]);
  });
});
