import { registerServiceDefault } from "../di/service-defaults.js";
import { markAutoRender } from "../di/service-provider.js";

/** Where a live connection stands: being opened, up, lost and coming back, or ended for good. */
export type ConnectionPhase = "connecting" | "open" | "reconnecting" | "closed";

/** A change of a ConnectionState: the phase it left and the phase it reached. */
export interface ConnectionChange {
  /** The phase it left. */
  readonly previous: ConnectionPhase;
  /** The phase it reached. */
  readonly phase: ConnectionPhase;
  /** True when it reached `open` again after a `reconnecting` or `closed`: the moment to reload what was missed. */
  readonly reconnected: boolean;
}

/**
 * Tsazor extension: whether the app's live connection is up — "live" / "connecting…" / "disconnected" in the header,
 * and the moment it comes back, when a page reloads what it missed. Transport-neutral: whatever the connection is (an
 * EventSource, a SignalR HubConnection, a WebSocket, Sleipnir's client), its events `report` the phase here;
 * `trackEventSource` does it for an EventSource. The app has one without registering it (a service default), so the
 * connection's code and the header's status share it:
 *
 * ```ts
 * @inject ConnectionState Connection
 * …
 * trackEventSource(this.Connection, new EventSource("/api/events"));
 * ```
 *
 * A component that injects it renders again on every change (as with the CultureService); `subscribe` is for
 * everything else, and `observe` takes it too. The skins' `ConnectionStatus` shows it.
 */
export class ConnectionState {
  #phase: ConnectionPhase;
  #lastChange: Date | undefined;
  #wasLost = false;
  readonly #listeners = new Set<(change: ConnectionChange) => void>();

  /** A state in `initial` ("connecting" by default). */
  constructor(initial: ConnectionPhase = "connecting") {
    this.#phase = initial;
    markAutoRender(this);
  }

  /** The current phase. */
  get phase(): ConnectionPhase {
    return this.#phase;
  }

  /** When the phase last changed; undefined before the first change. */
  get lastChange(): Date | undefined {
    return this.#lastChange;
  }

  /** True while the connection is up. */
  get isOpen(): boolean {
    return this.#phase === "open";
  }

  /** Reports the connection's phase; a change notifies the subscribers, the same phase again doesn't. */
  report(phase: ConnectionPhase): void {
    const previous = this.#phase;
    if (phase === previous) return;
    if (phase === "reconnecting" || phase === "closed") this.#wasLost = true;
    const reconnected = phase === "open" && this.#wasLost;
    if (reconnected) this.#wasLost = false;
    this.#phase = phase;
    this.#lastChange = new Date();
    const change: ConnectionChange = { previous, phase, reconnected };
    for (const listener of [...this.#listeners]) listener(change);
  }

  /** Calls `listener` on every change; returns the unsubscribe. */
  subscribe(listener: (change: ConnectionChange) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

/**
 * Reports an EventSource's phase into `state`: `connecting` until it opens, `open`, `reconnecting` while the browser
 * retries after a drop, `closed` when it gave up (a 4xx, the wrong content type) or was closed. Returns the function
 * that stops tracking (the EventSource itself stays as it is).
 */
export function trackEventSource(state: ConnectionState, source: EventSource): () => void {
  // EventSource: CONNECTING 0, OPEN 1, CLOSED 2. An error while CONNECTING is a retry — "reconnecting" once it had
  // been open, still "connecting" before; an error while CLOSED is the end.
  let opened = false;
  const sync = (): void => {
    if (source.readyState === 1) {
      opened = true;
      state.report("open");
    } else if (source.readyState === 2) state.report("closed");
    else state.report(opened ? "reconnecting" : "connecting");
  };
  source.addEventListener("open", sync);
  source.addEventListener("error", sync);
  sync();
  return () => {
    source.removeEventListener("open", sync);
    source.removeEventListener("error", sync);
  };
}

// The app's connection: injectable without a registration; an app's own registration wins.
registerServiceDefault(ConnectionState, () => new ConnectionState());
