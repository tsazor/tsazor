---
title: When parameters change
focus: Orders.tsazor
gate: click .user button:last-of-type; click nav a:nth-child(3); wait 400; click .filters a:nth-child(2); wait 400
---

The server can filter orders itself, so `Orders.tsazor` now asks for `/api/orders?state=open`
instead of filtering in the browser. But try it: sign in as baker, open Orders, click Open.
The list doesn't change.

Clicking Open doesn't create a new page. The router keeps the `Orders` component and only
gives it a new `state` parameter. `onInitialized` ran once, when the page was created, and
doesn't run again.

The method for "the parameters are new" is `onParametersSet`. It runs after
`onInitialized` and again every time the parameters change. Rename the method:

```ts
override async onParametersSet() {
    const query = this.state === null ? "" : `?state=${encodeURIComponent(this.state)}`;
    this.orders = await this.http.getJson<Order[]>(`/api/orders${query}`);
}
```

Click Open again: the page asks the server once more, and only the open orders come back.

Rule of thumb: load in `onInitialized` what only needs loading once. If the request depends
on a parameter, load in `onParametersSet`.
