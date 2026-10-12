# @tsazor/worker

Heavy work off the main thread for [Tsazor](../../README.md) apps — the answer to Blazor's `Task.Run`: typed calls
into a Web Worker, with progress callbacks, cancellation through an `AbortSignal`, transferables, errors that arrive
as errors, pools, and an in-process double for tests.

```bash
npm install @tsazor/worker
```

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
// import-worker.ts — the main thread
import { defineWorker } from "@tsazor/worker";
import type { ImportApi } from "./import.worker";

export class ImportWorker extends defineWorker<ImportApi>(
  () => new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" }),
) {}
```

Register `ImportWorker` as a service and call `await this.importer.parseCsv(file, onProgress, this.disposeSignal)`
in a component. See [the design](../../docs/design-worker.md).
