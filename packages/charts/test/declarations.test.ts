/**
 * The published declarations (dist/*.d.ts) type-check as a consumer sees them — with
 * skipLibCheck off, so a broken declaration can't hide behind it (types silently `any`).
 */
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
});
