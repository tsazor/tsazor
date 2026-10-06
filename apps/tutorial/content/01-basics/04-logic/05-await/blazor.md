---
title: Await
keywords: Await, Pending, Then, Catch, promise, loading state
focus: App.tsazor
gate: look
---

Same weather app as in the last lesson, before loading. This time, store the promise itself
(no `async` hook) and let the markup show its state:

```ts
forecasts = getForecast();
```

```tsazor
<Await For="@forecasts">
    <Pending>
        <p>Loading…</p>
    </Pending>
    <Then Context="week">
        <ul>
            @foreach (const forecast of week) {
                <li>@forecast.day: @forecast.summary, @forecast.temperature °C</li>
            }
        </ul>
    </Then>
    <Catch Context="error">
        <p>Could not load the forecast: @error.message</p>
    </Catch>
</Await>
```

`<Await>` is a templated component like those you know: `<Pending>`, `<Then>` and `<Catch>`
are its `RenderFragment` parameters, and `Context="week"` names the resolved value, typed
from `Promise<Forecast[]>` as `TItem` is inferred elsewhere. A missing part renders nothing.
A new promise starts over at `<Pending>`, and a stale one that settles late is ignored. The
`<Catch>` context is `unknown` (TypeScript's `catch` semantics, not `Exception`); without
`<Catch>`, the rejection reaches the nearest `<ErrorBoundary>`.

> **Coming from Blazor:** Blazor has no counterpart; there you'd keep a field, load it in
> `OnInitializedAsync` and branch with `@if`, as in the last lesson. That pattern still works
> here and is the better fit when your code needs the data too. `<Await>` is a Tsazor addition
> (Svelte's `{#await}`) for the common case where only the markup consumes the task, and it
> doesn't replace anything.
