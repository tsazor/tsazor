# Design: Virtualize at Blazor 11 parity

Status: **decided** (owner, 2026-10-09; §7), in progress. This is the core step of
[design-library-completeness.md](design-library-completeness.md). The behavior is specified, with source lines, in
[blazor-virtualize-net11.md](blazor-virtualize-net11.md) (cited as *spec §n*).

## 1. Why

The AgentView dogfood needs a live event feed and a chat. Both are lists whose rows differ in height and that follow
new rows at the bottom. Tsazor's `Virtualize` assumes a fixed `itemSize` and doesn't follow. The parity baseline is
Blazor 11 (owner, 2026-10-09). There, `Virtualize` measures what it renders and has `AnchorMode.End`, so what the
dogfood asked for is parity, not a Tsazor extension.

## 2. What Blazor 11 has and Tsazor lacks

| Area | Blazor 11 | Tsazor today |
|---|---|---|
| API | generic `Virtualize<TItem>`; `ChildContent`/`ItemContent`, `Placeholder`, `EmptyContent`, `OverscanCount` (15), `MaxItemCount` (100), `AnchorMode`, `ItemComparer`, `InitialItemIndex`, `ScrollToItemAsync` | `unknown` items, `ItemTemplate`, `Overscan` (3) |
| Measurement | a running average over rendered windows; `ItemSize` is only the first estimate (spec §3) | fixed `itemSize` |
| Viewport loop | IntersectionObserver on the spacers (50px margin), ResizeObserver re-trigger, 50 ms throttle (spec §4) | scroll events, own math |
| Provider | cancelled when superseded, look-ahead, placeholders while loading, prepend/append detection (spec §5) | superseded results dropped, no signal, no placeholders |
| Anchoring | native `overflow-anchor` with guards against compensating twice; a manual path for tables and browsers without it; snapshot/restore; the follow state machine; Home/End (spec §6) | none |
| Scroll APIs | `InitialItemIndex`, `ScrollToItemAsync` (spec §7) | none |
| Row identity | the item template is written inline, so `@key` survives a window slide | one region per row at a position-based sequence |

Two candidates for core findings turned out not to be core bugs:
- **CSP:** Blazor 11 avoids `style` attributes. Tsazor's renderer already writes `style` through the CSSOM under
  `strictCsp` (`dom-attributes.ts`).
- **Row identity:** a bug in the component. The fix is to write the template inline, as Blazor does.

## 3. Structure

One component, two parts that call each other synchronously (spec §10.5):

- **Window model** (pure TypeScript, no DOM): Blazor's C# half.
  - Item distribution, measurement, the provider orchestration, prepend/append detection, and the initial-index
    phases.
  - Driven by `spacerBeforeVisible`/`spacerAfterVisible(spacerSize, separation, containerSize, reason)`.
  - Blazor's 47 unit tests port to it almost 1:1.
- **Viewport driver** (DOM): Blazor's JS half.
  - Scroll-container detection, the observers and throttle, and the scale factor.
  - Spacer styles through the CSSOM, snapshot and restore, and drift correction.
  - Native or manual anchoring, the follow state, convergence, and input classification (Home/End).

What exists in Blazor only because of the .NET↔JS boundary is left out (spec §10.3):
- the interop wrappers and the disposal guards;
- the `data-blazor-virtualize-*` attributes with their MutationObserver;
- awaited follow-state queries.

The anchor restore runs in `onAfterRender`. Tsazor calls it synchronously after the DOM patch, before paint, which is
what Blazor's MutationObserver hook achieves on Server. The `Items` path stays synchronous, as Blazor's
`DefaultItemsProvider` is.

## 4. API

Markup follows Razor 1:1, code stays clean TypeScript:

| Blazor | Tsazor |
|---|---|
| `Items` | `items?: readonly TItem[]` |
| `ItemsProvider` | `(request: { startIndex; count; signal: AbortSignal }) => Promise<{ items?: Iterable<TItem>; totalItemCount?: number }>`. Both result fields stay optional as today, a Tsazor superset: an omitted total keeps the previous one (D-V3) |
| `ChildContent` / `ItemContent` | `(item: TItem) => RenderFragment`; `ItemContent` wins. `ItemTemplate` stays as an alias (D-V2) |
| `Placeholder` | `(context: { index: number; size: number }) => RenderFragment` |
| `EmptyContent` | `RenderFragment` |
| `ItemSize`, `OverscanCount`, `MaxItemCount`, `SpacerElement`, `InitialItemIndex` | same names; defaults 50, 15, 100, `"div"`, 0. `Overscan` stays as an alias of `OverscanCount` (D-V2) |
| `AnchorMode` | `VirtualizeAnchorMode = { None: 0, Start: 1, End: 2 } as const` (flags, `Start \| End` works); default `Start` |
| `ItemComparer` | `(a: TItem, b: TItem) => boolean`, default `Object.is` |
| `RefreshDataAsync()` | `refreshData(): Promise<void>` |
| `ScrollToItemAsync(index, token)` | `scrollToItem(index, signal?): Promise<void>`. It throws before the first render, and rejects only when `signal` aborts. A superseded call resolves, and so does one that a user scroll overrides |

**Aliases (D-V2):** `ItemTemplate` and `Overscan` are Tsazor's earlier names. They keep working, and the docs show
Blazor's names. Precedence: `ItemContent` › `ChildContent` › `ItemTemplate`. `Overscan` applies when set, and setting
both `Overscan` and `OverscanCount` is an error.

`Virtualize<TItem>` is a generic runtime class. The manifest lists `TItem`, and the compiler infers it from `Items` or
`ItemsProvider` as it does for other generic components, so the item context is typed (it is `any` today).

## 5. Other parts

- **DataGrid** in both skins: QuickGrid 11 passes `AnchorMode`, `InitialItemIndex`, `ItemComparer` and `OverscanCount`
  (default 3 there) to its Virtualize. The skins do the same (D-V6).
- **Callers:** both DataGrid skins, the demo, the tutorial's DataGrid lesson, the language reference and the
  CHANGELOG move to the new names.
- **Tutorial:** a lesson for long lists, with a live feed that follows the bottom (`AnchorMode.End`), rows of different
  heights, and `scrollToItem`.
- **The rest of the library:** the chat and feed patterns of AgentView then need no library component of their own.

## 6. Where Tsazor deviates from Blazor 11 (D-V4)

The owner chose to fix Blazor's probable bugs (spec appendix A) rather than copy them. Each deviation has a test
that shows the better behavior. Where a Blazor test asserts the bug, the port asserts the fix and says so.

| # | Blazor 11 | Tsazor |
|---|---|---|
| A1 | NaN or ∞ in a measurement poisons the average (the guard checks `<= 0` only) | only finite, positive measurements count |
| A2 | rows beyond the window can render while a load is pending (`Skip/Take` over a longer loaded slice) | the rendered rows are clamped to the window |
| A3 | `PlaceholderContext.Size` is the last window's recalibrated size, while spacers and the built-in placeholder use the average | one size, the average, everywhere |
| A4 | changing `ItemSize` resets the average but not the recalibrated size | both reset |
| A5 | a grown list whose item at the compared index changed counts as a prepend of the whole difference, so mixed insertions shift wrongly | the shift is where the previously first row is now (found by identity for `Items`, by `ItemComparer` in the provider's result), else the old rule |
| A6 | deleting rows above the viewport isn't compensated (#66509; the test is skipped) | compensated the same way: the visible row stays (the skipped test runs and passes) |
| A7 | built-in placeholder heights are applied only when a spacer changes | applied with every render (styles go through the CSSOM after each patch) |
| A8 | a container that changes size adapts only at the next spacer crossing | a ResizeObserver on the scroll container re-checks the window |
| A9 | the "initial index not yet started" guard covers only the before spacer | both spacers |

Not bugs, so kept: `Items` mode compares by identity, not by `ItemComparer` (Blazor's design); the 50 ms throttle; the
test-page quirks of spec appendix A.12 are fixed in the ported tests, not in the component.

## 7. Order

1. The window model with Blazor's unit tests.
2. The viewport driver and the render: spacers, the inline template, placeholders, `EmptyContent`, the loop breaker.
   Then the new API with its callers.
3. Anchoring: native and manual, snapshot/restore, the follow state, convergence, Home/End.
4. `InitialItemIndex` and `scrollToItem`.
5. The parity gate (D-V5) and the DataGrid parameters.
6. Tutorial, docs, CHANGELOG.

Each step ends green: unit tests, `pnpm gates`, `api:check`.

## 8. Decisions

| # | Question | Decision (owner, 2026-10-09) |
|---|---|---|
| D-V1 | Parity baseline | **Blazor 11** (`release/11.0`) |
| D-V2 | `Overscan` and `ItemTemplate` | Blazor's names, and the old ones stay as aliases (§4) |
| D-V3 | `ItemsProvider` result | `signal` in the request, as Blazor's token. Both result fields stay optional, as a Tsazor superset |
| D-V4 | Blazor's probable bugs | **Fix all of them** (§6), each with a test |
| D-V5 | Tests | Port all of Blazor's tests. The 47 unit tests go against the window model. The 135 E2E tests and their 20 pages go into a new gate app, `apps/blazor-parity`, a home for Blazor's own E2E suites, with Virtualize first. The 33 QuickGrid tests go against the DataGrid skins. The gate runs in Edge, Firefox and WebKit |
| D-V6 | DataGrid | Mirror QuickGrid 11: `AnchorMode`, `InitialItemIndex`, `ItemComparer`, `OverscanCount` (default 3), passed to Virtualize |
