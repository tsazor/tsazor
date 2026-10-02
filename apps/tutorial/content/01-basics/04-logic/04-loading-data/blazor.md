---
title: Loading data
focus: App.tsazor
---

The classic `FetchData` pattern: start loading when the component initializes, render a
placeholder until the data has arrived. `getForecast()` in `weather.ts` resolves after a
second:

```ts
forecasts?: Forecast[];

override async onInitialized() {
    this.forecasts = await getForecast();
}
```

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

As with `OnInitializedAsync`, the component renders after the synchronous part of the hook
("Loading…") and again when the promise completes. `Forecast[]?` with a `null` check
becomes an optional field checked against `undefined`; inside `else`, TypeScript has narrowed
`forecasts` to `Forecast[]`.

> **Coming from Blazor:** an `async` override of `onInitialized` is the whole story — there's
> no separate `OnInitializedAsync`. One documented difference: Blazor skips the intermediate
> render when the task completed synchronously. A JavaScript promise can't be inspected
> synchronously, so an `async` hook without a real `await` renders once more. The real
> `HttpClient` equivalent comes in the chapter on talking to a backend.
