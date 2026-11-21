/**
 * The diagnostic catalog (src/diagnostic-catalog.ts) is complete and true:
 * every code the compiler sources report has an entry (and only those),
 * the severity matches how it is reported, and each example compiles to a
 * diagnostic with its code.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile";
import { DIAGNOSTIC_CATALOG, RETIRED_DIAGNOSTIC_CODES } from "../src/diagnostic-catalog";
import { DIAGNOSTIC_MESSAGES } from "../src/diagnostics";

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const sources = readdirSync(srcDir)
  .filter((name) => name.endsWith(".ts") && name !== "diagnostic-catalog.ts" && name !== "diagnostics.ts")
  .map((name) => readFileSync(path.join(srcDir, name), "utf8"))
  .join("\n");

/** Every `"TZSnnn"` literal in the compiler sources. */
const reported = new Set([...sources.matchAll(/"(TZS\d{3})"/g)].map((match) => match[1]!));

describe("diagnostic catalog", () => {
  it("lists every reported code once, in order, and nothing else", () => {
    const codes = DIAGNOSTIC_CATALOG.map((entry) => entry.code);
    expect(codes).toEqual([...codes].sort());
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual([...reported].filter((code) => !RETIRED_DIAGNOSTIC_CODES.includes(code)).sort());
  });

  it("has a message for every code; retired codes are no longer reported", () => {
    const known = Object.keys(DIAGNOSTIC_MESSAGES);
    expect(known.filter((code) => !RETIRED_DIAGNOSTIC_CODES.includes(code))).toEqual(DIAGNOSTIC_CATALOG.map((entry) => entry.code));
    expect(RETIRED_DIAGNOSTIC_CODES.filter((code) => reported.has(code))).toEqual([]);
  });

  it("has a description and a fix for each code", () => {
    for (const entry of DIAGNOSTIC_CATALOG) {
      expect(entry.description.length, entry.code).toBeGreaterThan(20);
      expect(entry.fix.length, entry.code).toBeGreaterThan(10);
    }
  });

  const withExamples = DIAGNOSTIC_CATALOG.filter((entry) => entry.example !== undefined);
  it.each(withExamples.map((entry) => [entry.code, entry] as const))("%s: the example reports it", (code, entry) => {
    const { diagnostics } = compile(entry.example!, { className: "Example", fileName: "/virtual/Example.tsazor", generateSourceMap: false });
    const found = diagnostics.all.filter((diagnostic) => diagnostic.code === code);
    expect(found.length, `${code} example reports: ${diagnostics.all.map((d) => d.code).join(", ") || "nothing"}`).toBeGreaterThan(0);
    if (entry.severity !== "error or warning") {
      expect(found.some((diagnostic) => diagnostic.severity === entry.severity), `${code} is reported as ${entry.severity}`).toBe(true);
    }
  });

  // Without an example: the codes that need a workspace — code-behind (TZS011),
  // @using resolution (TZS017, TZS018) and component metadata (TZS025–TZS029, TZS037) — and
  // the check's own (TZS033–TZS036: a tsconfig, an unreadable file, a compiler bug, a package's manifest; TZS040: a
  // bind's declared type, which only the type layer knows — tested in the lsp's text-bind-check).
  it("has an example for most codes", () => {
    expect(withExamples.length).toBeGreaterThanOrEqual(DIAGNOSTIC_CATALOG.length - 14);
  });
});
