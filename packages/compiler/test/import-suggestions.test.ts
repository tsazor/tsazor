/**
 * F29: the typed shadow names the `@import` an unbound name in `@code` needs (tooling offers it for
 * TS2304); the build itself imports nothing — in TypeScript code a type comes from an import.
 */
import { describe, expect, it } from "vitest";
import { DiagnosticBag } from "../src/diagnostics";
import { generateCode } from "../src/codegen";
import { parseDocument } from "../src/parser";
import { unresolvedName } from "../src/import-suggestions";

const FILES: Record<string, { specifier: string; exportName?: string }> = {
  FilesTable: { specifier: "../Base/FilesTable.tsazor" },
  Dialog: { specifier: "@tsazor/fluent", exportName: "Dialog" },
  Formats: { specifier: "./formats", exportName: "Formats" },
  Imported: { specifier: "./imported" },
  Service: { specifier: "./service" },
};

function gen(source: string, typed = true) {
  const diagnostics = new DiagnosticBag();
  const result = generateCode(parseDocument(source, diagnostics), {
    className: "Demo",
    resolveType: (name) => FILES[name] ?? null,
    ...(typed ? { typedShadow: { rebaseTypeImport: () => undefined } } : {}),
  }, diagnostics);
  return result;
}

const SOURCE = [
  "@using ../Base",
  '@import { Imported } from "./imported"',
  "@inject Service Service",
  "",
  "<p>x</p>",
  "",
  "@code {",
  "    private table?: FilesTable;",
  "    private dialogs: Array<Dialog> = [];",
  "    private format = Formats.short(new Date());",
  "    private imported?: Imported;",
  "    private self?: Demo;",
  "    private unknown?: Nowhere;",
  "}",
].join("\n");

describe("import suggestions for @code (F29)", () => {
  it("names the @import each unbound name needs, type-only where only types use it", () => {
    expect(gen(SOURCE).importSuggestions).toEqual([
      { name: "FilesTable", directive: '@import type FilesTable from "../Base/FilesTable.tsazor"', insertLine: 3 },
      { name: "Dialog", directive: '@import type { Dialog } from "@tsazor/fluent"', insertLine: 3 },
      { name: "Formats", directive: '@import { Formats } from "./formats"', insertLine: 3 },
    ]);
  });

  it("imports nothing in the module itself, and records nothing outside the typed shadow", () => {
    const typed = gen(SOURCE);
    expect(typed.code).not.toMatch(/import.*FilesTable/);
    expect(typed.code).not.toMatch(/import.*Formats/);
    expect(gen(SOURCE, false).importSuggestions).toBeUndefined();
  });

  it("reads the name out of a TS2304 message", () => {
    expect(unresolvedName("Cannot find name 'FilesTable'.")).toBe("FilesTable");
    expect(unresolvedName("Cannot find name 'x'. Did you mean 'y'?")).toBe("x");
    expect(unresolvedName("Property 'a' does not exist on type 'B'.")).toBeUndefined();
  });
});
