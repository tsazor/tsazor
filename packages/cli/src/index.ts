/**
 * Tsazor CLI: the gate form of the type layer — `tsazor check` reports
 * compiler + TypeScript diagnostics for every project `.tsazor` and exits
 * nonzero on errors — `tsazor codemod` (2.5), the `.razor` → `.tsazor`
 * migration command (dry-run by default, `--write` beside the source), and
 * `tsazor build-lib`, a component library's build (`buildLibrary`). The
 * command line itself is `main.ts` (the `tsazor` bin); this entry is what a
 * script calls.
 */
export { checkProject, type CheckResult, type CheckDiagnostic } from "@tsazor/lsp";
export { codemodProject, type CodemodOptions, type CodemodReport, type CodemodFileReport } from "./codemod.js";
export { buildLibrary, type BuildLibraryOptions, type BuildLibraryResult } from "./build-library.js";
