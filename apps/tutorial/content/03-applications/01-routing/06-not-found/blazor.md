---
title: Not found
focus: App.tsazor
gate: click nav a:nth-child(3)
---

The Bread link leads to `/bread`, which has no route, and `NotFound` shows only a `?`. Do
what you'd do in Blazor and put a component there: fill in the empty `Lost.tsazor`, without
a `@page`:

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

> **Coming from Blazor:** same slot, same behavior for deep links, and no route data in it.
> To show the failed address, inject `NavigationManager` and read `baseRelativePath`, a
> shortcut for `toBaseRelativePath(uri)`:
> `<code>/@(this.navigation.baseRelativePath)</code>`.
