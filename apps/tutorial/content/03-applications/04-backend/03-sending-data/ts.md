---
title: Sending data
focus: Bread.tsazor
gate: click .user button; click nav a:nth-child(2); click .order button[type=submit]; wait 400
---

When Marta reserves a loaf, the form says "Reserved", but the bakery never hears about it.
Send the order to the server.

In `Bread.tsazor`, inject the HTTP client, as on the Orders page:

```tsazor
@import { Order } from "./Order.ts"
@inject TsazorHttp http
```

(Add `TsazorHttp` to the import from `@tsazor/runtime`, too.) The server answers with the
order it saved, so replace `submitted` with a field for that answer:

```ts
confirmation: Order | null = null;
```

Make `handleOrder` send the form's model:

```ts
async handleOrder() {
    this.confirmation = await this.http.postJson<Order>("/api/orders", this.order);
    this.status = null;
}
```

`postJson` sends the object as JSON in a POST request and parses the JSON that comes back.
A form handler can be `async`, just like a click handler. The page renders again when the
answer arrives.

Show what the server saved:

```tsazor
@if (confirmation !== null) {
    <p class="success">Reserved as order #@confirmation.id: @confirmation.quantity × @confirmation.bread for @confirmation.customer.</p>
}
```

Sign in as baker and reserve a loaf. Then open Orders: your order is on the list.
