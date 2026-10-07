---
title: Off the main thread
keywords: Web Worker, @tsazor/worker, exposeWorker, defineWorker, main thread, Task.Run
focus: orders.worker.ts
gate: click .import; look
---

Click **Import**: the counter stops — the 400,000-line import blocks the page's only thread.
Move the work into a **Web Worker** with `@tsazor/worker`. The worker module, `orders.worker.ts`
(open in the editor), exposes it:

```ts
import { parseOrders, sampleOrders } from "./orders";

const api = {
    importOrders(count: number) {
        return parseOrders(sampleOrders(count));
    },
};
```

`OrdersWorker` (in `orders-client.ts`) is the typed client. Register it and inject it:

```ts
services.registerType(OrdersWorker, { singleton: true });
```

```tsazor
@import { OrdersWorker } from "./orders-client"
@inject OrdersWorker worker
```

```ts
async runImport() {
    this.status = "Importing…";
    const result = await this.worker.importOrders(400_000);
    this.status = `Imported ${result.orders} orders, ${result.loaves} loaves.`;
}
```

The counter keeps running.

> **Coming from Blazor:** this is your `await Task.Run(() => Import())`. The difference: the
> worker has its own memory — arguments and results are copied, not shared — and no access to
> the page. Getting back to the UI needs no `InvokeAsync`: the result arrives on the main
> thread, and the code after `await` runs there.
