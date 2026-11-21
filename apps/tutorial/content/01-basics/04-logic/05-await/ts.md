---
title: Await
keywords: Await, Pending, Then, Catch, promise, loading state
focus: App.tsazor
gate: look
---

Same weather app, same empty list. In the last lesson you loaded the forecast with a field,
an `async` `onInitialized` and an `@if`. Here's a shorter way for the common case: hand the
promise itself to the markup and let `<Await>` show its state.

Store the promise, not the result. There's no `async` and no `await` in the code:

```ts
forecasts = getForecast();
```

Then describe the three states in the markup:

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

`<Pending>` shows while the promise is pending, `<Then>` once it has resolved, `<Catch>` if it
was rejected. `Context="week"` names the resolved value, and it's typed: `getForecast()`
returns a `Promise<Forecast[]>`, so `week` is a `Forecast[]`. Leave out any part you don't
need; a missing part renders nothing.

A few details:

- **A new promise starts over.** Assign another one (`this.forecasts = getForecast()` in a
  Refresh handler) and `<Await>` goes back to `<Pending>`. If the old promise settles later,
  it is ignored.
- **The error is `unknown`**, just like in a `catch` clause: anything can be thrown. The
  markup doesn't check it, so `@error.message` works for an `Error`.
- **Without `<Catch>`, a failure isn't swallowed.** It goes to the nearest `<ErrorBoundary>`,
  like an exception in a lifecycle method.

Tsazor offers `<Await>` as an addition, not as a replacement. The field and `@if` pattern
still works and is the better fit when your code needs the data too (to sort, edit or save it),
or when several loads feed one view. `<Await>` fits when the markup is the only consumer of
the promise.
