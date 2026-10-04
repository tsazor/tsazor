---
title: Lifetimes
keywords: singleton, scoped, transient, service lifetimes
focus: Program.ts
gate: click .board button
---

Two scoreboards, each with its own `+1` button. Click Home: *both* boards count. Each
`Scoreboard` injects a `Tally`, and by default a service is a **singleton** — one instance for
the whole app. Last lesson, that was the point (one cart). Here, every board needs its own.

Change the registration in `Program.ts`:

```ts
services.registerType(Tally, { lifetime: "transient" });
```

Now every `@inject Tally` gets a fresh instance, and the teams count separately.

| Lifetime | Instances | Typical use |
|---|---|---|
| `"singleton"` (default) | one per app | app-wide state, API clients, caches |
| `"transient"` | a new one per injection | small helpers with state of their own |
| `"scoped"` | one per scope | per-request state on a server; in a browser app there's one scope, so it behaves like a singleton |

A transient service is like writing `new Tally()` yourself — but the component still doesn't
know *how* a `Tally` is made. That's the job of the registration, and it can change without
touching any component:

```ts
services.register(Tally, () => new Tally());              // a factory
services.register(Checkout, (s) => new Checkout(s.get(Cart)));  // with a dependency
services.registerValue(Clock, fixedClock);                // an existing instance
```

`registerType(Tally)` is the short form of the first line (the class gets the services as its
constructor argument, if it wants them). A rule of thumb for choosing: if two components should
see each other's changes, share one instance; if they shouldn't, they shouldn't share a
singleton.
