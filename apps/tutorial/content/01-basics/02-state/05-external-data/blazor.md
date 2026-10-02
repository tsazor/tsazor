---
title: External data
focus: Price.tsazor
gate: wait 1100
---

Data that changes outside an event handler — a store, a timer, a server push — needs the
familiar pattern: subscribe, call `StateHasChanged` on every notification, unsubscribe in
`Dispose`. `ticker.ts` is such a source; `Price.tsazor` doesn't listen yet, so its price is
frozen. The Blazor way works as is:

```ts
private unsubscribe = () => {};

override onInitialized() {
    this.unsubscribe = ticker.subscribe(() => this.stateHasChanged());
}

dispose() {
    this.unsubscribe();
}
```

Tsazor has a short form for exactly this:

```ts
override onInitialized() {
    this.track(ticker);
}
```

The price moves. Hide it and show it again: "Listening" stays at 1 — the old subscription
went away with the old component.

> **Tsazor extension — `track` and `disposeSignal`:** `this.track(source, onNext?)` is
> subscribe + `InvokeAsync(StateHasChanged)` + unsubscribe in `Dispose`, written once.
> Notifications go through the render queue (a burst renders once); `onNext` runs before
> each render, and an error in it reaches the nearest `ErrorBoundary` like a lifecycle error.
> Sources: `subscribe(listener)` returning an unsubscribe function, observables returning
> `{ unsubscribe() }` (also as a promise, after a handshake — one that resolves after dispose
> is unsubscribed at once), or `(signal, notify) => { … }` for anything else. The return value
> stops tracking early. `this.disposeSignal` is an `AbortSignal` that aborts on dispose — the
> web platform's counterpart of a `CancellationToken`: `fetch(url, { signal: this.disposeSignal })`,
> `addEventListener(…, { signal: this.disposeSignal })`.

> **Coming from Blazor:** there's no `InvokeAsync` around `StateHasChanged` — JavaScript has
> one thread, so `stateHasChanged()` is safe from any callback. Like a subscription in
> `OnParametersSet`, a `track` there subscribes again on every parameter change (in
> development a warning says so); track once, in `onInitialized`.
