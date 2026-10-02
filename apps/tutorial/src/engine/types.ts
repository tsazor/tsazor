/**
 * Build result types and the source-map lookup — kept apart from
 * compile-project.ts so the main thread never pulls in the compiler or
 * TypeScript (those load only in the worker).
 */
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";

/** Project files: POSIX paths relative to the project root (`App.tsazor`, `lib/data.ts`). */
export type Files = Readonly<Record<string, string>>;

export const MODULE_PREFIX = "$app/";

export interface Diagnostic {
  file: string;
  /** 1-based line, 0-based column (compiler convention). */
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  severity: "error" | "warning";
  code: string;
  message: string;
  /** "types": reported by the type check (`tsazor check`) — the code still runs. */
  source?: "types";
}

export interface CompiledModule {
  /** Module id (`$app/App.tsazor`). */
  id: string;
  file: string;
  code: string;
  /** JS → original source map (JSON), when the file maps back to a source. */
  map?: string;
}

export interface ProjectBuild {
  modules: Record<string, CompiledModule>;
  /** Global + scoped CSS, in file order. */
  css: string;
  diagnostics: Diagnostic[];
  /** Module id of the entry component, when it compiled. */
  entry?: string;
  /**
   * Module id of `Program.ts`, when the project has one: it starts the app
   * itself (`createTsazorApp({ root: App, services })`, as in a real app);
   * without it the preview mounts the entry component.
   */
  program?: string;
}

/**
 * Maps a position in a compiled module back to its source file (runtime
 * error stacks in the preview). Lines are 1-based, columns 0-based.
 */
export function originalPosition(module: CompiledModule, line: number, column: number): { line: number; column: number } | undefined {
  if (!module.map) return undefined;
  const position = originalPositionFor(new TraceMap(module.map), { line, column });
  if (position.line === null) return undefined;
  return { line: position.line, column: position.column ?? 0 };
}
