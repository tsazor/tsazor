---
title: Navigation
focus: Order.tsazor
gate: click nav a:nth-child(2); click .orders a; click button
---

The order page's "Back to orders" button calls an empty `back()`. You know this
one — inject the navigator and call it:

```tsazor
@inject NavigationManager navigation
```

```ts
back() {
    this.navigation.navigateTo("/orders");
}
```

Same as Blazor's `NavigationManager.NavigateTo`: URL changes, history entry
pushed, router matches, page renders.

> **Coming from Blazor:** the camel-case surface maps one to one —
    `navigateTo(uri, { forceLoad, replaceHistoryEntry, historyEntryState })`
  is `NavigateTo(uri, options)`, `addLocationChanged(handler)` returns the
  unsubscribe function (Blazor's `IDisposable` from `LocationChanged` +=
  is the returned `() => void`), `registerLocationChangingHandler` is
  `RegisterLocationChangingHandler` with `preventNavigation()` on the
  context, and `uri` / `baseRelativePath` are `Uri` / `baseRelativePath` in
  spirit. An external URL performs a full browser navigation, as in Blazor.