---
title: Passing values down
focus: App.tsazor
gate: check input
---

`App` knows the theme; `ThemedButton`, two levels down, needs it. You could add a `theme`
parameter to `Toolbar` just to hand it on — and to every component in between, in every app
that uses the buttons. That's tedious, and it couples components that don't care about themes.

A *cascading value* skips the levels in between. Wrap the part of the tree that should see the
theme:

```tsazor
<CascadingValue Value="@theme">
    <Toolbar />
</CascadingValue>
```

and let the button ask for it:

```ts
@CascadingParameter() theme = "light";
```

Tick "Dark mode": both buttons switch, and `Toolbar` didn't change at all. Every component
below the `<CascadingValue>` can declare a `@CascadingParameter()`, at any depth; the
initializer is the value it uses when no cascade is around.

When the value changes, the components that use it update — the ones in between don't even
re-render: `Toolbar` has no parameters that changed, so it's skipped, and each button gets its
new `theme` directly. If a value never changes, say so with `IsFixed="true"`: consumers then
don't subscribe at all, which is cheaper.

Cascades are the right tool for things a whole subtree shares — a theme, the signed-in user, a
form's state. For data that one parent hands to one child, a parameter is clearer: you can see
where it comes from.
