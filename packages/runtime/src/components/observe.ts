/**
 * Types and helpers of `ComponentBase.observe` (Tsazor extension): external
 * sources bound to the component lifetime. It is the Blazor pattern written
 * once: subscribe in OnInitialized, `InvokeAsync(StateHasChanged)` per
 * notification, unsubscribe in Dispose.
 */

/** What a source's subscribe may return: an unsubscribe function or an `{ unsubscribe() }` handle. */
export type ObserveTeardown = (() => unknown) | { unsubscribe(): unknown } | null | undefined | void;

/**
 * The listener `observe` hands to `subscribe`. It is callable (store
 * listeners, `subscribe(next)`) and an observer at the same time:
 * `next`/`error`/`complete` (RxJS, TC39 Observable) and
 * `onNext`/`onError`/`onComplete` (Sleipnir's SubscribeHandlers).
 */
export interface ObserveListener<T> {
  /** Notifies a new value: runs the `observe` callback, then re-renders the component. */
  (value?: T): void;
  /** Same as calling the listener. */
  next(value: T): void;
  /** Routes the source's error to the component's error path (nearest ErrorBoundary, else the error handler). */
  error(error: unknown): void;
  /** Ignored: completion does not stop observing or re-render. */
  complete(): void;
  /** Same as calling the listener. */
  onNext(value: T): void;
  /** Same as `error`. */
  onError(error: unknown): void;
  /** Same as `complete` (ignored). */
  onComplete(): void;
}

/** A source with a `subscribe` method (structural: Svelte-style stores, RxJS, Zustand, async handshakes). */
export interface Subscribable<T> {
  /** Starts the subscription; returns its teardown, or a promise of it for an async handshake. */
  subscribe(listener: ObserveListener<T>): ObserveTeardown | PromiseLike<ObserveTeardown>;
}

/**
 * What `observe` accepts: a subscribable source, or the escape hatch
 * `(signal, notify) => void`, whose signal aborts when observing stops.
 */
export type ObserveSource<T = unknown> = Subscribable<T> | ((signal: AbortSignal, notify: (value?: T) => void) => void);

/** @internal Vite and Vitest replace `import.meta.env`; elsewhere the dev warnings stay off. */
export const DEV = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;

/** @internal Releases a teardown handle; returns what `unsubscribe()` returned (a promise is error-routed). */
export function release(teardown: ObserveTeardown): unknown {
  if (typeof teardown === "function") return teardown();
  if (teardown != null && typeof teardown.unsubscribe === "function") return teardown.unsubscribe();
  return undefined;
}
