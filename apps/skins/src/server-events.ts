/**
 * Server-sent events as a source for `this.observe` (docs/guide-live-data.md): each message's JSON goes to the
 * listener; the stream opens on subscribe and closes when the component is disposed. The browser reconnects by
 * itself and sends the last event's id (Last-Event-ID), so a server that numbers its events resumes where it left
 * off. `onState` reports where the stream is.
 */

/** Where a stream is: connecting, open, reconnecting after it dropped, or closed for good (the server refused it). */
export type StreamState = "connecting" | "open" | "reconnecting" | "closed";

/** The events at `url`, parsed as JSON, for `this.observe(serverEvents(url), (event) => …)`. */
export function serverEvents<T>(url: string, onState?: (state: StreamState) => void): { subscribe(listener: (value: T) => void): () => void } {
  return {
    subscribe(listener) {
      const source = new EventSource(url);
      onState?.("connecting");
      source.addEventListener("open", () => onState?.("open"));
      // An error with readyState CONNECTING is a drop the browser is retrying; CLOSED, it gave up.
      source.addEventListener("error", () => onState?.(source.readyState === EventSource.CONNECTING ? "reconnecting" : "closed"));
      source.addEventListener("message", (event) => listener(JSON.parse((event as MessageEvent<string>).data) as T));
      return () => source.close();
    },
  };
}
