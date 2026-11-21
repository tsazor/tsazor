---
title: Signing in
keywords: authentication, AuthenticationStateProvider, signIn, signOut, login
focus: BakeryAuth.ts
gate: click .user button
---

Auth works through an `AuthenticationStateProvider`, as in Blazor. The bakery's provider is
`BakeryAuth.ts`, registered in `Program.ts`. Its `signIn` and `signOut` are still empty, so
the Sign in button in the header does nothing. Fill them in:

```ts
signIn(name: string) {
    this.current = new AuthenticationState(createUser({ name }));
    this.notifyAuthenticationStateChanged(this.current);
}
```

Write `signOut` the same way with `ANONYMOUS`, and import `createUser`. Click Sign in: the
header greets Marta.

> **Coming from Blazor:** you override `getAuthenticationStateAsync()` as you would
> `GetAuthenticationStateAsync()`. `notifyAuthenticationStateChanged` takes the state itself when
> it's ready, as here, or a promise of it where Blazor takes a `Task`. The user is
> a plain object (`name`, `isAuthenticated`, `roles`, `claims`) instead of a
> `ClaimsPrincipal`. `Program.ts` registers one instance under two keys — the class for
> `@inject` and the base class for the auth components — where you'd write
> `AddScoped<AuthenticationStateProvider, BakeryAuth>()`.
>
> Against your own ASP.NET Core backend you don't write the provider: `@tsazor/dotnet` has
> `CookieAuthenticationStateProvider` for a BFF's session cookie, and for a bearer token
> `JwtAuthenticationStateProvider` with `attachJwtAuth`, your `DelegatingHandler`. The
> [auth guide](https://github.com/tsazor/tsazor/blob/main/docs/auth.md) says which to pick.
