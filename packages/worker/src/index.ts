// @tsazor/worker — heavy work off the main thread (docs/design-worker.md).

export { defineWorker, WorkerConnection, type WorkerClient, type WorkerControl, type WorkerLike, type WorkerOptions, type WorkerProxy } from "./client.js";
export { exposeWorker, WORKER_SCOPE, type WorkerScope } from "./expose.js";
export { inProcessWorker } from "./in-process.js";
export { transfer } from "./protocol.js";
