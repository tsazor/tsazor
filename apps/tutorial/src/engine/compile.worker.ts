/// <reference lib="webworker" />
/**
 * Compile worker: runs the project build (compiler + TypeScript) off the main
 * thread so typing stays responsive. One request at a time; the client drops
 * stale results.
 */
import { buildProject, type Files, type ProjectBuild } from "./compile-project.js";

export interface CompileRequest {
  id: number;
  files: Files;
}

export interface CompileResponse {
  id: number;
  build?: ProjectBuild;
  error?: string;
  /** Milliseconds spent compiling. */
  time: number;
}

self.addEventListener("message", (event: MessageEvent<CompileRequest>) => {
  const { id, files } = event.data;
  const started = performance.now();
  let response: CompileResponse;
  try {
    response = { id, build: buildProject(files), time: performance.now() - started };
  } catch (error) {
    response = { id, error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error), time: performance.now() - started };
  }
  (self as unknown as Worker).postMessage(response);
});
