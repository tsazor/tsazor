---
title: AuthorizeView
keywords: AuthorizeView, Authorized, NotAuthorized, claims
focus: Home.tsazor
gate: click .user button
---

Signed-in customers should get a personal welcome on the home page. The header already
shows how: it wraps its content in an `AuthorizeView`. Let's write one ourselves.

In its simplest form, `AuthorizeView` shows its content only to signed-in users. Add this
to `Home.tsazor`:

```tsazor
<AuthorizeView>
    <p class="welcome">Welcome back, @context.user.name! Your usual sourdough is waiting.</p>
</AuthorizeView>
```

Click Sign in: the welcome appears. Sign out: it's gone.

Inside, `context` is the authentication state, so `context.user` is the signed-in user —
with a `name`, `roles` and `claims`.

To show something to everybody else, split the content in two:

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

That's exactly what the header does with its two buttons. When the provider reports a
change, every `AuthorizeView` on the page updates.

While the provider is still answering — say, waiting for the server — `AuthorizeView`
renders nothing. An `<Authorizing>` section lets you show something in the meantime.
