---
title: The user in code
keywords: AuthenticationState, CascadingAuthenticationState, current user
focus: Bread.tsazor
gate: click .user button; click nav a:nth-child(2)
---

Prefill the order form with the signed-in user's name. Wrap the `Router` in `App.tsazor` in
a `<CascadingAuthenticationState>`, then receive the state in `Bread.tsazor`:

```ts
@CascadingParameter({ type: AuthenticationState }) authentication?: AuthenticationState;

override onParametersSet() {
    const user = this.authentication?.user;
    if (user?.isAuthenticated && this.order.name === "") {
        this.order.name = user.name;
    }
}
```

Add `AuthenticationState` to the `@import`, sign in as Marta, and open Bread.

> **Coming from Blazor:** you'd write `[CascadingParameter] Task<AuthenticationState>`
> and await it. Here the cascade is the state itself, so there's nothing to await, and
> `onParametersSet` runs again when the user changes. The type goes into the decorator
> (`{ type: AuthenticationState }`), because TypeScript types don't exist at runtime.
> Instead of the `<CascadingAuthenticationState>` component, Blazor 8 can also register the
> cascade as a service; here it's the component only.
