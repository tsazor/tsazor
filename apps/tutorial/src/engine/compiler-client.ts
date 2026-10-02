/**
 * Main-thread side of the compile worker: debounced, latest-wins requests.
 * A shared singleton — the worker (and the TypeScript it carries) loads once.
 */
import type { Files, ProjectBuild } from "./compile-project.js";
import type { CompileRequest, CompileResponse } from "./compile.worker.js";

export interface CompileOutcome {
  build?: ProjectBuild;
  /** The worker itself failed (a compiler crash, not a diagnostic). */
  error?: string;
  time: number;
}

export class CompilerClient {
  private worker: Worker | undefined;
  private nextId = 1;
  private latest = 0;
  private readonly pending = new Map<number, (outcome: CompileOutcome | null) => void>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./compile.worker.ts", import.meta.url), { type: "module", name: "tsazor-compiler" });
    worker.addEventListener("message", (event: MessageEvent<CompileResponse>) => {
      const { id, ...outcome } = event.data;
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

  /** Compiles `files`; resolves with null when a newer compile was requested meanwhile. */
  compile(files: Files): Promise<CompileOutcome | null> {
    const id = this.nextId++;
    this.latest = id;
    const request: CompileRequest = { id, files: { ...files } };
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ensureWorker().postMessage(request);
    });
  }
}

export const compilerClient = new CompilerClient();
