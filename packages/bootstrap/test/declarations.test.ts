/**
 * The published declarations (dist/*.d.ts) type-check as a consumer sees them — with
 * skipLibCheck off, so a broken declaration can't hide behind it (types silently `any`).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

// A TypeScript program per test: a second or two alone, over vitest's 5 s with every package testing at once.
describe("the published declarations", { timeout: 60_000 }, () => {
  it("type-check without skipLibCheck", () => {
    const dist = path.resolve(import.meta.dirname, "..", "dist");
    const program = ts.createProgram([path.join(dist, "index.d.ts")], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      types: [],
      lib: ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    });
    const errors = ts
      .getPreEmitDiagnostics(program)
      .map((d) => {
        const where = d.file ? `${path.relative(dist, d.file.fileName)}:${d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1}` : "";
        return `${where}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`;
      });
    expect(errors).toEqual([]);
  });

  it("type a parameter without an annotation by its initializer", () => {
    const dist = path.resolve(import.meta.dirname, "..", "dist");
    expect(readFileSync(path.join(dist, "Toolbar.d.ts"), "utf8")).toMatch(/^ {2}wrap: boolean;$/m);
    expect(readFileSync(path.join(dist, "Overlay.d.ts"), "utf8")).toMatch(/^ {2}opacity: number;$/m);
    const untyped = readdirSync(dist)
      .filter((file) => file.endsWith(".d.ts"))
      .filter((file) => /^ {2}\w+\??: undefined;$/m.test(readFileSync(path.join(dist, file), "utf8")));
    expect(untyped).toEqual([]);
  });

  it("list a component's public methods, not its internal ones or its lifecycle", () => {
    const dist = path.resolve(import.meta.dirname, "..", "dist");
    const read = (name: string): string => readFileSync(path.join(dist, `${name}.d.ts`), "utf8");
    expect(read("Overlay")).toMatch(/^ {2}showAsync\(\): Promise<void>;$/m);
    expect(read("Overlay")).toMatch(/^ {2}closeAsync\(\): Promise<void>;$/m);
    expect(read("DataGrid")).toMatch(/^ {2}refreshDataAsync\(\): Promise<void>;$/m);
    expect(read("DataGrid")).toMatch(/^ {2}scrollToItemAsync\(index: number, signal\?: AbortSignal\): Promise<void>;$/m);
    expect(read("Wizard")).toMatch(/^ {2}goToStepAsync\(index: number, validate\?: boolean\): Promise<void>;$/m);
    expect(read("Dropdown")).not.toMatch(/close\(/);
    expect(read("TreeView")).not.toMatch(/isExpanded\(/);
    expect(read("ToastRegion")).not.toMatch(/onInitialized/);
  });
});
