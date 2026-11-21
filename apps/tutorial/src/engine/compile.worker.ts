/// <reference lib="webworker" />
/**
 * Compile worker: runs the project build (compiler + TypeScript) off the main
 * thread so typing stays responsive, then the type check (`tsazor check`).
 * Each request answers twice: the build first (the preview starts right
 * away), the type diagnostics after it. The client drops stale results; a
 * type check that a newer request already superseded is skipped.
 */
import { buildProject, type Diagnostic, type Files, type ProjectBuild } from "./compile-project.js";
import type { TypeChecker } from "./type-check.js";

export interface CompileRequest {
  id: number;
  files: Files;
}

export type CompileResponse =
  | {
      kind: "build";
      id: number;
      build?: ProjectBuild;
      error?: string;
      /** Milliseconds spent compiling. */
      time: number;
    }
  | {
      kind: "types";
      id: number;
      diagnostics: Diagnostic[];
      time: number;
    };

let latest = 0;
let checker: Promise<TypeChecker> | undefined;

/** The checker loads lazily: the lib .d.ts files are a few MB the first lesson does not wait for. */
function typeChecker(): Promise<TypeChecker> {
  checker ??= Promise.all([import("./type-check.js"), import("virtual:tutorial-types")]).then(
    ([{ TypeChecker }, types]) => new TypeChecker(types.default),
  );
  return checker;
}

const post = (response: CompileResponse): void => (self as unknown as Worker).postMessage(response);

self.addEventListener("message", (event: MessageEvent<CompileRequest>) => {
  const { id, files } = event.data;
  latest = id;
  const started = performance.now();
  try {
    post({ kind: "build", id, build: buildProject(files), time: performance.now() - started });
  } catch (error) {
    post({ kind: "build", id, error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error), time: performance.now() - started });
    return;
  }
  void (async () => {
    const instance = await typeChecker();
    // Let queued requests arrive first: a superseded check is skipped.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (id !== latest) return;
    const checkStarted = performance.now();
    let diagnostics: Diagnostic[];
    try {
      diagnostics = instance.check(files);
    } catch (error) {
      console.error("type check failed", error);
      diagnostics = [];
    }
    post({ kind: "types", id, diagnostics, time: performance.now() - checkStarted });
  })();
});
