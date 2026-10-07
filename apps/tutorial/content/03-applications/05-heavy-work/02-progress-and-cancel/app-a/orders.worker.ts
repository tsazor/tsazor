// This module runs in a Web Worker — a thread of its own, away from the page.
import { exposeWorker } from "@tsazor/worker";
import { parseOrders, sampleOrders } from "./orders";

const api = {
    async importOrders(count: number) {
        const lines = sampleOrders(count).split("\n");
        const total = { orders: 0, loaves: 0 };
        const step = Math.ceil(lines.length / 10);
        // In ten parts, so the worker can report between them.
        for (let start = 0; start < lines.length; start += step) {
            const part = parseOrders(lines.slice(start, start + step).join("\n"));
            total.orders += part.orders;
            total.loaves += part.loaves;
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        return total;
    },
};

exposeWorker(api);
export type OrdersApi = typeof api;
