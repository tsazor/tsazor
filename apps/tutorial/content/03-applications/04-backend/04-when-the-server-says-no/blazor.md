---
title: When the server says no
focus: Bread.tsazor
gate: click .user button; click nav a:nth-child(2); change select ciabatta; change input[type=number] 5; click .order button[type=submit]; wait 400
---

Order five ciabatta: the server answers 409 with a ProblemDetails body ("Only 2 ciabatta
left today."), `postJson` throws, and nothing catches it. Catch it and show the detail:

```ts
async handleOrder() {
    this.status = null;
    try {
        this.confirmation = await this.http.postJson<Order>("/api/orders", this.order);
    } catch (error) {
        if (!(error instanceof TsazorHttpError)) throw error;
        this.confirmation = null;
        this.status = asProblemDetails(error.body)?.detail ?? error.message;
    }
}
```

Import `TsazorHttpError` from `@tsazor/runtime` and `asProblemDetails` from `@tsazor/dotnet`.

> **Coming from Blazor:** the ProblemDetails is what `Results.Problem(...)` or
> `[ApiController]` sends. `HttpRequestException` carries only the status. The
> `TsazorHttpError` keeps the parsed body. TypeScript's `catch` has no exception type,
> so the `instanceof` check plus rethrow does what `catch (HttpRequestException)` does.
