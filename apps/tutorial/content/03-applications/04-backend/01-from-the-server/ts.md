---
title: Data from the server
focus: Orders.tsazor
gate: click .user button:last-of-type; click nav a:nth-child(3); wait 400
---

The order list is still typed into `Orders.tsazor`, but the orders live on the bakery's
server. Load them from there.

`Program.ts` already registers an HTTP client, `TsazorHttp`, with the server's address.
(The preview has no real server: `BakeryApi.ts` plays it, and the client hands it every
request.) Inject the client in `Orders.tsazor`, below the imports, and add `TsazorHttp`
to the import from `@tsazor/runtime`:

```tsazor
@inject TsazorHttp http
```

Replace the `orders` array with a field that starts empty, and fill it when the page starts:

```ts
orders: Order[] | null = null;

override async onInitialized() {
    this.orders = await this.http.getJson<Order[]>("/api/orders");
}
```

`getJson` sends a GET request and parses the JSON. `Order` describes what comes back, so
import it with `@import { Order } from "./Order.ts"`. In `shown`, start from
`this.orders ?? []`.

Until the answer arrives, `orders` is `null`. Show that in the markup:

```tsazor
@if (orders === null) {
    <p class="loading">Loading…</p>
} else {
    <ul class="orders">…</ul>
}
```

Sign in as baker and open Orders. "Loading…" shows briefly, then five orders from the server.

> **Plain `fetch` works too.** `TsazorHttp` is optional: a component can call
> `await fetch(url)` like any other code. The client adds a base address, JSON helpers,
> errors that keep the server's answer, and hooks for things like auth headers. Because
> it's injected, it can also be swapped out, which is how the preview plays the server.
