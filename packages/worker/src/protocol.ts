/**
 * The wire protocol between a worker client (main thread) and
 * `exposeWorker` (worker). Data travels by structured clone; functions and
 * AbortSignals can't, so they are replaced by markers and stand-ins on the
 * other side.
 */

/** Main → worker: run `method` with `args`. */
export interface CallMessage {
  readonly t: "call";
  readonly id: number;
  readonly method: string;
  readonly args: readonly unknown[];
}

/** Main → worker: the signal `signal` aborted. */
export interface AbortMessage {
  readonly t: "abort";
  readonly signal: number;
  readonly reason: unknown;
}

/** Worker → main: call `id` returned `value`. */
export interface ResultMessage {
  readonly t: "ok";
  readonly id: number;
  readonly value: unknown;
}

/** Worker → main: call `id` threw. */
export interface ErrorMessage {
  readonly t: "err";
  readonly id: number;
  readonly error: SerializedError;
}

/** Worker → main: callback `fn` of call `id` was called with `args`. */
export interface CallbackMessage {
  readonly t: "cb";
  readonly id: number;
  readonly fn: number;
  readonly args: readonly unknown[];
}

export type ToWorker = CallMessage | AbortMessage;
export type FromWorker = ResultMessage | ErrorMessage | CallbackMessage;

/** An error as it crosses the boundary. */
export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

/** The key of a marker object (a function or a signal in place of the value). */
export const MARKER = "$tsazorWorker";

/** A function argument: calling the stand-in in the worker calls `id` on the main thread. */
export interface FunctionMarker {
  readonly [MARKER]: "fn";
  readonly id: number;
}

/** An AbortSignal argument: the stand-in aborts when the original does. */
export interface SignalMarker {
  readonly [MARKER]: "signal";
  readonly id: number;
  readonly aborted: boolean;
  readonly reason: unknown;
}

const TRANSFER = Symbol.for("tsazor.worker.transfer");

/** A value with the buffers to move instead of copy (see `transfer`). */
export interface Transfer<T> {
  readonly [TRANSFER]: true;
  readonly value: T;
  readonly transferables: readonly Transferable[];
}

/**
 * Marks `value` to be sent with `transferables` moved instead of copied —
 * zero-copy for large data. After sending, the buffers are unusable on the
 * sending side. Works for call arguments and for results.
 *
 * ```ts
 * return transfer(pixels, [pixels.buffer]);
 * ```
 */
export function transfer<T>(value: T, transferables: readonly Transferable[]): T {
  return { [TRANSFER]: true, value, transferables } as Transfer<T> as unknown as T;
}

/** Whether `value` is a `transfer` marker. */
export function isTransfer(value: unknown): boolean {
  return value !== null && typeof value === "object" && (value as Partial<Transfer<unknown>>)[TRANSFER] === true;
}

/** Unwraps a `transfer` marker: the value to send and the buffers to move. */
export function unwrapTransfer(value: unknown): { value: unknown; transferables: Transferable[] } {
  if (value !== null && typeof value === "object" && (value as Partial<Transfer<unknown>>)[TRANSFER] === true) {
    const marked = value as Transfer<unknown>;
    return { value: marked.value, transferables: [...marked.transferables] };
  }
  return { value, transferables: [] };
}

/** Whether `value` is a plain object (an options bag), whose function properties also become callbacks. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** The marker in `value`, if it is one. */
export function markerOf(value: unknown): FunctionMarker | SignalMarker | undefined {
  return isPlainObject(value) && typeof value[MARKER] === "string" ? (value as unknown as FunctionMarker | SignalMarker) : undefined;
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { name: "Error", message: String(error) };
}

/** An `Error` rebuilt on the receiving side: same name and message, the other side's stack appended. */
export function deserializeError(error: SerializedError): Error {
  const result = new Error(error.message);
  result.name = error.name;
  if (error.stack) result.stack = `${result.stack ?? ""}\n--- in the worker ---\n${error.stack}`;
  return result;
}

/** An AbortError as `fetch` rejects with, or the signal's reason. */
export function abortError(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  return typeof DOMException === "function" ? new DOMException("The operation was aborted.", "AbortError") : Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
}
