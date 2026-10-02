# Design draft — `@Bindable` and `this.observe`

Status: **implemented** (2026-10-02, branch `feature/bindable-track`; see "Implementation notes"
at the end). Open decisions resolved as recommended. Two Tsazor extensions under the v1 superset rule
(design-principles, "Parity first, then scale"). Both live on the TypeScript side. Markup is
untouched, every valid `.razor` construct keeps its meaning, and each extension desugars to the
Blazor form with identical semantics. The codemod keeps emitting the Blazor form; the LSP offers
the extension as a quick fix.

---

## 1. `@Bindable` — two-way component parameters in one line

### Problem

A bindable component parameter needs a pair today, plus a helper that invokes the callback:

```razor
@code {
    @Parameter() value = 0;
    @Parameter() valueChanged?: EventCallback<number>;

    async change(delta: number) {
        await this.valueChanged?.invokeAsync(this.value + delta);
    }
}
```

That is three concepts (parameter, callback parameter, invocation) for one idea: "this value is
two-way". It is noise for Blazor developers and opaque for TypeScript developers.

### Proposal

```razor
@code {
    @Bindable() accessor value = 0;

    change(delta: number) {
        this.value += delta;
    }
}
```

The parent is unchanged: `<Stepper @bind-Value="guests" />`, including `:after`, `:get`/`:set`
and `:event`.

### Semantics (desugaring)

`@Bindable() accessor value: T = init` is exactly:

```ts
@Parameter() value: T = init;
@Parameter() valueChanged?: EventCallback<T>;
```

plus one behavior: **assigning `this.value` inside the component** sets the local value and then
invokes `valueChanged` with it.

- **Runtime assignment is different.** When the parent passes parameters, the runtime writes the
  backing storage directly, so no callback fires.
- **Same value, no callback.** If the new value equals the current one (`Object.is`), nothing is
  invoked. This prevents echo loops with parents that normalize the value.
- **Fire and forget.** A setter cannot be awaited, so the callback runs in the background. Its
  errors go to the same error path as an `EventCallback` from an event handler (`ErrorBoundary`).
  Code that needs to await calls `await this.valueChanged?.invokeAsync(v)` explicitly; the
  synthesized parameter is a real, typed member.
- **Unbound use works.** Without a parent binding (`valueChanged` unset), the local value simply
  changes. The component works as a self-contained input ("uncontrolled"), the way Vue's
  `defineModel` behaves.
- **Rendering.** The setter does not call `stateHasChanged` itself. From an event handler the
  normal re-render after the handler applies, and the parent's re-render cascades the value down.
  From an external source, `this.observe` (part 2) covers it.

Options:
- `@Bindable({ changed: "onPick" })` names the callback differently (`@bind-Value:event="OnPick"`).
- `@Bindable({ expression: true })` also synthesizes `valueExpression`, for `InputBase`-style
  components that cooperate with `EditContext`.

### Why `accessor`

Standard (TC39) **field** decorators cannot intercept assignments; only **auto-accessor**
decorators can. `accessor` is standard TypeScript (5.0+), not a Tsazor dialect. A plain field with
`@Bindable()` is error TZS0xx with a quick fix that inserts `accessor`.

### Work

- **Runtime:** the decorator, backing-store writes in `setParametersAsync`, and the callback
  invocation in the setter.
- **Compiler/workspace (2.1 metadata):** `@Bindable` contributes two parameters, so
  `@bind-Value` resolves and type-checks against the pair.
- **Typed shadows / LSP:** hover shows the desugared pair, plus the quick fixes "convert pair to
  `@Bindable`" and "insert `accessor`".
- **Docs:** language reference (marked "Tsazor extension"), plus the Bindings tutorial lesson.

---

## 2. `this.observe` — external sources bound to the component lifetime

### Problem

Data that arrives from outside an event handler or lifecycle method — stores, timers,
WebSockets, server events — needs a subscription, `stateHasChanged()` on each notification, and
unsubscribing in `dispose()`. `apps/sleipnir-ticker` repeats this in every page:

```razor
@code {
    private unsub: () => void = () => {};
    protected override onInitialized(): void {
        this.unsub = this.Store.subscribe(() => this.stateHasChanged());
    }
    dispose(): void { this.unsub(); }
}
```

If you forget the `dispose`, it leaks; if you forget `stateHasChanged`, the page doesn't update.
This is the main thing developers coming from fine-grained reactive frameworks trip over.

### Proposal: two layers

**Layer 1: `this.disposeSignal`** is an `AbortSignal` that aborts when the component is disposed.
It is plain web platform, so everything that accepts a signal tears itself down:

```ts
addEventListener("resize", this.onResize, { signal: this.disposeSignal });
const res = await fetch(url, { signal: this.disposeSignal });
```

**Layer 2: `this.observe(source, onNext?)`** subscribes, re-renders on every notification, and
unsubscribes on dispose:

```razor
@code {
    protected override onInitialized(): void {
        this.observe(this.Store);
    }
}
```

```ts
this.observe(client.market.tickerUpdated(), (snapshot) => this.last = snapshot);
```

### Supported sources (structural, no imports needed)

| Shape | Examples |
|---|---|
| `subscribe(listener) → () => void` | Svelte-style stores, the ticker's `TickerStore`, Zustand |
| `subscribe(observer) → { unsubscribe() }` | RxJS, TC39 Observable |
| `subscribe(…) → Promise<{ unsubscribe() }>` | async handshakes (Sleipnir events) |
| `(signal: AbortSignal, notify: () => void) => void` | escape hatch, e.g. a timer: `this.observe((signal, notify) => { const id = setInterval(notify, 1000); signal.addEventListener("abort", () => clearInterval(id)); })` |

An `EventTarget` doesn't need `observe`; layer 1 handles it.

### Semantics

- **Render coalescing.** Notifications schedule `stateHasChanged` through the render queue (B2).
  A burst of notifications in one tick gives one render.
- **Handler order.** `onNext` runs first, then the render is scheduled. Errors in `onNext` follow
  the lifecycle error path (`ErrorBoundary`).
- **Teardown.** On dispose, every observed subscription is torn down. If an async subscription
  resolves after dispose, it is unsubscribed immediately.
- **Early stop.** The return value stops observing early.
- **When to call.** Calls after dispose are a no-op with a dev-mode warning. Calling `observe` in
  `onParametersSet` creates a new subscription on every parameter change; in dev mode this warns
  when the same source is observed twice (see the open decisions below).
- **Blazor equivalent:** `IDisposable` + subscribe + `InvokeAsync(StateHasChanged)` + unsubscribe
  in `Dispose`. `observe` is exactly that, written once.

### Relation to Sleipnir (roadmap-sleipnir T3)

T3 then needs no separate lifecycle machinery. Generated event methods return a source that
`observe` understands, and `disposeSignal` flows into calls once U3 adds `signal` options.

### Work

- **Runtime:** `disposeSignal`, `observe` and dispose integration in `ComponentBase`; the dev
  warnings.
- **`@tsazor/testing`:** a fake-store helper plus `waitUntilIdle` coverage.
- **Docs:** language reference ("Tsazor extension"). Tutorial: a new lesson "External data" in
  chapter 2 (State & rendering), after "Async work".
- **Migration of `apps/sleipnir-ticker`:** pages drop `unsub`/`dispose`.

---

## Tutorial impact

- **TS track:** teaches `@Bindable` and `observe` as the normal way, and shows the explicit pair
  only as "what it means".
- **Blazor track:** teaches the familiar pair first, then the extension as "the short form".
- **Lesson changes:** the M2 lesson "Component bindings" gets the update, and chapter 2 gets the
  new lesson "External data".

## Decisions (2026-10-02, as recommended)

| Question | Decision |
|---|---|
| Name: `@Bindable`, `@Model`, `@TwoWay`? | `@Bindable` (says what the parent can do: `@bind-…`) |
| Name of the signal: `disposeSignal`, `lifetimeSignal`, `disposal`? | `disposeSignal` (mirrors `dispose()`) |
| Skip the callback for equal values? | yes (`Object.is`) |
| `observe` deduplication: per source identity, or a warning only? | warning only in v1 (explicit beats magic) |
| `observe` as a `ComponentBase` method or a free function `observe(this, …)`? | method, since the cost is small and it is discoverable |
| Name of the method: `track` or `observe`? (2026-10-02, after implementation) | `observe` (renamed from `track`: `track` is a common domain word — a music track, a shipment, the tutorial's learning track — and collided with a component parameter in the first port; types follow: `ObserveSource`, `ObserveListener`, `ObserveTeardown`) |

## Implementation notes (2026-10-02)

Implemented as designed; the points below are where the design left room or where the
implementation had to choose.

- **Diagnostic:** `@Bindable()` on a non-accessor is **TZS030** (error, fix "Insert
  'accessor'"); at runtime the decorator throws with the same advice.
- **Typed member:** a decorator cannot add members to a class type. In a `.tsazor` the
  compiler emits `declare valueChanged?: EventCallback<T>` (and `valueExpression?: string`)
  unless `@code` declares it; a plain `.ts` class writes that line itself when it uses the
  member. `T` is the annotation or the literal initializer's type, else `unknown`.
- **Backing storage:** the decorator keeps the value in a symbol-keyed slot
  (`Symbol.for("tsazor.bindable.<name>")`) instead of the accessor's private storage, so a
  hot-swapped class still reads an existing instance; parameter sets write that slot
  (`ParameterMeta.store`).
- **Callback errors:** routed through a new internal `RenderHandle.reportError` with phase
  `event`, attributed to the component that assigned; the callback promise is tracked by
  `waitUntilIdle`. A plain function as the callback (hand-built trees) is accepted too.
- **`observe` sources:** the listener is callable and carries `next`/`error`/`complete` and
  Sleipnir's `onNext`/`onError`/`onComplete`, so all four shapes need no adapter. Source
  errors and a rejected handshake take the lifecycle path like `onNext` errors; an
  unsubscribe that throws during disposal is a `dispose` error.
- **`waitUntilIdle`:** a pending async handshake is *not* tracked (an open-ended
  subscription must not stall idle detection or a future prerender).
- **Order on dispose:** `disposeSignal` aborts and observed subscriptions end *before* the
  component's own `dispose`/`disposeAsync` runs.
- **Dev mode:** `import.meta.env.DEV` (Vite, Vitest); the warnings are compiled out of
  production bundles.
- **Bind type check:** `@bind-X` values (and `:get`) are now checked against the target
  parameter's type in the typed shadow — for the explicit pair and `@Bindable` alike.
- **Tutorial:** "External data" is lesson 05 of chapter 2, directly after "Async work"
  (Lifecycle moved to 06). The tutorial's `track` parameter was renamed (`lessonTrack`): a
  component member named like a new `ComponentBase` method overrides it (port-findings M.1) — which led to the rename `track` ⇒ `observe` (Decisions).
- **Bundle:** bench 24.79 → 25.28 KB gz (+0.49): `observe`/`disposeSignal` live on
  `ComponentBase` and are not tree-shaken; `@Bindable` is.
