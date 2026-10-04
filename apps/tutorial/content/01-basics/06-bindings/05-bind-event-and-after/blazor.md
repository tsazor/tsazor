---
title: Binding while typing
keywords: @bind:event, @bind:after, oninput, @bind:set
focus: App.tsazor
gate: input input ap; wait 300
---

Search-as-you-type with the .NET 7 bind modifiers:

```tsazor
<input @bind="query" @bind:event="oninput" @bind:after="search" placeholder="Search for fruit" />
```

Type "ap". `@bind:event="oninput"` writes `query` on every keystroke; `@bind:after` runs
`search` once the new value is assigned, and awaits the returned promise before the
component renders — exactly Blazor's behavior, including the intermediate render
("Searching…").

The rest of the family works too: `@bind:get`/`@bind:set` as a pair, when you want to
intercept the write yourself, and `@bind-value:event` for the spelled-out form. The
combination rules are Blazor's as well — `@bind:after` together with `@bind:set` is an
error (call the after-logic from the setter instead).

> **Coming from Blazor:** the modifier values are TypeScript: `@bind:after="search"` is a
> method group bound to the component, `@bind:after="() => search(true)"` a lambda.
