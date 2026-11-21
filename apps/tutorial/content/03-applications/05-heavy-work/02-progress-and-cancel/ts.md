---
title: Progress and cancel
keywords: progress callback, AbortSignal, AbortController, cancel, @State, inProcessWorker
focus: orders.worker.ts
gate: click .import; click .cancel; wait 100
---

The import runs in the worker now, in ten parts — but the progress bar stays empty, and
**Cancel** does nothing. The page can't see inside the worker unless the worker tells it.

Give `importOrders` two more parameters: a function to report progress, and an `AbortSignal`
to hear about a cancel. Report after each part, and stop when the signal says so:

```ts
async importOrders(count: number, onProgress: (done: number) => void, signal: AbortSignal) {
    // … inside the loop, after adding up a part:
    onProgress(Math.min(1, (start + step) / lines.length));
    await new Promise((resolve) => setTimeout(resolve, 0));
    signal.throwIfAborted();
}
```

A function can't be sent to another thread — but `@tsazor/worker` passes it as a **callback**:
calling `onProgress` in the worker calls your function on the page. The signal travels the same
way: when the page aborts, the worker's signal aborts too. The `await` between the parts gives
that message a chance to arrive.

In `App.tsazor`, pass a function and a signal, and abort it in `cancel`:

```ts
private controller: AbortController | null = null;

async runImport() {
    this.status = "Importing…";
    this.controller = new AbortController();
    try {
        const result = await this.worker.importOrders(400_000, (done) => this.done = done, this.controller.signal);
        this.status = `Imported ${result.orders} orders, ${result.loaves} loaves.`;
    } catch (error) {
        if ((error as Error).name !== "AbortError") throw error;
        this.status = "Cancelled.";
    }
}

cancel() {
    this.controller?.abort();
}
```

The bar fills up: `done` is a `@State` field, so each report renders the page — progress
arrives between events, where nothing else would trigger a render. **Cancel** stops the import
at once: the call rejects with an `AbortError`, as a cancelled `fetch` does, and the worker stops
at its next check. Pass `this.disposeSignal` instead, and leaving the page cancels the import.

> **Testing it:** `inProcessWorker(api)` from `@tsazor/worker` runs the same `api` in the test's
> own thread, through the same copying — register it in place of `OrdersWorker` in a test.
