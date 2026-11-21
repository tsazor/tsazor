import { sequenced, type ObserveListener, type Sequenced } from "@tsazor/runtime";
import type { JobProgress, SleipnirClient } from "./api";

/**
 * One job's progress stream (Jobs.Progress(jobId)) as a source for `observe` — a per-entity subscription, unlike the
 * app-wide TickerStore. The server replays the job's history to every subscriber, then streams the live steps, then
 * completes; a page that opens a running or finished job late sees all of it. `sequenced` drops a `seq` already
 * seen (the replay of a resubscribe); `observe`'s `complete` handler hears the end. The subscription ends when the
 * page stops observing or is disposed.
 */
export function jobProgress(client: SleipnirClient, jobId: number): Sequenced<JobProgress> {
    return sequenced(
        {
            subscribe(listener: ObserveListener<JobProgress>) {
                const controller = new AbortController();
                // Sleipnir's handlers are onNext/onError/onComplete, which the listener has.
                client.jobs.progress(jobId, listener, { signal: controller.signal }).catch((err: unknown) => {
                    if (!controller.signal.aborted) listener.error(err);
                });
                return () => controller.abort();
            },
        },
        (event) => event.seq,
    );
}
