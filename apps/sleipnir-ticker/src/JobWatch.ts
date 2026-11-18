import type { JobProgress, SleipnirClient } from "./api";
import { appendSequenced } from "./jobs.mjs";

type Listener = () => void;

/**
 * One job's progress stream (Jobs.Progress(jobId)) — a per-entity subscription, unlike the
 * app-wide TickerStore. The server replays the job's history to every subscriber, then streams
 * the live steps, then completes; a page that opens a running or finished job late sees all of
 * it. The page owns the watch: `this.observe(watch)` re-renders per event, and the
 * component's disposeSignal ends the subscription.
 */
export default class JobWatch {
    private readonly listeners = new Set<Listener>();

    /** Applied events, in `seq` order, without duplicates. */
    events: JobProgress[] = [];
    /** True once the server completed the stream (the job is over). */
    completed = false;
    error: string | null = null;

    constructor(client: SleipnirClient, readonly jobId: number, signal: AbortSignal) {
        void client.jobs.progress(jobId, {
            // TODO(runtime-helpers): the sequenced-stream helper replaces this dedupe (and `events`).
            onNext: (event) => {
                const next = appendSequenced(this.events, event);
                if (next === this.events) return;
                this.events = next;
                this.notify();
            },
            onError: (err) => {
                this.error = err instanceof Error ? err.message : String(err);
                this.notify();
            },
            // TODO(runtime-helpers): observe()'s completion callback replaces `completed` + this
            // notify — the page then reacts to the end where it observes the watch.
            onComplete: () => {
                this.completed = true;
                this.notify();
            },
        }, { signal }).catch((err: unknown) => {
            if (signal.aborted) return;
            this.error = err instanceof Error ? err.message : String(err);
            this.notify();
        });
    }

    /** The newest event (null before the first). */
    get latest(): JobProgress | null {
        return this.events.at(-1) ?? null;
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notify(): void {
        for (const listener of [...this.listeners]) listener();
    }
}
