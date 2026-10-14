/**
 * The `tsazor` command line: `check`, `codemod` and `build-lib`. Exit codes (one table for every command):
 *
 *   0  done, nothing to report (`--help` and `--version` too)
 *   1  findings: `check` found errors, `build-lib` found errors and built nothing
 *   2  usage or setup: an unknown command or option, a missing path, nothing to work on, a crash
 *
 * Reports go to stdout; usage errors and failures to stderr, so a gate that pipes the report still sees why it failed.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { checkProject } from "@tsazor/lsp";
import { buildLibrary } from "./build-library.js";
import { codemodProject } from "./codemod.js";

const USAGE = [
  "Usage: tsazor check [project-root]",
  "  Compiler and TypeScript diagnostics for every .tsazor under root (default: the current directory).",
  "Usage: tsazor codemod <path> [--write]",
  "  Mechanical .razor → .tsazor migration: applies the compiler's fix payloads (TZS021 C# forms, TZS022 var,",
  "  TZS024 interpolated strings) and the PascalCase API forms; writes <name>.tsazor beside the source with",
  "  --write, reports the dry-run otherwise.",
  "Usage: tsazor build-lib [package-dir] [--stylesheet <file>] [--no-check]",
  "  Builds a component library: src/*.tsazor and src/*.ts into dist/, with the component manifest, the",
  "  declarations and the index, after type-checking the sources (--no-check skips it); --stylesheet joins",
  "  src/styles/*.css and the components' sidecar CSS into dist/<file>.",
  "Exit codes: 0 done, 1 findings (errors), 2 usage or setup (an unknown option, a missing path, a crash).",
];

/** The package's own version (one for every package, design-release.md D-P1) — read when asked: a bundler that loads
 * this module (the tutorial's tests) has no file URL to read it from. */
function version(): string {
  return (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
}

/** Runs the command line `argv` (as `process.argv`) and returns the exit code. */
export async function main(argv: readonly string[], stdout: (line: string) => void, stderr: (line: string) => void = stdout): Promise<number> {
  const [command, ...rest] = argv.slice(2);
  if (command === "--version" || command === "-v") {
    stdout(`tsazor ${version()}`);
    return 0;
  }
  if (command === "--help" || command === "-h" || rest.includes("--help") || rest.includes("-h")) {
    for (const line of USAGE) stdout(line);
    return 0;
  }
  const usage = (problem: string): number => {
    stderr(problem);
    for (const line of USAGE) stderr(line);
    return 2;
  };
  if (command === undefined) return usage("tsazor: which command? check, codemod or build-lib.");
  if (command !== "check" && command !== "codemod" && command !== "build-lib") return usage(`tsazor: unknown command "${command}".`);

  // The arguments: positionals, and the options each command knows (with their values).
  const known: Record<string, Record<string, "flag" | "value">> = {
    check: {},
    codemod: { "--write": "flag" },
    "build-lib": { "--stylesheet": "value", "--no-check": "flag" },
  };
  const positionals: string[] = [];
  const options = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }
    const kind = known[command]![arg];
    if (kind === undefined) return usage(`tsazor ${command}: unknown option "${arg}".`);
    if (kind === "flag") options.set(arg, true);
    else {
      const value = rest[++i];
      if (value === undefined || value.startsWith("-")) return usage(`tsazor ${command}: ${arg} needs a value.`);
      options.set(arg, value);
    }
  }
  if (positionals.length > 1) return usage(`tsazor ${command}: one path, not ${positionals.length}.`);
  const target = positionals[0];
  if (command === "codemod" && target === undefined) return usage("tsazor codemod: which path?");
  const root = target ?? ".";
  if (!existsSync(root)) return usage(`tsazor ${command}: no such path "${root}".`);
  if (command !== "codemod" && !statSync(root).isDirectory()) return usage(`tsazor ${command}: "${root}" is no directory.`);

  try {
    if (command === "check") return await check(root, stdout);
    if (command === "codemod") return await codemod(root, options.has("--write"), stdout, stderr);
    if (!existsSync(path.join(root, "package.json"))) return usage(`tsazor build-lib: "${root}" has no package.json.`);
    const stylesheet = options.get("--stylesheet");
    const result = await buildLibrary({
      packageDir: root,
      check: !options.has("--no-check"),
      ...(typeof stylesheet === "string" ? { stylesheet: { file: stylesheet } } : {}),
      log: stdout,
    });
    return result.errors.length > 0 ? 1 : 0;
  } catch (error) {
    stderr(`tsazor ${command} failed: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

/** `tsazor check`: diagnostics `file(line,column) code message`, paths relative to the root (posix). */
async function check(root: string, stdout: (line: string) => void): Promise<number> {
  const result = await checkProject(root);
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  for (const diagnostic of result.diagnostics) {
    stdout(`${relativePosix(root, diagnostic.file)}(${diagnostic.line},${diagnostic.column}) ${diagnostic.code} ${diagnostic.message}`);
  }
  stdout(`tsazor check: ${result.files} file(s), ${errors.length} error(s), ${result.diagnostics.length - errors.length} warning(s)`);
  return errors.length > 0 ? 1 : 0;
}

/** `tsazor codemod`: one line per file, then the totals; no .razor file under the path is a setup error. */
async function codemod(root: string, write: boolean, stdout: (line: string) => void, stderr: (line: string) => void): Promise<number> {
  const report = await codemodProject(root, { write });
  if (report.files.length === 0) {
    stderr(`tsazor codemod: no .razor files under ${relativePosix(root, root)}`);
    return 2;
  }
  for (const file of report.files) {
    const codes = [...file.remainingCodes].sort().map(([code, count]) => `${code}×${count}`).join(" ");
    stdout(
      `${relativePosix(root, file.file)} → ${relativePosix(root, file.target)}: ${file.applied} fix(es), ${file.apiReplacements} API form(s)` +
        (codes === "" ? "" : `, remaining: ${codes}`) + (file.crash !== undefined ? ` CRASH: ${file.crash}` : ""),
    );
  }
  stdout(
    `tsazor codemod: ${report.files.length} file(s), ${report.applied} fix(es), ${report.apiReplacements} API form(s), ` +
      `${report.withRemainingErrors} with remaining errors, ${report.crashes} crash(es)` + (write ? "" : " (dry-run — pass --write)"),
  );
  return 0;
}

function relativePosix(root: string, file: string): string {
  const filePosix = file.replace(/\\/g, "/");
  const rootPosix = root.replace(/\\/g, "/");
  return filePosix.toLowerCase().startsWith(rootPosix.toLowerCase() + "/") ? "./" + filePosix.slice(rootPosix.length + 1) : filePosix;
}
