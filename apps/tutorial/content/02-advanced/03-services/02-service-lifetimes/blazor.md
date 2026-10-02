---
title: Lifetimes
focus: Program.ts
gate: click .board button
---

Click Home: both boards count — `Tally` is registered as a singleton (the default), so both
`Scoreboard`s share it. Make it transient:

```ts
services.registerType(Tally, { lifetime: "transient" });
```

The lifetimes are Blazor's: `"singleton"` (`AddSingleton`, one instance at the root provider),
`"transient"` (`AddTransient`, one per resolution) and `"scoped"` (`AddScoped`, one per
`createScope()`). As in Blazor WebAssembly, a browser app has a single scope, so scoped and
singleton services behave the same there.

> **Coming from Blazor:** the provider follows .NET's behavior where it's observable: a
> service that depends on itself (directly or through others) throws *A circular dependency was
> detected for the service of type 'X'.*, `get` on a disposed provider throws *Cannot access a
> disposed object.*, and the provider disposes the instances its factories created in reverse
> creation order. An unregistered service is `Service not registered: X` (`tryGet` returns
> `undefined`, like `GetService`).
