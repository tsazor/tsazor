---
title: Page title and head
keywords: PageTitle, HeadContent, title
focus: App.tsazor
---

A browser tab shows the document's `<title>` — the part of a page that lives in `<head>`, outside
any component. Components can still set it. Put this anywhere in `App.tsazor`:

```tsazor
<PageTitle>(@unread) Inbox</PageTitle>
```

Look at the preview's bar: it shows the title like a browser tab, *(2) Inbox*. Click **Mark all
as read** and it drops to *(0) Inbox* — the title is markup like any other and updates with the
component.

For everything else that belongs in `<head>` — a description, a canonical link, social preview
tags — there's `HeadContent`:

```tsazor
<HeadContent>
    <meta name="description" content="Your mail, @unread unread" />
</HeadContent>
```

Both render their content into the document head, not where they're written, and both go away
when their component does. If several components set a title, the one rendered last wins —
so a page can override the app's default title, and a dialog the page's. When the last
`PageTitle` disappears, the title the document started with comes back.

`PageTitle`'s content is child content, like a card's: it renders later, and an `@if` around it
still covers it, so `@if (user) { <PageTitle>@user.name</PageTitle> }` checks clean.
