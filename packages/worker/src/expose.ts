import {
  markerOf,
  isPlainObject,
  serializeError,
  unwrapTransfer,
  type AbortMessage,
  type CallMessage,
  type FromWorker,
  type ToWorker,
} from "./protocol.js";

/** What `exposeWorker` talks through: the worker's global scope (or a MessagePort in tests). */
export interface WorkerScope {
  /** Sends a message to the main thread, moving `transfer`. */
  postMessage(message: unknown, transfer?: Transferable[]): void;
  /** Listens to the main thread's messages. */
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

/**
 * Makes `api`'s functions callable from the main thread — call it once in the
 * worker module. Each function may be async; what it returns (or throws)
 * goes back to the caller. Function arguments arrive as callbacks into the
 * main thread, `AbortSignal` arguments as signals that abort with the
 * caller's.
 *
 * ```ts
 * // import.worker.ts
 * const api = {
 *   async parseCsv(file: File, onProgress: (done: number) => void, signal: AbortSignal) { … },
 * };
 * exposeWorker(api);
 * export type ImportApi = typeof api;
 * ```
 */
export function exposeWorker<Api extends object>(api: Api, scope: WorkerScope = defaultScope()): Api {
  const signals = new Map<number, AbortController>();
  const post = (message: FromWorker, transfer: Transferable[] = []): void => scope.postMessage(message, transfer);

  const decode = (call: CallMessage, value: unknown): unknown => {
    const marker = markerOf(value);
    if (marker?.$tsazorWorker === "fn") {
      return (...args: unknown[]) => post({ t: "cb", id: call.id, fn: marker.id, args });
    }
    if (marker?.$tsazorWorker === "signal") {
      const controller = new AbortController();
      signals.set(marker.id, controller);
      if (marker.aborted) controller.abort(marker.reason);
      return controller.signal;
    }
    return value;
  };

  scope.addEventListener("message", (event: MessageEvent) => {
    const message = event.data as ToWorker;
    if (message.t === "abort") {
      abort(message);
      return;
    }
    if (message.t !== "call") return;
    void run(message);
  });

  const abort = (message: AbortMessage): void => {
    signals.get(message.signal)?.abort(message.reason);
  };

  const run = async (call: CallMessage): Promise<void> => {
    const used: number[] = [];
    try {
      const args = call.args.map((arg) => {
        if (isPlainObject(arg) && markerOf(arg) === undefined) {
          // An options bag: its function and signal properties too.
          return Object.fromEntries(Object.entries(arg).map(([key, value]) => [key, decode(call, value)]));
        }
        return decode(call, arg);
      });
      for (const arg of call.args) collectSignals(arg, used);
      const fn = (api as Record<string, unknown>)[call.method];
      if (typeof fn !== "function") throw new TypeError(`The worker has no function '${call.method}'.`);
      const result = await (fn as (...args: unknown[]) => unknown).apply(api, args);
      const { value, transferables } = unwrapTransfer(result);
      post({ t: "ok", id: call.id, value }, transferables);
    } catch (error) {
      post({ t: "err", id: call.id, error: serializeError(error) });
    } finally {
      for (const id of used) signals.delete(id);
    }
  };

  return api;
}

function collectSignals(value: unknown, into: number[]): void {
  const marker = markerOf(value);
  if (marker?.$tsazorWorker === "signal") into.push(marker.id);
  else if (marker === undefined && isPlainObject(value)) for (const property of Object.values(value)) collectSignals(property, into);
}

/**
 * The key under which a host that runs a worker module in-process (the
 * tutorial's lesson gate, a test runner) offers the module its scope:
 * `globalThis[Symbol.for("tsazor.worker.scope")] = scope` while the module
 * loads. In a real worker it is unset and the worker's global scope is used.
 */
export const WORKER_SCOPE = Symbol.for("tsazor.worker.scope");

function defaultScope(): WorkerScope {
  const hosted = (globalThis as Record<symbol, unknown>)[WORKER_SCOPE];
  return (hosted as WorkerScope | undefined) ?? (globalThis as unknown as WorkerScope);
}
