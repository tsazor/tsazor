/**
 * P.5 — `RenderFragment<T>` is a real generic type: a template with a context
 * (`(item: T) => @<li>…</li>`). Before the fix the runtime type was not generic,
 * so `RenderFragment<Item>` in a component failed `tsazor check` with TS2315
 * *Type 'RenderFragment' is not generic.* This type-checks a consumer against the
 * real runtime source, with skipLibCheck off.
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const index = path.resolve(import.meta.dirname, "..", "src", "index.ts");

/** Type-checks `consumer` (a module importing the runtime) against the runtime source. */
function typeErrors(consumer: string): string[] {
  const dir = mkdtempSync(path.join(tmpdir(), "tsazor-rf-type-"));
  const file = path.join(dir, "consumer.ts");
  writeFileSync(file, consumer);
  try {
    const program = ts.createProgram([file, index], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      types: [],
      lib: ["lib.es2023.d.ts", "lib.dom.d.ts"],
    });
    return ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file?.fileName === file)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const importLine = `import type { RenderFragment, RenderTreeBuilder } from ${JSON.stringify(index.replace(/\.ts$/, ".js"))};`;

// A TypeScript program per test: a second or two alone, over vitest's 5 s with every package testing at once.
describe("RenderFragment<T> as a generic type (P.5)", { timeout: 60_000 }, () => {
  it("RenderFragment<number> takes the context and returns a fragment", () => {
    const errors = typeErrors(`${importLine}
const row: RenderFragment<number> = (n: number): RenderFragment => (b: RenderTreeBuilder): void => { n; b; };
const plain: RenderFragment = (b): void => { b; };
void row; void plain;`);
    expect(errors).toEqual([]);
  });

  it("a context-less RenderFragment stays the plain fragment", () => {
    const errors = typeErrors(`${importLine}
const plain: RenderFragment = (b: RenderTreeBuilder): void => { b; };
void plain;`);
    expect(errors).toEqual([]);
  });
});
