import { defineWorker } from "@tsazor/worker";
import type { OrdersApi } from "./orders.worker";

/** The worker as a service: inject it, then call its functions with await. */
export class OrdersWorker extends defineWorker<OrdersApi>(
    () => new Worker(new URL("./orders.worker.ts", import.meta.url), { type: "module" }),
) {}
