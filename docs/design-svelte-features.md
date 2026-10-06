# Design draft — Svelte-style features ("Svelte magic")

Status: **accepted** (2026-10-02, decisions D1–D4 below). Scheduled after `@Bindable`/`this.observe`
([design-bindable-observe.md](design-bindable-observe.md)), in parallel with tutorial M3.

JavaScript allows things C# makes hard: functions as values everywhere, cheap closures, direct
DOM access. Svelte uses this for features Blazor doesn't have at all. This document takes over what
fits the v1 rules ([design-principles.md](design-principles.md), "Parity first, then scale") and
defers the rest.

---

## Finding: the `@` attribute namespace (verified 2026-10-02)

Probe with the .NET 10 SDK (`dotnet build`, generated `*.razor.g.cs` inspected) and Edge:

- Razor does **not** reject unknown directive attributes. `<div @transition="fade">` compiles
  without a diagnostic. In static markup it ends up literally inside `AddMarkupContent`, and with a
  dynamic value it becomes `AddAttribute(n, "@attach", value)`. The browser accepts it; even
  `setAttribute("@attach", …)` doesn't throw in current Edge. So in Blazor, the construct has a
  meaning, if a useless one: "render an attribute literally named `@x`".
- Tsazor already reports unknown directive attributes as **TZS001**, an existing (undocumented)
  deviation.
- Microsoft itself extends exactly this namespace (`@formname` and `@rendermode` in .NET 8) and
  treats it as Razor's directive-attribute namespace.

**Consequence.** Strictly, `@transition` and friends are not "syntax Razor rejects". They are
"syntax with no sensible use in Blazor". The proposal treats the `@` namespace as reserved for
directive attributes, as Microsoft does, documents TZS001 as a deviation, and picks names Blazor is
unlikely to claim later. The alternative is component-only forms (`<Transition>`), which keep
markup pure Razor but are clumsier. → **Decision needed (D1).**

---

## F1 — Compiler: static markup and update hints

**F1a — Parity (gap).** Razor collapses static HTML into one `AddMarkupContent` frame (one HTML
string, inserted once, compared as one frame in the diff). Tsazor emits a full element/attribute/
text frame sequence for static subtrees. Closing this gap is Blazor parity and a performance win:
fewer frames, less diff work, and DOM creation via a parsed template.

**F1b — Beyond Razor (invisible).** The compiler knows which attributes and text nodes are
dynamic. It can emit update hints (Vue calls them "patch flags"), so the diff compares only those
frames, and it can hoist static frame sequences out of `buildRenderTree`. Semantics stay unchanged;
the conformance suite and benchmarks are the gate.

This comes first: it has the largest benefit, no API, and no risk to ports.

## F2 — `@attach` (Svelte actions/attachments)

```razor
<input @attach="autofocus" />
<button @attach="tooltip('Save the document')">Save</button>

@code {
    autofocus = (el: HTMLElement) => el.focus();
}
```

- Type: `Attachment<E extends Element = Element> = (el: E) => void | (() => void)`.
- Runs after the element is inserted, in the same phase as `onAfterRender`. The returned function
  is the cleanup, called when the element is removed or the component is disposed.
- **Changing the value** (a different function identity) runs the cleanup and then attaches anew.
  For factories with arguments (`tooltip('…')`) the call is re-evaluated each render, so the
  factory should memoize, or the component holds the attachment in a field. Svelte 5
  attachments behave the same way; the tutorial teaches it that way.
- Several attachments per element: **the named form** (decided 2026-10-06) — `@attach="autofocus"`
  plus `@attach:tooltip="tooltip('Save')"`; the name after the colon only tells them apart
  (Razor's directive-attribute grammar, as in `@bind:event`), and each one is updated and cleaned
  up on its own.
- Replaces most `@ref` + `onAfterRender` + `dispose` wrappers for imperative widgets.

**Implemented** (2026-10-06): `Attachment<E>` and `addAttachment` in `@tsazor/runtime`
([language reference](language-reference.md#attach-tsazor-extension), tutorial chapter
*Attachments* in Advanced). Decisions made on the way: an attachment frame (`FrameType.Attachment`)
in the element's attribute run, diffed like an attribute by identity (the same function is no
edit); the applier only queues attachment work — attaching and cleanup run at the batch end
before the `onAfterRender` calls, so a rolled-back pass drops what it queued, and an element a
later pass of the same batch removed is never attached; removal is found by checking the
component's attached elements after a pass that removed something; the attachment support
installs itself on the first `addAttachment` (apps without `@attach` don't bundle it). A member
method is bound like a delegate parameter (stable identity). Typed shadows pass the tag's
interface as the type argument. Diagnostics: no value TZS009; duplicate name, `@attach:` without
a name and `@attach` on a component tag TZS008. Rows with `@attach` are excluded from H2 and
static markup blocks.

## F3 — `<Await>` (Svelte `{#await}`)

A built-in component, so the markup stays pure Razor and no D1 decision is needed:

```razor
<Await For="@user">
    <Pending><Spinner /></Pending>
    <Then Context="u">Hello @u.name</Then>
    <Catch Context="err">Failed: @err.message</Catch>
</Await>
```

- A new promise identity resets to `Pending`. A stale promise that resolves late is ignored
  (latest wins).
- Typed: `Then` gets `T` from `Promise<T>` through the 2.3 templated-component inference, with
  explicit `TItem` as the fallback.

**Implemented** (2026-10-06): `Await<TValue>` in `@tsazor/runtime`
([language reference](language-reference.md#await-tsazor-extension), tutorial lesson *Await*
in Logic). Decisions made on the way: a rejection without `Catch` fails the component (nearest
`ErrorBoundary`) instead of being swallowed; `null`/`undefined` renders `Pending` ("no promise
yet"); an already settled promise renders `Pending` for one microtask (no synchronous peek);
the type parameter is `TValue`, inferred through the awaited type of `For`; the `Catch`
context is `unknown`; the parameters are write-only (setters), so the instance is no thenable.

## F4 — `@transition`, `@in`, `@out`

```razor
@if (visible) {
    <div @transition="fade">fades in and out</div>
    <p @in="fly({ y: 200, duration: 2000 })" @out="fade">flies in, fades out</p>
}
```

- **Built-ins** (`@tsazor/runtime/transition`, tree-shakable): `fade`, `fly`, `slide`, `scale`,
  `blur`, `draw` (SVG), plus `crossfade` for send/receive pairs.
- **Custom transitions** use Svelte's contract: `(node, params) => { delay?, duration?, easing?,
  css?: (t, u) => string, tick?: (t, u) => void }`. `css` is preferred because it compiles to Web
  Animations or CSS keyframes and runs off the main thread.
- **Runtime core.** Leaving elements stay in the DOM until their outro has finished; this hooks
  into the DOM applier's removal path (logical ranges, B3). Reversing mid-flight (an intro during
  an outro) continues from the current `t`. This is the real cost of the feature.
- **Local by default.** A transition only runs when its own block is added or removed, not when a
  parent block is. A `global` modifier is also available, as in Svelte.
- Events: `onintrostart`, `onintroend`, `onoutrostart`, `onoutroend`, as ordinary `@on…` handlers.
- `prefers-reduced-motion` is respected by default (duration 0), with an opt-out.

**Implemented** (2026-10-06): `@tsazor/runtime` + `/transition` + `/easing`
([language reference](language-reference.md#transition-in-out-tsazor-extension), tutorial
chapter *Transitions* in Advanced). Implementation decisions:

- **Value form.** The directive's value is a `Transition<E>`: `(element, { direction }) =>
  TransitionConfig | (() => TransitionConfig)`. Parameters are bound by a call:
  `@in="fly({ y: 200 })"`. The built-ins are overloaded — `fade` is a transition, `fade({ duration:
  400 })` returns one — so both spellings work. The value is read when the transition starts, so
  a new function identity each render costs nothing (unlike `@attach`).
- **`global` is a valueless modifier**, Razor's `@onclick:preventDefault` form:
  `<p @transition="fade" @transition:global>`. Same for `@in:global` and `@out:global`.
- **"Local" means local to the component.** Razor emits control flow as flat frames, so the
  runtime cannot tell which `@if` removed an element. A local transition plays whenever its own
  component's render adds or removes the element, also as part of a removed parent element; it
  does not play on the component's first render or when the component itself is removed. A
  `global` one plays in those cases too, except on the app's initial render. Deviation from
  Svelte: toggling an outer `@if` of the same component plays an inner block's local transition.
- **Leaving elements** stay in the DOM, marked as leaving; the applier's sibling indexing skips
  them, so the diff never sees them. They are removed when their last outro ends. A pass that
  rolls back unmarks them. Event handlers stay live until removal; the component may already
  be disposed (`global` outro of a removed component), then its handlers no longer run.
- **Timing.** Intros and outros start at the batch end, after attachments, before
  `onAfterRender`. `css` runs on the Web Animations API (the `css` string sampled into
  keyframes, as Svelte 5 does); `tick` runs on `requestAnimationFrame`. Without Web Animations
  (test DOMs) `css` is skipped and only the timing and `tick` remain.
- **Reversal.** An element with `@transition` that is removed during its intro runs its outro
  from the current `t` (and the other way round never happens: a re-added element is a new
  element). Separate `@in`/`@out` don't reverse; the intro is cancelled.
- **Events** are DOM events on the element (`introstart`, `introend`, `outrostart`,
  `outroend`), handled with `@onintrostart` etc.
- **Reduced motion:** `configureTransitions({ reducedMotion: "ignore" })` opts out; by default a
  `prefers-reduced-motion: reduce` user gets duration 0.
- **Modules:** `@tsazor/runtime/transition` (`fade`, `fly`, `slide`, `scale`, `blur`, `draw`,
  `crossfade`), `@tsazor/runtime/animate` (`flip`), `@tsazor/runtime/easing` (Svelte's easing
  set). The transition support itself installs on the first transition frame (tree-shaken like
  `@attach`).

## F5 — `@animate` (keyed list reordering)

```razor
@foreach (var todo in todos) {
    <li @key="todo.id" @animate="flip">@todo.text</li>
}
```

- FLIP animation when keyed items move. It is only valid on the direct child of a keyed loop, and
  is a diagnostic otherwise.
- Built-in `flip`, custom ones with the same contract as F4.

**Implemented** (2026-10-06): `addAnimate`, `Animate<E>`, `@tsazor/runtime/animate`
([language reference](language-reference.md#animate-tsazor-extension), tutorial chapter
*Animations*). Rows are measured before the first structural edit of their level in a pass and
again at the batch end; a moved row plays its animation (0 → 1). A leaving row with `@animate`
is taken out of the flow during its outro (Svelte's `fix_position`). "Directly inside a keyed
loop" means an element child of a `@foreach`/`@for` body that has `@key`; elsewhere TZS008.

## F6 — `@State` (opt-in automatic re-render), **planned for v1** (D4)

`@State() accessor count = 0` would schedule a render on assignment, which would also work from
timers. It is technically a superset (only extra, coalesced renders). **Deliberately not deep**: no
proxies, no `items.push` detection (identity problems, conflicts with `#private`, cost, hard to
debug). Svelte 5 itself moved away from implicit `$:` magic to explicit runes. Decide once
`this.observe` has shown in the tutorial and the ticker how much need remains.

## Not planned

- Deep reactivity via proxies (see F6).
- `$store` auto-subscription syntax: `$store` is an ordinary identifier in TS, and `this.observe` is
  the equivalent.
- `transition:fade` / `class:active` / `bind:clientWidth` attribute forms: these are ordinary
  attributes in Razor, and reinterpreting them is off-limits.
- **Post-1.0:** fine-grained reactivity instead of component-level diffing, the one big divergence
  that needs its own decision record.

## Tutorial

New chapters modelled on Svelte's (Part 2): *Attachments* (F2), *Transitions* (F4: directive,
parameters, in/out, custom CSS, custom JS, events, global), *Animations* (F5), and an *Await*
lesson in Logic or Reusing content (F3). Built after the features land. Both tracks;
the Blazor track explains that Blazor has no counterpart.

## Order

1. F1a (parity) → F1b
2. F2 `@attach`, F3 `<Await>`
3. F4 `@transition`/`@in`/`@out` (after D1), then F5 `@animate`
4. F6 `@State` (shallow, opt-in; design detail in its own short doc before implementation)

## Decisions (2026-10-02)

| # | Question | Decision |
|---|---|---|
| D1 | Treat the `@` attribute namespace as reserved for directive attributes, or only component forms? | **reserve it** (like Microsoft); document TZS001 as a deviation; component forms only where natural (`<Await>`) |
| D2 | `@attach` or `@use`? | **`@attach`** (Svelte 5 naming; `use` is generic) |
| D3 | Built-in transition set for v1 | **Svelte set:** `fade`, `fly`, `slide`, `scale`, `blur`, `draw`, `crossfade`, `flip` |
| D4 | F6 `@State` | **planned for v1** (user decision; the recommendation was to defer) |
