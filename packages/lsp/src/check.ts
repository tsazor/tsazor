/**
 * 2.4 / T1: `tsazor check` — compiles every `.tsazor` of a project (compiler
 * diagnostics) and type-checks all their shadows in one TsazorTypeService
 * (TS syntactic + semantic diagnostics, filtered like the LSP layer). The
 * gate form of the same pipeline the language server runs live.
 */
import { analyzeSource } from "./analysis.js";
import { ProjectRegistry } from "./projects.js";
import { tsDiagnostics } from "./ts-features.js";
import { findTsazorFiles } from "./ts-service.js";
import { readFileSync } from "node:fs";
import path from "node:path";

export interface CheckDiagnostic {
  /** Absolute path of the .tsazor file. */
  file: string;
  /** 1-based line / column of the diagnostic (source coordinates). */
  line: number;
  column: number;
  /** Diagnostic code: `TZS…` (compiler) or `TS…` (type layer). */
  code: string;
  severity: "error" | "warning";
  message: string;
}

export interface CheckResult {
  /** Number of .tsazor files checked. */
  files: number;
  diagnostics: CheckDiagnostic[];
}

/** Checks every .tsazor under `root`. `tsDiagnostics: false` limits the run
 *  to the compiler layer (the type layer needs a tsconfig/lib set). Files are
 *  routed to their nearest-tsconfig project (2.5): each app of a monorepo
 *  root checks against its own compiler options. */
export async function checkProject(root: string, options?: { tsDiagnostics?: boolean }): Promise<CheckResult> {
  const projectRoot = path.resolve(root);
  const files = findTsazorFiles(projectRoot);
  const diagnostics: CheckDiagnostic[] = [];
  const registry = new ProjectRegistry([projectRoot]);
  try {
    // Pass 1 (compiler layer) + shadow build for every file — the type layer
    // only starts once the whole shadow graph is registered: a consumer
    // shadow importing a sibling component's shadow (`.tsazor.gen`) must not
    // report TS2307 because the sibling had not been ensured yet.
    const entries = new Map<string, Awaited<ReturnType<ProjectRegistry["ensureTsazor"]>>>();
    for (const file of files) {
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        diagnostics.push({ file, line: 1, column: 1, code: "TSZECHECK", severity: "error", message: "file is not readable" });
        continue;
      }
      for (const diagnostic of (await analyzeSource(file, source, projectRoot)).diagnostics) {
        diagnostics.push({
          file,
          // Source positions are 1-based line / 0-based column (display adds 1).
          line: diagnostic.pos.line,
          column: diagnostic.pos.column + 1,
          code: diagnostic.code,
          severity: diagnostic.severity,
          message: diagnostic.message,
        });
      }
      if (options?.tsDiagnostics === false) continue;
      entries.set(file, await registry.ensureTsazor(file, source));
    }
    if (options?.tsDiagnostics !== false) {
      // Pass 2: the type layer over the complete graph.
      for (const [file, entry] of entries) {
        if (!entry) continue;
        for (const diagnostic of tsDiagnostics(registry.projectFor(file).service, entry, 200)) {
          diagnostics.push({
            file,
            // TS diagnostics arrive 0-based (LSP coordinates) — display adds 1.
            line: diagnostic.line + 1,
            column: diagnostic.character + 1,
            code: `TS${diagnostic.code}`,
            severity: "error",
            message: diagnostic.message,
          });
        }
      }
    }
  } finally {
    registry.dispose();
  }
  return { files: files.length, diagnostics };
}