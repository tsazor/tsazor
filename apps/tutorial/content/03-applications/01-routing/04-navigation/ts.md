---
title: Navigation
focus: Order.tsazor
gate: click nav a:nth-child(2); click .orders a; click button
---

Not every navigation starts with a link. After saving or cancelling, your code decides where
to go next. The "Back to orders" button on the order page calls `back()`, which is still
empty.

Navigation is a service, so you inject it. Add this line below `@page`:

```tsazor
@inject NavigationManager navigation
```

Then fill in `back()`:

```ts
back() {
    this.navigation.navigateTo("/orders");
}
```

Open an order and click the button: you're back on the list. `navigateTo` does exactly what
a link click does — the URL changes, the router picks the page — and it adds a history
entry, so the browser's back button still works.

Sometimes "back" should skip a step, for example after checkout. Then replace the current
entry instead of adding one:

```ts
this.navigation.navigateTo("/orders", { replaceHistoryEntry: true });
```

`NavigationManager` can do more when you need it: `navigation.uri` is the current URL,
`addLocationChanged` calls you after every navigation, and `registerLocationChangingHandler`
lets you cancel one before it happens — the basis for an "unsaved changes?" prompt.
