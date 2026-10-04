---
title: A typed client
keywords: typed client, @tsazor/dotnet, Result, service
focus: Bread.tsazor
gate: click .user button; click nav a:nth-child(2); change select ciabatta; change input[type=number] 5; click .order button[type=submit]; wait 400
refactor: true
---

The order form works, but it spells out the URL, types the answer by hand and needs a
`try`/`catch` for every refusal. Use the generated client instead.

Many servers describe their API in an **OpenAPI** document: every URL, every parameter,
every JSON shape. From it, `tsazor-dotnet generate` writes a client class. `bakery.ts` and
`models.ts` came out of the bakery's document. Have a look: `BakeryClient` has one method
per operation, `createOrder(body: NewOrder)` among them. `Program.ts` already registers it.

In `Bread.tsazor`, inject it in place of `TsazorHttp`:

```tsazor
@import { BakeryClient } from "./bakery.ts"
@inject BakeryClient bakery
```

Now `handleOrder` shrinks to three lines:

```ts
async handleOrder() {
    const result = await this.bakery.createOrder(this.order);
    this.confirmation = result.ok ? result.body : null;
    this.status = result.ok ? null : problemMessage(result);
}
```

The client doesn't throw when the server refuses. It returns a result. If `result.ok` is
`true`, `result.body` is the saved `Order`. Otherwise you get the status and the
ProblemDetails, and `problemMessage` picks the best text from them. Import it from
`@tsazor/dotnet` in place of `asProblemDetails`, and drop the imports you no longer use.

The page works exactly as before: try five ciabatta. What changed is that a typo in the URL
or a wrong field name is now a type error.
