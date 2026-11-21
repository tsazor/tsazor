---
title: When parameters change
keywords: onParametersSet, reloading data, query parameters
focus: Orders.tsazor
gate: click .user button:last-of-type; click nav a:nth-child(3); wait 400; click .filters a:nth-child(2); wait 400
---

`Orders.tsazor` now passes `?state=` to the server, but it loads in `onInitialized`. Sign in
as baker, open Orders and click Open: nothing happens. You know this one. The router reuses
the component and only sets new parameters.

Move the load to `onParametersSet`:

```ts
override async onParametersSet() {
    const query = this.state === null ? "" : `?state=${encodeURIComponent(this.state)}`;
    this.orders = await this.http.getJson<Order[]>(`/api/orders${query}`);
}
```

> **Coming from Blazor:** there is no separate `OnParametersSetAsync`. Make
> `onParametersSet` `async` and it plays both roles. The component renders when the method
> starts and again when its promise completes, the same as `OnInitializedAsync`.
