/**
 * 2.5 — `tsazor codemod`: the `.razor` → `.tsazor` migration command over a
 * project's markup sources. The transform itself (fix payloads to a fixpoint
 * plus the PascalCase API forms) lives in `@tsazor/compiler` (`codemodSource`);
 * this module walks the tree, writes `<name>.tsazor` next to the `.razor`
 * source and reports what worked and what a reviewer still sees.
 */
import { codemodSource } from "@tsazor/compiler";
import { readdirSync, statSync } from "node:fs";

export interface CodemodOptions {
  /** Write `<name>.tsazor` next to every `.razor` (default: dry-run). */
  readonly write?: boolean;
}

export interface CodemodFileReport {
  /** The `.razor` source (absolute, real case). */
  readonly file: string;
  /** The `.tsazor` written or to-be-written (absolute). */
  readonly target: string;
  readonly applied: number;
  readonly apiReplacements: number;
  readonly remainingErrors: number;
  readonly remainingWarnings: number;
  /** Remaining real-error codes (the C# forms and the fixes applied are gone). */
  readonly remainingCodes: ReadonlyMap<string, number>;
  readonly crash?: string;
}

export interface CodemodReport {
  readonly files: readonly CodemodFileReport[];
  readonly applied: number;
  readonly apiReplacements: number;
  readonly withRemainingErrors: number;
  readonly crashes: number;
}

/** Every `.razor` under `root` (sorted): the codemod's input set. */
export function findRazorFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    names.sort();
    for (const name of names) {
      if (name === ".git" || name === "bin" || name === "obj" || name === "node_modules") continue;
      const full = `${dir}/${name}`;
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".razor")) files.push(full);
    }
  };
  walk(root.replace(/\\/g, "/"));
  return files;
}

/** Runs the codemod over every `.razor` under `root`; `--write` puts the
 *  transformed markup beside the source as `.tsazor` (the `.razor` stays —
 *  the migration is not destructive). */
export async function codemodProject(root: string, options?: CodemodOptions): Promise<CodemodReport> {
  const reports: CodemodFileReport[] = [];
  const { readFileSync, writeFileSync } = await import("node:fs");
  for (const file of findRazorFiles(root)) {
    const target = file.replace(/\.razor$/i, ".tsazor");
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch (error) {
      reports.push({ file, target, applied: 0, apiReplacements: 0, remainingErrors: 0, remainingWarnings: 0, remainingCodes: new Map(), crash: error instanceof Error ? error.message : String(error) });
      continue;
    }
    const result = codemodSource(source, file.replace(/\\/g, "/").split("/").pop() ?? "p.tsazor");
    const errors = result.remaining.filter((d) => d.severity === "error");
    const codes = new Map<string, number>();
    for (const diagnostic of result.remaining) codes.set(diagnostic.code, (codes.get(diagnostic.code) ?? 0) + 1);
    reports.push({
      file,
      target,
      applied: result.applied.length,
      apiReplacements: result.apiReplacements.length,
      remainingErrors: errors.length,
      remainingWarnings: result.remaining.length - errors.length,
      remainingCodes: codes,
      ...(result.crash !== undefined ? { crash: result.crash } : {}),
    });
    if (options?.write === true) {
      writeFileSync(target, result.text);
    }
  }
  const applied = reports.reduce((sum, r) => sum + r.applied, 0);
  return {
    files: reports,
    applied,
    apiReplacements: reports.reduce((sum, r) => sum + r.apiReplacements, 0),
    withRemainingErrors: reports.filter((r) => r.remainingErrors > 0).length,
    crashes: reports.filter((r) => r.crash !== undefined).length,
  };
}