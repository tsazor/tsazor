/**
 * Types and helpers of `ComponentBase.track` (Tsazor extension): external
 * sources bound to the component lifetime. It is the Blazor pattern written
 * once: subscribe in OnInitialized, `InvokeAsync(StateHasChanged)` per
 * notification, unsubscribe in Dispose.
 */

/** What a source's subscribe may return: an unsubscribe function or an `{ unsubscribe() }` handle. */
export type TrackTeardown = (() => unknown) | { unsubscribe(): unknown } | null | undefined | void;

/**
 * The listener `track` hands to `subscribe`. It is callable (store
 * listeners, `subscribe(next)`) and an observer at the same time:
 * `next`/`error`/`complete` (RxJS, TC39 Observable) and
 * `onNext`/`onError`/`onComplete` (Sleipnir's SubscribeHandlers).
 */
export interface TrackListener<T> {
  (value?: T): void;
  next(value: T): void;
  error(error: unknown): void;
  complete(): void;
  onNext(value: T): void;
  onError(error: unknown): void;
  onComplete(): void;
}

/** A source with a `subscribe` method (structural: Svelte-style stores, RxJS, Zustand, async handshakes). */
export interface Subscribable<T> {
  subscribe(listener: TrackListener<T>): TrackTeardown | PromiseLike<TrackTeardown>;
}

/**
 * What `track` accepts: a subscribable source, or the escape hatch
 * `(signal, notify) => void`, whose signal aborts when tracking stops.
 */
export type TrackSource<T = unknown> = Subscribable<T> | ((signal: AbortSignal, notify: (value?: T) => void) => void);

/** @internal Vite and Vitest replace `import.meta.env`; elsewhere the dev warnings stay off. */
export const DEV = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;

/** @internal Releases a teardown handle; returns what `unsubscribe()` returned (a promise is error-routed). */
export function release(teardown: TrackTeardown): unknown {
  if (typeof teardown === "function") return teardown();
  if (teardown != null && typeof teardown.unsubscribe === "function") return teardown.unsubscribe();
  return undefined;
}
