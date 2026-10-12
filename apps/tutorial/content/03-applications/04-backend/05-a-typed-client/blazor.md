---
title: A typed client
keywords: typed client, @tsazor/dotnet, Result, service
focus: Bread.tsazor
gate: click .user button; click nav a:nth-child(2); change select ciabatta; change input[type=number] 5; click .order button[type=submit]; wait 400
refactor: true
---

Replace the hand-written request with the client generated from the API's OpenAPI document
(`bakery.ts`, `models.ts`; `Program.ts` registers it):

```tsazor
@import { BakeryClient } from "./bakery.ts"
@inject BakeryClient bakery
```

```ts
async handleOrder() {
    const result = await this.bakery.createOrder(this.order);
    this.confirmation = result.ok ? result.body : null;
    this.status = result.ok ? null : problemMessage(result);
}
```

Import `problemMessage` from `@tsazor/dotnet` and drop the unused imports. The page behaves
as before.

> **Coming from Blazor:** the generator is to TypeScript what NSwag or Kiota is to C#:
> `npx tsazor-dotnet generate https://localhost:5001/openapi/v1.json --out src/api`. The
> client returns an `HttpResult` instead of throwing. Nullable reference types in the
> schema become `| null`. Your `[Required]` and `[Range]` rules come along as
> decorators in `models.ts`. Does your API wrap every answer in an envelope, such as
> `{ data, errors }`? `--envelope data,errors` unwraps it, so you don't type each call by hand.
