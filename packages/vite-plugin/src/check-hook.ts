/**
 * 2.4: the optional `check: true` hook — the vite plugin runs the same
 * `tsazor check` pipeline (compiler diagnostics + typed shadow checks) over
 * the build root at build end and fails the build on errors, so app builds
 * carry the gate even without the CLI script.
 */
import { checkProject, type CheckDiagnostic } from "@tsazor/lsp";
import path from "node:path";

/** Formats one diagnostic like the CLI: `file(line,column) code message`. */
export function formatCheckDiagnostic(root: string, diagnostic: CheckDiagnostic): string {
  const relative = path.relative(root, diagnostic.file).replace(/\\/g, "/");
  return `${relative}(${diagnostic.line},${diagnostic.column}) ${diagnostic.code} ${diagnostic.message}`;
}

/** Runs the check over `root`, printing every diagnostic through `log`.
 *  Returns the diagnostics for the caller to decide the error. */
export async function runBuildCheck(root: string, log: (line: string) => void): Promise<CheckDiagnostic[]> {
  const { files, diagnostics } = await checkProject(root);
  for (const diagnostic of diagnostics) log(formatCheckDiagnostic(root, diagnostic));
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;
  log(`tsazor check: ${files} file(s), ${errors} error(s), ${warnings} warning(s)`);
  return diagnostics;
}