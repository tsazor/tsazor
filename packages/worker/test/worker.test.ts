import { describe, expect, it } from "vitest";
import { defineWorker, exposeWorker, inProcessWorker, transfer, type WorkerLike } from "../src/index";

/** The API under test, as a worker module would expose it. */
function makeApi() {
  const seen: { aborted?: boolean } = {};
  const api = {
    add(a: number, b: number) {
      return a + b;
    },
    async count(to: number, onProgress: (n: number) => void) {
      for (let i = 1; i <= to; i++) onProgress(i);
      return "done";
    },
    async wait(signal: AbortSignal) {
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      seen.aborted = signal.aborted;
      return "stopped";
    },
    withOptions(options: { label: string; onStep: (step: string) => void }) {
      options.onStep(`${options.label}:1`);
      return options.label.length;
    },
    fail() {
      throw new RangeError("Row 7 has no date.");
    },
    async slow(ms: number) {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    },
    bytes(size: number) {
      const buffer = new ArrayBuffer(size);
      return transfer(buffer, [buffer]);
    },
    length(buffer: ArrayBuffer) {
      return buffer.byteLength;
    },
  };
  return { api, seen };
}

/** A fake Worker over a MessageChannel, counting how many were started. */
function channelFactory(api: object, started: { count: number }): () => WorkerLike {
  return () => {
    started.count++;
    const channel = new MessageChannel();
    exposeWorker(api, {
      postMessage: (message, transferList) => channel.port2.postMessage(message, transferList ?? []),
      addEventListener: (type, listener) => channel.port2.addEventListener(type, listener as EventListener),
    });
    channel.port1.start();
    channel.port2.start();
    return {
      postMessage: (message: unknown, transferList: Transferable[]) => channel.port1.postMessage(message, transferList),
      addEventListener: (type: string, listener: EventListener) => channel.port1.addEventListener(type, listener),
      terminate: () => channel.port1.close(),
    } as WorkerLike;
  };
}

describe("@tsazor/worker", () => {
  it("calls a function and returns its result", async () => {
    const worker = inProcessWorker(makeApi().api);
    await expect(worker.add(2, 3)).resolves.toBe(5);
  });

  it("calls callbacks on the main thread before the result arrives", async () => {
    const worker = inProcessWorker(makeApi().api);
    const progress: number[] = [];
    await expect(worker.count(3, (n) => progress.push(n))).resolves.toBe("done");
    expect(progress).toEqual([1, 2, 3]);
  });

  it("passes callbacks inside an options object", async () => {
    const worker = inProcessWorker(makeApi().api);
    const steps: string[] = [];
    await expect(worker.withOptions({ label: "csv", onStep: (step) => steps.push(step) })).resolves.toBe(3);
    expect(steps).toEqual(["csv:1"]);
  });

  it("rejects at once when the signal aborts, and aborts the worker's signal", async () => {
    const { api, seen } = makeApi();
    const worker = inProcessWorker(api);
    const controller = new AbortController();
    const call = worker.wait(controller.signal);
    setTimeout(() => controller.abort(), 5);
    await expect(call).rejects.toMatchObject({ name: "AbortError" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seen.aborted).toBe(true);
  });

  it("rejects without running when the signal is already aborted", async () => {
    const worker = inProcessWorker(makeApi().api);
    const controller = new AbortController();
    controller.abort();
    await expect(worker.wait(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects with the worker's error name and message", async () => {
    const worker = inProcessWorker(makeApi().api);
    const error = await worker.fail().catch((reason: unknown) => reason as Error);
    expect(error).toBeInstanceOf(Error);
    expect([error.name, error.message]).toEqual(["RangeError", "Row 7 has no date."]);
    expect(error.stack).toContain("in the worker");
  });

  it("rejects a value a worker can't receive, as a real worker does", async () => {
    const worker = inProcessWorker(makeApi().api);
    await expect(worker.length({ notAnArrayBuffer: Symbol("x") } as never)).rejects.toThrow();
  });

  it("moves transferred buffers instead of copying them", async () => {
    const worker = inProcessWorker(makeApi().api);
    const received = await worker.bytes(1024);
    expect(received.byteLength).toBe(1024);
    const buffer = new ArrayBuffer(16);
    await expect(worker.length(transfer(buffer, [buffer]))).resolves.toBe(16);
    expect(buffer.byteLength).toBe(0);
  });

  it("spreads concurrent calls over the pool and starts workers on demand", async () => {
    const started = { count: 0 };
    const worker = new (defineWorker<ReturnType<typeof makeApi>["api"]>(channelFactory(makeApi().api, started), { pool: 3 }))();
    expect(started.count).toBe(0);
    await Promise.all([worker.slow(20), worker.slow(20), worker.slow(20), worker.slow(20)]);
    expect(started.count).toBe(3);
    worker.terminate();
  });

  it("is a class to extend: the DI token, not a thenable, terminate rejects pending calls", async () => {
    const started = { count: 0 };
    class ImportWorker extends defineWorker<ReturnType<typeof makeApi>["api"]>(channelFactory(makeApi().api, started)) {}
    const worker = new ImportWorker();
    expect(worker).toBeInstanceOf(ImportWorker);
    expect((worker as unknown as { then?: unknown }).then).toBeUndefined();
    const pending = worker.slow(50);
    worker.terminate();
    await expect(pending).rejects.toThrow("terminated");
    await expect(worker.add(1, 1)).resolves.toBe(2);
    expect(started.count).toBe(2);
    worker.dispose();
  });
});
