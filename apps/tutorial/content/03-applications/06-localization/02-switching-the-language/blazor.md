---
title: Switching the language
focus: App.tsazor
gate: click .languages button:nth-child(2)
---

Inject the `CultureService` (add it to the import) and switch the culture in `switchTo`:

```tsazor
@inject CultureService culture
```

```ts
switchTo(name: string) {
    this.culture.setExplicit(name);
}
```

Click Deutsch: the page follows.

> **Coming from Blazor:** `CultureService` takes the place of `CultureInfo.CurrentUICulture`,
> as app state in DI instead of ambient static state. Blazor re-renders nothing when the
> culture changes; you'd reload or notify components yourself. Tsazor re-renders every
> component that injects `StringLocalizer` or `CultureService`. That's a Tsazor extension.
> `setExplicit` (the user's choice) wins over `setFromProfile` and `setDefault`.
