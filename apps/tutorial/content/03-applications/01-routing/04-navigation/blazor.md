---
title: Navigation
keywords: NavigationManager, navigateTo, locationChanged, navigation
focus: Order.tsazor
gate: click nav a:nth-child(2); click .orders a; click button
---

The "Back to orders" button calls an empty `back()`. Inject `NavigationManager` as you
would in Blazor, and navigate:

```tsazor
@inject NavigationManager navigation
```

```ts
back() {
    this.navigation.navigateTo("/orders");
}
```

Open an order and click the button: you're back on the list, with a new history entry.

> **Coming from Blazor:** the API is Blazor's in camelCase.
> `navigateTo(uri, { forceLoad, replaceHistoryEntry, historyEntryState })` is
> `NavigateTo(uri, options)`, and `uri`, `baseUri` and `toBaseRelativePath()` are what you
> know. `addLocationChanged(handler)` stands in for the `LocationChanged` event: the handler gets
> the event arguments only (no `sender`), and the call returns a function that unsubscribes.
> `registerLocationChangingHandler` works as in Blazor, including `preventNavigation()`, and returns
> that kind of function too instead of an `IDisposable`.
