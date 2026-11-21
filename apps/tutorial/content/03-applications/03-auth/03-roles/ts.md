---
title: Roles
keywords: roles, policies, authorization, AuthorizeView
focus: App.tsazor
gate: click .user button:last-of-type
---

The order list is for the bakers, not for customers. Bakers are users with a **role**, so
let's give Bea one and show the Orders link only to bakers.

First the provider. `signIn` gets an optional list of roles and passes it on to
`createUser`:

```ts
signIn(name: string, roles: string[] = []) {
    this.current = new AuthenticationState(createUser({ name, roles }));
    this.notifyAuthenticationStateChanged(this.current);
}
```

Then add a second button to the header's `<NotAuthorized>` section:

```tsazor
<button @onclick="@(() => auth.signIn("Bea", ["baker"]))">Sign in as baker</button>
```

Now the menu. An `AuthorizeView` with `Roles` shows its content only to users with one of
those roles. Wrap the Orders link in one:

```tsazor
<AuthorizeView Roles="baker">
    <NavLink href="/orders">Orders</NavLink>
</AuthorizeView>
```

Sign in as Marta: no Orders link. Sign out and sign in as baker: there it is. `Roles` can
list several roles separated by commas; one of them is enough.

For rules that roles can't express — "has been a customer for a year", say — `AuthorizeView`
also takes a `Policy`: the name of a check function you register with the
`AuthorizationService`.
