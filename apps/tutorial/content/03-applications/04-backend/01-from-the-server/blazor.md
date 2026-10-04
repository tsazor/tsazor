---
title: Data from the server
keywords: TsazorHttp, getJson, fetch, HTTP, API
focus: Orders.tsazor
gate: click .user button:last-of-type; click nav a:nth-child(3); wait 400
---

Load the order list from the server instead of the hard-coded array. `Program.ts` registers
the HTTP client, so inject it in `Orders.tsazor` (and add `TsazorHttp` to the import):

```tsazor
@inject TsazorHttp http
```

```ts
orders: Order[] | null = null;

override async onInitialized() {
    this.orders = await this.http.getJson<Order[]>("/api/orders");
}
```

Import `Order` from `./Order.ts`, start `shown` from `this.orders ?? []`, and show
`<p class="loading">Loading…</p>` while `orders` is `null`. Sign in as baker and open Orders.

> **Coming from Blazor:** `TsazorHttp` is your `HttpClient`: `getJson` is
> `GetFromJsonAsync`, `postJson` is `PostAsJsonAsync`. Instead of an
> `HttpMessageHandler`, you pass `fetch` (the browser's own HTTP call). The preview's
> `BakeryApi.ts` uses that to answer in memory, as a test handler would. Without it,
> requests go over the network.
