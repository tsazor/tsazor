// @tsazor/worker — heavy work off the main thread (docs/design-worker.md).

export { defineWorker, type DefineWorkerOptions, type WorkerClient, type WorkerControl, type WorkerLike, type WorkerProxy } from "./client.js";
export { exposeWorker, WORKER_SCOPE, type WorkerScope } from "./expose.js";
export { inProcessWorker } from "./in-process.js";
export { transfer } from "./protocol.js";
