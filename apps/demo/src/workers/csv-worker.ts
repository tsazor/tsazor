import { defineWorker } from "@tsazor/worker";
import type { CsvApi } from "./csv.worker";

/** The CSV worker as a service: `@inject CsvWorker csv`, then `await this.csv.parseOrders(…)`. */
export class CsvWorker extends defineWorker<CsvApi>(
  () => new Worker(new URL("./csv.worker.ts", import.meta.url), { type: "module" }),
) {}
