---
title: Protected pages
keywords: @authorize, AuthorizeRouteView, protected pages, redirect
focus: Orders.tsazor
gate: click .staff a
---

The staff link on the home page still opens the orders for anyone. Protect the page — where
you'd write `@attribute [Authorize(Roles = "baker")]`, write:

```tsazor
@authorize({ roles: ["baker"] })
```

Then swap `RouteView` for `AuthorizeRouteView` in `App.tsazor`:

```tsazor
<AuthorizeRouteView RouteData="@routeData">
    <NotAuthorized>
        <p class="denied">Bakers only — please sign in as a baker.</p>
    </NotAuthorized>
</AuthorizeRouteView>
```

Customers get "Bakers only", Bea gets the list.

> **Coming from Blazor:** C# attributes don't exist in TypeScript, so `@authorize` is a
> Tsazor directive: bare for `[Authorize]`, with `{ roles, policy }` for the arguments. The
> migration codemod rewrites `@attribute [Authorize(…)]` for you. `[AllowAnonymous]` isn't
> needed — a page without `@authorize` is public.
>
> **Coming from Blazor Server:** this is the big shift. There, a component the user may not
> see never runs, and its data never leaves the server. Tsazor runs in the browser, like
> WebAssembly: `@authorize` only decides what the UI shows. Your API must check the user on
> every request.
