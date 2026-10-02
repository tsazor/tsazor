---
title: Page title and head
focus: App.tsazor
---

`PageTitle` and `HeadContent` from Blazor Web, unchanged:

```tsazor
<PageTitle>(@unread) Inbox</PageTitle>
<HeadContent>
    <meta name="description" content="Your mail, @unread unread" />
</HeadContent>
```

The preview's bar shows the document title like a browser tab — *(2) Inbox*, then *(0) Inbox*
after **Mark all as read**. As in Blazor, `createTsazorApp` mounts a `HeadOutlet` as a second
root in `document.head`; both components are section providers for it, so the last rendered one
wins, and the static `<title>` of `index.html` is captured on the first render, removed, and
used as the fallback.

> **Coming from Blazor:** no `<HeadOutlet @rendermode="…" />` in `App.razor` — the app adds the
> outlet itself. Narrowing caveat from "Child content": `<PageTitle>@user.name</PageTitle>`
> inside `@if (user)` is TS2532 in `tsazor check`; read the value through a getter or a local.
