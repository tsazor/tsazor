/**
 * Tsazor CLI: the gate form of the type layer — `tsazor check` reports
 * compiler + TypeScript diagnostics for every project `.tsazor` and exits
 * nonzero on errors — and `tsazor codemod` (2.5), the `.razor` → `.tsazor`
 * migration command (dry-run by default, `--write` beside the source).
 */
import { checkProject } from "@tsazor/lsp";
import { codemodProject } from "./codemod.js";

export { checkProject, type CheckResult, type CheckDiagnostic } from "@tsazor/lsp";
export { codemodProject, findRazorFiles, type CodemodOptions, type CodemodReport, type CodemodFileReport } from "./codemod.js";

const VERSION = "0.2.0";

/** CLI entry: prints diagnostics `file(line,column) code message` (paths
 *  relative to the root, posix) and returns the exit code — 0 clean, 1 with
 *  errors, 2 on a fatal setup failure or wrong usage. */
export async function main(argv: readonly string[], stdout: (line: string) => void): Promise<number> {
  const [command, root, ...extra] = argv.slice(2);
  if (command === "--version" || command === "-v") {
    stdout(`tsazor ${VERSION}`);
    return 0;
  }
  if (command !== "check" && command !== "codemod") {
    stdout("Usage: tsazor check [project-root]");
    stdout("  Compiler and TypeScript diagnostics for every .tsazor under root.");
    stdout("  Exit code 1 when any error is found.");
    stdout("Usage: tsazor codemod <path> [--write]");
    stdout('  Mechanical .razor → .tsazor migration: applies the compiler\'s fix');
    stdout("  payloads (TZS021 C# forms, TZS022 var, TZS024 interpolated strings)");
    stdout("  and the PascalCase API forms; writes <name>.tsazor beside the source");
    stdout("  with --write, reports the dry-run otherwise.");
    return 2;
  }
  if (root === undefined || root === "--help" || root === "-h") {
    return command === "codemod" ? 2 : 0;
  }
  if (command === "codemod") {
    const write = extra.includes("--write");
    if (extra.some((option) => option !== "--write")) {
      stdout("Usage: tsazor codemod <path> [--write]");
      return 2;
    }
    let report;
    try {
      report = await codemodProject(root, { write });
    } catch (error) {
      stdout(`tsazor codemod failed: ${error instanceof Error ? error.message : String(error)}`);
      return 2;
    }
    for (const file of report.files) {
      const codes = [...file.remainingCodes].sort().map(([code, count]) => `${code}×${count}`).join(" ");
      stdout(
        `${relativePosix(root, file.file)} → ${relativePosix(root, file.target)}: ${file.applied} fix(es), ${file.apiReplacements} API form(s)` +
          (codes === "" ? "" : `, remaining: ${codes}`) + (file.crash !== undefined ? ` CRASH: ${file.crash}` : ""),
      );
    }
    if (report.files.length === 0) {
      stdout(`tsazor codemod: no .razor files under ${relativePosix(root, root)}`);
      return 1;
    }
    stdout(
      `tsazor codemod: ${report.files.length} file(s), ${report.applied} fix(es), ${report.apiReplacements} API form(s), ` +
        `${report.withRemainingErrors} with remaining errors, ${report.crashes} crash(es)` + (write ? "" : " (dry-run — pass --write)"),
    );
    return 0;
  }
  let result;
  try {
    result = await checkProject(root);
  } catch (error) {
    stdout(`tsazor check failed: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  for (const diagnostic of result.diagnostics) {
    stdout(`${relativePosix(root, diagnostic.file)}(${diagnostic.line},${diagnostic.column}) ${diagnostic.code} ${diagnostic.message}`);
  }
  stdout(`tsazor check: ${result.files} file(s), ${errors.length} error(s), ${result.diagnostics.length - errors.length} warning(s)`);
  return errors.length > 0 ? 1 : 0;
}

function relativePosix(root: string, file: string): string {
  const filePosix = file.replace(/\\/g, "/");
  const rootPosix = root.replace(/\\/g, "/");
  return filePosix.toLowerCase().startsWith(rootPosix.toLowerCase() + "/") ? "./" + filePosix.slice(rootPosix.length + 1) : filePosix;
}