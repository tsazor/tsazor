import { WorkerConnection, proxyFor, type WorkerClient, type WorkerLike, type DefineWorkerOptions } from "./client.js";
import { exposeWorker } from "./expose.js";

/**
 * A worker client that runs `api` in the same thread — for tests (and for
 * environments without workers). It goes through a real `MessageChannel`:
 * arguments and results are cloned exactly as with a worker (a value a
 * worker can't receive fails here too), callbacks, cancellation and errors
 * behave the same, and results arrive asynchronously.
 *
 * ```ts
 * services.registerValue(ImportWorker, inProcessWorker<ImportApi>(api));
 * ```
 */
export function inProcessWorker<Api extends object>(api: Api, options?: DefineWorkerOptions): WorkerClient<Api> {
  const connection = new WorkerConnection(() => channelWorker(api), options);
  return proxyFor<Api>({}, (method, args) => connection.call(method, args), () => connection.terminate());
}

function channelWorker(api: object): WorkerLike {
  const channel = new MessageChannel();
  exposeWorker(api, {
    postMessage: (message, transfer) => channel.port2.postMessage(message, transfer ?? []),
    addEventListener: (type, listener) => channel.port2.addEventListener(type, listener as EventListener),
  });
  channel.port2.start();
  channel.port1.start();
  return {
    postMessage: (message, transfer) => channel.port1.postMessage(message, transfer),
    addEventListener: (type: string, listener: (event: never) => void) => channel.port1.addEventListener(type, listener as EventListener),
    terminate: () => {
      channel.port1.close();
      channel.port2.close();
    },
  } as WorkerLike;
}
