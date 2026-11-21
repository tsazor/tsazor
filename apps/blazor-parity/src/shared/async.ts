/**
 * The .NET task primitives Blazor's test pages use, as plain promises, so the pages port line by line:
 * a TaskCompletionSource is a deferred promise, `Task.Delay(ms, token)` a delay that rejects on abort,
 * `CancellationToken.Register` an abort listener. A cancelled .NET task throws OperationCanceledException;
 * here the promise rejects with the signal's reason (an AbortError), which is what Virtualize expects.
 */

/** A promise settled from outside (Blazor's TaskCompletionSource). Settling it again does nothing, as `TrySet…` does. */
export interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(reason: unknown): void;
}

export function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // A cancelled source nobody awaits must not surface as an unhandled rejection; a .NET Task doesn't either.
  promise.catch(() => undefined);
  return { promise, resolve: () => resolve(), reject: (reason) => reject(reason) };
}

/** `Task.Delay(ms, token)`: resolves after `ms`; rejects with the signal's reason when it aborts first. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const unregister = signal === undefined ? () => undefined : onAbort(signal, () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
    const timer = setTimeout(() => {
      unregister();
      resolve();
    }, ms);
  });
}

/** `Task.WaitAsync(token)`: settles as `promise` does, or rejects with the signal's reason when it aborts first. */
export function waitAsync(promise: Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const unregister = onAbort(signal, () => reject(signal.reason));
    promise.then(
      () => {
        unregister();
        resolve();
      },
      (error: unknown) => {
        unregister();
        reject(error);
      },
    );
  });
}

/** `Task.Yield()`: the rest runs in a later task of the event loop, after what is queued now (a render). */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * `CancellationToken.Register(callback)`: runs `callback` when `signal` aborts, at once when it has already.
 * The result unregisters it (the registration's `Dispose`).
 */
export function onAbort(signal: AbortSignal, callback: () => void): () => void {
  if (signal.aborted) {
    callback();
    return () => undefined;
  }
  signal.addEventListener("abort", callback, { once: true });
  return () => signal.removeEventListener("abort", callback);
}

/** Whether `error` is an abort: the OperationCanceledException of a cancelled .NET task. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** `Enumerable.Range(start, count)`. */
export function range(start: number, count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => start + i);
}

/** `Exception.Message`: an error's message, or the thrown value as text. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
