---
title: When the server says no
focus: Bread.tsazor
gate: click .user button; click nav a:nth-child(2); change select ciabatta; change input[type=number] 5; click .order button[type=submit]; wait 400
---

Sign in, pick ciabatta, order five and press Reserve. Nothing happens. The console shows an
error: the server refused the order, and nobody caught it. Show the server's reason instead.

The bakery has only two ciabatta left, so the server answers with status 409 and a body
that explains why:

```json
{ "title": "Not enough bread", "status": 409, "detail": "Only 2 ciabatta left today." }
```

This shape is called **ProblemDetails**, a standard format for error answers. When the
status means failure, `postJson` throws a `TsazorHttpError` that carries the parsed body.
Catch it in `handleOrder`:

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

Anything else (a bug, say) is thrown on. `error.body` is `unknown`, because the server could
have sent anything. `asProblemDetails` checks that it really is a ProblemDetails and returns
it typed, or `null`. Import it, and add `TsazorHttpError` to the runtime import:

```tsazor
@import { asProblemDetails } from "@tsazor/dotnet"
```

Order five ciabatta again: "Only 2 ciabatta left today." Two still work.
