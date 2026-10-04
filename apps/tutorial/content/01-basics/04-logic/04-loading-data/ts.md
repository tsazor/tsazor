---
title: Loading data
keywords: loading data, onInitialized, async, loading state
focus: App.tsazor
---

Most components show data that comes from somewhere else, and that takes time. Here's the
pattern you'll use everywhere: start loading when the component is created, show a
placeholder until the data is there.

`weather.ts` has a `getForecast()` that resolves after a second. Load it in
`onInitialized` — which may be `async`:

```ts
forecasts?: Forecast[];

override async onInitialized() {
    this.forecasts = await getForecast();
}
```

Note the field: `forecasts?: Forecast[]` instead of an empty array. "Not loaded yet" and
"loaded, but empty" are different states, and `undefined` makes the first one explicit. Now
the markup has to handle it — the type checker insists, since `forecasts` might be
`undefined`:

```tsazor
@if (forecasts === undefined) {
    <p>Loading…</p>
} else {
    <ul>
        @foreach (const forecast of forecasts) {
            <li>@forecast.day: @forecast.summary, @forecast.temperature °C</li>
        }
    </ul>
}
```

This works because an async lifecycle method renders twice, like an async event handler:
once when it reaches the first `await` (showing "Loading…") and again when it's done. And
inside the `else` branch, TypeScript has narrowed `forecasts` to `Forecast[]` — no `!` and
no `?.` needed.
