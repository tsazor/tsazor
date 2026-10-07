// Runs in a Web Worker: parsing a large CSV here keeps the page responsive.
import { exposeWorker } from "@tsazor/worker";

export interface OrderRow {
  id: number;
  customer: string;
  loaves: number;
}

const api = {
  /** Parses `text` (id;customer;loaves per line), reporting progress every 10 %. */
  async parseOrders(text: string, onProgress: (done: number) => void, signal: AbortSignal): Promise<{ rows: number; loaves: number; first: OrderRow | null; inWorker: boolean }> {
    const lines = text.split("\n");
    let loaves = 0;
    let first: OrderRow | null = null;
    const step = Math.max(1, Math.floor(lines.length / 10));
    for (let i = 0; i < lines.length; i++) {
      if (i % step === 0) {
        onProgress(i / lines.length);
        // Let the abort message in: a busy loop would never see it.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (signal.aborted) throw signal.reason;
      }
      const [id, customer, count] = lines[i]!.split(";");
      const row: OrderRow = { id: Number(id), customer: customer ?? "", loaves: Number(count) };
      first ??= row;
      loaves += row.loaves;
    }
    onProgress(1);
    // True here: the code ran in a worker, not on the page's main thread.
    const inWorker = typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== "undefined";
    return { rows: lines.length, loaves, first, inWorker };
  },
};

exposeWorker(api);
export type CsvApi = typeof api;
