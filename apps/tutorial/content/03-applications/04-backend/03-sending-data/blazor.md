---
title: Sending data
focus: Bread.tsazor
gate: click .user button; click nav a:nth-child(2); click .order button[type=submit]; wait 400
---

Send the reservation to the server. Inject `TsazorHttp` in `Bread.tsazor`, replace
`submitted` with `confirmation: Order | null = null;` and post the model:

```ts
async handleOrder() {
    this.confirmation = await this.http.postJson<Order>("/api/orders", this.order);
    this.status = null;
}
```

Show the saved order:

```tsazor
@if (confirmation !== null) {
    <p class="success">Reserved as order #@confirmation.id: @confirmation.quantity × @confirmation.bread for @confirmation.customer.</p>
}
```

Sign in as baker, reserve a loaf, then open Orders.

> **Coming from Blazor:** `postJson<Order>` is `PostAsJsonAsync` and
> `ReadFromJsonAsync<Order>` in one call. JSON uses the property names as they are. Your
> ASP.NET Core API writes camelCase by default, which matches TypeScript fields. If it
> fails (4xx, 5xx), `postJson` throws, like `EnsureSuccessStatusCode`. That's the next
> lesson.
