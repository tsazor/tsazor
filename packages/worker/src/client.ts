import {
  abortError,
  deserializeError,
  isPlainObject,
  isTransfer,
  MARKER,
  unwrapTransfer,
  type FromWorker,
  type FunctionMarker,
  type SignalMarker,
  type ToWorker,
} from "./protocol.js";
import { ensureWorkerPolicy, workerStartError } from "./trusted-types.js";

/** What a worker client talks to: a `Worker`, or anything shaped like one (tests). */
export interface WorkerLike {
  /** Sends a message to the worker, moving `transfer`. */
  postMessage(message: unknown, transfer: Transferable[]): void;
  /** Listens to the worker's messages. */
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  /** Listens to the worker failing (script error, unreadable message). */
  addEventListener(type: "error" | "messageerror", listener: (event: Event) => void): void;
  /** Stops the worker. */
  terminate(): void;
}

/** Options of `defineWorker`. */
export interface WorkerOptions {
  /**
   * Up to this many workers share the calls (each call goes to the least
   * busy one); `"auto"`: one per CPU core but one. Default 1.
   */
  pool?: number | "auto";
}

/**
 * The client side of a worker API: each function becomes an async method
 * (its result as a promise of the awaited value).
 */
export type WorkerProxy<Api> = {
  readonly [K in keyof Api as Api[K] extends (...args: never[]) => unknown ? K : never]: Api[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : never;
};

/** What every worker client has besides the API's methods. */
export interface WorkerControl {
  /** Stops the worker(s) now; pending calls reject. The next call starts a fresh one. */
  terminate(): void;
  /** Same as terminate — DI calls it when the service's scope ends. */
  dispose(): void;
}

/** A worker client: the API's methods plus `terminate`/`dispose`. */
export type WorkerClient<Api> = WorkerProxy<Api> & WorkerControl;

interface Pending {
  resolve(value: unknown): void;
  reject(error: unknown): void;
  callbacks: Map<number, (...args: unknown[]) => unknown>;
  cleanup: () => void;
}

interface Slot {
  readonly worker: WorkerLike;
  readonly pending: Map<number, Pending>;
}

let nextId = 0;

/** The calls of one client, spread over a pool of workers that start on demand. */
export class WorkerConnection {
  private readonly slots: Slot[] = [];
  private readonly size: number;

  /** `factory` starts one worker; `options.pool` caps how many run at once. */
  constructor(
    private readonly factory: () => WorkerLike,
    options: WorkerOptions = {},
  ) {
    const pool = options.pool ?? 1;
    const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
    this.size = Math.max(1, pool === "auto" ? cores - 1 : Math.floor(pool));
  }

  /** Runs `method` in a worker; the promise settles on the main thread. */
  call(method: string, args: readonly unknown[]): Promise<unknown> {
    let slot: Slot;
    try {
      slot = this.pick();
    } catch (error) {
      // The worker couldn't start (a blocked script URL, no Worker support).
      return Promise.reject(workerStartError(error));
    }
    const id = ++nextId;
    const callbacks = new Map<number, (...args: unknown[]) => unknown>();
    const transferables: Transferable[] = [];
    const detach: Array<() => void> = [];
    /** A signal that was aborted before the call: the call rejects without running. */
    let preAborted: AbortSignal | undefined;
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        slot.pending.delete(id);
        for (const undo of detach) undo();
      };
      const encode = (value: unknown): unknown => {
        if (typeof value === "function") {
          const fn = ++nextId;
          callbacks.set(fn, value as (...args: unknown[]) => unknown);
          return { [MARKER]: "fn", id: fn } satisfies FunctionMarker;
        }
        if (typeof AbortSignal !== "undefined" && value instanceof AbortSignal) {
          const signal = ++nextId;
          if (value.aborted) preAborted ??= value;
          else {
            const onAbort = (): void => {
              this.post(slot, { t: "abort", signal, reason: cloneableReason(value.reason) });
              // Like fetch: the call rejects at once; the worker stops at its next check.
              cleanup();
              reject(abortError(value));
            };
            value.addEventListener("abort", onAbort, { once: true });
            detach.push(() => value.removeEventListener("abort", onAbort));
          }
          return { [MARKER]: "signal", id: signal, aborted: value.aborted, reason: cloneableReason(value.reason) } satisfies SignalMarker;
        }
        const { value: unwrapped, transferables: moved } = unwrapTransfer(value);
        transferables.push(...moved);
        return unwrapped;
      };
      const encoded = args.map((arg) => {
        // An options bag (not a transfer marker): its function and signal properties too.
        if (isPlainObject(arg) && !isTransfer(arg)) return Object.fromEntries(Object.entries(arg).map(([key, value]) => [key, encode(value)]));
        return encode(arg);
      });
      if (preAborted) {
        cleanup();
        reject(abortError(preAborted));
        return;
      }
      slot.pending.set(id, { resolve, reject, callbacks, cleanup });
      try {
        this.post(slot, { t: "call", id, method, args: encoded }, transferables);
      } catch (error) {
        // Not cloneable (a class instance with methods, a DOM node, …).
        cleanup();
        reject(error);
      }
    });
  }

  /** Stops every worker; pending calls reject. */
  terminate(): void {
    for (const slot of this.slots.splice(0)) {
      slot.worker.terminate();
      this.failAll(slot, new Error("The worker was terminated."));
    }
  }

  private post(slot: Slot, message: ToWorker, transfer: Transferable[] = []): void {
    slot.worker.postMessage(message, transfer);
  }

  /** The least busy worker; a new one while the pool isn't full and all are busy. */
  private pick(): Slot {
    let best: Slot | undefined;
    for (const slot of this.slots) if (!best || slot.pending.size < best.pending.size) best = slot;
    if (best && (best.pending.size === 0 || this.slots.length >= this.size)) return best;
    return this.start();
  }

  private start(): Slot {
    ensureWorkerPolicy();
    const worker = this.factory();
    const slot: Slot = { worker, pending: new Map() };
    worker.addEventListener("message", (event: MessageEvent) => this.receive(slot, event.data as FromWorker));
    const crashed = (event: Event): void => {
      // A crashed worker (script error, unloadable module): its calls fail; the next call starts a fresh one.
      const index = this.slots.indexOf(slot);
      if (index >= 0) this.slots.splice(index, 1);
      worker.terminate();
      const message = (event as ErrorEvent).message || "The worker failed.";
      this.failAll(slot, new Error(message));
    };
    worker.addEventListener("error", crashed);
    worker.addEventListener("messageerror", crashed);
    this.slots.push(slot);
    return slot;
  }

  private receive(slot: Slot, message: FromWorker): void {
    const pending = slot.pending.get(message.id);
    if (!pending) return;
    if (message.t === "cb") {
      try {
        void pending.callbacks.get(message.fn)?.(...message.args);
      } catch (error) {
        // A callback that throws doesn't fail the call; report it like an unhandled error.
        queueMicrotask(() => {
          throw error;
        });
      }
      return;
    }
    pending.cleanup();
    if (message.t === "ok") pending.resolve(message.value);
    else pending.reject(deserializeError(message.error));
  }

  private failAll(slot: Slot, error: Error): void {
    for (const pending of [...slot.pending.values()]) {
      pending.cleanup();
      pending.reject(error);
    }
  }
}

/** An abort reason that survives cloning (an Error or DOMException becomes its name and message). */
function cloneableReason(reason: unknown): unknown {
  if (reason instanceof Error || (typeof DOMException === "function" && reason instanceof DOMException)) {
    return { name: (reason as Error).name, message: (reason as Error).message };
  }
  return reason;
}

/** Names a worker client answers itself, never forwarded to the worker. */
const RESERVED = new Set<PropertyKey>(["then", "terminate", "dispose", "constructor"]);

/**
 * Creates the base class of a worker client. Extend it with a named class —
 * the class is the DI token, its instances call into the worker:
 *
 * ```ts
 * export class ImportWorker extends defineWorker<ImportApi>(
 *   () => new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" }),
 * ) {}
 *
 * // Program.ts: services.registerType(ImportWorker, { lifetime: "singleton" });
 * // a component: @inject ImportWorker importer — await this.importer.parseCsv(file)
 * ```
 *
 * The worker starts on the first call. `terminate()` (or `dispose()`, which
 * DI calls) stops it.
 */
export function defineWorker<Api extends object>(factory: () => WorkerLike, options?: WorkerOptions): new () => WorkerClient<Api> {
  return class WorkerClientBase {
    constructor() {
      const connection = new WorkerConnection(factory, options);
      return proxyFor<Api>(this, (method, args) => connection.call(method, args), () => connection.terminate());
    }
  } as unknown as new () => WorkerClient<Api>;
}

/** @internal The proxy over a client instance: own members first, everything else a call. */
export function proxyFor<Api>(target: object, call: (method: string, args: readonly unknown[]) => Promise<unknown>, terminate: () => void): WorkerClient<Api> {
  return new Proxy(target, {
    get(object, property, receiver) {
      if (property === "terminate" || property === "dispose") return terminate;
      if (typeof property === "symbol" || RESERVED.has(property) || property in object) return Reflect.get(object, property, receiver);
      return (...args: unknown[]) => call(property, args);
    },
  }) as WorkerClient<Api>;
}
