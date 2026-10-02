---
title: Navigation
focus: Order.tsazor
gate: click nav a:nth-child(2); click .orders a; click button
---

The order page has a "Back to orders" button — wired up, but `back()` has an
empty body. Click it: nothing. Not every navigation starts with a link; code
navigates too — after saving, after cancelling, after a sign-in. The app's
navigator is a service any component can inject. Add the line under `@page`:

```tsazor
@inject NavigationManager navigation
```

`NavigationManager` resolves like any injected service; the field `navigation`
is filled before the component initializes. Now the method:

```ts
back() {
    this.navigation.navigateTo("/orders");
}
```

`navigateTo` walks the same path a link click takes: the URL changes, a
history entry appears, the router matches, the page renders. Click the button
on an order page and you land back on the list — the browser's back button
still works, because a real history entry was pushed.

The second argument tunes the entry:

```ts
this.navigation.navigateTo("/orders", { replaceHistoryEntry: true });
```

`replaceHistoryEntry` swaps the current entry instead of pushing one — for
flows where "back" should skip a step, like landing on a "thanks" page after
checkout. `forceLoad: true` skips the router entirely and loads the URL the
old way (rare, but sometimes an app really must reload). An absolute URL
outside the app (`https://…`) leaves it — the browser just goes there.

The manager also reports: `addLocationChanged` gets a callback on every
navigation and returns the unsubscribe function; `registerLocationChangingHandler`
runs your check *before* the navigation happens and may cancel it — that's the
hook behind "unsaved changes?" dialogs. Its current opinion of the URL is
`navigation.uri`; the root-relative form used in pages is
`navigation.baseRelativePath`.