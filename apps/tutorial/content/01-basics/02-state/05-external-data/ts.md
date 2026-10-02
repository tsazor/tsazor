---
title: External data
focus: Price.tsazor
gate: wait 1100
---

Event handlers aren't the only place where data changes. A price feed, a chat, a store that
several components share — that data lives outside the component and changes whenever *it*
wants. `ticker.ts` is such a source: its price moves twice a second, and anyone can
`subscribe` to hear about it.

`Price.tsazor` shows the price, but it's frozen. Nothing tells the component that something
changed — and, as you saw in "When a component renders", a change outside an event handler
doesn't render by itself. Observe the source in `onInitialized`, which runs once when the
component is created (the next lesson covers it in detail):

```ts
override onInitialized() {
    this.observe(ticker);
}
```

The price moves. `observe` subscribes, re-renders the component after every notification, and
unsubscribes when the component is removed. Hide the price and show it again: "Listening"
stays at 1 — the old subscription went away with the old component. There's no cleanup code
to forget.

A few details:

- Notifications that arrive in a burst render once — they're queued like any
  `stateHasChanged()`.
- A second argument runs before each render, with the value the source sends (if it sends
  one): `this.observe(ticker, () => this.history.push(ticker.price))`.
- `observe` understands the common shapes of a source: `subscribe(listener)` returning an
  unsubscribe function, observables whose `subscribe` returns `{ unsubscribe() }` — also as a
  promise, after a handshake — and, for anything else, a function `(signal, notify) => { … }`
  whose `signal` aborts when observing ends.
- `observe` returns a function that stops observing early.

For APIs that take an `AbortSignal` there's `this.disposeSignal`, which aborts when the
component goes away: `fetch(url, { signal: this.disposeSignal })`, or
`addEventListener("resize", this.onResize, { signal: this.disposeSignal })`.
