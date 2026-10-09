/**
 * The published declarations as a consumer's TypeScript sees them: an icon is an IconValue, and a misspelled one is
 * an error on the namespace (TS2551, with the near name), not a silent `any`.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const dist = path.resolve(import.meta.dirname, "..", "dist").replaceAll("\\", "/");

function diagnosticsOf(code: string): string[] {
  // Inside the package, so @tsazor/ui resolves as it does for a consumer that depends on the icons.
  const work = mkdtempSync(path.join(import.meta.dirname, ".consumer-"));
  try {
    const file = path.join(work, "consumer.ts");
    writeFileSync(file, code);
    const program = ts.createProgram([file], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      types: [],
      lib: ["lib.es2023.d.ts", "lib.dom.d.ts"],
      baseUrl: path.resolve(import.meta.dirname, ".."),
    });
    return ts.getPreEmitDiagnostics(program).map((d) => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

describe("the published declarations", () => {
  it("type an icon as an IconValue", () => {
    expect(
      diagnosticsOf(
        `import * as Icons from "${dist}/index.js";\nimport type { IconValue } from "@tsazor/ui";\nexport const save: IconValue = Icons.Alarm;\nexport const name: string = Icons.AlarmFill.name;\n`,
      ),
    ).toEqual([]);
  });

  it("report a misspelled icon, with the near name", () => {
    const errors = diagnosticsOf(`import * as Icons from "${dist}/index.js";\nexport const save = Icons.Alar;\n`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^TS2551: Property 'Alar' does not exist .* Did you mean 'Alarm'\?/);
  });
});
