// This module runs in a Web Worker — a thread of its own, away from the page.
import { exposeWorker } from "@tsazor/worker";

const api = {};

exposeWorker(api);
export type OrdersApi = typeof api;
