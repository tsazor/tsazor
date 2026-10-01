/**
 * Tsazor CLI (2.4 / T1): the gate form of the type layer — `tsazor check`
 * reports compiler + TypeScript diagnostics for every project `.tsazor` and
 * exits nonzero on errors.
 */
import { checkProject } from "@tsazor/lsp";

export { checkProject, type CheckResult, type CheckDiagnostic } from "@tsazor/lsp";

const VERSION = "0.1.0";

/** CLI entry: prints diagnostics `file(line,column) code message` (paths
 *  relative to the root, posix) and returns the exit code — 0 clean, 1 with
 *  errors, 2 on a fatal setup failure or wrong usage. */
export async function main(argv: readonly string[], stdout: (line: string) => void): Promise<number> {
  const [command, root, ...extra] = argv.slice(2);
  if (command === "--version" || command === "-v") {
    stdout(`tsazor ${VERSION}`);
    return 0;
  }
  if (command !== "check" || extra.length > 0 || root === "--help" || root === "-h") {
    stdout("Usage: tsazor check [project-root]");
    stdout("  Compiler and TypeScript diagnostics for every .tsazor under root.");
    stdout("  Exit code 1 when any error is found.");
    return command === "check" && root === undefined ? 0 : 2;
  }
  let result;
  try {
    result = await checkProject(root ?? process.cwd());
  } catch (error) {
    stdout(`tsazor check failed: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  for (const diagnostic of result.diagnostics) {
    stdout(`${relativePosix(root ?? process.cwd(), diagnostic.file)}(${diagnostic.line},${diagnostic.column}) ${diagnostic.code} ${diagnostic.message}`);
  }
  stdout(`tsazor check: ${result.files} file(s), ${errors.length} error(s), ${result.diagnostics.length - errors.length} warning(s)`);
  return errors.length > 0 ? 1 : 0;
}

function relativePosix(root: string, file: string): string {
  const filePosix = file.replace(/\\/g, "/");
  const rootPosix = root.replace(/\\/g, "/");
  return filePosix.toLowerCase().startsWith(rootPosix.toLowerCase() + "/") ? "./" + filePosix.slice(rootPosix.length + 1) : filePosix;
}