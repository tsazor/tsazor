---
title: Not found
keywords: NotFound, unknown address, routing
focus: App.tsazor
gate: click nav a:nth-child(3)
---

The menu links to a Bread page that doesn't exist. Click it: the router can't match
`/bread`, so it shows the `NotFound` content — a lonely `?`. Let's give lost visitors a real
page with a way back.

`Lost.tsazor` is already there, empty. Fill it in — without a `@page`, because it isn't a
route of its own:

```tsazor
<h2>Lost in the oven</h2>
<p>That page doesn't exist — but the bread always finds its way back.</p>
<p><a href="/">Take me home</a></p>
```

Then use it in `App.tsazor`:

```tsazor
<NotFound>
    <Lost />
</NotFound>
```

This page isn't only for broken menu links. When the app starts, the router matches the URL
it was opened with — a bookmark, a link from a chat, a typo in the address bar. Any URL
without a route ends up here.

If you like, show the address that failed. `NotFound` gets no route data, but the navigator
still knows the path:

```tsazor
@inject NavigationManager navigation
<p>There is nothing at <code>/@(this.navigation.baseRelativePath)</code>.</p>
```

`baseRelativePath` has no leading slash, so the markup adds one.
