---
title: Roles
focus: App.tsazor
gate: click .user button:last-of-type
---

Only bakers should see the Orders link. Give `signIn` an optional `roles` parameter and pass
it to `createUser({ name, roles })`, then add a second button to the header:

```tsazor
<button @onclick="@(() => auth.signIn("Bea", ["baker"]))">Sign in as baker</button>
```

Wrap the Orders link the way you would in Blazor:

```tsazor
<AuthorizeView Roles="baker">
    <NavLink href="/orders">Orders</NavLink>
</AuthorizeView>
```

Marta doesn't see the link; Bea does.

> **Coming from Blazor:** `Roles` takes a comma-separated list, and one role is enough.
> Policies are plain functions instead of requirement classes: register them by name in
> `AuthorizationService.policies` (`(user) => boolean`) and refer to them with `Policy`.
