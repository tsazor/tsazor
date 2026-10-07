# Design draft — `@tsazor/worker`: heavy work off the main thread

Status: **proposal** (2026-10-07). A core extension the user asked for: "eine eigene hilfreiche
Schicht über Worker". Superset only — nothing in Blazor changes meaning; it is an opt-in package.

## Problem

A Tsazor app runs on the page's main thread: components, event handlers, `await` continuations.
That's why Tsazor needs no `InvokeAsync`, no `SynchronizationContext`. But CPU-heavy work — a
large CSV/Excel import, image processing, crypto, searching big data — freezes the page while
it runs. The browser's answer is the **Web Worker**: a separate thread with its own memory,
talking through `postMessage`. Its raw API is untyped messages and manual bookkeeping. Blazor
developers look for `Task.Run` and find nothing comparable in any frontend framework.

## Proposal

```ts
// import.worker.ts — runs in the worker
import { exposeWorker } from "@tsazor/worker";

const api = {
  async parseCsv(file: File, onProgress: (done: number) => void, signal: AbortSignal): Promise<Row[]> {
    // heavy work; onProgress(0.5); if (signal.aborted) …
  },
};
exposeWorker(api);
export type ImportApi = typeof api;
```

```ts
// import-worker.ts — main thread
import { defineWorker } from "@tsazor/worker";
import type { ImportApi } from "./import.worker";

export class ImportWorker extends defineWorker<ImportApi>(
  () => new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" }),
) {}
```

```razor
@* A component *@
@inject ImportWorker importer

<input type="file" @onchange="upload" />
<progress value="@done" />

@code {
    @State() accessor done = 0;
    rows: Row[] = [];

    async upload(e: Event) {
        const file = (e.target as HTMLInputElement).files![0]!;
        this.rows = await this.importer.parseCsv(file, (d) => this.done = d, this.disposeSignal);
    }
}
```

`Program.ts`: `services.addWorker(ImportWorker)` (a singleton), or `new ImportWorker()` where DI
isn't wanted (then `terminate()` it in `dispose`).

## How results come back

There is nothing to marshal. The worker answers with `postMessage`; on the main thread that
arrives as a `message` event, queued in the event loop like a click. The layer resolves the
call's promise there, so the code after `await` runs on the main thread. Progress callbacks are
called the same way. Rendering follows the usual rules: after an event handler's `await` the
component renders; a callback between (progress) renders with `@State` or `stateHasChanged()`.

## Semantics

- **Typed proxy.** `defineWorker<Api>(factory)` returns a class whose instances have one method
  per function of `Api`, each returning a promise of the (awaited) result. `tsazor check` checks
  calls like any method call. `terminate` is reserved (it stops the worker).
- **Arguments and results** are copied with the structured clone algorithm (what
  `postMessage` does). Functions and `AbortSignal`s are the exceptions:
  - **Callbacks** — a function argument (also a function property of a plain-object argument,
    for `{ onProgress }` options) becomes a stub in the worker; calling it calls the original on
    the main thread (fire and forget; its return value is not sent back).
  - **Cancellation** — an `AbortSignal` argument becomes a signal in the worker that aborts when
    the original does. The call's promise rejects with an `AbortError` at once, like `fetch`;
    the worker should stop at its next check.
- **Transfer** — `transfer(value, [buffer])` marks buffers to move instead of copy (zero-copy
  for large data), in arguments and in results.
- **Errors** — an exception in the worker rejects the call with an `Error` of the same `name`
  and `message`, the worker's stack appended. Unhandled in a component, it reaches the nearest
  `ErrorBoundary` as any rejected handler does. A worker that crashes (script error) rejects all
  pending calls; the next call starts a fresh worker.
- **Lifetime** — the worker starts on the first call (no cost for unused workers). A singleton
  lives as long as the app; `terminate()` stops it and rejects pending calls.
- **Pool** — `defineWorker(factory, { pool: n })` (or `"auto"`: `hardwareConcurrency - 1`)
  spreads calls over up to `n` workers, each call to the least busy one.
- **Tests** — `inProcessWorker(api)` from `@tsazor/testing` gives a client that calls the api in
  the same thread, through the same cloning (a non-cloneable argument fails like in the
  browser). Register it in a test in place of the real one:
  `services.registerValue(ImportWorker, inProcessWorker<ImportApi>(api))`.
- **Bundling** — `new Worker(new URL("./x.worker.ts", import.meta.url), { type: "module" })` is
  Vite's native worker form; the build emits the worker as its own chunk. Nothing Tsazor-
  specific. CSP: `worker-src 'self'` (docs/csp.md).
- **Zero dependencies**, like every Tsazor package (no Comlink); the layer is small (~2 KB).

## Not in v1

`SharedArrayBuffer`/`Atomics` helpers (they need cross-origin isolation), async iterators and
streams as results, worker-initiated events, workers in tests running real threads.

## Tutorial

A Part 3 chapter "Heavy work": the bakery imports a large order list — the page freezes; move the
parsing into a worker; progress and a cancel button; testing it with `inProcessWorker`. The
tutorial preview runs modules from blob URLs with an import map, which module workers don't
inherit: the preview needs worker support (bundle the worker module with `@tsazor/worker` inlined
into one blob, rewrite `new URL("./x.worker…", import.meta.url)` to it).

## Decisions needed

| # | Question | Recommendation |
|---|---|---|
| W1 | Where it lives | its own opt-in package `@tsazor/worker` (runtime stays small) |
| W2 | Own layer or Comlink | own (zero-dependency policy; DI, `AbortSignal`, test double are Tsazor-specific) |
| W3 | Main-side shape | `class X extends defineWorker<Api>(factory) {}` — the class is the DI token and the typed proxy; `services.addWorker(X)` |
| W4 | v1 scope | as above: calls, callbacks, cancellation, transfer, errors, lazy start, pool, test double |
| W5 | Tutorial | the Part 3 chapter with preview support for workers |
