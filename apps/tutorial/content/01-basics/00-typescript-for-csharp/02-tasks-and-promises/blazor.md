---
title: Tasks and promises
focus: shop.ts
gate: wait 100
---

Good news again: `async`/`await` is **nearly identical**. A `Promise<T>` is a `Task<T>`, an
`async` method returns one, `await` unwraps it, `try`/`catch` around an `await` catches the
failure. Like a `Task`, a promise is already running when you get it: calling `loadUser()`
starts the work, `await` only waits for it.

| C# | TypeScript |
| --- | --- |
| `async Task<User> LoadUser()` | `async loadUser(): Promise<User>` |
| `async Task Save()` | `async save(): Promise<void>` |
| `await Task.WhenAll(a, b)` | `await Promise.all([a, b])` |
| `await Task.WhenAny(a, b)` | `await Promise.race([a, b])` |
| `Task.FromResult(x)` | `Promise.resolve(x)` |
| `await Task.Delay(500)` | `await new Promise((r) => setTimeout(r, 500))` |
| `CancellationToken` | `AbortSignal` (`fetch(url, { signal })`) |

The dashboard only shows the user. Load the orders too, in parallel, the way you'd use
`Task.WhenAll`:

```ts
export async function loadDashboard(): Promise<Dashboard> {
    const [user, orders] = await Promise.all([loadUser(), loadOrders()]);
    return { user, orders };
}
```

`Promise.all` takes an array and gives you a typed tuple back: `user` is a `User`, `orders`
an `Order[]`. One difference: it rejects as soon as one promise fails, without waiting for the
others. When you want every outcome, use `Promise.allSettled`.

> **Coming from C#:** what's gone is the threading. JavaScript runs your code on one thread,
> so there's no `ConfigureAwait(false)`, no `SynchronizationContext`, no `.Result` deadlock
> (and no `.Result` at all: you can't block on a promise). The code after an `await` always
> runs later, after the caller has moved on. `async void` doesn't exist either; the trap that
> remains is a *forgotten* `await`, which TypeScript doesn't flag. Cancellation is an
> `AbortSignal`; in a component, `this.disposeSignal` is the one that fires on dispose.
