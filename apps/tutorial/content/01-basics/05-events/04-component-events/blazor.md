---
title: Component events
keywords: EventCallback, component events, invokeAsync
focus: Inner.tsazor
gate: click button
---

Component events are `EventCallback` parameters, as in Blazor. Declare one in
`Inner.tsazor` and invoke it:

```ts
@Parameter() onMessage?: EventCallback<string>;

async sayHello() {
    await this.onMessage?.invokeAsync("Hello!");
}
```

and handle it in `App.tsazor`:

```tsazor
<Inner onMessage="handleMessage" />
```

The callback is bound to `App` (the component whose markup passes it), so `App` re-renders
after `handleMessage` ran — Blazor's `EventCallback` semantics, including the second render
when the handler returns a promise.

> **Coming from Blazor:** `EventCallback<string>` is a class here, not a struct, so there's
> no `default` instance: declare the parameter optional and call it with
> `this.onMessage?.invokeAsync(…)` (or initialize it with `EventCallback.empty`).
> `InvokeAsync` and `HasDelegate` are `invokeAsync` and `hasDelegate`. A plain function
> parameter (`(text: string) => void`, Blazor's `Action<string>`) works too, with the same
> trade-off as in Blazor: no automatic re-render of the parent.
