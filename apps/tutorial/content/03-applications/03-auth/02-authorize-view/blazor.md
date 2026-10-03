---
title: AuthorizeView
focus: Home.tsazor
gate: click .user button
---

Give signed-in customers a welcome on the home page, with the `AuthorizeView` you know:

```tsazor
<AuthorizeView>
    <Authorized>
        <p class="welcome">Welcome back, @context.user.name! Your usual sourdough is waiting.</p>
    </Authorized>
    <NotAuthorized>
        <p>Sign in to see your usual order.</p>
    </NotAuthorized>
</AuthorizeView>
```

Sign in and out to see both sides.

> **Coming from Blazor:** the same component with the same sections, including
> `<Authorizing>`, and `Roles`/`Policy` (next lesson). `context` is the
> `AuthenticationState` itself, so you write `context.user.name` instead of
> `context.User.Identity?.Name`. Content without sections counts as `<Authorized>`.
