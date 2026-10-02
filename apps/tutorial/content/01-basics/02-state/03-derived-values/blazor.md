---
title: Derived values
focus: App.tsazor
gate: click button
---

Click the button a few times: the count goes up, "doubled" stays at 2. The field initializer
`doubled = this.count * 2` ran once, when the component was constructed — just like a field
initializer in C#.

A value computed from other state is a property without a backing field. In C# you'd write
`int Doubled => count * 2;`; in TypeScript it's a getter:

```ts
get doubled() {
    return this.count * 2;
}
```

The markup stays `@doubled`. Since the render tree is rebuilt on every render, the getter is
re-evaluated every time, exactly like a C# computed property read from Razor markup.

> **Coming from Blazor:** TypeScript has no expression-bodied members, so `=> count * 2`
> becomes a getter with a `return`. Getters show up as ordinary members everywhere — in
> markup, in `@code`, and to the type checker, which infers `doubled: number` from the
> body.
