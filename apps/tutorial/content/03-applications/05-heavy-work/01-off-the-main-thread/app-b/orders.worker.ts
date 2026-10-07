// This module runs in a Web Worker — a thread of its own, away from the page.
import { exposeWorker } from "@tsazor/worker";
import { parseOrders, sampleOrders } from "./orders";

const api = {
    importOrders(count: number) {
        return parseOrders(sampleOrders(count));
    },
};

exposeWorker(api);
export type OrdersApi = typeof api;
