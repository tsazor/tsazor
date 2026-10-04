---
title: The user in code
keywords: AuthenticationState, CascadingAuthenticationState, current user
focus: Bread.tsazor
gate: click .user button; click nav a:nth-child(2)
---

Marta is signed in, but the order form still asks for her name. The form's code needs the
user — not in markup, where `AuthorizeView` helps, but in a field.

First make the user available everywhere. In `App.tsazor`, wrap the `Router` in a
`CascadingAuthenticationState`:

```tsazor
<CascadingAuthenticationState>
    <Router>
        …
    </Router>
</CascadingAuthenticationState>
```

It passes the current authentication state down to every component below it, as a cascading
value, and passes the new one when the user changes.

In `Bread.tsazor`, receive it with a cascading parameter. It's matched by type, so name the
type in the decorator, and add `AuthenticationState` to the import at the top:

```ts
@CascadingParameter({ type: AuthenticationState }) authentication?: AuthenticationState;
```

Now fill in the name when the parameters arrive:

```ts
override onParametersSet() {
    const user = this.authentication?.user;
    if (user?.isAuthenticated && this.order.name === "") {
        this.order.name = user.name;
    }
}
```

Sign in as Marta and open Bread: the name is filled in. Because the check only fills an
empty name, whatever Marta types herself is kept.

That's the auth chapter: a provider that knows the user, `AuthorizeView` for markup, roles,
protected pages, and the user in code.
