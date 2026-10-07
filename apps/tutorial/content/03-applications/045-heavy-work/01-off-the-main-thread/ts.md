---
title: Off the main thread
keywords: Web Worker, @tsazor/worker, exposeWorker, defineWorker, main thread
focus: App.tsazor
gate: click .import; look
---

The bakery imports its order list every morning — 400,000 lines. Click **Import** and watch the
counter above it: it stops. While `parseOrders` runs, the page is frozen. Nothing else can happen,
not even the next tick of the clock, because everything a page does runs on one thread, the
**main thread**.

A **Web Worker** is a second thread. It can't touch the page, but it can compute.
`@tsazor/worker` lets you call a function in a worker as if it were a service method.

First, give the worker something to do. In `orders.worker.ts`, which runs in the worker, put the
import into the `api` object:

```ts
import { parseOrders, sampleOrders } from "./orders";

const api = {
    importOrders(count: number) {
        return parseOrders(sampleOrders(count));
    },
};
```

`orders-worker.ts` is the page's side: `OrdersWorker` is a class whose methods call the
worker. Register it in `Program.ts`, like any service:

```ts
services.registerType(OrdersWorker, { singleton: true });
```

Then inject it in `App.tsazor` and await the result:

```tsazor
@import { OrdersWorker } from "./orders-worker"
@inject OrdersWorker worker
```

```ts
async runImport() {
    this.status = "Importing…";
    const result = await this.worker.importOrders(400_000);
    this.status = `Imported ${result.orders} orders, ${result.loaves} loaves.`;
}
```

Click **Import** again: the counter keeps going. The result comes back to the main thread on
its own — the worker's answer arrives like a click, and the code after `await` runs on the page
as usual, so the component renders after the handler as always. `importOrders` is typed: the
editor knows it takes a number and returns a promise of the result.

> **Tsazor chooses a typed call over messages.** The browser's own way is `postMessage` and a
> `message` event — untyped data both ways, and your own bookkeeping to match answers to
> questions. That still works; `@tsazor/worker` does the bookkeeping and keeps the types.
