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
  /** Runs the `complete` handler and re-renders, if `observe` was given one; else ignored (a store never completes). */
  complete(): void;
  /** Same as calling the listener. */
  onNext(value: T): void;
  /** Same as `error`. */
  onError(error: unknown): void;
  /** Same as `complete`. */
  onComplete(): void;
}

/**
 * `observe`'s handlers, as an observer has them: `next` per value (then a render), `complete` when the source ends
 * (then a render: "live" turns "done"), `error` instead of the component's error path (nearest ErrorBoundary).
 */
export interface ObserveHandlers<T> {
  /** Each value; the component renders after it. */
  next?(value: T): void;
  /** The source completed; the component renders after it, and again when an async one is done. */
  complete?(): void | PromiseLike<void>;
  /** The source's error, instead of the component's error path. */
  error?(error: unknown): void;
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

/**
 * A stream whose values carry a sequence number — the events of one job, replayed to a late subscriber and then live
 * — with the duplicates dropped: a value whose number is not above the last one's (a replay after a reconnect, an
 * event that overtook it) doesn't reach the listener. `lastSequence` and `completed` say where the stream stands.
 * Transport-neutral: SSE, SignalR, a WebSocket, Sleipnir — anything `observe` takes as a subscribable.
 *
 * ```ts
 * private readonly progress = sequenced(api.jobs.progress(this.jobId), (event) => event.seq);
 * protected override onInitialized(): void {
 *     this.observe(this.progress, { next: (event) => this.events.push(event), complete: () => this.reload() });
 * }
 * ```
 *
 * It drops; it doesn't reorder or fill a gap (a missed number stays missed — the source's replay is what fills it).
 */
export class Sequenced<T> implements Subscribable<T> {
  #last: number | undefined;
  #completed = false;

  /** A Sequenced over `source`, numbered by `sequenceOf`, after the number `after` if given (`sequenced` builds one). */
  constructor(
    private readonly source: Subscribable<T>,
    private readonly sequenceOf: (value: T) => number,
    /** The last number already seen (a page that loaded the history up to it): values up to it are dropped. */
    after?: number,
  ) {
    this.#last = after;
  }

  /** The number of the last value let through (or `after`); undefined before the first. */
  get lastSequence(): number | undefined {
    return this.#last;
  }

  /** Whether the source completed. */
  get completed(): boolean {
    return this.#completed;
  }

  subscribe(listener: ObserveListener<T>): ObserveTeardown | PromiseLike<ObserveTeardown> {
    const next = (value?: T): void => {
      const sequence = this.sequenceOf(value as T);
      if (this.#last !== undefined && sequence <= this.#last) return;
      this.#last = sequence;
      listener.next(value as T);
    };
    const complete = (): void => {
      this.#completed = true;
      listener.complete();
    };
    const error = (failure: unknown): void => listener.error(failure);
    return this.source.subscribe(Object.assign((value?: T) => next(value), { next, error, complete, onNext: next, onError: error, onComplete: complete }));
  }
}

/** A Sequenced over `source`: its values with the duplicates dropped, by `sequenceOf` (`(event) => event.seq`). */
export function sequenced<T>(source: Subscribable<T>, sequenceOf: (value: T) => number, after?: number): Sequenced<T> {
  return new Sequenced(source, sequenceOf, after);
}
