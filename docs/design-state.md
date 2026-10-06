# Design draft — `@State` (F6): fields that render their component

Status: **proposal** (2026-10-06). F6 in [design-svelte-features.md](design-svelte-features.md),
planned for v1 (decision D4). A Tsazor extension under the v1 superset rule: markup untouched,
nothing in Blazor changes meaning, and the Blazor form (`stateHasChanged()`) keeps working.

## Problem

A component re-renders after its event handlers, after parameter changes and when it calls
`stateHasChanged()`. A change anywhere else — a timer, a callback, a WebSocket message, a
promise that settles outside a lifecycle method — needs the explicit call:

```ts
setInterval(() => {
    this.seconds++;
    this.stateHasChanged();
}, 1000);
```

Forgetting it is the most common "the screen doesn't update" bug for Blazor beginners, and it
looks archaic to developers who come from Svelte or Vue. `this.observe` (2026-10-02) covers
external *sources*; what remains is the component's own fields.

## Proposal

```ts
@State() accessor seconds = 0;

start() {
    setInterval(() => this.seconds++, 1000);
}
```

Assigning a `@State` field schedules a render of its component, exactly as if
`stateHasChanged()` were called after the assignment.

## Semantics

- **Desugaring.** `this.seconds = v` is `set backing; if changed, this.stateHasChanged()`. So
  everything `stateHasChanged` does applies: renders are queued and coalesced (ten assignments in
  a row render once), `shouldRender()` is consulted, a disposed component ignores it.
- **Changed** means `!Object.is(old, new)`. Assigning the same value does nothing.
- **Shallow, on purpose.** Only assignment to the field counts. `this.items.push(x)` or
  `this.user.name = "x"` are not seen — no proxies (identity problems, `#private` members,
  cost, debugging). Write `this.items = [...this.items, x]`, or call `stateHasChanged()`.
  Svelte 5's `$state` is deep; Tsazor deliberately isn't, and the tutorial says so.
- **Quiet phases.** No render is scheduled while the component builds its render tree (an
  assignment there would loop) or before its first render (the first render comes anyway).
  Inside event handlers and lifecycle methods it is harmless: the render that follows anyway
  absorbs the queued one.
- **Needs `accessor`**, like `@Bindable()`: standard field decorators cannot intercept
  assignments. A plain field with `@State()` throws at class definition with the fix in the
  message, and the compiler/LSP report it earlier (TZS030, see below).
- **Not a parameter.** `@State()` and `@Parameter()`/`@Bindable()` on one member is an error:
  a parameter is the parent's value and is overwritten on the next parent render.
- **Hot reload** keeps the value (stable `Symbol.for` key, as `@Bindable`).
- **Typing:** `State(): <This extends ComponentBase, V>(target, context:
  ClassAccessorDecoratorContext<This, V>) => …` — usable only in components.

## Not included

- Deep reactivity, computed/derived state, effects. `@code` getters already derive values on
  each render (tutorial "Derived values").
- Automatic `@State` for all fields (a class-level switch). Too much magic for Blazor
  developers reading the code; the explicit decorator marks exactly the fields that render.
- Making `@Bindable` render by itself. It keeps its documented semantics.

## Diagnostics

- `@State()` on a member without `accessor`: compile-time error in the `@code` analysis, the
  TZS030, the check `@Bindable` already has.
- `@State()` together with `@Parameter()`/`@Bindable()`: same error class.

## Tutorial

One lesson in *State & rendering*, right after "When a component renders": the timer from
that lesson, rewritten with `@State() accessor seconds`, plus the shallow rule (a `push` that
doesn't render, and the fix). Blazor track: "Blazor has no counterpart; `StateHasChanged()`
keeps working."

## Decisions needed

| # | Question | Recommendation |
|---|---|---|
| S1 | Name | `@State()` (reads like Svelte's `$state`; no clash with Blazor's `[PersistentState]`, which is about prerendering) |
| S2 | Shallow only | yes (above) |
| S3 | Lesson placement | new lesson after "When a component renders" |
