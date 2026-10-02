/**
 * Main-thread side of the compile worker: debounced, latest-wins requests.
 * A shared singleton — the worker (and the TypeScript it carries) loads once.
 */
import type { Diagnostic, Files, ProjectBuild } from "./types.js";
import type { CompileRequest, CompileResponse } from "./compile.worker.js";

export interface CompileOutcome {
  build?: ProjectBuild;
  /** The worker itself failed (a compiler crash, not a diagnostic). */
  error?: string;
  time: number;
}

/** Receives the type diagnostics of a compile, after its build. */
export type TypeDiagnosticsListener = (diagnostics: Diagnostic[]) => void;

export class CompilerClient {
  private worker: Worker | undefined;
  private nextId = 1;
  private latest = 0;
  private readonly pending = new Map<number, (outcome: CompileOutcome | null) => void>();
  private readonly typeListeners = new Map<number, TypeDiagnosticsListener>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./compile.worker.ts", import.meta.url), { type: "module", name: "tsazor-compiler" });
    worker.addEventListener("message", (event: MessageEvent<CompileResponse>) => {
      const response = event.data;
      if (response.kind === "types") {
        const listener = this.typeListeners.get(response.id);
        this.typeListeners.delete(response.id);
        if (response.id === this.latest) listener?.(response.diagnostics);
        return;
      }
      const { id, kind: _kind, ...outcome } = response;
      const resolve = this.pending.get(id);
      this.pending.delete(id);
      // A newer request superseded this one: its caller gets null.
      resolve?.(id === this.latest ? outcome : null);
    });
    worker.addEventListener("error", (event) => {
      for (const [id, resolve] of this.pending) {
        resolve(id === this.latest ? { error: event.message || "The compiler worker failed to start.", time: 0 } : null);
      }
      this.pending.clear();
    });
    this.worker = worker;
    return worker;
  }

  /**
   * Compiles `files`; resolves with null when a newer compile was requested
   * meanwhile. `onTypes` receives the type check's diagnostics afterwards
   * (not called for superseded compiles).
   */
  compile(files: Files, onTypes?: TypeDiagnosticsListener): Promise<CompileOutcome | null> {
    const id = this.nextId++;
    this.latest = id;
    for (const old of this.typeListeners.keys()) if (old !== id) this.typeListeners.delete(old);
    if (onTypes) this.typeListeners.set(id, onTypes);
    const request: CompileRequest = { id, files: { ...files } };
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ensureWorker().postMessage(request);
    });
  }
}

export const compilerClient = new CompilerClient();
