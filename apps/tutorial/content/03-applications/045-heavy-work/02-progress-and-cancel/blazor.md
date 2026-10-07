---
title: Progress and cancel
keywords: progress callback, AbortSignal, AbortController, cancel, @State, inProcessWorker
focus: orders.worker.ts
gate: click .import; click .cancel; wait 100
---

Add progress and cancellation to the worker function — a callback and an `AbortSignal`:

```ts
async importOrders(count: number, onProgress: (done: number) => void, signal: AbortSignal) {
    // … inside the loop, after adding up a part:
    onProgress(Math.min(1, (start + step) / lines.length));
    await new Promise((resolve) => setTimeout(resolve, 0));
    signal.throwIfAborted();
}
```

`@tsazor/worker` passes the callback across (calling it in the worker calls yours on the page)
and the signal (it aborts in the worker when yours does). In `App.tsazor`:

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

`done` is a `@State` field, so each progress report renders. Tests use `inProcessWorker(api)`.

> **Coming from Blazor:** `AbortSignal` is your `CancellationToken` (`AbortController` the
> `CancellationTokenSource`), and the progress callback your `IProgress<T>` — reported on the UI
> thread without a `SynchronizationContext`.
