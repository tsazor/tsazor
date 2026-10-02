---
title: Not found
focus: App.tsazor
gate: click nav a:nth-child(3)
---

The menu promises a Bread page that doesn't exist — `/bread` matches no
route. Click it: the router's `NotFound` slot runs, and what's there is a
placeholder `?`. Real apps answer with a proper lost page, and since anything
can sit in the slot, it can be a component. `Lost.tsazor`, no `@page` (it
isn't a route — it renders *when there is no route*):

```tsazor
<h2>Lost in the oven</h2>
<p>That page doesn't exist — but the bread always finds its way back.</p>
<p><a href="/">Take me home</a></p>
```

```tsazor
<NotFound>
    <Lost />
</NotFound>
```

> **Coming from Blazor:** the `NotFound` you know from `Routes.razor`, with the
> same pattern: point it at a component (like Blazor's NotFound.razor
> convention). It covers the deep-link case the same way — the router matches
> the URL the app *arrived* on (a bookmark, a pasted link), and there's no
> route data in the slot, as in Blazor. The one upgrade over Blazor: the
> fragment *can* name the failed address — inject `NavigationManager` and
> read `baseRelativePath`, which still holds the unmatched path
> (`@(this.navigation.baseRelativePath)`).