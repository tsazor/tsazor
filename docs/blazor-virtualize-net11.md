# Blazor `Virtualize<TItem>` (.NET 11) — behavior specification for the Tsazor port

Basis for reimplementing Blazor's `Virtualize<TItem>` from `dotnet/aspnetcore` `release/11.0` as one TypeScript
component in Tsazor. Blazor splits it into a C# component (window/data logic) and a JS module (DOM observers,
anchoring); Tsazor has no interop boundary, so both halves become one component that touches the DOM directly.

## 0. Sources and conventions

Sources: `dotnet/aspnetcore` at `release/11.0` commit `da0ed6d` (2026-10-09; the Virtualization folder last changed in
`a65894d`, `Web.JS/src/Virtualize.ts` in `fbb625b`). Fetch a file with
`gh api "repos/dotnet/aspnetcore/contents/<path>?ref=da0ed6d28709b106841d3c629145407147b94dde" -H "Accept: application/vnd.github.raw"`.
Paths: `src/Components/Web/src/Virtualization/*.cs`, `src/Components/Web.JS/src/Virtualize.ts`,
`src/Components/Web/test/Virtualization/VirtualizeTest.cs`, `src/Components/test/E2ETest/Tests/VirtualizationTest.cs`,
`src/Components/test/testassets/BasicTestApp/Virtualization*.razor`. Citations:

| Prefix | File | Lines |
|---|---|---|
| `Virtualize.cs:N` | .NET 11 component | 1407 |
| `Virtualize.ts:N` | .NET 11 JS side (`Blazor._internal.Virtualize`) | 1063 (not ~1124) |
| `net10:N` | `Virtualize.net10.cs`, .NET 10 GA component | 480 |
| `Interop.cs:N` | `VirtualizeJsInterop.cs` | 167 |
| `VirtualizeTest.cs:N` | C# unit tests (47 tests) | 1820 |
| `VirtualizationTest.cs:N` | Selenium E2E tests (168 test methods) | 7268 |
| `<Page>.razor:N` | test pages in `testassets/` | — |

"C#" means the logic in `Virtualize.cs`, "JS" the logic in `Virtualize.ts`. The .NET 10 JS file was not downloaded,
so statements about "new since .NET 10" are only made for the C# side; JS-side changes are inferred from the C#
interop surface (`net10:209` passes no anchor mode; `net10:302,318` callbacks have no reason).

Terms used below:
- **window**: the slice `[itemsBefore, itemsBefore + visibleItemCapacity)` that is rendered (items or placeholders).
- **capacity**: `_visibleItemCapacity`, the number of slots in the window.
- **avg**: the running average item height (§3).
- **edge spacers**: `spacerBefore` (above the window) and `spacerAfter` (below it).
- **scroll element**: the nearest scrolling ancestor, or `document.documentElement` for window scrolling (§4.1).

---

## 1. Public API in .NET 11

### 1.1 Component

`public sealed class Virtualize<TItem> : ComponentBase, IAsyncDisposable` (Virtualize.cs:17), annotated
`[CacheBehavior(CacheBehavior.Throw)]` (Virtualize.cs:16) — **new** (not on net10:16). Its semantics are not in the
downloaded sources (presumably a .NET 11 render-output-caching opt-out that throws when Virtualize sits in a cached
region); irrelevant for Tsazor.

| Parameter | Type | Default | Notes / change since .NET 10 |
|---|---|---|---|
| `ChildContent` | `RenderFragment<TItem>?` | null | Item template. Unchanged (Virtualize.cs:103-104, net10:68-69). |
| `ItemContent` | `RenderFragment<TItem>?` | null | Item template; **wins over `ChildContent`** (`ItemContent ?? ChildContent`, Virtualize.cs:453). Unchanged. |
| `Placeholder` | `RenderFragment<PlaceholderContext>?` | null → built-in placeholder | Built-in placeholder changed: it now emits `<div data-blazor-virtualize-reserved-height="{avg}">` instead of `style="height:{_itemSize}px; flex-shrink:0"` (Virtualize.cs:1199-1204 vs net10:463-468), and its height is now the running average, not `_itemSize`. |
| `EmptyContent` | `RenderFragment?` | null | Shown when a load completed with `TotalItemCount == 0` (§2.4). Unchanged. |
| `ItemSize` | `float` | `50f` | Must be > 0, else `InvalidOperationException` on every `OnParametersSet` (Virtualize.cs:398-402). Role changed: it is now only the *initial estimate and fallback*; spacers use the measured running average (§3). **New:** changing the value resets the running average (Virtualize.cs:411-416). |
| `ItemsProvider` | `ItemsProviderDelegate<TItem>?` | null | Exactly one of `Items` / `ItemsProvider` is required (Virtualize.cs:423-451). **Changed:** request `Count` can exceed the capacity (look-ahead, §5.2) and extra requests can follow (prepend/tail adjustment, out-of-range re-clamp; §5). |
| `Items` | `ICollection<TItem>?` | null | Re-queried synchronously on every parameter set (Virtualize.cs:434-445). **New:** in-memory prepends/appends are detected and anchored (§5.5, §6). |
| `OverscanCount` | `int` | **`15`** | **Default changed from `3`** (net10:115 → Virtualize.cs:150). Means more DOM per list (window = viewport + 2×15 items). |
| `SpacerElement` | `string` | `"div"` | Tag of both spacers (`"tr"` inside `<tbody>`). Unchanged API (Virtualize.cs:161-162). |
| `MaxItemCount` | `int` | `100` | Existed in .NET 10 (net10:137-138). Effective cap is `MaxItemCount + 2×OverscanCount` (§4.5). Now overflow-safe (`long` math, Virtualize.cs:930) and also caps window growth (Virtualize.cs:807) and look-ahead (Virtualize.cs:945-947). |
| `AnchorMode` | `VirtualizeAnchorMode` | `Start` | **New.** Edge pinning (§6). |
| `ItemComparer` | `IEqualityComparer<TItem>` | `EqualityComparer<TItem>.Default` | **New.** Only used for `ItemsProvider` prepend/append detection (Virtualize.cs:1097). Analyzer **BL0011** warns when `ItemsProvider` is used without an explicit comparer (Virtualize.cs:194-196). `Items` mode always uses `EqualityComparer<TItem>.Default` (Virtualize.cs:1066). |
| `InitialItemIndex` | `int` | `0` | **New.** Applied once, on the first interactive render; `0` (or negative) = no initial scroll; out-of-range values clamp (Virtualize.cs:208-215; §7.1). |

| Method | Signature | Notes |
|---|---|---|
| `RefreshDataAsync` | `public Task RefreshDataAsync()` | Re-requests the current window, **does not re-render on success** (caller re-renders; Virtualize.cs:227-229). **New in .NET 11:** resets the running average (Virtualize.cs:230-231) and asks with `prefetchForPotentialPrepend: true` (look-ahead rows, §5.2); like every refresh it runs prepend/append detection (§5.5). |
| `ScrollToItemAsync` | `public Task ScrollToItemAsync(int itemIndex, CancellationToken cancellationToken = default)` | **New** (Virtualize.cs:247-264; §7.2). Throws synchronously before the first interactive render. |
| `DisposeAsync` | `public ValueTask DisposeAsync()` | Cancels the refresh; **new:** also cancels an in-flight scroll and the render rendezvous (Virtualize.cs:1354-1365). |

Validation messages (tested by `VirtualizeTest.cs:19-73`): "requires a positive value for parameter 'ItemSize'",
"can only accept one item source from its parameters", "requires either the 'Items' or 'ItemsProvider' parameters to be
specified and non-null".

### 1.2 Supporting public types (unchanged as far as the .NET 10 component's use shows: net10:241, 419-431)

```csharp
public readonly struct ItemsProviderRequest {          // ItemsProviderRequest.cs:9-41
    public int StartIndex { get; }                     // first index of the requested slice
    public int Count { get; }                          // requested count; "the actual number of provided items does not need to match"
    public CancellationToken CancellationToken { get; }
    public ItemsProviderRequest(int startIndex, int count, CancellationToken cancellationToken);
}
public readonly struct ItemsProviderResult<TItem> {    // ItemsProviderResult.cs:10-32
    public IEnumerable<TItem> Items { get; }
    public int TotalItemCount { get; }
    public ItemsProviderResult(IEnumerable<TItem> items, int totalItemCount);
}
public delegate ValueTask<ItemsProviderResult<TItem>> ItemsProviderDelegate<TItem>(ItemsProviderRequest request); // ItemsProviderDelegate.cs:12
public readonly struct PlaceholderContext {             // PlaceholderContext.cs:9-35
    public int Index { get; }                          // absolute item index of the placeholder
    public float Size { get; }                         // px (height for vertical lists)
    public PlaceholderContext(int index, float size = 0f);
}
[Flags] public enum VirtualizeAnchorMode { None = 0, Start = 1, End = 2 }   // VirtualizeAnchorMode.cs:10-33 — NEW
```

`VirtualizeAnchorMode` docs: `None` — "no edge pinning; the viewport stays at its current scroll position regardless of
item changes"; `Start` — "when the user is at or near the top and new items arrive at the start, the viewport stays
at the top showing the newest items"; `End` — "when the user is at or near the bottom and new items arrive at the end,
the viewport auto-scrolls to show them. If the user has scrolled away, auto-scroll disengages until they return to the
bottom". `Start | End` pins both edges (VirtualizeAnchorMode.cs:7-8). What "near" means numerically: §6.2.

### 1.3 Internal contract between C# and JS (relevant because Tsazor merges it)

- `enum SpacerVisibilityReason { UserScroll = 0, ProgrammaticScroll = 1, ViewportFill = 2, RenderedContentMeasurement = 3 }`
  (SpacerVisibilityReason.cs:10-32; JS mirror Virtualize.ts:21-26) — **new** (the .NET 10 callbacks had no reason, net10:302,318).
- `enum ViewportFillDirection { Covered = 0, Before = 1, After = 2 }` (ViewportFillDirection.cs:10-15; Virtualize.ts:28-32) — new.
- JS → C#: `OnSpacerBeforeVisible(spacerSize, spacerSeparation, containerSize, reason)` and
  `OnSpacerAfterVisible(...)` (Interop.cs:40-50; IVirtualizeJsCallbacks.cs:8-9).
- C# → JS (Interop.cs:29-95): `init(helper, spacerBefore, spacerAfter, anchorMode)` (JS default `rootMargin = 50`,
  never overridden, Virtualize.ts:71), `scrollToBottom`, `refreshObservers(isLoading)`, `setAnchorMode(mode)`,
  `restoreAnchor(onNextMutation)`, `alignToItem(localIndex) → ViewportFillDirection | null`, `beginProgrammaticScroll`,
  `isFollowingTop() → bool`, `isFollowingBottom() → bool`, `dispose`.

---

## 2. Rendering

### 2.1 Render tree (BuildRenderTree, Virtualize.cs:552-647)

Virtualize renders **no element of its own**: two spacers with the window between them, all as siblings in the
parent. Sequence numbers in brackets.

```
if (_refreshException != null) { clear it; throw it; }                      // :554-560 → renderer error handling
<{SpacerElement}[0] data-blazor-virtualize-reserved-height[1]="{px(itemsBefore)}" aria-hidden[2]="true" @ref[3]=spacerBefore />
lastItemIndex = min(itemsBefore + capacity, itemCount)                        // :568
region[3]:  placeholders for i in [itemsBefore, min(loadedItemsStartIndex, lastItemIndex))   // :570-582, seq = i
if (loadedItems != null && !loading && itemCount == 0 && EmptyContent != null)
    content[4]: EmptyContent                                                 // :586-589
else if (loadedItems != null && itemTemplate != null)
    region[5]: for item in loadedItems.Skip(itemsBefore - loadedStart).Take(lastItemIndex - loadedStart):
                   itemTemplate(item)(builder)   // inline, no wrapper, no AddContent   // :590-621
region[6]:  placeholders for the rest up to lastItemIndex                    // :625-633, seq = i
<{SpacerElement}[7] aria-hidden[8]="true" data-blazor-virtualize-reserved-height[9]="{px(itemsAfter)}"
     [data-blazor-virtualize-loop-breaker-transform[10]="{px(unusedItemCapacity)}" only if unused != 0]
     @ref[11]=spacerAfter />                                                 // :635-646
```

- `itemsAfter = max(0, itemCount − capacity − itemsBefore)` (Virtualize.cs:635) — computed from the **capacity**, not
  from the number of items actually rendered.
- `px(n) = (n × GetItemHeight()).ToString(InvariantCulture)` — a bare number string such as `"47350"` or `"1234.5"`,
  no unit (Virtualize.cs:649-650). `GetItemHeight()` is the avg, or the frozen size during initial-index positioning
  (§3.1).
- Item templates are invoked **inline inside one region** (`_itemTemplate(item)(builder)`, Virtualize.cs:601), so all
  items share the template's own sequence numbers and are siblings for the diff: `@key` in the user's template keeps
  DOM identity when the window slides. Without `@key` the diff reuses elements by position (allowed; the DataChanges
  page omits `@key` on purpose, VirtualizationDataChanges.razor:11-13). No wrapper element is ever added
  (VirtualizeTest.cs:434, VirtualizationTest.cs:398 "no nested tr").
- Placeholders use the **absolute item index as sequence number** inside regions 3 and 6 ("rare case where it's valid
  for the sequence number to be programmatically incremented", Virtualize.cs:577-578), so a placeholder for index *i*
  diff-matches the previous placeholder for index *i*.
- `PlaceholderContext(index, _itemSize)` — `Size` is `_itemSize` (the last-window recalibration, §3.2), **not** the
  avg used by spacers and by the built-in placeholder (Virtualize.cs:579, 630 vs 1202). See Appendix A.
- Built-in placeholder: `<div data-blazor-virtualize-reserved-height="{px(1)}"></div>` (Virtualize.cs:1199-1204).
- Bookkeeping during render: `_lastRenderedItemCount` = items rendered (Virtualize.cs:584, 602);
  `_lastRenderedPlaceholderCount = max(0, lastItemIndex − itemsBefore − _lastRenderedItemCount)` (Virtualize.cs:623);
  for **custom providers only**, the first/last rendered items and their absolute indices are remembered as
  `_previousFirstLoadedItem/_previousFirstLoadedItemIndex` and `_previousLastLoadedItem/_previousLastLoadedItemIndex`
  for prepend detection (Virtualize.cs:604-615; §5.5).
- If no item template is set, nothing is rendered for the loaded items (Virtualize.cs:590).

### 2.2 What the spacer attributes become in the DOM (JS, Virtualize.ts:97-135)

The C# side emits only data attributes; JS mirrors them to CSSOM:

| Attribute | CSS property | Value |
|---|---|---|
| `data-blazor-virtualize-reserved-height` | `height` | `${n}px` |
| `data-blazor-virtualize-loop-breaker-transform` | `transform` | `translateY(${n}px)` |

`applyLayoutAttrs` (Virtualize.ts:112-123): on the first sight of an element sets `style.flexShrink = '0'` (once,
tracked with a Symbol); then for each attribute: finite `Number(attr)` → `style.setProperty`, otherwise
`style.removeProperty` (so `"NaN"`/`"Infinity"`/absent attribute → property removed). Applied to every element from
`spacerBefore` through `spacerAfter` that carries one of the attributes (spacers and built-in placeholders,
Virtualize.ts:126-134), at init and in a MutationObserver callback that watches **only the two spacers'** two
attributes (Virtualize.ts:149-167). `flushPendingStyleMutations()` (Virtualize.ts:157-161) applies pending changes
synchronously before layout reads. Tests read the spacer height via the attribute, `style.height` and `offsetHeight`
(VirtualizationTest.cs:53-54, 951-952, 5399-5400), so the attribute must end up as a real inline height.

Other DOM writes by JS:
- inside a table section, both spacers get `style.display = 'table-row'` (Virtualize.ts:92-95; table detection §4.1);
- spacers get `style.overflowAnchor = 'none'` when native anchoring is used; otherwise the scroll element gets
  `overflow-anchor: none` (Virtualize.ts:137-144; §6.5);
- the scroll container gets `tabindex="-1"` if it has no tabindex (Virtualize.ts:82-86) so Home/End work after a click.

### 2.3 Spacer sizes

```
spacerBefore.height = itemsBefore × H
spacerAfter.height  = max(0, itemCount − capacity − itemsBefore) × H
spacerAfter.transform = translateY(unusedItemCapacity × H)   // only when unused != 0 — the "loop breaker" (§4.5)
H = initial-index positioning ? frozenSpacerItemSize : (measuredCount > 0 ? totalMeasuredHeight / measuredCount : _itemSize)
```
(Virtualize.cs:563, 635-643, 652-658). Note the after-spacer subtracts the full capacity even when fewer items
(or placeholders) are rendered, e.g. when the provider returned fewer items than requested.

### 2.4 Loading, placeholders and EmptyContent

- Before the first data load (`_loadedItems == null`) nothing but two spacers renders. With `ItemsProvider` the
  item count is unknown (0), so there are **0 items and 0 placeholders** before the first result
  (VirtualizationTest.cs:83-84, 1402-1403).
- When the window moves to unloaded indices, the render shows **placeholders** for the window slots not covered by
  `_loadedItems` (before and/or after the loaded slice) while the request runs; all items can turn into the same
  number of placeholders (VirtualizationTest.cs:98-114).
- `EmptyContent` renders only if a load has completed (`_loadedItems != null`), nothing is loading, and the count is
  0 (Virtualize.cs:586) — never before the first load, never during an in-flight `RefreshDataAsync`
  (VirtualizationTest.cs:694-725). Spacers still render around it.

---

## 3. Measurement

### 3.1 Model: one running average, no per-item cache

.NET 11 measures **the whole rendered window at once** and keeps a **global running average**; there is no per-item
or per-key size cache.

- Input: `spacerSeparation` = height of the DOM range strictly between the two spacers
  (`Range.setStartAfter(spacerBefore)/setEndBefore(spacerAfter).getBoundingClientRect().height / scaleFactor`,
  Virtualize.ts:940-942), i.e. all rendered items + placeholders + gaps between them.
- `AccumulateMeasurement(sep)` (Virtualize.cs:863-878): only if `_lastRenderedItemCount > 0` **and
  `_lastRenderedPlaceholderCount == 0`** and `sep > 0`: `totalMeasuredHeight += sep; measuredItemCount +=
  _lastRenderedItemCount`; returns whether it accumulated (`hadNewMeasurements`). Windows with placeholders are never
  measured — avoids a feedback loop where subtracting `placeholders × _itemSize` makes the average depend on itself,
  which diverged under CSS zoom (comment Virtualize.cs:865-869).
- Every callback re-adds the whole window, so items are counted once per callback (the average is weighted by how
  often a window was measured).
- `avg = totalMeasuredHeight / measuredItemCount` if `measuredItemCount > 0`, else `_itemSize` (Virtualize.cs:657-658).
- Spacers and the built-in placeholder use `GetItemHeight()` = avg, **except during InitialItemIndex positioning**,
  when a frozen value is used (`_initialIndex.SpacerItemSize`, Virtualize.cs:652-655): `ItemSize` during the
  "filling viewport" phase, then the avg captured at the phase change (§7.1). This keeps spacer geometry stable while
  positioning (VirtualizeTest.cs:140: spacers stay `47350`/`2300` after a measurement).

### 3.2 `_itemSize` (last-window recalibration, kept from .NET 10)

`RecalibrateItemSize(sep)` (Virtualize.cs:880-893), run on every distribution calculation (even when
`AccumulateMeasurement` skipped): if items were rendered,
`_itemSize = (sep − placeholderCount × _itemSize) / renderedItemCount`; if the result is ≤ 0 → reset to `ItemSize`.
This is exactly the .NET 10 formula (net10:344-354). In .NET 11 `_itemSize` is used for: `PlaceholderContext.Size`,
the avg fallback before any measurement, and the fallback in `GetEffectiveItemSizeForStaleSpacer`.

### 3.3 Effective size for window math

`GetEffectiveItemSizeForStaleSpacer()` (Virtualize.cs:853-861) = `GetItemHeight()`, but if that is ≤ 0, NaN or ∞ →
`_itemSize > 0 ? _itemSize : ItemSize`. This value divides spacer and container sizes in §4.4.

### 3.4 When `ItemSize` is used

1. Initial `_itemSize` (only if `_itemSize <= 0`, i.e. first parameter set; Virtualize.cs:404-407).
2. The avg fallback until the first accepted measurement (Virtualize.cs:658).
3. Reset value when recalibration yields ≤ 0 (Virtualize.cs:887-892) and last-resort effective size (Virtualize.cs:858).
4. Frozen spacer item size for the "filling viewport" phase of InitialItemIndex (`BeginFillingViewport(_itemSize)`,
   Virtualize.cs:522 — `_itemSize` at that time, normally still `ItemSize`).
5. Real rows usually differ from `ItemSize` — e.g. the AnchorMode page rows are ~62px for `ItemSize=50`
   (VirtualizationAnchorMode.razor:24-27) — so all behavior must rely on measurement.

### 3.5 Variable heights

Handled only through the average: spacer heights are estimates (`n × avg`), so content above/below the window is
approximate. Visual stability comes from (a) scroll anchoring (§6.5), (b) measurement-based alignment for programmatic
scrolls (§7), and (c) edge **convergence** for jumps to the top/bottom (§4.9). Tests use extreme distributions:
20–2000px (VirtualizationVariableHeight.razor:49), bimodal 30/300px (VirtualizationBimodal.razor:69), "tall rows before
index 100" 200px vs 10px (VirtualizationAnchorMode.razor:169).

### 3.6 Scale factor (CSS transform/zoom/scale)

`getScaleFactor` (Virtualize.ts:60-69): `rect.height / offsetHeight` of the first spacer with `offsetHeight > 0`
(before preferred), else 1; non-finite or ≤ 0 → 1. All lengths sent to C# (spacer size, separation, container size)
are divided by it, so C# works in unscaled CSS px. Tested with `transform: scale`, `zoom`, `scale` and combinations
(0.42×–3.375×) (VirtualizationTest.cs:1556-1602).

### 3.7 Invalidation

| Event | Effect |
|---|---|
| `RefreshDataAsync()` | total/count reset to 0 (Virtualize.cs:230-231); `_itemSize` kept |
| `ItemSize` parameter changes | total/count reset (Virtualize.cs:411-416); `_itemSize` **not** reset (only set when ≤ 0) |
| `Items` collection mutated / parent re-render | no reset |
| item content resizes (expand/collapse, images) | no reset; next measurement adds the new heights; viewport kept by anchoring (§6.5) |
| container resize | no reset; there is **no ResizeObserver on the container** — a new capacity is computed only at the next IO callback (a spacer crossing the root, or a spacer resize re-trigger) (Virtualize.ts:317-354) |

`RenderedContentMeasurement` (reason 3): `alignToItemAt` reports the current window's separation via
`OnSpacerBeforeVisible(0, sep, scrollElementRectHeight, 3)` (Virtualize.ts:665-672, 694); C# accumulates it **only in
the FillingViewport phase** of InitialItemIndex and otherwise ignores it (Virtualize.cs:660-668, 683-687, 735-739).

---

## 4. The viewport loop

### 4.1 Setup and scroll-container detection (`init`, Virtualize.ts:71-175)

- Runs once after the first render (Virtualize.cs:469-474). Returns early if a spacer is null or disconnected (component
  disposed meanwhile, Virtualize.ts:74-76).
- **Scroll container** = `findClosestScrollContainer(spacerBefore)` (Virtualize.ts:42-58): walk up from the spacer
  itself; the first element whose **computed `overflowY`** is not `visible`, `hidden` or `clip` (i.e. `auto`, `scroll`,
  `overlay`) wins — **whether or not it currently overflows**. Reaching `body` or `html` returns `null` = window
  scrolling, even if `html, body { overflow-y: scroll }` (issue #37659; VirtualizationTable.razor:21-24). Only
  `overflowY` is considered, so an `overflow-x:auto; overflow-y:hidden` wrapper is skipped and the window is used
  (VirtualizationHorizontalOverflow.razor:5; VirtualizationTest.cs:2871).
- `scrollElement = scrollContainer || document.documentElement` (Virtualize.ts:79).
- **Table detection** `isValidTableElement(spacerAfter.parentElement)` (Virtualize.ts:980-987): parent is a
  `<table>`/`<thead|tbody|tfoot>` whose **inline** `style.display` is empty, or any element whose inline display is
  `table` or `table-row-group`. A `<table style="display:block">` is *not* a table. → spacers get `display: table-row`
  and the manual anchoring path is used (§6.5).
- `useNativeAnchoring = !isTable && CSS.supports('overflow-anchor', 'auto')` (Virtualize.ts:87-88).
- `tabindex="-1"` on an element scroll container without tabindex (Virtualize.ts:82-86).
- Display modes: spacers are plain block siblings; they work as rows of `display:grid` (with `gap`) and of a
  `subgrid` (VirtualizationDisplayModes.razor), and in flex containers thanks to `flex-shrink: 0`.

### 4.2 Observers

| Observer | Target | Options | Purpose |
|---|---|---|---|
| IntersectionObserver | both spacers | `root: scrollContainer` (null → viewport), `rootMargin: '50px'`, default threshold `[0]` (Virtualize.ts:169-175) | Spacer visibility drives the window. |
| ResizeObserver | both spacers always; rendered items during convergence or for manual compensation (Virtualize.ts:312-354, 356-401) | — | (1) A resized spacer is `unobserve`+`observe`d in the IO to force a fresh IO callback (IO only fires on threshold crossings, so an already-visible spacer would never report again). (2) Convergence pinning. (3) Manual scroll compensation. |
| MutationObserver | both spacers, `attributes: true`, `attributeFilter: [the two data attrs]` (Virtualize.ts:146-167) | — | Mirror data attributes to CSSOM; optionally run a pending anchor restore right after the DOM patch (`restoreAnchorOnMutation`). |
| `scroll` listener | `scrollContainer ?? window`, passive (Virtualize.ts:606-612) | — | Follow-state tracking and anchor snapshots (§6). |
| `wheel`, `touchmove`, `pointermove` (with buttons) | same target, passive (Virtualize.ts:592-597) | — | Mark scroll activity as **user** input. |
| `keydown` | `scrollContainer \|\| document` (Virtualize.ts:560) | — | Home/End jumps, arrow/page/space = user input (§4.8). |

Because the IO root margin is 50px, a spacer counts as visible within 50px of the viewport, and `entry.rootBounds`
(the root rectangle expanded by the margin) is what C# receives as `containerSize`: a 300px container reports
**400** (VirtualizationTest.cs:130-162 asserts `containerSize == 400`).

### 4.3 IO callback processing (Virtualize.ts:784-795, 884-978)

1. **Throttle** (`intersectionCallback`): entries are stored per target (latest wins). If no timer runs, flush now and
   start a 50ms timer (`THROTTLE_MS`, Virtualize.ts:20) that flushes again on expiry → leading + trailing throttle.
2. `processIntersectionEntries(entries)`:
   - return if a spacer is disconnected;
   - `source = scrollActivity.source`; if `UserScroll` it is **consumed** (reset to None) for the next batch;
   - `isSelfScroll = source ∈ {AlignToItem, RestoreSnapshot}`; if not a self scroll → `updateAnchorSnapshot()`;
   - if **both spacers intersect, only the before spacer is reported** (Virtualize.ts:903-910);
   - intersecting entries (unless self scroll) run edge-convergence checks: after spacer →
     `updateBottomConvergence(source === UserScroll)`, before spacer → `updateTopConvergence()` (§4.9);
   - non-intersecting entries are dropped, but keep pinning `scrollTop` to the edge while converging (Virtualize.ts:923-927);
   - nothing intersecting → (if `source === AlignToItem` → `scrollActivity.clear()`) return;
   - `spacerSeparation = rangeBetweenSpacers.height / scale`; per entry `containerSize = (rootBounds?.height ?? 0) / scale`;
   - **reason** = `UserScroll` if `source === UserScroll`; else `ProgrammaticScroll` if self scroll **and** (before
     spacer **or** `source === RestoreSnapshot`); else `ViewportFill` (Virtualize.ts:946-950). (So an align-to-item
     scroll that exposes the *after* spacer reports `ViewportFill`.)
   - an after spacer with `offsetHeight == 0` is not reported (nothing below);
   - if reason ≠ ProgrammaticScroll: `scrollTriggeredRender = true` and, if the spacer has height,
     `nativeAnchoring.suspend('slide')` (§6.5);
   - `spacerSize` = for the before spacer `intersectionRect.top − boundingClientRect.top` (the part of the spacer above
     the margin-expanded root top), for the after spacer `boundingClientRect.bottom − intersectionRect.bottom` (the part
     below the root bottom), both `/ scale`;
   - call `OnSpacerBeforeVisible` / `OnSpacerAfterVisible(spacerSize, spacerSeparation, containerSize, reason)`
     (fire-and-forget);
   - finally, if `source === AlignToItem` → `scrollActivity.clear()` (source None + re-observe spacers).

### 4.4 C# window distribution

**`CalculateItemDistribution(spacerSize, sep, containerSize)`** (Virtualize.cs:895-918):
```
hadNew  = AccumulateMeasurement(sep); RecalibrateItemSize(sep)            // §3
s       = GetEffectiveItemSizeForStaleSpacer()                           // §3.3
maxCap  = GetMaximumItemCapacity()      = min(AppContextMax?, MaxItemCount) + 2·OverscanCount   (Virtualize.cs:920-931)
itemsInSpacer = max(0, floor(spacerSize / s) − OverscanCount)
capacity      = ceil(containerSize / s) + 2·OverscanCount
unused        = max(0, capacity − maxCap);  capacity −= unused
```
Example: 300px container (reported 400), avg 50, overscan 15 → capacity `ceil(400/50)+30 = 38`.
Unit-test example: container 500, size 50 → 40 (VirtualizeTest.cs:1302-1305).

**`OnBeforeSpacerVisible`** (Virtualize.cs:681-731), in order:
1. reason `RenderedContentMeasurement` → measurement only (§3.7), return;
2. `_pendingAnchorRestore` → ignore (a data shift is committed but not yet restored);
3. InitialItemIndex > 0 but positioning not started yet → ignore (prevents the IO callback at scrollTop 0 from
   resetting the seeded window; only on the *before* side);
4. `ProgrammaticScroll` → ignore (VirtualizeTest.cs:1456); `UserScroll` → `CancelInFlightScrollForUserInteraction()`
   (abort initial-index positioning, cancel an in-flight `ScrollToItemAsync` and its provider request,
   Virtualize.cs:670-679); `ViewportFill` while a ScrollToItem is in flight or in the ApplyingMeasuredGeometry phase →
   ignore;
5. distribution → `itemsBefore = itemsInSpacer`;
6. during initial-index positioning → `UpdateWindowFromViewport(Before, …)` (grow, §4.7), return;
7. **slide by one**: if items are rendered and `itemsBefore == _itemsBefore && itemsBefore > 0` → `itemsBefore--`
   ("the before spacer is visible, so the window must move up by at least one"; the `_lastRenderedItemCount > 0`
   guard is new vs net10:310 and keeps the first render at 0, VirtualizeTest.cs:633);
8. `UpdateItemDistribution(itemsBefore, capacity, unused)`.

**`OnAfterSpacerVisible`** (Virtualize.cs:733-786): same reason handling (no initial-index guard), then
`itemsAfter = itemsInSpacer`; positioning → grow `After`; else `itemsBefore = max(0, itemCount − itemsAfter −
capacity)`; slide down by one if unchanged and `itemsBefore < itemCount − capacity`; **End-mode bottom pin:** if
`itemsAfter == 0 && hadNewMeasurements && AnchorMode has End` → `_pendingScrollToBottom = true;
_pendingAnchorRestore = false` (Virtualize.cs:776-783); then `UpdateItemDistribution`.

**`UpdateItemDistribution(itemsBefore, capacity, unused)`** (Virtualize.cs:953-993):
1. clamp: if `itemsBefore + capacity > itemCount` → `itemsBefore = max(0, itemCount − capacity)` (shrinking data with
   the window past the new end, issue #37245);
2. if any of the three values changed: store them; then
   - **skip-refresh**: if `_skipNextDistributionRefresh` (set after every successful load with `Count > 0`,
     Virtualize.cs:1153) and the loaded slice already starts at the new `itemsBefore` and the window is not at the end
     (`itemsBefore + capacity < itemCount`) → only re-render (the RO→IO cycle after a load re-triggers with refined
     measurements; this avoids one redundant provider call); the flag is one-shot;
   - otherwise `RefreshDataCoreAsync(renderOnSuccess: true)` and, if it did not complete synchronously,
     `StateHasChanged()` right away (renders placeholders for the new window).

### 4.5 How OverscanCount and MaxItemCount apply

- **OverscanCount**: window starts `OverscanCount` items above the first item above the expanded viewport
  (Virtualize.cs:912); capacity adds `2·OverscanCount` (Virtualize.cs:913); `MoveWindowToContain` puts the target at
  local index `OverscanCount` and seeds capacity `2·OverscanCount + 1` (Virtualize.cs:313-314); look-ahead adds
  `max(1, OverscanCount)` (Virtualize.cs:947).
- **MaxItemCount**: capacity is capped at `MaxItemCount + 2·OverscanCount` (overscan counted as used so a tiny
  MaxItemCount cannot cause an infinite load loop, Virtualize.cs:928-930). E.g. MaxItemCount 10, overscan 3 → exactly
  16 rows even if 20 would fit (VirtualizationTest.cs:432-457); MaxItemCount 100, overscan 200 → cap 500
  (VirtualizationTest.cs:732). The legacy AppContext switch
  `Microsoft.AspNetCore.Components.Web.Virtualization.Virtualize.MaxItemCount` (int) still applies as a `min`
  (Virtualize.cs:907-926).
- **Loop breaker**: the capped-off part (`unusedItemCapacity`) becomes `translateY(unused × H)` on the after spacer
  (Virtualize.cs:640-643), pushing it below the viewport so it stops intersecting; otherwise a viewport larger than the
  cap would keep reporting the after spacer and request more items forever (comment Virtualize.cs:29-35). The visible
  result is a blank gap below the last rendered row ("Do not set this to a smaller number than you expect to fit",
  Virtualize.cs:168-170).

### 4.6 SpacerVisibilityReason

| Reason | Produced when (JS) | C# reaction |
|---|---|---|
| `UserScroll` (0) | `scrollActivity.source === UserScroll` at processing time — set by a non-ignored `scroll` event or by wheel/touch/pointer-drag/arrow/page/space input (Virtualize.ts:540-548, 614-637) | cancels in-flight programmatic scrolling / initial positioning, then normal distribution |
| `ProgrammaticScroll` (1) | the component's own scroll (`AlignToItem`, `RestoreSnapshot`) exposed the before spacer, or any spacer during a snapshot restore | ignored (no redistribution, no render) |
| `ViewportFill` (2) | nothing user-driven: initial fill, a spacer visible at rest, resize re-trigger, after-spacer exposed by an align scroll | normal distribution; ignored while a ScrollToItem is in flight or in ApplyingMeasuredGeometry |
| `RenderedContentMeasurement` (3) | `alignToItemAt` reports the current window | measurement only, FillingViewport phase only |

A scroll event caused by the component's own `scrollTo` must never yield reason 0 (VirtualizationTest.cs:6532-6592).

### 4.7 ViewportFillDirection and window growth

`getViewportFillDirection()` (Virtualize.ts:706-732): viewport = element `rect.top + clientTop·scale` …
`+ clientHeight·scale` (window: `0 … documentElement.clientHeight`); if the before spacer overlaps it → `Before`, else
if the after spacer overlaps → `After`, else `Covered`. Returned by `alignToItem`.

`UpdateWindowFromViewport(direction, capacity, unused)` (Virtualize.cs:788-831) — used after a programmatic scroll and
during initial positioning; it **grows** the window instead of sliding it, so the target item stays rendered:
```
Covered → (if positioning and no placeholders) advance initial-index phase; return
null    → return
maxCap  = min(GetMaximumItemCapacity(), itemCount)
desired = min(max(capacity, 2·max(1, _visibleItemCapacity)), maxCap)       // doubling, overflow-safe
avail   = Before ? itemsBefore : max(0, itemCount − itemsBefore − _visibleItemCapacity)
added   = min(max(0, desired − _visibleItemCapacity), avail)
if added > 0 or unused changed → UpdateItemDistribution(Before ? itemsBefore − added : itemsBefore, _visibleItemCapacity + added, unused)
else if positioning && !loading → advance initial-index phase
```

### 4.8 User input classification and keyboard (Virtualize.ts:537-604)

- `scrollActivity.source ∈ {None, UserScroll, AlignToItem, RestoreSnapshot}` with a one-shot `ignoreNextScroll` flag
  (Virtualize.ts:34-39, 207-227). Every self-initiated `scrollTop` write sets `ignoreNextScroll` (End pin, drift
  correction, restore, align).
- `handleScroll` (Virtualize.ts:614-637): ignored while converging or if `ignoreNextScroll` is consumed, and while a
  self scroll is in progress; otherwise source = UserScroll, update follow state (§6.3) and the anchor snapshot. A bare
  `scroll` event (e.g. `scrollTop = n` + dispatched event, as most tests do, VirtualizationTest.cs:3254-3260) therefore
  counts as user scroll.
- `handleUserScrollInput` (wheel, touchmove, pointermove with `buttons != 0`, keys ArrowUp/ArrowDown/PageUp/PageDown/
  Space): consumes `ignoreNextScroll`, sets source UserScroll, and if a self scroll was in progress re-observes the
  spacers so the next IO batch is classified as user (Virtualize.ts:540-558). Tests that must prove the user *left*
  an edge use real wheel input (VirtualizationTest.cs:3263-3268).
- **End key** (Virtualize.ts:563-575): source UserScroll, re-observe spacers, stop following the top,
  `pendingJumpToEnd = true`; in modes without End: `bottomTracking.following = reached = true` (the jump makes it
  follow the bottom until the user scrolls away); start bottom convergence if the after spacer has height. The
  browser's default End action scrolls to `scrollHeight`.
- **Home key** (Virtualize.ts:576-585): mirror image (`topTracking.following = true`, clear bottom follow, top
  convergence if the before spacer has height).
- Keys are received on the scroll container (needs focus → `tabindex=-1`) or on `document` for window scrolling.

### 4.9 Edge convergence (Virtualize.ts:177-184, 317-327, 356-383, 512-535, 797-847)

When the viewport must sit at an edge while the edge spacer still holds estimated space (End/Home jump, End-mode
pin, Start-mode top after prepend, user reaching the very bottom), JS **converges**:
- `startConvergenceObserving(dir)`: mark `top`/`bottom`; on the first start suspend native anchoring ('convergence')
  and ResizeObserve every element between the spacers.
- Every RO callback and every `refreshObservedElements` while converging forces `scrollTop = scrollHeight` (bottom) or
  `0` (top), keeps the observed item set in sync, and **stops** when the edge spacer's `offsetHeight` is 0.
- `handleScroll` ignores scroll events while converging. Stop also on `beginProgrammaticScroll`/align and dispose.
- `stopConvergenceObserving` unobserves items, resumes native anchoring, clears the manual-compensation map and takes a
  fresh anchor snapshot.
- Start conditions from IO: `updateBottomConvergence(userScrolled)` — after spacer intersecting with height; a pending
  End-key jump always converges (and sets `scrollTop = scrollHeight`); otherwise only if End mode **or** the user
  scrolled, and the viewport is at the bottom (`scrollTop + clientHeight ≥ scrollHeight − 1`). This is what makes a
  plain user `scrollTop = scrollHeight` reach the true end of a variable-height list in any mode
  (VirtualizationTest.cs:1793). `updateTopConvergence()` — before spacer with height; pending Home always; otherwise
  only in Start mode and at `scrollTop < 1`.

### 4.10 Post-render work and C# → JS call order (OnAfterRenderAsync, Virtualize.cs:459-549)

1. Resolve the `ScrollToItemAsync` render rendezvous if the rendered slice matches the window
   (`_loadedItemsStartIndex == _itemsBefore && (_lastRenderedItemCount > 0 || _itemCount == 0)`, Virtualize.cs:461-467).
2. First render: `init(spacers, (int)AnchorMode)`.
3. `_pendingScrollToBottom` → `scrollToBottom()` (JS: only if following the bottom: `scrollTop = scrollHeight` + bottom
   convergence, Virtualize.ts:990-997).
4. Non-first renders: `setAnchorMode` if the parameter changed (Virtualize.ts:742-747: Start-follow =
   Start && at top; End-follow = End (unconditionally — switching to End parks the list at the bottom,
   VirtualizationTest.cs:3297-3300); `reached` = at bottom); then the anchor restore (§6.4); then
   `refreshObservers(_loading)` (Virtualize.ts:356-443).
5. InitialItemIndex start and alignment steps (§7.1).

`refreshObservedElements(isLoading)` (Virtualize.ts:356-443): observe spacers; while converging force the edge and
sync observed items, return; manual-compensation path (no native anchoring) and render not scroll-triggered →
ResizeObserve every rendered item, drop stale ones; reset `scrollTriggeredRender`; resume native anchoring ('slide')
unless the render was scroll-triggered and not loading; **End pin** if `bottomTracking.following || (End &&
(wasAtBottomLastRender || reached))` → apply pending styles, `scrollTop = scrollHeight`, ignore next scroll, start
bottom convergence if the after spacer has height; apply a pending drift correction (§6.4); take a new anchor snapshot.

---

## 5. ItemsProvider

### 5.1 Request shape and when requests happen

`new ItemsProviderRequest(StartIndex: _itemsBefore, Count: GetItemsProviderRequestCount(prefetch), token)`
(Virtualize.cs:1030-1033).
- `StartIndex` is the window start, `Count` normally the capacity. `Count` is **not clamped to the total**: the
  provider must tolerate requests past the end and may return fewer items (ItemsProviderRequest.cs:16-20;
  VirtualizationDataChanges.razor:272-279 behaves like `Skip/Take`).
- `Items` mode uses `DefaultItemsProvider` = `Items.Skip(start).Take(count)`, `TotalItemCount = Items.Count`,
  completing **synchronously** (Virtualize.cs:1192-1197; no CTS, no `_loading`, Virtualize.cs:1012-1019).
- Request triggers:
  - `Items`: every `OnParametersSet` (`renderOnSuccess: false`, Virtualize.cs:434-445) — so collection mutations show
    on the next parent render without `RefreshDataAsync` — plus every window change.
  - `ItemsProvider`: **no request in `OnParametersSet`**; the first one comes from the first IO callback
    (VirtualizeTest.cs:633); then on window changes (§4.4), `RefreshDataAsync`, `ScrollToItemAsync`, and the follow-up
    requests in §5.4–5.5.
  - The very first `Items` request has `Count = 0` (capacity unknown) unless `InitialItemIndex` seeded a capacity, so
    the first render shows only spacers (after spacer = `Items.Count × ItemSize`) and the items appear after the first
    IO callback (VirtualizationTest.cs:130-162).

### 5.2 Look-ahead (`GetItemsProviderRequestCount`, Virtualize.cs:933-951)

For **custom providers only**, `Count = min(GetMaximumItemCapacity(), capacity + max(1, OverscanCount))` when
- the call comes from `RefreshDataAsync` (`prefetchForPotentialPrepend`) **and** AnchorMode has `Start` **and** an item
  was rendered before (`CanDetectPrepend`), or
- AnchorMode has `End` **and** the window reaches the loaded tail (`itemCount > 0 && itemsBefore + capacity ≥ itemCount`).

Otherwise `Count = capacity`. The extra rows let small prepends/appends shift the window from the same result without
a second request (Virtualize.cs:943-944). The out-of-range re-request and the prepend/tail replacement requests use
plain `capacity` (Virtualize.cs:1046, 1211, 1249, 1337).

### 5.3 Cancellation of superseded requests (Virtualize.cs:1003-1028, 1050-1054, 1160-1189)

- Every refresh first cancels the previous refresh (`_refreshCts?.Cancel()`), creates a new CTS (linked to the
  `ScrollToItemAsync` token when called from there) and sets `_loading = true`.
- After the await: a cancelled token → the result is dropped (no state change). An `OperationCanceledException` whose
  token is ours is swallowed; any other exception is stored in `_refreshException`, faults a waiting
  `ScrollToItemAsync`, and `StateHasChanged()` makes the next render throw it (renderer error handling / error
  boundary; VirtualizeTest.cs:76).
- `finally`: if this refresh is still the current one, clear `_refreshCts`, and if it was cancelled reset `_loading`.
- Other cancellers: a user scroll during `ScrollToItemAsync` (Virtualize.cs:677), `DisposeAsync` (Virtualize.cs:1356).
- Observable: superseded requests see their token cancelled (VirtualizationTest.cs:291; VirtualizeTest.cs:736); stale
  prepend adjustments never overwrite a newer window (VirtualizeTest.cs:791).

### 5.4 Committing a result and total-count handling (Virtualize.cs:1039-1158)

1. **Out-of-range start** (e.g. InitialItemIndex beyond the end, or the total shrank): if not cancelled,
   `TotalItemCount > 0` and `itemsBefore ≥ TotalItemCount` → `_itemCount = total; MoveWindowToContain(itemsBefore)`
   (clamps to `[0, total−1]`, re-seeds the window) and **re-request** `(itemsBefore, capacity)` (Virtualize.cs:1039-1048).
2. Prepend/append detection (§5.5) — may replace `result` and move `_itemsBefore`.
3. Commit: `_itemCount = TotalItemCount; _loadedItems = Items; _loadedItemsStartIndex = _itemsBefore`
   (Virtualize.cs:1136-1138; **changed** from `request.StartIndex`, net10:430, because the window may have been
   adjusted). `Items` mode also remembers `_previousFirstLoadedItem = Items[itemsBefore]` (Virtualize.cs:1145-1150).
   `_loading = false; _skipNextDistributionRefresh = request.Count > 0`; render if `renderOnSuccess`.
4. A smaller total with the window past the new end is clamped by `UpdateItemDistribution` on the next callback
   (Virtualize.cs:955-960) — must settle in one step even from 100000 → 25 (VirtualizationTest.cs:660). A larger total
   keeps the pixel scroll position (VirtualizationTest.cs:626). Total 0 → EmptyContent (§2.4).

### 5.5 Prepend / append detection and `ItemComparer`

Only when the count **grew** and there was a previous count: `countDelta = total − previousCount; itemsAdded =
countDelta > 0 && previousCount > 0` (Virtualize.cs:1056-1059). Shrinks and same-count replacements are never treated
as shifts (deletes above the viewport are a known gap: `AnchorMode_DeleteAboveViewport_ViewportStaysStable` is skipped,
issue #66509, VirtualizationTest.cs:4403).

`CanDetectPrepend = _previousFirstLoadedItem is not null` (Virtualize.cs:59) — for custom providers set while
rendering (Virtualize.cs:604-615), for `Items` at commit. (Always true for non-nullable value types.)

**`Items` mode** (Virtualize.cs:1061-1079), comparer = `EqualityComparer<TItem>.Default` (identity for classes):
- `Items[itemsBefore]` (new collection) differs from the previously first loaded item → **prepend** →
  `AdjustForPrependAsync(countDelta)` (Virtualize.cs:1206-1220): `itemsBefore = min(itemsBefore + countDelta,
  max(0, total − capacity))`, re-query that window, `_pendingAnchorRestore = true`, `_deferAnchorRestoreClear =
  !wasAtTop`. The whole delta is assumed to be prepended.
- else `ShouldAnchorForAppend` → pending anchor restore (+ deferred clear).
- else `ShouldScrollToBottomForAppend` → `_pendingScrollToBottom = true`.

**Custom provider** with `CanDetectPrepend` (Virtualize.cs:1080-1122), comparer = `ItemComparer`:
- materialise `result.Items` once (single enumeration, VirtualizeTest.cs:1097);
- compare **the same global index across windows**: the previous first rendered item at its index if that index lies
  inside the new result, else the previous last rendered item (Virtualize.cs:1087-1093; VirtualizeTest.cs:1175);
- comparable item differs → **prepend**:
  - if `ShouldFollowPrependedHeadAsync()` (AnchorMode has Start, `itemsBefore == 0`, and JS reports
    `topTracking.following`, Virtualize.cs:1281-1298) → keep the window at 0: the new items render at the top;
  - else `AdjustProviderForPrependAsync` (Virtualize.cs:1222-1265): `adjusted = min(itemsBefore + countDelta,
    max(0, total − capacity))`; reuse the look-ahead rows if they cover `[adjusted, adjusted + min(capacity,
    total − adjusted))`, else re-request; tell JS `restoreAnchor(onNextMutation: true)` (§6.4); then
    `itemsBefore = adjusted`, `_pendingAnchorRestore = true`, `_deferAnchorRestoreClear = !wasAtTop`;
- equal → `ShouldAnchorForAppend` → pending restore; else if `ShouldFollowAppendedTailAsync(previousCount)`
  (End, capacity > 0, window reaches the old tail `itemsBefore + capacity ≥ previousCount`, JS
  `bottomTracking.following`, Virtualize.cs:1300-1318) → `AdvanceWindowToAppendedTailAsync`: window to
  `max(0, total − capacity)`, reuse look-ahead rows or re-request, publish the new window only together with its rows,
  `_pendingScrollToBottom = true` (Virtualize.cs:1320-1351).

**Custom provider without `CanDetectPrepend`** (nothing rendered yet): only the tail-follow check (Virtualize.cs:1123-1132).

Predicates:
```
ShouldAnchorForAppend(d, prev)        = d > 0 && d < prev && !End && itemsBefore + capacity >= prev        // Virtualize.cs:1270-1274
ShouldScrollToBottomForAppend(d, prev) = d > 0 && End && prev <= capacity                                  // Virtualize.cs:1276-1279 (Items mode only)
```

`ItemComparer` guidance (Virtualize.cs:182-200): default equality works for records/`IEquatable<T>`; for classes
without value equality and providers that return fresh instances, every growth looks like a prepend (false positive)
unless a key-based comparer is given; the test page passes `EqualityComparer.Create((a,b) => a.Index == b.Index)`
(VirtualizationAnchorMode.razor:137-149) and returns the same instances when testing the default comparer
(VirtualizationAnchorMode.razor:460-465). Growth with unchanged items at the same indices must not shift the window
(VirtualizeTest.cs:1046, 1215).

### 5.6 `RefreshDataAsync`

Resets the running average, cancels any running refresh, requests the current window with look-ahead and prepend
detection, commits **without rendering** (Virtualize.cs:225-233). The usual caller is an event handler whose component
re-renders afterwards; Virtualize re-renders as part of that because its `ChildContent` parameter is a fragment. The
post-render anchor restore then runs (§6.4). Provider mode is never re-queried on parent renders without it
(VirtualizationTest.cs:529); returning fresh objects replaces mutated ones (VirtualizationTest.cs:561).

---

## 6. Anchoring

### 6.1 Two layers

1. **Content anchoring (always on, every AnchorMode):** when content above the viewport changes size, or items are
   inserted/removed above the window by a data change, the visible rows stay where they are. Implemented with the
   browser's scroll anchoring plus JS snapshot/restore and manual compensation (§6.4, §6.5).
2. **Edge pinning (`AnchorMode`):** at an edge, new items at that edge are *revealed* instead of compensated:
   `Start` keeps the viewport at the top showing prepended items; `End` auto-scrolls to show appended items. Both are
   "follow" states that a user scroll away from the edge disengages and a return re-engages (§6.3).

Expected behavior by scenario (from code and tests; tolerances in §9 findings):

| Scenario | None | Start (default) | End |
|---|---|---|---|
| Prepend while at the very top (scrollTop < 1) | old first row stays in place (scrollTop grows) | **new rows shown**, scrollTop stays ≈0 | old first row stays |
| Prepend near top (≈200px), mid-list, at bottom | stable | stable | stable |
| Append at bottom (10 rows) | stable, no follow | stable, no follow | **follows** to the new bottom |
| Append 100 rows at bottom | gap > 2000px | gap > 2000px | follows; tail rendered as real items |
| Append at top / mid-list | stable | stable | stable (no auto-scroll) |
| List fits entirely (5 items), append | — | — | follows (scrollTop > 0, at bottom) |
| First data load | top | top | **pinned to bottom**, tail fetched |
| Delete below viewport | stable | stable | stable |
| Delete the rows containing the top row | first survivor at top | same | same |
| Delete above viewport mid-list | not guaranteed (test skipped, #66509) | | |
| User scrolls away from edge, then new items | — | not pulled back | not pulled back |

### 6.2 What "at the edge" means numerically

| Check | Definition | Source |
|---|---|---|
| at top (JS follow state) | `scrollElement.scrollTop < 1` | Virtualize.ts:255 |
| at bottom (JS follow state, snapshots) | `scrollHeight ≤ clientHeight` **or** `\|scrollTop + clientHeight − scrollHeight\| < 2` | Virtualize.ts:228-230 |
| at bottom (start bottom convergence) | `scrollTop + clientHeight ≥ scrollHeight − 1` | Virtualize.ts:817 |
| Start reveal after a prepend | anchor snapshot `scrollTop < 1` | Virtualize.ts:470 |
| provider prepend follow | additionally `itemsBefore == 0` | Virtualize.cs:1284 |
| provider append follow | additionally window reaches the old tail | Virtualize.cs:1304 |
| Items-mode "anchor instead of chase" on append | window reaches the old tail (`itemsBefore + capacity ≥ previousCount`) | Virtualize.cs:1274 |

So "near" in the docs means within 1px (top) / 2px (bottom); a viewport at scrollTop ≈ 200 is not at the top and a
prepend there is compensated in every mode (VirtualizationTest.cs:3565).

### 6.3 Follow state machine (JS)

| State | Initial | Set true | Set false / recomputed |
|---|---|---|---|
| `topTracking.following` | `AnchorMode & Start` (Virtualize.ts:239-241) | Home key (Virtualize.ts:579) | user scroll event: `= scrollTop < 1` when Start or already following (Virtualize.ts:627-629); End key, `beginProgrammaticScroll` (Virtualize.ts:271, 566); `setAnchorMode`: `= Start && atTop` (Virtualize.ts:744) |
| `bottomTracking.following` | `AnchorMode & End` — true at mount (Virtualize.ts:237) | End key in non-End modes (Virtualize.ts:569-572); `setAnchorMode` with End (Virtualize.ts:745) | user scroll event: `= atBottom` when End or already following (Virtualize.ts:630-634); Home key, `beginProgrammaticScroll` (Virtualize.ts:582, 272 → `clearBottomFollow`, 245-249) |
| `bottomTracking.reached` | false ("not set at mount, sticky across appends") | End key; user scroll at bottom; `setAnchorMode` (= atBottom) | user scroll away; Home; programmatic scroll |
| `bottomTracking.wasAtBottomLastRender` | false | `updateAnchorSnapshot()` (= atBottom, Virtualize.ts:851); restore while at bottom (Virtualize.ts:507-509) | same |

Consumers: provider prepend/tail decisions in C# (`isFollowingTop/Bottom`), JS `scrollToBottom` (only if following),
and the **End pin** after every render (`following || (End && (wasAtBottomLastRender || reached))`,
Virtualize.ts:410-421). Only *user* scroll events change follow state; the component's own scroll writes are excluded by
`ignoreNextScroll`, the self-scroll sources and convergence (Virtualize.ts:614-626). An End-key jump makes even None/
Start lists follow the bottom until the user scrolls away. Leaving an edge is proven in tests by real wheel input
(≥ 100–500px), after which new items must not pull the viewport back (VirtualizationTest.cs:4606-4767).

C# side of End following: `_pendingScrollToBottom` is set when the after spacer reports `itemsAfter == 0` with a new
measurement in End mode (Virtualize.cs:776-783 — keeps scrolling to the bottom while measurements converge), by the
Items-mode small-list append rule and by the provider tail advance; it is consumed after the next render
(`scrollToBottom`, Virtualize.cs:476-480) and suppresses the anchor restore of that render (Virtualize.cs:494).

### 6.4 Anchor snapshot and restore (data shifts)

**Snapshot** (`updateAnchorSnapshot`, Virtualize.ts:849-882): the first element between the spacers whose
`rect.bottom > containerTop` (containerTop = scroll container's rect top, 0 for the window); store `{anchorItemIndex:
its position among the rendered siblings (local index), anchorOffset: rect.top − containerTop, scrollTop}`; also
refreshes `wasAtBottomLastRender`. Taken on every non-self IO batch, every user scroll event, after every render, before a mutation-time restore (Virtualize.ts:751) and
when convergence stops. **Pre-shift preservation:** if native anchoring is unavailable (manual path, or an element
scroller at scrollTop < 1), the mode pins the top item (not Start-mode top convergence), a snapshot exists, and the
first visible row already sits more than its own height below the container top (`rect.top − containerTop >
rect.height` — the DOM was shifted by a prepend that has not been restored yet), the old snapshot is kept
(Virtualize.ts:863-871).

**Restore** (`restoreAnchorForShift`, Virtualize.ts:447-510), run after the render that committed the shift:
1. apply pending spacer styles; take and clear the snapshot; nothing to do while converging;
2. a pending `alignToItem` that could not find its target is retried instead (Virtualize.ts:461-467);
3. **Start mode with `snapshot.scrollTop < 1`** → `scrollTop = 0`, start top convergence, re-observe spacers → the
   prepended rows load and show (this is the "reveal" behavior);
4. otherwise `delta = currentOffset(anchorItemIndex) − anchorOffset`; mark the following scroll as `RestoreSnapshot`
   and ignore it; if `|delta| > 1` → `scrollTop += delta` and arm a **drift correction**: after the next render the same
   local row is re-measured and any remaining drift > 1px is corrected (Virtualize.ts:423-438, 486-505);
5. in End mode, if the viewport is at the bottom now, keep `wasAtBottomLastRender = true`.

Because the window was shifted by exactly `countDelta` (§5.5), the snapshot's *local* index still points at the same
logical row after the shift.

**C# gating** (OnAfterRenderAsync, Virtualize.cs:491-511): restore only if `_pendingAnchorRestore` and no
`_pendingScrollToBottom` and no `ScrollToItemAsync` in flight. While the (asynchronous) JS restore runs,
`_pendingAnchorRestore` stays true — so spacer callbacks are ignored (Virtualize.cs:688, 740) — in None and End mode
and for Start-mode shifts away from the top (`_deferAnchorRestoreClear`); for a Start-mode prepend at the top the flag
is cleared first so the callbacks driven by top convergence are processed. Both flags are cleared afterwards.

**Restore on the next DOM mutation** (provider prepends, Virtualize.cs:1254-1257; Virtualize.ts:748-755): before the
shifted window is committed, C# calls `restoreAnchor(onNextMutation: true)`. Without native anchoring, JS takes a fresh
snapshot and runs `restoreAnchorForShift` inside the MutationObserver callback that sees the spacer attributes change,
i.e. right after the DOM patch and before paint. With native anchoring it does nothing (the browser compensates).

### 6.5 Native scroll anchoring vs manual compensation — the double-compensation guards

`useNativeAnchoring = !isTable && CSS.supports('overflow-anchor', 'auto')` (Virtualize.ts:87-88).

**Native path:**
- Spacers get `overflow-anchor: none`, so the browser's anchor node is always a real row, never a spacer whose height
  Virtualize itself changes (Virtualize.ts:137-140).
- The browser compensates size changes above the viewport — also render-less ones (an item grows via its own style
  without any Blazor render must move visible rows < 5px, VirtualizationTest.cs:2948).
- **Suspension** (Virtualize.ts:186-202): `overflow-anchor: none` on the scroll element while
  - `'slide'`: from every non-programmatic IO report with a non-empty spacer (Virtualize.ts:960-966) until a spacer
    resize is observed (Virtualize.ts:347-349) or a render that was not scroll-triggered (or is still loading) completes
    (Virtualize.ts:402-407);
  - `'convergence'`: while converging (Virtualize.ts:516, 531).
  Rationale: during a scroll-driven slide the window is recomputed from the current scroll position and spacer space is
  traded for rows; if the browser also anchored on that trade, the position would be compensated twice
  ("reserved-height compensation over-shifting", issue #67729: 100px steps produced jumps to the start/end,
  VirtualizationTest.cs:3191-3209). The suspension must be lifted when things settle: the container's computed
  `overflow-anchor` must not stay `none` (VirtualizationTest.cs:2965-2969).

**Manual path** (tables — Chrome's anchoring on `<tr>` causes 3000–8000px jumps per 300px scroll,
VirtualizationTest.cs:3021-3025 — and browsers without `overflow-anchor`):
- `overflow-anchor: none` on the scroll element (Virtualize.ts:143);
- after renders that were not scroll-triggered, ResizeObserve every rendered row (Virtualize.ts:385-401);
- `compensateScrollForItemResizes` (Virtualize.ts:282-310): for each observed row whose height changed (border-box
  block size) and whose top is above the container top, add the height delta to `scrollTop` (only if `scrollTop > 0`);
  the first observation only records the height;
- prepends: snapshot/restore including the mutation-time restore (§6.4) and the pre-shift snapshot preservation.

**Guards against compensating twice** (the sources do not name one "fix"; these are the places where native and manual
compensation are kept mutually exclusive): (1) spacers never anchor; (2) native anchoring suspended during slides and
convergence; (3) item resize compensation only when native anchoring is off (Virtualize.ts:342-345); (4)
`restoreAnchor(onNextMutation)` is a no-op with native anchoring (Virtualize.ts:749-754); (5) `restoreAnchorForShift`
applies only the *remaining* offset after the browser's own adjustment (threshold 1px); (6) snapshot preservation only
where the browser does not anchor — the code treats an element scroller at scrollTop < 1 as such
(Virtualize.ts:864).

### 6.6 Window scrolling vs element scrolling

| Aspect | Element scroller | Window (document) |
|---|---|---|
| IO root | the element | `null` (viewport) (Virtualize.ts:170) |
| scroll element / follow checks | the element | `document.documentElement` (Virtualize.ts:79) |
| scroll/wheel/touch/pointer listeners | element | `window` (Virtualize.ts:591) |
| keydown (Home/End) | element (gets `tabindex=-1`) | `document` (Virtualize.ts:560, 84-86) |
| containerTop for snapshots/compensation | element rect top | 0 (Virtualize.ts:853-855, 284-286) |
| alignment reference | element border-box top (`getBoundingClientRect().top`) | viewport top 0 (Virtualize.ts:659-662) — a fixed header can cover the target |
| viewport for fill direction | `rect.top + clientTop·scale … + clientHeight·scale` | `0 … documentElement.clientHeight` (Virtualize.ts:706-715) |
| "native anchoring unavailable at top" | yes (scrollTop < 1) | no (Virtualize.ts:864) |
| `overflow-anchor` writes | on the element | on `<html>` |

Window-scroll tests use a 90px fixed header and `html, body { overflow-y: scroll }`
(VirtualizationAnchorModeWindowScroll.razor:3-8, 41) and allow ±5px drift (VirtualizationTest.cs:4883-4907).

---

## 7. Scroll APIs

### 7.1 `InitialItemIndex`

State machine `InitialIndexState` (Virtualize.cs:1367-1406): `None → FillingViewport → ApplyingMeasuredGeometry →
Completed`; `IsPositioning` = the two middle phases; `Abort()` → Completed (only while positioning).

1. **Seed** (`OnParametersSet`, while `None` and `InitialItemIndex > 0`): `MoveWindowToContain(InitialItemIndex)`
   (Virtualize.cs:418-421) — window starts `OverscanCount` before the target, capacity seeded to `2·OverscanCount + 1`;
   with an unknown count no end clamp. `Items` mode loads that window synchronously, so even the first (and a
   prerendered) render shows rows around the target, with the before spacer at `itemsBefore × ItemSize`. Out-of-range
   seeds are re-clamped after the first result (Virtualize.cs:1039-1048): 100 items, index 99999 → itemsBefore 69
   (VirtualizeTest.cs:1599). Negative/zero → no seed (VirtualizeTest.cs:1543-1596).
2. **Start** (first `OnAfterRenderAsync` with JS ready, phase `None`, Virtualize.cs:516-529): index > 0 →
   `BeginFillingViewport(_itemSize)` (spacer item size frozen) and run the ScrollToItem core with no token (§7.2);
   index ≤ 0 and `itemCount > 0` → `Completed`.
3. **While positioning:** before-spacer callbacks are ignored until the phase starts (Virtualize.cs:692-695); user
   scroll aborts (Virtualize.cs:670-679); spacer callbacks grow the window toward the uncovered side instead of sliding
   (Virtualize.cs:715-722, 757-764); `RenderedContentMeasurement` accumulates in FillingViewport only; ViewportFill is
   ignored in ApplyingMeasuredGeometry.
4. **Realign after renders** (Virtualize.cs:531-548): when not loading, the slice matches the window, items are
   rendered and no placeholders → `alignToItem(InitialItemIndex − itemsBefore)` and grow by the returned direction.
   If alignment is impossible in ApplyingMeasuredGeometry → abort.
5. **Phase advance** (`AdvanceInitialIndexPhase`, Virtualize.cs:833-851) when the viewport is covered (no placeholders)
   or no growth is possible: FillingViewport → if nothing rendered or placeholders → Completed; else
   `BeginApplyingMeasuredGeometry(avg)` + re-render (spacers jump from `ItemSize` to the measured avg; the target is
   re-aligned at the next render, anchoring keeps it in place meanwhile); ApplyingMeasuredGeometry → Completed.
6. Applied **once per component instance**: later parameter changes have no effect (the phase is never reset; the test
   page remounts to apply a new index, VirtualizationAnchorMode.razor:488-495). `ScrollToItemAsync` aborts it.

Required outcomes (§9 J): the top rendered real row equals the target for indices 1, 5, 500 (fixed/variable heights,
Items/delayed provider); tall containers are filled to the bottom without user scroll while the target stays at the top
(±2px); near the end both edges are covered; the fill growth never exceeds `MaxItemCount + 2·OverscanCount`; the first
downward redistribution after positioning never moves backward; Home/End still work afterwards.

### 7.2 `ScrollToItemAsync(int itemIndex, CancellationToken ct = default)` (Virtualize.cs:247-393)

1. Not yet initialised (no JS module = before the first interactive `OnAfterRenderAsync`) → throws
   `InvalidOperationException` **synchronously**, message points to `InitialItemIndex` (Virtualize.cs:249-255).
2. `ct` already cancelled → returns a cancelled Task (Virtualize.cs:257-260).
3. Aborts InitialItemIndex positioning (Virtualize.cs:262).
4. **Last call wins:** cancels the previous call's linked CTS (Virtualize.cs:269-273). The superseded call's
   cancellation is swallowed because *its caller's* token is not cancelled → **superseded Tasks complete
   successfully** (Virtualize.cs:293-296; five rapid calls → `canceled=0, completed=5, faulted=0`,
   VirtualizationTest.cs:6892).
5. JS `beginProgrammaticScroll` (Virtualize.ts:269-276): stop convergence, clear top and bottom follow, mark the scroll
   source `AlignToItem`, drop queued IO entries for the spacers.
6. `MoveWindowToContain(index)` (Virtualize.cs:310-334): clamp (§7.3); `itemsBefore = max(0, clamped − OverscanCount)`,
   end-clamped to `max(0, itemCount − capacity)`; capacity seeded to `2·OverscanCount + 1` if still 0; refetch if the
   window moved or its data is not loaded.
7. `EnsureRenderCommittedAsync` (Virtualize.cs:336-357): register the render rendezvous **before** rendering; refetch
   (`RefreshDataCoreAsync(renderOnSuccess: true, token)`, provider token linked to the scroll token) or just re-render;
   await the post-render signal, which fires only when the rendered slice is the requested window with real items (or
   the list is empty) (Virtualize.cs:461-467) — so the Task never completes while placeholders sit at the target
   (VirtualizationTest.cs:6650). A provider exception faults the Task with that exception (VirtualizeTest.cs:1402).
8. `AlignToTargetAsync` (Virtualize.cs:359-376): re-clamp (count may have changed); `local = clamped − itemsBefore`; out
   of `[0, capacity)` or nothing rendered → no alignment. JS `alignToItemAt(local)` (Virtualize.ts:674-704): apply
   pending styles; measure the target row's top relative to the scroll element's border-box top (window: viewport top);
   row missing → remember it (retried by the next anchor restore) and report `null`; else send a
   `RenderedContentMeasurement`, and if `|delta| > 0.5` → ignore the next scroll event, mark `AlignToItem`, drop the
   anchor snapshot, stop convergence, clear pending Home/End jumps, `scrollTo({top: scrollTop + delta, behavior:
   'instant'})`; return the fill direction (§4.7).
9. `finally`: clear the current-scroll CTS if it is still ours. Then `UpdateWindowFromViewport(direction, …)` grows the
   window toward the uncovered side (Virtualize.cs:307).

**Cancellation outcomes:** caller's token cancelled → the Task is cancelled (`OperationCanceledException`) and the
linked provider request is cancelled (VirtualizationTest.cs:6907; VirtualizeTest.cs:1337 quarantined); the component
keeps working afterwards. A **user scroll** during the operation cancels the operation and its provider request
(Virtualize.cs:670-679) but the caller's Task **completes successfully** and the viewport follows the user
(VirtualizationTest.cs:6928, quarantined; its comment at :6950 claims the opposite of its assertion at :6957).
`DisposeAsync` cancels a pending scroll and its rendezvous (Virtualize.cs:1358-1359).

**Positioning with unmeasured items:** the target position is never computed as `index × size`. The window is moved so
the target is rendered as a real row, then its actual DOM offset is measured and scrolled to. Rows above it remain
estimated spacer space; growing the window upward afterwards replaces estimate with real rows while scroll anchoring
keeps the target fixed. Tests require the top row to be the target within a 1px sliver and ±2px offset even with
"tall rows before the target" skewing the average (VirtualizationTest.cs:6205, 6459). Programmatic scroll events must
never be reported as `UserScroll` (VirtualizationTest.cs:6532).

### 7.3 Clamping (`ClampToItemRange`, Virtualize.cs:378-393)

`itemCount ≤ 0 → max(0, index)`; `index < 0 → 0`; `index ≥ itemCount → itemCount − 1`. `-1` → top, `int.MaxValue` →
last row with the scroller at its end (±2px); an empty list completes immediately (VirtualizeTest.cs:1309).

---

## 8. CSP and other constraints

- **CSP (`style-src` without `'unsafe-inline'`):** Virtualize emits **no `style` attributes**. Spacer heights, the loop
  breaker and the built-in placeholder height travel as `data-blazor-virtualize-*` attributes; JS applies them through
  CSSOM (`element.style.setProperty`), which CSP does not block (Virtualize.cs:563, 639-643, 1199-1204;
  Virtualize.ts:107-123). Asserted by VirtualizeTest.cs:1633 (the only `style` attribute is the test host's). All other
  JS style writes are CSSOM too (`display`, `flexShrink`, `overflowAnchor`); the only attribute write is `tabindex`.
  `VirtualizationCsp.razor` (used by a CSP test outside `VirtualizationTest.cs`) covers Items and a 50ms-delayed
  provider with a Placeholder "so the placeholder data-blazor-virtualize-* path is exercised"
  (VirtualizationCsp.razor:32-34). .NET 10 used inline styles (net10:225, 288, 294-300, 466) — a CSP fix new in .NET 11.
- **Number formatting:** spacer values use the invariant culture (Virtualize.cs:650).
- **Browser APIs:** IntersectionObserver with `rootMargin` and `rootBounds`, ResizeObserver (`borderBoxSize` with
  `contentRect` fallback, Virtualize.ts:278-280), MutationObserver, `Range.getBoundingClientRect`, `CSS.supports`,
  `Element.scrollTo({ behavior: 'instant' })`. Without `overflow-anchor` support (Safari) the manual path is used.
- **Arithmetic:** capacity math is overflow-safe (`long`, Virtualize.cs:808-811, 930, 945-947) — `int.MaxValue`
  targets and `OverscanCount` 200 must not overflow. C# uses single-precision `float` for sizes; JS doubles.
- **Synchronisation context:** `ScrollToItemAsync` must be called on the renderer's context (Virtualize.cs:238-241).
- **Single enumeration** of provider results (Virtualize.cs:1082); `Items` is an `ICollection` read via
  `Skip/Take/ElementAtOrDefault` (O(n) for non-lists, Virtualize.cs:1063, 1148, 1195).
- **Errors** from the provider are rethrown during render (error-boundary compatible), not from the event that
  triggered the load (Virtualize.cs:554-560).
- **Interop lifecycle (Blazor only):** every interop call is skipped after disposal and `ObjectDisposedException` is
  swallowed (Interop.cs:31-34, 97-166); JS `init` returns early for disconnected spacers and `dispose` always releases
  the object reference (Virtualize.ts:74-76, 1048-1063); observers are keyed per dispatcher (Virtualize.ts:1037-1046).
  Disposal during a pending `init` or `setAnchorMode` must not touch the disposed reference (VirtualizeTest.cs:1677, 1720).
- **Accessibility:** spacers are `aria-hidden="true"`; the scroll container is made focusable (`tabindex=-1`, not in tab
  order) for Home/End.

---

## 9. Test catalog

Every test of `tests/VirtualizationTest.cs` (168 E2E test methods, Selenium, run in both Server and WebAssembly
modes), `tests/VirtualizeTest.cs` (47 C# unit tests against the component with a mocked `IJSRuntime` that calls the JS
callbacks by hand) and `tests/Virtualize.test.ts` (1 JS unit test), one line each, grouped by feature. Within a group:
E2E tests first (file order), then unit tests (marked *unit*). Format:
`**Name** (file:line; variants; page) → behavior checked`.

Status notes:
- **Skipped:** `AnchorMode_DeleteAboveViewport_ViewportStaysStable` (`Skip = …/issues/66509`, VirtualizationTest.cs:4403).
- **Quarantined:** `ScrollToItem_AfterEndJump_LandsAtTarget` (#68644, :6420), `ScrollToItem_UserScrollDuringProviderFetch_UserScrollWins`
  (#68777, :6927), unit `ScrollToIndexAsync_CancellationCancelsProviderRequest` (#68852, VirtualizeTest.cs:1336).
- **Disabled InlineData** (all #67865): `QuickGrid_AnchorMode_Top_AppendKeepsViewportStable("2", true)` (:2220),
  `QuickGrid_AnchorMode_Start_LargeAppendAtBottom_DoesNotFollowToBottom(false)` (:2684),
  `QuickGrid_AnchorMode_EndKeyJumpsToBottom("2", true)` (:2798).
- **Group L (33 tests)** mounts `BasicTestApp.QuickGridTest.*` pages that were not downloaded; their setup is inferred
  from the tests and mirrors the AnchorMode page. For Tsazor they map to the DataGrid skins with `Virtualize`.
- `VirtualizationCsp.razor` is not mounted by any test in `VirtualizationTest.cs` (a CSP test elsewhere uses it).
- `VirtualizationMaxItemCount_AppContext.razor` tests the .NET 8 AppContext switch — not applicable to Tsazor.

Conventions shared by the E2E tests (helpers at VirtualizationTest.cs:852-1058, 3211-3448, 4796-4908, 5168-6175):
- **Positions:** at top = `scrollTop < 2` (:3303); at bottom = `scrollHeight − scrollTop − clientHeight < 2` (:3317);
  near top = `ScrollContainer(200)` and asserted ≥ 150 (:3544-3554); mid-list = `ScrollContainer(5000)` until
  4000 < scrollTop < 6000 with a visible `data-index > 20` (:3411-3447); "left the edge" = real wheel input moving
  > 100–500px.
- **Stable** (`AssertViewportStaysStable`, :5198): the first row overlapping the container by > 1px keeps its
  `data-index` and its `relTop` within a tolerance: 0 (exact) for Start/End mid-list prepends (:4164, :4250), whole-pixel
  rounding for None mid-list (:3863), 2px typically, 5px for variable heights, async placeholder transitions, item-resize
  anchoring and window scrolling (:4889).
- **Settled** (`WaitForRenderToSettle`, :5229): three consecutive identical polls of rounded scrollTop, rendered item
  count and first visible index (optionally scrollHeight) within 15s; a blank viewport resets the count. JS probes use
  mutation quiescence over 3 animation frames (:5552-5595).
- **Landed at target** (`GetTopRenderedIndex`, :6103): the topmost `.item`/placeholder not entirely above the container's
  border-box top + 1px; a placeholder counts as −1. Edge coverage (`ViewportEdgeCoveredByRealItem`, :6150): a real
  `.item` within 2px of the padding-box edge.
- **Flash:** the top visible index drops by > 3 between samples (:2546, :4037) or decreases at all (scale tests, :5435).
  **Backward jump:** scrollTop moves > 5px against the scroll direction (:5527, :5711).
- **User scroll simulation:** `ScrollContainer` = `scrollTop = n` + a dispatched `scroll` event (classified as user
  scroll, :3254-3260); `ScrollContainerWithWheelTo` = real Selenium wheel input (:3263-3268); `FastScroll` = synthetic
  `WheelEvent` then `scrollTop` (:1982-2003); keys are sent to the focused scroll container or `<body>`.
- Rows on the AnchorMode pages are ~62px tall for `ItemSize=50` (min-height + padding + border), so all stability
  checks rely on measurement. Provider mutations on the AnchorMode page are queued and applied inside the provider,
  followed by `RefreshDataAsync` (VirtualizationAnchorMode.razor:198-215, 434-456); a provider "gate" makes
  round-trips deterministic (:2099-2110).

### A. Basic rendering, parameter validation and the fill loop (5 E2E, 8 unit)

- **AlwaysFillsVisibleCapacity_Sync** (VirtualizationTest.cs:43; variants: —; page: VirtualizationComponent `#sync-container`, 500px, Items 0..999, ItemSize 100, Overscan 3) → top spacer starts with `data-blazor-virtualize-reserved-height="0"` and `aria-hidden="true"`; after scrollTop = 50% and = scrollHeight the rendered item count stays equal to the initial count and the top spacer's reserved height becomes non-zero.
- **AlwaysFillsVisibleCapacity_Async** (VirtualizationTest.cs:76; —; VirtualizationComponent `#async-container`, ItemsProvider gated by a TCS, total 200) → before the first fetch completes there are 0 items and 0 placeholders (count unknown); after "finish loading" items appear with 0 placeholders; after scrolling to 50% and to bottom, all items are replaced by the *same number* of placeholders, which become the same number of items again after the next load.
- **InitialRender_DispatchesSingleSpacerCallback** (VirtualizationTest.cs:130; variants: Items / ItemsProvider (unload → toggle-provider → reload list); VirtualizationAnchorMode, 300px container) → patches `IntersectionObserver` + `DotNetObject.invokeMethodAsync` to record calls per IO batch: the first IO batch yields exactly 1 call, `OnSpacerBeforeVisible`, with spacerSize 0, containerSize 400 (300px + 2×50px rootMargin), reason 2 (ViewportFill).
- **CanUseViewportAsContainer** (VirtualizationTest.cs:321; —; VirtualizationComponent `#viewport-as-root`, no scrolling ancestor) → top spacer starts at reserved height "0"; `window.scrollTo(0, body.scrollHeight)` brings item id "999" into view and the top spacer grows (document/window is the scroll root).
- **ProgrammaticScrollToBottom_ReachesLastItems** (VirtualizationTest.cs:1793; —; VirtualizationScrollBehavior) → plain `scrollTop = scrollHeight` (no key) + stabilization → some rendered index > 480 (variable heights converge to the end).
- *unit* **Virtualize_ThrowsWhenGivenNonPositiveItemSize** (VirtualizeTest.cs:19; unit; host: 800px `overflow:auto` div) → `ItemSize = 0` throws InvalidOperationException "requires a positive value for parameter" during the first render (Virtualize.cs:398-402).
- *unit* **Virtualize_ThrowsWhenGivenMultipleItemSources** (VirtualizeTest.cs:38; unit) → both `Items` and `ItemsProvider` set → throws "can only accept one item source from its parameters" (Virtualize.cs:425-430).
- *unit* **Virtualize_ThrowsWhenGivenNoItemSources** (VirtualizeTest.cs:57; unit) → neither set → throws "…parameters to be specified and non-null" (Virtualize.cs:446-451).
- *unit* **Virtualize_OnBeforeSpacerVisible_MeasuredSpacerTriggersProviderFetch** (VirtualizeTest.cs:280; unit; provider, 100 items) → `OnBeforeSpacerVisible(100, 300, 500, ViewportFill)` issues a provider request.
- *unit* **Virtualize_RendersItemsWithoutWrapperElements** (VirtualizeTest.cs:434; unit; Items 1..3) → no wrapper element around items: the item template's frames are emitted directly (Virtualize.cs:599-602).
- *unit* **Virtualize_FirstRender_DoesNotShiftStartIndexAwayFromZero** (VirtualizeTest.cs:633; unit; provider) → the first `OnBeforeSpacerVisible(50, 500, 500)` issues exactly one request, with `StartIndex 0` (no "slide by one" before anything rendered, Virtualize.cs:725).
- *unit* **Virtualize_BothSpacersVisible_SmallItemCountDoesNotCrash** (VirtualizeTest.cs:661; unit; Items 1..3, container 1000) → alternating after/before/after callbacks with everything visible: no crash, measurements accumulate.
- *unit* **OnBeforeSpacerVisible_UserScroll_MovesWindowTowardTop** (VirtualizeTest.cs:1479; unit) → the same callback with reason UserScroll moves the window toward the top.

### B. ItemsProvider, cancellation, refresh, data changes, EmptyContent (13 E2E, 8 unit)

- **CancelsOutdatedRefreshes_Async** (VirtualizationTest.cs:291; —; VirtualizationComponent async list) → `scrollTo({top})` at 1000, 2000 … 5000 without finishing loads; the page counts cancellations via `request.CancellationToken.Register`; asserts cancellation-count > 0 (superseded provider requests are cancelled).
- **CanMutateDataInPlace_Sync** (VirtualizationTest.cs:460; —; VirtualizationDataChanges `#using-items`, Items, no @key) → clicking an item's Mutate button (mutates object, parent re-renders) shows "Person 2 MUTATED" in place.
- **CanMutateDataInPlace_Async** (VirtualizationTest.cs:483; —; VirtualizationDataChanges `#using-itemsprovider`, provider 500ms delay) → same as above with ItemsProvider: in-place object mutation is visible after the parent re-render without a refresh.
- **CanChangeDataCount_Sync** (VirtualizationTest.cs:506; —; VirtualizationDataChanges `#using-items`) → adding an item to the Items list (parent event handler) immediately shows Person 4 (Items mode re-queries on every parameter set).
- **CanChangeDataCount_Async** (VirtualizationTest.cs:529; —; VirtualizationDataChanges `#using-itemsprovider`) → after the provider's count grows, the list still shows 3 people (provider not re-queried on parent render); after `RefreshDataAsync()` button, 4 people.
- **CanRefreshItemsProviderResultsInPlace** (VirtualizationTest.cs:561; —; VirtualizationDataChanges `#using-itemsprovider`) → mutate Person 2 (shows MUTATED), then RefreshDataAsync → provider returns fresh objects and the text reverts to "Person 2".
- **CanExpandDataSetAndRetainScrollPosition** (VirtualizationTest.cs:626; variants: the 7 horizontal containers + `removing-many` div; VirtualizationDataChanges) → scroll to end of 1000-item set ("Person 1000" visible); switch dataset to 100000 (RefreshDataAsync on all lists); "Person 1000" is still visible (scroll position is kept as pixels, not percentage).
- **CanHandleDataSetShrinkingWithExistingOffsetAlreadyBeyondNewListEnd** (VirtualizationTest.cs:660; variants: same 8 containers; VirtualizationDataChanges) → at end of 100000 items, switch to 25 items: window must clamp to the new end quickly and show "Person 25" (regression #37245, which used to take >30 minutes of stepwise reloads).
- **EmptyContentRendered_Sync** (VirtualizationTest.cs:687; —; VirtualizationComponent `#empty-container`, empty Items) → `EmptyContent` (`#no-data-sync`) is rendered.
- **EmptyContentRendered_Async** (VirtualizationTest.cs:694; —; VirtualizationComponent async list) → EmptyContent not shown before first load, not shown after loading 200 items, not shown while a RefreshDataAsync is in flight; shown after the refresh completes with TotalItemCount 0.
- **VariableHeightAsync_CollectionMutationWorks** (VirtualizationTest.cs:1445; —; VirtualizationVariableHeightAsync) → insert 100px item at start + RefreshDataAsync → new item 0 is 100px, item 1 is 25px; remove from middle + refresh → End reaches item 999 and Home shows the 100px item 0.
- **VariableHeightAsync_SmallItemCountsWork** (VirtualizationTest.cs:1501; —; VirtualizationVariableHeightAsync) → set count 0 + refresh → 0 items and EmptyContent `#no-data`; count 1 → exactly 1 item (30px), no EmptyContent; count 5 → exactly 5 items with heights 30/47/64/40/57.
- **AnchorMode_End_InitialItemsProviderLoad_PinsToBottom** (VirtualizationTest.cs:5981; variants: none; page: VirtualizationAnchorMode) → Server mode only: emulates 400ms latency and 50 kB/s throughput over CDP. Unload the list, switch to ItemsProvider, select AnchorMode End, turn the provider gate on, reload (InitialItemIndex 0). Releasing p1 must pin to the bottom: maxScrollTop > 0 and |scrollTop − maxScrollTop| < 2 within 10s. A second provider call (p2, the tail window) must follow. After releasing p2, the bottom visible real item is 999 and the list is still at the bottom. In End mode the first provider load pins to the bottom before the tail data exists, then fetches the tail. (Group G/B.)
- *unit* **Virtualize_DispatchesExceptionsFromItemsProviderThroughRenderer** (VirtualizeTest.cs:76; unit) → a provider that throws synchronously, triggered by `OnAfterSpacerVisible(10, 50, 100, ViewportFill)`: the exception surfaces from the next render ("Thrown from items provider."), i.e. it is stored and rethrown in BuildRenderTree (Virtualize.cs:554-560, 1166-1176).
- *unit* **Virtualize_NonZeroStartIndex_ItemsProviderReceivesCorrectStartIndex** (VirtualizeTest.cs:306; unit; provider, 500 items) → after a fill, `OnBeforeSpacerVisible(5000, 500, 500)` leads to a request with `StartIndex > 0`.
- *unit* **Virtualize_RapidScrollCancellation_StaleRequestsCancelled** (VirtualizeTest.cs:736; unit; never-completing provider) → a second callback (container 500 → 1000) starts a second request and cancels the first request's token; nothing rendered → no measurements.
- *unit* **Virtualize_CanceledPrependAdjustment_DoesNotOverwriteNewerWindow** (VirtualizeTest.cs:791; unit; provider, 200 items) → window at 100; 20 items prepended; a RefreshDataAsync whose prepend re-request (start 120) is blocked; a newer RefreshDataAsync (window forced to 130) completes with `_itemsBefore = 150`; releasing the stale one must leave 150 (its token was cancelled; `_itemsBefore` is only written after `ThrowIfCancellationRequested`, Virtualize.cs:1252-1263).
- *unit* **Virtualize_ItemsProvider_GrowingTotalCount_DoesNotAssumePrepend** (VirtualizeTest.cs:1046; unit; provider total 100 → 120, same items at same indices) → an IO-driven refresh must not shift `_itemsBefore` by the count delta (20).
- *unit* **Virtualize_ItemsProvider_PrependedSinglePassEnumerable_IsNotEnumeratedMoreThanOnce** (VirtualizeTest.cs:1097; unit) → after a 20-item prepend, RefreshDataAsync shifts `_itemsBefore` by +20 and the provider's single-pass `IEnumerable` is enumerated exactly once (materialised to a list, Virtualize.cs:1082-1083).
- *unit* **Virtualize_ItemsProvider_GrowthWhileWindowMovesPastPreviousFirstItem_DistinguishesPrependFromAppend** (VirtualizeTest.cs:1175; unit; variants prepend → 140 / append → 130) → window at 100..139; 10 items added; a UserScroll callback moves the window to 130 (past the previous first item): the previous *last* item (index 139) is the comparison point; prepend detected → window 140, append → 130.
- *unit* **Virtualize_DefaultProvider_ValueTypeItem_AppendDoesNotAssumePrepend** (VirtualizeTest.cs:1215; unit; Items of int) → appending 20 to an in-memory list must not shift the window by 20 (value-type comparison uses `EqualityComparer.Default`, Virtualize.cs:1064-1066).

### C. MaxItemCount and OverscanCount (2 E2E, 1 unit)

- **CanLimitMaxItemsRendered** (VirtualizationTest.cs:432; variants: AppContext switch `…Virtualize.MaxItemCount`=10 / parameter MaxItemCount=10; VirtualizationMaxItemCount[_AppContext], 600px, 30px items, Overscan 3, provider 100ms delay, 100000 items) → exactly 16 items render (= MaxItemCount 10 + 2×Overscan 3, although 20 would fit); first is "Thing 0"; after scrollTop=300 first item changes and count is in (3, 16].
- **CanElevateEffectiveMaxItemCount_WhenOverscanExceedsMax** (VirtualizationTest.cs:732; —; VirtualizationLargeOverscan, 600px, 500 items × 20px, MaxItemCount 100, Overscan 200) → ≥ 200 items render (effective cap = MaxItemCount + 2×Overscan); then PageDown repeatedly (container focused by click) until bottom: rendered indices always contiguous (no holes) and the max rendered index never decreases.
- *unit* **MaxItemCount_ClampsVisibleItemCapacity** (VirtualizeTest.cs:854; unit; provider, ItemSize 10, MaxItemCount 20) → container 500 would give 50 + 30 = 80; the request count is ≤ 50 (= 20 + 2×15).

### D. Tables, display modes, horizontal overflow, RTL, CSS scaling (14 E2E, 1 unit)

- **CanRenderHtmlTable** (VirtualizationTest.cs:373; —; VirtualizationTable, `SpacerElement="tr"`, window scroll, `html, body { overflow-y: scroll }`) → first/last children of `tbody` are `<tr>` spacers with `aria-hidden="true"`, top reserved height "0"; row-999 absent; after `window.scrollTo(bottom)` row-999 displayed, top spacer non-zero, bottom spacer reserved height "0".
- **VariableHeight_HtmlTable_DoesNotProduceNestedTrElements** (VirtualizationTest.cs:398; —; VirtualizationVariableHeightTable, 500 rows 30–200px, SpacerElement tr) → top spacer is `<tr>`; `tr > tr` count is 0 before and after scrolling the window to the bottom (vht-row-499 shown); rows contain `td`s (no wrapper elements around item templates).
- **CanLoadNewDataWithHorizontalScrollToRight** (VirtualizationTest.cs:592; variants: 7 containers simple/complex table `display:block` with overflow, overflow on parent div, overflow on tbody, `display:table` div variants; VirtualizationDataChanges, 200px tall × 300px wide, provider 200ms) → with dataset 1000: scrollLeft=scrollWidth + scrollTop=scrollHeight (retried) until "Person 1000" rendered; then scrollTop=0 (scrolled right) until "Person 1" rendered.
- **VariableHeightAsync_RtlLayoutWorks** (VirtualizationTest.cs:1418; —; VirtualizationVariableHeightAsync with `direction: rtl`) → End jump reaches item 999 and Home jump reaches item 0 in RTL.
- **VariableHeightAsync_CanScrollWithoutFlashing** (VirtualizationTest.cs:1566; variants: 9 combos of `transform: scale` × CSS `zoom` × CSS `scale` (50/75/100/150/200%); VirtualizationVariableHeightAsync, autoload, 200 items) → script scrolls +100px per iteration (≤300), waits rAF + an IO tick; the top visible item index must never decrease (no flashing) and max index seen ≥ 199. `public virtual`.
- **DisplayModes_BlockLayout_SupportsVariableHeights** (VirtualizationTest.cs:1606; —; VirtualizationDisplayModes `display:block`, 50 items 30–80px) → item heights 30px/47px preserved; items still rendered after scrolling to bottom.
- **DisplayModes_GridLayout_SupportsVariableHeights** (VirtualizationTest.cs:1626; —; VirtualizationDisplayModes `display:grid; gap:4px`) → item 0 is 30px; items rendered at 50% and at bottom (spacers act as grid rows).
- **DisplayModes_SubgridLayout_SupportsVariableHeights** (VirtualizationTest.cs:1647; —; VirtualizationDisplayModes, Virtualize inside a `grid-template-columns: subgrid` wrapper) → item 0 is 30px; items rendered after scrolling to bottom.
- **VirtualizeWorksInsideHorizontalOverflowContainer** (VirtualizationTest.cs:2871; variants: —; page: VirtualizationHorizontalOverflow) → A table with `SpacerElement=tr` (1000 rows, 30 px) sits inside a `div` with `overflow-x:auto; overflow-y:hidden`, so the window must be the scroll root. Rows render and row 999 is absent at first. After `window.scrollTo(bottom)`, row 999 exists and is displayed.
- **Table_VariableHeight_IncrementalScrollDoesNotCauseWildJumps** (VirtualizationTest.cs:3020; variants: —; page: VirtualizationVariableHeightTable) → A window-scrolled `<table>` with 500 rows of 30-200 px (ItemSize 50, overscan 3). After `window.scrollTo(0,1000)`, does 15× `window.scrollBy(0,300)`, each waiting for a render settle. The largest signed per-step jump must be < 1500 px (about 300 is expected; the browser's anchoring bug on `<tr>` gives 3000-8000).
- **Table_EndAnchor_AsyncProvider_AppendDuringRapidUserScroll_DoesNotReverseScrollDirection** (VirtualizationTest.cs:3053; variants: —; page: VirtualizationTableScrollWithAppend, End, 500 ms provider) → At the bottom: 8 real wheel actions of −500 px, 20 ms apart, while appends fire at 300/900/1500 ms. Per animation frame, a "backward jump" is scrollTop increasing by more than 5 px. Precondition: placeholders were rendered in some frame. Asserts `backwardJumps == 0`.
- **Table_EndAnchor_AsyncProvider_ContinuousAppend_MaterializesNewTailBeforeUpdatesStop** (VirtualizationTest.cs:3082; variants: —; page: VirtualizationTableScrollWithAppend, End) → At the bottom and settled: 10 appends every 600 ms, each with `RefreshDataAsync` and a 500 ms delay. Sampled per frame (once total > 500): the first and last visible indexes never decrease; the last-visible index advances ≤ 1 per frame; the final total is 510, the last visible index > 499, and the bottom gap ≤ 1 px.
- **Table_StartAnchor_AsyncProvider_ContinuousPrepend_MaterializesNewHeadWithoutIndexReversal** (VirtualizationTest.cs:3122; variants: —; page: VirtualizationTableScrollWithAppend, switched to Start) → At scrollTop 0: 10 prepends every 600 ms (indexes −1…−10). Per frame: the first and last visible indexes never increase; the first-visible index decreases ≤ 1 per frame; finally the first visible index is < 0 (a new head item is shown) and scrollTop ≤ 1.
- **Table_StartAnchor_AsyncProvider_ContinuousPrependAfterLeavingHead_KeepsViewportStable** (VirtualizationTest.cs:3158; variants: —; page: VirtualizationTableScrollWithAppend, Start) → Wheel-scrolls to 300 (scrollTop > 200), so the user has left the head. Settles and records the first visible row. During 10 prepends every 600 ms, that row must exist in every animation frame (`missingAnchorFrames == 0`) and its offset may drift at most ≤ 2 px. Final total is 510.
- *unit* **Virtualize_TableSpacerElement_RendersItemsDirectlyWithTrSpacers** (VirtualizeTest.cs:468; unit; SpacerElement "tr") → the spacers are rendered as `<tr>`.

### E. Measurement, variable heights, dynamic content (11 E2E, 7 unit)

- **RerendersWhenItemSizeShrinks_Sync** (VirtualizationTest.cs:236; —; VirtualizationComponent sync list) → changing the `ItemSize` parameter from 100 to 10 (items also render 10px tall) re-renders with more items than before.
- **RerendersWhenItemSizeShrinks_Async** (VirtualizationTest.cs:256; —; VirtualizationComponent async list) → after ItemSize 100→10: the same number of loaded items stays rendered and placeholders (>0) appear for the newly gained capacity; after "finish loading" item count > initial and 0 placeholders.
- **ToleratesIncorrectItemSize** (VirtualizationTest.cs:344; —; VirtualizationComponent `#incorrect-size-container`, ItemSize 50 but items 30px) → scrolls scrollTop 0..950 in 50px steps with 200ms pauses; top spacer must leave "0" (window keeps sliding despite the wrong estimate; regression for "spacer visible but calculation says nothing to load").
- **VariableHeight_ItemsRenderWithCorrectHeights** (VirtualizationTest.cs:1110; —; VirtualizationVariableHeight) → item 0 has inline `height: 20px`, item 1 `height: 57px` (item template output untouched).
- **DynamicContent_ItemHeightChangesUpdateLayout** (VirtualizationTest.cs:1129; —; VirtualizationDynamicContent, 300px, 500 items min-height 50, ItemSize 50, default Overscan 15) → expand item 2 (+100px content) → item 3 moves down; scroll to ≥200 and back to 0 → item 2 still expanded.
- **VariableHeight_ContainerResizeWorks** (VirtualizationTest.cs:1363; —; VirtualizationVariableHeight, container height 100↔400 via buttons) → resize to 400px, End jump reaches item 999; resize to 100px, Home jump reaches item 0.
- **VariableHeightAsync_LoadsItemsWithCorrectHeights** (VirtualizationTest.cs:1395; —; VirtualizationVariableHeightAsync, 200px, 1000 items 25–55px, ItemSize 35, manual loading) → 0 items and 0 placeholders before first load; after load item 0 is `height: 25px`, item 1 `height: 36px`.
- **BimodalHeightDistribution_CanScrollThroughItems** (VirtualizationTest.cs:1665; —; VirtualizationBimodal, 300px, 200 items alternating 30/300px, ItemSize 50) → heights 30/300 preserved; End jump reaches item 199; Home jump reaches item 0.
- **NestedVirtualize_BothRenderIndependently** (VirtualizationTest.cs:1690; —; VirtualizationBimodal nested: outer 400px, 50 × 120px; inner Virtualize in outer item 0, 80px, 100 items 15–35px) → outer renders < 50 items (outer measurement not polluted by inner items); inner renders items; heights 120/15 kept; scroll outer to 500 and back to 0 → inner still renders items.
- **NonZeroStartIndex_ScrollToMiddleThenMeasure** (VirtualizationTest.cs:1820; —; VirtualizationScrollBehavior) → scrollTop = scrollHeight/2 once, wait for mutations to quiet (200ms) + stabilization → rendered indices > 50 exist and every rendered item has a non-zero inline height. `public virtual`.
- **NestedVariableHeight_OuterMeasurementsNotPollutedByInner** (VirtualizationTest.cs:2850; variants: —; page: VirtualizationNestedVariableHeight) → The outer container is 400 px with 40 items of 100-300 px (ItemSize 150, default overscan). Each outer item hosts an inner Virtualize with 30 items of 15-45 px (ItemSize 25). The outer list must render < 40 items, so its average is not polluted by inner rows, and inner items must render.
- *unit* **Virtualize_MeasurementsUpdateRunningAverage** (VirtualizeTest.cs:106; unit; Items 1..100, ItemSize 50) → two `OnAfterSpacerVisible(0, 80, 500, ViewportFill)`: the first makes items render, the second accumulates (`_totalMeasuredHeight > 0`, `_measuredItemCount > 0`).
- *unit* **Virtualize_ZeroSpacerSeparationDoesNotCorruptAverage** (VirtualizeTest.cs:239; unit) → after valid measurements, `spacerSeparation = 0` adds nothing (Virtualize.cs:870).
- *unit* **Virtualize_NaNSpacerSeparationDoesNotCrashComponent** (VirtualizeTest.cs:332; unit) → NaN separation in before/after callbacks: no crash and the component still issues provider requests. (Note: NaN passes the `<= 0` guard and poisons the average — see Appendix A.)
- *unit* **Virtualize_NegativeSpacerSeparationDoesNotCrashComponent** (VirtualizeTest.cs:366; unit) → negative separation adds no measurement (total and count unchanged).
- *unit* **Virtualize_InfinitySpacerSeparationDoesNotCrashComponent** (VirtualizeTest.cs:401; unit) → +∞ separation: no crash/overflow, requests continue (MaxItemCount caps capacity; the effective size falls back to `_itemSize`/ItemSize, Virtualize.cs:853-861).
- *unit* **Virtualize_RefreshDataAsync_ResetsRunningAverage** (VirtualizeTest.cs:502; unit) → after 10 callbacks have accumulated measurements, `RefreshDataAsync()` sets total and count to 0 (Virtualize.cs:230-231).
- *unit* **Virtualize_FixedItems_MeasurementsAccumulateWithoutBreakingRendering** (VirtualizeTest.cs:697; unit; Items 1..20) → measurements start at 0/0 and accumulate after two callbacks.

### F. Viewport anchoring for item resizes (overflow-anchor / manual compensation) (5 E2E, 0 unit)

- **DynamicContent_ExpandingOffScreenItemDoesNotAffectVisibleItems** (VirtualizationTest.cs:1167; —; VirtualizationDynamicContent) → scroll to bottom until item 2 is virtualized out; expanding item 2 (data change above viewport) moves the first visible item by < 5px.
- **ViewportAnchoring_ExpandAboveViewport_VisibleItemStaysInPlace** (VirtualizationTest.cs:2885; variants: —; page: VirtualizationDynamicContent) → scrollTop = 500, with item 5 still in the DOM above the viewport (overscan). Records the first visible item. Clicking `expand-item-5` (a Blazor re-render that grows item 5 by about 110 px) must move the first visible item's relTop by < 5 px.
- **ViewportAnchoring_CollapseAboveViewport_VisibleItemStaysInPlace** (VirtualizationTest.cs:2918; variants: —; page: VirtualizationDynamicContent) → Expands item 5 at the top, scrolls to 600, and records the first visible item. Clicking `collapse-all` (item 5 shrinks above the viewport) must move it by < 5 px.
- **ViewportAnchoring_RenderlessAboveViewportResize_AfterScroll_VisibleItemStaysInPlace** (VirtualizationTest.cs:2948; variants: —; page: VirtualizationComponent `#incorrect-size-container`) → Steps scrollTop 0→1000 by 100, using an assignment plus a dispatched `scroll`. Within 5 s, the container's computed `overflow-anchor` must be != `none`: the scroll-time suppression is lifted once rendering settles. Then the last item fully above the viewport grows by 200 px via `style.height`, with no Blazor render. Polls until relTop is stable (3 reads < 0.5 px apart, 10 s). The visible item must move < 5 px, which only works through native anchoring.
- **AnchorMode_None_ItemExpansionAfterPrepend_NoGap** (VirtualizationTest.cs:3878; variants: variableHeight × provider (4); page: VirtualizationAnchorMode) → None mode mid-list. Prepend 10: stable (±5px). Then "expand-item" sets item Index==3 (far above the viewport) to 400px: still stable (±5px), and no gap > 2px between consecutive rendered items inside the viewport.

### G. AnchorMode with an element scroll container (incl. prepend/append/delete stability) (36 E2E, 3 unit)

- **DynamicContent_PrependItemsWhileScrolledToMiddle_VisibleItemsStayInPlace** (VirtualizationTest.cs:1211; —; VirtualizationDynamicContent, default AnchorMode Start) → scroll to 5000 (first rendered index > 10); prepend 10 items → the first visible item moves < 5px; then wheel-scroll to 0 shows item −10.
- **DynamicContent_AppendItemsWhileScrolledToMiddle_VisibleItemsStayInPlace** (VirtualizationTest.cs:1263; —; VirtualizationDynamicContent) → at 5000, append 10 → first visible item and scrollTop each change < 5px.
- **DynamicContent_PrependItemsWhileAtTop_NewItemsAppearAtTop** (VirtualizationTest.cs:1296; —; VirtualizationDynamicContent, default Start) → at scrollTop 0, prepend 10 → scrollTop stays < 50 and item −10 becomes rendered (Start mode shows new head items).
- **DynamicContent_AppendItemsWhileAtBottom_ViewportStaysStable** (VirtualizationTest.cs:1322; —; VirtualizationDynamicContent, default Start) → at bottom (gap < 2px), append 10 × 50px → viewport does NOT chase the new bottom: remaining gap (scrollHeight − scrollTop − clientHeight) > 50px.
- **AnchorMode_None_PrependAtTop_ViewportStaysStable** (VirtualizationTest.cs:3454; variants: variableHeight × provider (4); page: VirtualizationAnchorMode) → None mode at scrollTop 0. Prepend 10, then settle: the same first item stays put (±2px), so the viewport does not show the new items. A real wheel scroll back to 0 must then render `data-index=-10` within 5 s.
- **AnchorMode_None_LargeAppendAtBottom_DoesNotFollowToBottom** (VirtualizationTest.cs:3492; variants: variableHeight × provider (4); page: VirtualizationAnchorMode) → None mode at the bottom. Append 100, and right after the status updates (no settle) the gap to the bottom must be > 2000px, so there is no convergence or chasing of the new bottom.
- **AnchorMode_None_AppendAtBottom_NoAutoScroll** (VirtualizationTest.cs:3519; variants: provider (2); page: VirtualizationAnchorMode) → None mode at the bottom. Append 10, then settle: the same first visible item stays at the same relTop (±2px).
- **AnchorMode_NearTop_PrependKeepsViewportStable** (VirtualizationTest.cs:3565; variants: mode 0/1/2 × Items/Provider (6) + Provider with default comparer for modes 0/1 (2) = 8; page: VirtualizationAnchorMode) → At scrollTop ≈200 (near top but not at top), prepend 10, then settle: the first item stays stable (±2px) in every mode, including Start. Start pins only at the exact top.
- **AnchorMode_NearTop_AppendKeepsViewportStable** (VirtualizationTest.cs:3597; variants: mode 0/1/2 × provider (6); page: VirtualizationAnchorMode) → Near top (≈200), append 10, then settle: stable (±2px) in all modes.
- **AnchorMode_Top_AppendKeepsViewportStable** (VirtualizationTest.cs:3628; variants: mode 0/1/2 × provider (6); page: VirtualizationAnchorMode) → Verifies the initial position (End mode starts at the bottom, others at top), moves to the top for End, then appends 10: the top item stays stable (±2px).
- **AnchorMode_Bottom_PrependKeepsViewportStable** (VirtualizationTest.cs:3663; variants: mode 0/1/2 × provider (6); page: VirtualizationAnchorMode) → At the bottom, prepend 10, then settle: the first visible item stays stable (±2px). The End mode is not disturbed by a prepend either.
- **AnchorMode_MidList_AppendKeepsViewportStable** (VirtualizationTest.cs:3694; variants: mode 0/1 × provider (4) + Provider with default comparer for modes 0/1 (2) = 6, no End variant; page: VirtualizationAnchorMode) → Mid-list (≈5000), append 10, then settle: stable (±2px).
- **AnchorMode_None_MidList_ViewportStable** (VirtualizationTest.cs:3848; variants: provider (2); page: VirtualizationAnchorMode) → None mode mid-list, prepend 10, then settle: same first item, relTop identical after rounding to whole pixels (tolerance 0).
- **AnchorMode_None_AsyncProvider_PrependKeepsViewportStable** (VirtualizationTest.cs:3936; variants: — (variable height + provider + 500 ms delay); page: VirtualizationAnchorMode) → Mid-list, settled. Prepend 10 (RefreshDataAsync with the placeholder transition), then settle: stable (±5px).
- **AnchorMode_Start_PrependAtTop_NewItemsVisible** (VirtualizationTest.cs:4070; variants: variableHeight × provider (4); page: VirtualizationAnchorMode) → Start mode at scrollTop 0. Prepend 10, then settle: scrollTop < 50 and `data-index=-10` is rendered, so the new head is shown.
- **AnchorMode_Start_AppendAtBottom_ViewportStable** (VirtualizationTest.cs:4096; variants: provider (2); page: VirtualizationAnchorMode) → Start mode at the bottom. Append **100** (despite the test's name); right after the status updates the gap must be > 2000px, so there is no follow to the bottom.
- **AnchorMode_Start_SmallAppendAtBottom_ViewportStable** (VirtualizationTest.cs:4121; variants: provider (2); page: VirtualizationAnchorMode) → Start mode at the bottom, append 10, then settle: same first item, ±2px.
- **AnchorMode_Start_MidList_ViewportStable** (VirtualizationTest.cs:4149; variants: provider (2); page: VirtualizationAnchorMode) → Start mode mid-list, prepend 10, then settle: same first item with **exact** relTop (tolerance 0).
- **AnchorMode_End_PrependAtTop_ViewportStaysStable** (VirtualizationTest.cs:4178; variants: variableHeight × provider (4); page: VirtualizationAnchorMode) → End mode starts at the bottom (asserted). Scroll to the top, prepend 10, then settle: same item at the same relTop (±2px, ±5px for variable height), so scrollTop grows to compensate.
- **AnchorMode_End_AppendAtBottom_ViewportFollows** (VirtualizationTest.cs:4211; variants: variableHeight × provider (4); page: VirtualizationAnchorMode) → End mode at the bottom, append 10: eventually gap < 2 (it follows).
- **AnchorMode_End_MidList_ViewportStable** (VirtualizationTest.cs:4235; variants: provider (2); page: VirtualizationAnchorMode) → End mode mid-list, prepend 10, then settle: same first item with **exact** relTop (tolerance 0).
- **AnchorMode_End_AppendAtMidList_DoesNotAutoScroll** (VirtualizationTest.cs:4262; variants: provider (2); page: VirtualizationAnchorMode) → End mode mid-list, append 10, then settle: |ΔscrollTop| < 2 and the same item's |ΔrelTop| < 2.
- **AnchorMode_End_LargeAppendAtBottom_StillFollows** (VirtualizationTest.cs:4290; variants: variableHeight × provider (4); page: VirtualizationAnchorMode) → End mode at the bottom, append 100. Polls every 500 ms for up to 30 s for gap < 2 **and** max rendered `data-index` ≥ 1099 (the new last row is materialized as a real item, not a placeholder).
- **AnchorMode_End_SmallDataset_AppendFollowsToBottom** (VirtualizationTest.cs:4341; variants: — (Items); page: VirtualizationAnchorMode) → End mode with only 5 items (all fit, spacerAfter is 0). Scroll to the bottom, append 10: within 10 s scrollTop > 0 and gap < 2.
- **AnchorMode_End_GrowingDataset_AppendFollowsToBottom** (VirtualizationTest.cs:4371; variants: — (Items); page: VirtualizationAnchorMode) → End mode, 5 items, then 20 × "Append 1 item" (25 total). Within 10 s scrollTop > 0 and gap < 2, so it follows before any scrollbar exists.
- **AnchorMode_DeleteAboveViewport_ViewportStaysStable** (VirtualizationTest.cs:4410; variants: mode 0/1/2 × provider (6); page: VirtualizationAnchorMode) → Mid-list, settled, delete 10 from the top, then settle: stable (±5px). **Skipped: `Theory(Skip = "…/issues/66509")`.**
- **AnchorMode_DeleteBelowViewport_ViewportStaysStable** (VirtualizationTest.cs:4443; variants: mode 0/1/2 × provider (6); page: VirtualizationAnchorMode) → Mid-list, settled, delete the last 10 items, then settle: same first visible index and |ΔscrollTop| < 5.
- **AnchorMode_DeleteAtViewportTop_FirstSurvivingItemJumpsToTheTop** (VirtualizationTest.cs:4473; variants: mode 0/1/2 × provider (6); page: VirtualizationAnchorMode) → scrollTop ≈200 (> 100), so the anchor item lies in rows 0-9. Delete 10 from the top, then settle: items are still rendered and the first visible index is ≥ 10 (the first survivor).
- **AnchorMode_Start_LargePrependAtTop_StillShowsNewItems** (VirtualizationTest.cs:4508; variants: variableHeight × provider (4); page: VirtualizationAnchorMode) → Start mode at 0, prepend 100, then settle: scrollTop < 50 and `data-index=-100` is rendered.
- **AnchorMode_None_LargePrependAtTop_ViewportStaysStable** (VirtualizationTest.cs:4533; variants: variableHeight × provider (4); page: VirtualizationAnchorMode) → None mode at 0, prepend 100, then settle: same item stable (±2px, ±5px for variable height). Then a wheel scroll to 0 must render `data-index=-100` within 5 s.
- **AnchorMode_End_LargePrependAtTop_ViewportStaysStable** (VirtualizationTest.cs:4573; variants: variableHeight × provider (4); page: VirtualizationAnchorMode) → End mode starts at the bottom; scroll to the top, prepend 100, then settle: stable (±2/±5px).
- **AnchorMode_End_AppendAfterLeavingBottom_DoesNotReengage** (VirtualizationTest.cs:4606; variants: variableHeight × provider (4); page: VirtualizationAnchorMode) → End mode at the bottom, append 10: follows (gap < 2). Then a **wheel** scroll about 500px up (until scrollTop < previous − 100), settle, append 10 again, settle: |ΔscrollTop| < 2, so there is no re-engagement. (The method is declared `virtual`.)
- **AnchorMode_End_SmallDataset_AppendAfterScrollingUpAFewRows_DoesNotReengage** (VirtualizationTest.cs:4652; variants: provider (2); page: VirtualizationAnchorMode) → "Console scenario": 40 items, OverscanCount 100, so every item is in the DOM. Pin to the bottom, wheel up 150px (≥ 100 actually moved), precondition gap > 50. Append 10, then settle: |ΔscrollTop| < 5.
- **AnchorMode_Start_PrependAfterLeavingTop_DoesNotReengage** (VirtualizationTest.cs:4699; variants: variableHeight × provider (4); page: VirtualizationAnchorMode) → Start mode at 0, prepend 10 (−10 visible). Wheel down to about 500 (> 200), settle, prepend 10 again, settle: scrollTop > 200, so it is not pulled back to the top.
- **AnchorMode_Start_SmallDataset_PrependAfterScrollingDownAFewRows_DoesNotReengage** (VirtualizationTest.cs:4732; variants: provider (2); page: VirtualizationAnchorMode) → Console scenario (40 items, overscan 100). Start at 0, wheel down to 150 (≥ 100), prepend 10, then settle: scrollTop ≥ 100.
- **AnchorMode_Start_LargeAppendAtBottom_DoesNotFollowToBottom** (VirtualizationTest.cs:4775; variants: variableHeight × provider (4); page: VirtualizationAnchorMode) → Start mode at the bottom, append 100: immediately the gap is > 2000px. Same check as `Start_AppendAtBottom_ViewportStable`, with variable-height variants added.
- *unit* **Virtualize_ScrollToBottom_SetWhenAtEndWithNewMeasurements** (VirtualizeTest.cs:538; unit; Items 1..100, AnchorMode End) → second `OnAfterSpacerVisible(0, 500, 500)` (itemsAfter 0, new measurement) either calls JS `scrollToBottom` or leaves `_pendingScrollToBottom` set (Virtualize.cs:776-783).
- *unit* **Virtualize_ScrollToBottom_NotSetWhenNotAtEnd** (VirtualizeTest.cs:581; unit; provider, 100 items, default Start) → `OnAfterSpacerVisible(5000, 1000, 500)` does not set `_pendingScrollToBottom`.
- *unit* **Virtualize_ScrollToBottom_NotSetWhenMeasurementsNotApplied** (VirtualizeTest.cs:594; unit; Items 1..100, default Start) → with `spacerSeparation = 0` (no new measurement) `_pendingScrollToBottom` stays false. (Weak: in Start mode the missing End bit alone already prevents it, Virtualize.cs:778.)

### H. AnchorMode with window (document) scrolling (10 E2E, 0 unit)

- **AnchorMode_WindowScroll_None_PrependAtTop_ViewportStaysStable** (VirtualizationTest.cs:4914; variants: variableHeight × provider (4); page: VirtualizationAnchorModeWindowScroll) → Window scroll, None mode at the top, prepend 10: window.scrollY becomes > 50 (compensated) and the same item stays within ±5px of its viewport top.
- **AnchorMode_WindowScroll_None_LargeAppendAtBottom_DoesNotFollowToBottom** (VirtualizationTest.cs:4939; variants: variableHeight × provider (4); page: VirtualizationAnchorModeWindowScroll) → Window at the bottom, append 100. It waits until document scrollHeight has grown by > 2000, then requires gap > 2000.
- **AnchorMode_WindowScroll_None_MidList_ViewportStable** (VirtualizationTest.cs:4967; variants: provider (2); page: VirtualizationAnchorModeWindowScroll) → `scrollTo(0,5000)`, prepend 10: the item stays within ±5px.
- **AnchorMode_WindowScroll_Start_PrependAtTop_NewItemsVisible** (VirtualizationTest.cs:4990; variants: variableHeight × provider (4); page: VirtualizationAnchorModeWindowScroll) → Start mode at the top, prepend 10: within 10 s the first item visible in the window has a negative index.
- **AnchorMode_WindowScroll_Start_AppendAtBottom_ViewportStable** (VirtualizationTest.cs:5011; variants: provider (2); page: VirtualizationAnchorModeWindowScroll) → Start mode, window at the bottom, append 10: the item stays within ±5px.
- **AnchorMode_WindowScroll_Start_MidList_ViewportStable** (VirtualizationTest.cs:5032; variants: provider (2); page: VirtualizationAnchorModeWindowScroll) → Start mode mid-list (window), prepend 10: ±5px.
- **AnchorMode_WindowScroll_End_PrependAtTop_ViewportStaysStable** (VirtualizationTest.cs:5055; variants: variableHeight × provider (4); page: VirtualizationAnchorModeWindowScroll) → End mode as mounted (it does not scroll to the top first), prepend 10: scrollY > 50 and the item stays within ±5px.
- **AnchorMode_WindowScroll_End_AppendAtBottom_ViewportFollows** (VirtualizationTest.cs:5079; variants: variableHeight × provider (4); page: VirtualizationAnchorModeWindowScroll) → End mode, window at the bottom, append 10: within 10 s the gap is < 2 (it follows).
- **AnchorMode_WindowScroll_End_MidList_ViewportStable** (VirtualizationTest.cs:5103; variants: provider (2); page: VirtualizationAnchorModeWindowScroll) → End mode mid-list (window), prepend 10: ±5px.
- **WindowScroll_ScrollToItem_LandsAtTarget** (VirtualizationTest.cs:7034; variants: none; page: VirtualizationAnchorModeWindowScroll, with the document as scroller, 500 items, ItemSize 50, `#virtualize-root` margin-top 90px under a fixed header, provider with ItemComparer and no delay) → `ScrollToItemAsync(100)` reports "Completed: 100" (15s). Then `window.scrollY` > 0 and item 100 intersects the window viewport. This is weaker than "aligned at top". (Also K.)

### I. Home/End keyboard jumps (10 E2E, 0 unit)

- **VariableHeight_CanJumpToEndAndStart** (VirtualizationTest.cs:1062; variants: sync VirtualizationVariableHeight (100px container, 1000 items 20–2000px, ItemSize 30) / async VirtualizationVariableHeightAsync (manual loading)) → one End key press converges to the true bottom (last spacer < 1px, item 999 present), one Home key press converges to the top (first spacer < 1px, item 0 present).
- **ChatList_CanJumpToHomeFromEnd** (VirtualizationTest.cs:1893; —; VirtualizationChatListAsync, 300px, 500 items 20–2000px, ItemSize 40, gated provider + Placeholder) → End jump reaches msg 499, Home jump reaches msg 0 (loading whenever placeholders appear).
- **QuickGrid_AnchorMode_HomeKeyJumpsToTop** (VirtualizationTest.cs:2771; variants: mode 0/1/2 × items/provider+delay; page: QuickGridAnchorModeComponent) → Mid-list, then `SendKeys(Home)` on the container. Within 10 s scrollTop < 2, and an element `[data-index='0']` is present.
- **QuickGrid_AnchorMode_EndKeyJumpsToBottom** (VirtualizationTest.cs:2799; variants: 0/1/2 items, 0/1 provider+delay; page: QuickGridAnchorModeComponent) → VerifyInitialPosition: End mode must start at the bottom (gap < 2), the others at scrollTop < 2. Mode 2 then scrolls to the top first. `SendKeys(End)`, and within 10 s the bottom gap is < 2. Disabled: `("2", true)` is pending #67865, because End mode converges to the bottom on mount before the precondition.
- **AnchorMode_EndKeyJumpsToBottom** (VirtualizationTest.cs:3725; variants: mode 0/1/2 × provider (6); page: VirtualizationAnchorMode) → The End key is sent to the scroll container (after moving to the top in End mode). Within 10 s the container reaches the bottom (gap < 2) in every anchor mode.
- **AnchorMode_VariableHeight_EndKeyFromTop_JumpsToBottom** (VirtualizationTest.cs:3753; variants: mode "0"/"1", always variable height + provider + 500 ms delay; page: VirtualizationAnchorMode) → Starts near the top (scrollTop < 50) and presses End once. It waits until no `.loading-placeholder` is in the viewport and scrollHeight is unchanged between polls, then requires the gap to be **≤ 1px**: one End press must rest exactly at the bottom with real rows.
- **AnchorMode_HomeKeyJumpsToTop** (VirtualizationTest.cs:3797; variants: mode 0/1/2 × provider (6); page: VirtualizationAnchorMode) → From mid-list, the Home key on the container gives scrollTop < 2 within 10 s, and `data-index=0` is rendered.
- **AnchorMode_End_HomeKeyFromBottom_JumpsToTop** (VirtualizationTest.cs:3823; variants: variableHeight (2), always provider + delay; page: VirtualizationAnchorMode) → End mode pinned at the bottom. Home gives scrollTop < 2 within 10 s and item 0 is rendered, so the End follow must not pull the list back.
- **AnchorMode_WindowScroll_EndKeyJumpsToBottom** (VirtualizationTest.cs:5125; variants: mode 0/1/2 (3), Items only; page: VirtualizationAnchorModeWindowScroll) → End is sent to `<body>` (document keydown): within 10 s the window is at the bottom (gap < 2).
- **AnchorMode_WindowScroll_HomeKeyJumpsToTop** (VirtualizationTest.cs:5149; variants: mode 0/1/2 (3), Items only; page: VirtualizationAnchorModeWindowScroll) → From scrollY ≈5000, Home on `<body>`: within 10 s, round(scrollY) < 2.

### J. InitialItemIndex (9 E2E, 7 unit)

- **InitialIndex_PendingGrowth_DoesNotExceedMaxItemCount** (VirtualizationTest.cs:6176; variants: none; page: VirtualizationAnchorMode) → Window 1024×2900, container 2500px. Settings: MaxItemCount 20, OverscanCount 3, ItemsProvider without delay, InitialItemIndex 100. After the render settles, the rendered `.item` count is ≤ 26 (MaxItemCount + 2·Overscan), even though the tall viewport would hold about 40 rows.
- **InitialIndex_PendingGrowth_TallItemsBeforeTarget_KeepsTargetAligned** (VirtualizationTest.cs:6205; variants: none; page: VirtualizationAnchorMode) → Window 1024×2400, container 2000px, average-height trap (rows 0-99 200px, later rows 10px), MaxItemCount 300, overscan 3, provider without delay, InitialItemIndex 100. After settling, the viewport bottom must be covered by a real item (±2px), and item 100's top must be within ±2px of the container's top (border-box rect).
- **InitialIndex_TallContainer_FillsViewportWithoutUserScroll** (VirtualizationTest.cs:6244; variants: useProvider false/true, where true adds the 500ms delay; page: VirtualizationAnchorMode) → Window 2400, container 2000px, variable heights, InitialItemIndex 10. Item 10 must become the top rendered index and the viewport bottom must be covered by a real item, with no user scroll needed to fill the viewport.
- **InitialIndex_TallContainer_NearEnd_FillsViewportWithoutUserScroll** (VirtualizationTest.cs:6308; variants: useProvider false/true, where true adds the delay; page: VirtualizationAnchorMode) → Container 2000px, variable heights, InitialItemIndex 950. The top rendered index is 950 and both the top and bottom viewport edges are covered by real items (±2px).
- **InitialIndex_TallContainer_ClampedNearEnd_FillsViewportWithoutUserScroll** (VirtualizationTest.cs:6341; variants: none; page: VirtualizationAnchorMode) → Window 5400, container 5000px, item size 100 (about 112px real), provider without delay, InitialItemIndex 990. Items 990-999 cannot fill 5000px. After settling, the top and bottom edges must both be covered by real items, with no blank gap. The target's position is not asserted.
- **InitialIndex_OpensAtTargetWithRealContent** (VirtualizationTest.cs:6688; variants: initialIndex 1/500 × variableHeight × useProvider, 8 cases, provider adds the delay; page: VirtualizationAnchorMode) → Unload, set scrollTop to 0, reload with InitialItemIndex N. The top rendered real item becomes exactly N, including the small index 1 and with a delayed provider.
- **InitialIndex_RetainsTargetWhenPreviousItemExpandsThenHomeEndTakeOver** (VirtualizationTest.cs:6732; variants: useProvider false/true, where true adds the delay; page: VirtualizationAnchorMode) → Variable heights, InitialItemIndex 500 (top == 500). Grow item 499 by 200px through direct style, a renderless resize above the viewport. Item 500's offset must stay within ±2px of where it was (scroll anchoring). Then End must render item 999 within 10s, and Home must then render item 0 within 10s, so initial-index positioning must not block keyboard jumps. (Also F/I.)
- **InitialIndex_FirstDownwardRedistributionDoesNotMoveBackward** (VirtualizationTest.cs:6777; variants: none; page: VirtualizationAnchorMode) → Items, fixed heights, InitialItemIndex 500. Wheel down in 50px ticks (at most 20, each must increase scrollTop) until item 514 is visible, then one more tick. The first rendered index must change, meaning the after-spacer redistribution happened within 10s. The top visible index afterwards must be ≥ the index before, so the first redistribution after initial positioning never jumps backward.
- **InitialIndex_BeyondCount_ClampsToEnd** (VirtualizationTest.cs:6852; variants: useProvider false/true, where true adds the delay; page: VirtualizationAnchorMode) → InitialItemIndex 100000. Item 999 must be rendered and the scroller pinned at its end: |scrollTop + clientHeight − scrollHeight| ≤ 2.
- *unit* **InitialIndex_MeasurementDoesNotChangeSpacerUntilPositioningCompletes** (VirtualizeTest.cs:140; unit; Items 0..999, ItemSize 50, InitialItemIndex 950, Overscan 3) → a `RenderedContentMeasurement` callback with separation 1253 accumulates (1253 / 7 items) but the spacers still render with the frozen 50px: before "47350" (947×50), after "2300" (46×50).
- *unit* **InitialIndex_ApplyingMeasuredGeometry_PreservesRunningAverage** (VirtualizeTest.cs:194; unit; Items 0..6, InitialItemIndex 5, Overscan 3) → a RenderedContentMeasurement (1253) followed by a ViewportFill callback (1253) both accumulate: total 2506, count 14 — the phase change does not reset the average.
- *unit* **InitialIndex_ParameterRoundTrip** (VirtualizeTest.cs:1418; unit) → the parameter value 42 is kept on the instance.
- *unit* **InitialIndex_ShortListThatFits_TargetOnScreenWithoutScroll_DoesNotStall** (VirtualizeTest.cs:1503; unit; 10 items, InitialItemIndex 8) → seed capacity 31 > 10 → `_itemsBefore == 0`; a later bottom-spacer ViewportFill is processed and keeps it at 0.
- *unit* **InitialIndex_DefaultZeroMeansNoInitialScroll** (VirtualizeTest.cs:1543; unit) → default 0 → window at 0, no initial scroll.
- *unit* **InitialIndex_NegativeClampsToZero** (VirtualizeTest.cs:1567; unit) → `InitialItemIndex = -5` → `_itemsBefore == 0` (only `> 0` seeds, Virtualize.cs:418).
- *unit* **InitialIndex_BeyondCountClampsToEnd** (VirtualizeTest.cs:1599; unit; Items 1..100, InitialItemIndex 99999) → seed capacity 31 → `_itemsBefore == 69` (out-of-range start re-clamped after the first provider result, Virtualize.cs:1039-1048).

### K. ScrollToItemAsync (15 E2E, 9 unit)

- **ScrollToItem_FixedHeight_LandsAtTop** (VirtualizationTest.cs:6405; variants: useProvider false/true, where true adds the 500ms delay; page: VirtualizationAnchorMode) → `ScrollToItemAsync(200)`. The status reads "Completed: 200" (30s timeout) and the top rendered real item is 200.
- **ScrollToItem_AfterEndJump_LandsAtTarget** (VirtualizationTest.cs:6421; variants: none; page: VirtualizationAnchorMode) → Provider with delay. Press End until item 999 is rendered, then call `ScrollToItemAsync(200)`. Expects "Completed: 200" and top == 200, so a programmatic scroll must override the End-key bottom convergence and following state. **Quarantined** (dotnet/aspnetcore#68644).
- **ScrollToItem_VariableHeight_LandsAtTop** (VirtualizationTest.cs:6442; variants: useProvider false/true, where true adds the delay; page: VirtualizationAnchorMode) → Variable heights, `ScrollToItemAsync(200)`. Expects "Completed: 200" and top rendered index 200, so the target must land exactly even though the rows above it were never measured.
- **ScrollToItem_TallItemsBeforeTarget_FillsViewportAndKeepsTargetAligned** (VirtualizationTest.cs:6459; variants: useProvider false/true, where true adds the delay; page: VirtualizationAnchorMode) → Window 2400, container 2000px, average-height trap, then `ScrollToItemAsync(100)`. After completion and settling, the bottom edge is covered by a real item and item 100's top is within ±2px of the container top.
- **ScrollToItem_TallContainer_ClampedNearEnd_FillsViewport** (VirtualizationTest.cs:6495; variants: useProvider false/true, where true adds the delay; page: VirtualizationAnchorMode) → Window 5400, container 5000px, item size 100, `ScrollToItemAsync(990)`. After completion and settling, both edges are covered by real items and item 990 intersects the viewport.
- **ScrollToItem_NegativeIndex_ScrollsToTop** (VirtualizationTest.cs:6532; variants: useProvider false/true, where true adds the delay; page: VirtualizationAnchorMode) → `ScrollToItemAsync(150)`, then `ScrollToItemAsync(-1)`, which must report "Completed: -1", scrollTop ≤ 1 and top == 0. A test hook makes `Element.prototype.scrollTo` dispatch two extra `scroll` events and spies on `invokeMethodAsync`. No `OnSpacer{Before,After}Visible` call may carry reason 0 (UserScroll), so scroll events caused by the component's own `scrollTo` must never be classified as user scrolls (`:6561-6592`).
- **ScrollToItem_MaxIntIndex_ScrollsToLast** (VirtualizationTest.cs:6598; variants: useProvider false/true, where true adds the delay; page: VirtualizationAnchorMode) → `ScrollToItemAsync(int.MaxValue)` must report "Completed: 2147483647". Then scrollTop > 0 and scrollTop ≥ scrollHeight − clientHeight − 2, and item 999 is in the DOM and intersects the viewport (the index clamps to the last item).
- **ScrollToItem_ForwardThenBackward** (VirtualizationTest.cs:6632; variants: useProvider false/true, where true adds the delay; page: VirtualizationAnchorMode) → `ScrollToItemAsync(300)` and then `ScrollToItemAsync(50)`. Each reports Completed, and the top ends at 50, so backward scrolling works after a forward jump.
- **ScrollToItem_WithProviderDelay_NoPlaceholderAtTarget** (VirtualizationTest.cs:6650; variants: none; page: VirtualizationAnchorMode) → Provider with 500ms delay, `ScrollToItemAsync(300)`. When it reports Completed, the top rendered item is the real item 300, and nothing intersecting the top 5px of the viewport is a `.loading-placeholder`. The Task must not complete while placeholders are shown at the target.
- **ScrollToItem_AfterInitialIndex_LandsAtTarget** (VirtualizationTest.cs:6706; variants: target 505, already in the DOM, and 700, not in the DOM; page: VirtualizationAnchorMode) → Provider without delay, variable heights, InitialItemIndex 500 (top == 500), then `ScrollToItemAsync(target)`. After completion and settling, `Assert.Equal(target, top rendered index)`.
- **ScrollToItem_AsyncProvider_VariableHeight_WithDelay_ReachesTarget** (VirtualizationTest.cs:6877; variants: target 120/300; page: VirtualizationAnchorMode) → Provider with 500ms delay and variable heights, `ScrollToItemAsync(target)`. Reports "Completed: target" (30s) and the top rendered real item equals the target.
- **ScrollToItem_RapidCalls_OnlyLastTargetReached** (VirtualizationTest.cs:6892; variants: none; page: VirtualizationAnchorMode) → Provider with delay. Five calls are fired back to back without awaiting: 50, 400, 100, 350, 250 (`razor:530-537`). The status must be exactly "Completed: 250 (canceled=0, completed=5, faulted=0)", so superseded calls complete normally rather than being canceled. Top == 250.
- **ScrollToItem_ExternalCancellation_TaskCancels** (VirtualizationTest.cs:6907; variants: none; page: VirtualizationAnchorMode) → Provider with delay, `ScrollToItemAsync(450, token)`, then the token is canceled during the 500ms fetch. The status must read "Canceled", meaning the Task threw OperationCanceledException. A fresh `ScrollToItemAsync(120)` afterwards must still complete with top == 120, so the component recovers.
- **ScrollToItem_UserScrollDuringProviderFetch_UserScrollWins** (VirtualizationTest.cs:6928; variants: none; page: VirtualizationAnchorMode) → Provider without delay, gate on. `ScrollToItemAsync(800)`, which records events p1-enter and scroll-start. While p1 is blocked, a real wheel scroll moves to scrollTop 5000. Expected: p1-cancel (the provider token is canceled), a p2-enter, and the caller's Task completes normally with "Completed: 800" (not Canceled). After the gate is released, some pN-return follows p1-cancel, `p1-return` never appears, the order is scroll-start < p1-enter < p1-cancel, and the final top rendered index is in [0, 250), following the user's scroll and not the target. **Quarantined** (dotnet/aspnetcore#68777). The comment at `:6950` says the caller sees an OperationCanceledException, but the test asserts normal completion.
- **ScrollToItem_AnchorStart_AtTop_LandsAtTarget** (VirtualizationTest.cs:7015; variants: useProvider false/true, where true adds the delay; page: VirtualizationAnchorMode) → Default AnchorMode Start at scrollTop 0, `ScrollToItemAsync(2)`. Expects "Completed: 2" and top == 2, so the Start-mode top-follow, anchor restore and top convergence must not pull the viewport back to 0.
- *unit* **ScrollToIndexAsync_ThrowsBeforeJsInteropInitialized** (VirtualizeTest.cs:1257; unit) → calling `ScrollToItemAsync(0)` on a never-rendered instance throws synchronously; the message names `ScrollToItemAsync` and `InitialItemIndex` (Virtualize.cs:249-255).
- *unit* **ScrollToIndexAsync_NegativeIndexDoesNotThrow** (VirtualizeTest.cs:1270; unit) → `ScrollToItemAsync(-5)` completes successfully and `_itemsBefore == 0`.
- *unit* **ScrollToIndexAsync_IndexBeyondCountDoesNotThrow** (VirtualizeTest.cs:1288; unit; 100 items) → `ScrollToItemAsync(99999)` completes; capacity ceil(500/50)+2×15 = 40 → `_itemsBefore == 60`.
- *unit* **ScrollToIndexAsync_EmptyListCompletesAsNoOp** (VirtualizeTest.cs:1309; unit; 0 items) → completes within 5 s (the render rendezvous accepts `_itemCount == 0`, Virtualize.cs:463).
- *unit* **ScrollToIndexAsync_AlreadyCancelledTokenProducesCancelledTask** (VirtualizeTest.cs:1322; unit) → a pre-cancelled token yields a cancelled Task (Virtualize.cs:257-260).
- *unit* **ScrollToIndexAsync_CancellationCancelsProviderRequest** (VirtualizeTest.cs:1337; unit; **Quarantined** #68852) → cancelling the caller's token while the provider request for the new window is pending cancels the provider's token and faults the Task with OperationCanceledException.
- *unit* **ScrollToIndexAsync_SecondCallDoesNotFaultFirstTask** (VirtualizeTest.cs:1377; unit; 1000 items) → `ScrollToItemAsync(500)` then `(750)` back to back: the first Task completes successfully (superseded ≠ cancelled); the second, if completed, is successful.
- *unit* **ScrollToIndexAsync_ProviderThrows_FaultsTaskInsteadOfHanging** (VirtualizeTest.cs:1402; unit) → a throwing provider faults the Task with the same exception instance (Virtualize.cs:1171-1172).
- *unit* **OnBeforeSpacerVisible_ProgrammaticScroll_DoesNotResetWindow** (VirtualizeTest.cs:1456; unit; 1000 items) → after moving the window away from the top, a before-spacer callback with spacerSize 0 and reason ProgrammaticScroll leaves `_itemsBefore` unchanged (#68114/#68064; Virtualize.cs:698-699).

### L. Virtualize hosted in QuickGrid (pages in BasicTestApp.QuickGridTest, not downloaded) (33 E2E, 0 unit)

- **QuickGrid_CanJumpToEndAndStart** (VirtualizationTest.cs:1917; —; QuickGridVariableHeightComponent, provider delay 150ms, 1000 rows) → Home → first data row id 1; End → first row id > 950; Home → id 1 again.
- **QuickGrid_Virtualize_ToleratesIncorrectItemSize_UnderFastScroll** (VirtualizationTest.cs:1959; variants: fixed / variable row mode; QuickGridVirtualizeCapacityComponent) → top spacer reserved height "0" initially; FastScroll (synthetic WheelEvent + scrollTop set every 40ms) to 1500·k for k=1..40, then jitter 58000/57700/58200/57900; top spacer non-zero and the row at the viewport's vertical center is real data (not a placeholder cell).
- **QuickGrid_AnchorMode_NearTop_PrependKeepsViewportStable** (VirtualizationTest.cs:2126; variants: mode 0/1/2 × Items/Provider (provider with delay); QuickGridAnchorModeComponent) → scroll to top then to 200 (≥150); prepend 10 → same first visible item, drift ≤ 2px.
- **QuickGrid_AnchorMode_DefaultComparer_Items_PrependKeepsViewportStable** (VirtualizationTest.cs:2155; —; QuickGridAnchorModeComponent, Start, Items, no custom comparer) → near-top prepend keeps first visible item within 2px using default (reference) equality.
- **QuickGrid_AnchorMode_NearTop_AppendKeepsViewportStable** (VirtualizationTest.cs:2189; variants: 0/1/2 × Items/Provider (gated provider mutation); QuickGridAnchorModeComponent) → near top (200px), append 10 → first visible item stable within 2px.
- **QuickGrid_AnchorMode_Top_AppendKeepsViewportStable** (VirtualizationTest.cs:2221; variants: 0/1/2 × Items, 0/1 × Provider; QuickGridAnchorModeComponent) → verifies initial position (End mode starts at bottom, others at top; End mode then scrolls to top); append 10 → first visible item stable within 2px. Disabled InlineData("2", true) pending #67865. `public virtual`.
- **QuickGrid_AnchorMode_Bottom_PrependKeepsViewportStable** (VirtualizationTest.cs:2256; variants: 0/1/2 × Items/Provider (delay); QuickGridAnchorModeComponent) → at bottom (gap < 2px, item visible), prepend 10 → first visible item stable within 2px.
- **QuickGrid_AnchorMode_None_PrependAtTop_ViewportStaysStable** (VirtualizationTest.cs:2284; variants: Items/Provider (delay); QuickGridAnchorModeComponent, None) → starts at scrollTop < 2; prepend 10 → first visible item stable within 2px (None compensates even at top); wheel-scroll to 0 shows item −10.
- **QuickGrid_AnchorMode_Start_PrependAtTop_NewItemsVisible** (VirtualizationTest.cs:2318; variants: Items/Provider (delay); QuickGridAnchorModeComponent, Start) → at top, prepend 10 → scrollTop < 50 and item −10 rendered.
- **QuickGrid_AnchorMode_End_PrependAtTop_ViewportStaysStable** (VirtualizationTest.cs:2341; variants: Items/Provider (delay); QuickGridAnchorModeComponent, End) → End mode starts at bottom; scroll to top; prepend 10 → first visible item stable within 2px.
- **QuickGrid_AnchorMode_None_AsyncProvider_PrependKeepsViewportStable** (VirtualizationTest.cs:2368; —; QuickGridAnchorModeComponent, None, provider + delay) → mid-list (scrollTop 4000–6000, visible index > 20), prepend 10 → first visible item stable within 5px despite placeholder transition.
- **QuickGrid_AnchorMode_Start_PrependAfterLeavingTop_DoesNotReengage** (VirtualizationTest.cs:2401; variants: Items/Provider (delay); QuickGridAnchorModeComponent, Start) → prepend at top (item −10 visible), wheel-scroll to >200, prepend again → scrollTop stays > 200 (not pulled back to top).
- **QuickGrid_AnchorMode_End_AppendAfterLeavingBottom_DoesNotReengage** (VirtualizationTest.cs:2435; variants: Items/Provider (gated); QuickGridAnchorModeComponent, End) → at bottom, append 10 → follows to bottom (gap < 2px); wheel-scroll up ~500px (> 100px away), append again → scrollTop changes < 2px.
- **QuickGrid_AnchorMode_None_AsyncProvider_ScrollDoesNotFlash** (VirtualizationTest.cs:2472; variants: —; page: QuickGridAnchorModeComponent, mode 0, provider + delay) → 50× `scrollTop += 200` with a 100 ms settle. If the top visible row is a `.loading-placeholder` or no rows exist, waits up to 1500 ms. A "flash" means the top visible `data-index` drops by more than 3 below the previous sample. Asserts `flashCount == 0` and `maxIndexSeen >= 50` (2546, 2567-2571).
- **QuickGrid_AnchorMode_None_MidList_ViewportStable** (VirtualizationTest.cs:2577; variants: items / provider+delay; page: QuickGridAnchorModeComponent, mode 0) → Mid-list (scrollTop ≈ 5000), then the first visible row is recorded. Clicking prepend 10 (ungated) and settling must keep the same first-visible index with a relTop drift ≤ 2 px.
- **QuickGrid_AnchorMode_Start_MidList_ViewportStable** (VirtualizationTest.cs:2605; variants: items / provider+delay; page: QuickGridAnchorModeComponent, mode 1) → Same as above in Start mode: a mid-list prepend must not move the viewport (same index, drift ≤ 2 px).
- **QuickGrid_AnchorMode_End_MidList_ViewportStable** (VirtualizationTest.cs:2633; variants: items / provider+delay; page: QuickGridAnchorModeComponent, mode 2) → Same as above in End mode: same index, drift ≤ 2 px after a mid-list prepend.
- **QuickGrid_AnchorMode_End_LargeAppendAtBottom_StillFollows** (VirtualizationTest.cs:2661; variants: items / provider (no delay); page: QuickGridAnchorModeComponent, mode 2) → ScrollToBottomAndWait, then a gated append of 100. Polls for 30 s, setting `scrollTop = scrollHeight` each time, until `scrollHeight - scrollTop - clientHeight < 2`. Note: the poll re-scrolls itself, so this checks that the bottom is reachable and converges, not pure auto-follow.
- **QuickGrid_AnchorMode_Start_LargeAppendAtBottom_DoesNotFollowToBottom** (VirtualizationTest.cs:2686; variants: provider only; page: QuickGridAnchorModeComponent, mode 1) → At the bottom, a gated append of 100. Immediately afterwards (no settle) the bottom gap must be > 2000 px: no convergence chasing the new tail. Disabled: `[InlineData(false)]` (items) is pending #67865, because the WASM leg converges to the bottom.
- **QuickGrid_AnchorMode_MidList_AppendKeepsViewportStable** (VirtualizationTest.cs:2711; variants: mode 0/1 × items/provider; page: QuickGridAnchorModeComponent) → Mid-list, then a gated append of 10 and a settle. Same first-visible index, drift ≤ 2 px.
- **QuickGrid_AnchorMode_Bottom_AppendKeepsViewportStable** (VirtualizationTest.cs:2740; variants: mode 0/1 × items/provider; page: QuickGridAnchorModeComponent) → At the bottom, a gated append of 10 and a settle. In None and Start modes the viewport must NOT follow: same first-visible index, drift ≤ 2 px.
- **QuickGrid_AnchorMode_None_LargeAppendAtBottom_DoesNotFollowToBottom** (VirtualizationTest.cs:2827; variants: items / provider+delay; page: QuickGridAnchorModeComponent, mode 0) → At the bottom, a direct (ungated) click on append-many (100) and a settle. The bottom gap must be > 2000 px.
- **QuickGrid_InitialIndex_TallContainer_FillsViewportWithoutUserScroll** (VirtualizationTest.cs:6276; variants: useProvider false/true, where true adds the delay; page: QuickGridScrollComponent) → Same as InitialIndex_TallContainer_FillsViewportWithoutUserScroll, hosted in QuickGrid: top == 10 and the bottom edge is covered.
- **QuickGrid_InitialIndex_TallContainer_NearEnd_FillsViewportWithoutUserScroll** (VirtualizationTest.cs:6370; variants: useProvider false/true, where true adds the delay; page: QuickGridScrollComponent) → Same as InitialIndex_TallContainer_NearEnd in QuickGrid: top == 950 and both edges are covered.
- **QuickGrid_ScrollToItem_LandsAtTop** (VirtualizationTest.cs:7092; variants: useItemsProvider × variableHeight, 4 cases, provider adds the delay; page: QuickGridScrollComponent) → `ScrollToItemAsync(200)`. Expects "Completed: 200" and top == 200.
- **QuickGrid_ScrollToItem_NegativeIndex_ScrollsToTop** (VirtualizationTest.cs:7109; variants: useItemsProvider true/false; page: QuickGridScrollComponent) → Scroll to 150, then −1. Expects "Completed: -1" and top == 0. Unlike the Virtualize version, it has no scroll-event spy.
- **QuickGrid_ScrollToItem_MaxIntIndex_ScrollsToLast** (VirtualizationTest.cs:7130; variants: useItemsProvider true/false; page: QuickGridScrollComponent) → int.MaxValue. Expects scrollTop > 0 and ≥ max − 2, and item 999 intersects the viewport.
- **QuickGrid_ScrollToItem_WithProviderDelay_LandsAtTargetWithRealContent** (VirtualizationTest.cs:7161; variants: variableHeight false/true; page: QuickGridScrollComponent) → Provider with delay, scroll to 300. Expects "Completed: 300" (30s) and top == real item 300, not a placeholder.
- **QuickGrid_InitialIndex_OpensAtTargetWithRealContent** (VirtualizationTest.cs:7184; variants: initialIndex 1/5/500 × variableHeight × useItemsProvider, 9 cases; page: QuickGridScrollComponent) → Unload, set scrollTop to 0, reload with InitialItemIndex N. Top rendered real item == N.
- **QuickGrid_InitialIndex_BeyondCount_ClampsToEnd** (VirtualizationTest.cs:7201; variants: useItemsProvider false/true; page: QuickGridScrollComponent) → InitialItemIndex 100000. Item 999 is rendered and the scroller is at its end within ±2px.
- **QuickGrid_ScrollToItem_RapidCalls_OnlyLastTargetReached** (VirtualizationTest.cs:7221; variants: none, provider with delay; page: QuickGridScrollComponent) → Status "Completed: 250 (canceled=0, completed=5, faulted=0)" and top == 250.
- **QuickGrid_ScrollToItem_ExternalCancellation_TaskCancels** (VirtualizationTest.cs:7234; variants: none, provider with delay; page: QuickGridScrollComponent) → Cancel during the fetch shows "Canceled". A following scroll to 120 completes with top == 120.
- **QuickGrid_ScrollToItem_AnchorStart_AtTop_LandsAtTarget** (VirtualizationTest.cs:7253; variants: useItemsProvider true/false; page: QuickGridScrollComponent) → Starting at scrollTop 0, scroll to 2. Expects "Completed: 2" and top == 2.

### M. Stress and stability (rapid scroll, large data, flashing, backward jumps) (5 E2E, 0 unit)

- **LargeDataset_CanScrollWithoutErrors** (VirtualizationTest.cs:1731; —; VirtualizationBimodal large: 100000 items 25–65px, ItemSize 40, 300px) → items present at scrollTop 1%, 50%, 99%; End jump shows an index > 99900; Home jump shows item 0.
- **RapidScrollReversals_DoNotCauseErrors** (VirtualizationTest.cs:1778; —; VirtualizationScrollBehavior, 200px, 500 items 25–55px, ItemSize 35) → 20 × (+300px, wait 30ms, −150px, wait 30ms), wait 200ms → items still rendered.
- **VariableHeight_VisualStability_NoBackwardJumps** (VirtualizationTest.cs:1866; —; VirtualizationVariableHeightAsync, autoload, 200 items) → 50 × (scrollTop += 40, wait 50ms) while logging scroll events: backward jumps (Δ < −5px) ≤ 3.
- **ItemsIncrementalScroll_DoesNotJumpToStartOrEnd** (VirtualizationTest.cs:3191; variants: —; page: VirtualizationComponent `#incorrect-size-container`, ItemSize 50 vs real 30 px, overscan 3) → 40 steps of `scrollTop += 100` down, then 40 of −100 up, each waiting for a render settle. The largest absolute per-step jump must be < 400 px (4 × step). Regression test for #67729: reserved-height compensation over-shifting.
- **AnchorMode_None_AsyncProvider_ScrollDoesNotFlash** (VirtualizationTest.cs:3967; variants: — (variable height + provider + delay); page: VirtualizationAnchorMode) → A JS loop does `scrollTop += 200` up to 50 times with 100 ms pauses, waiting up to 1.5 s while the top visible row is a placeholder. A "flash" is a top visible index < previous − 3. It asserts 0 flashes and maxIndexSeen ≥ 50.

### S. CSP, lifecycle and interop disposal (0 E2E, 4 unit)

- *unit* **Virtualize_SpacersUseDataAttributeNotInlineStyle** (VirtualizeTest.cs:1633; unit) → exactly two `data-blazor-virtualize-reserved-height` attributes ("0" and a parseable number) and no `style` attribute emitted by Virtualize.
- *unit* **Virtualize_DisposedWhileInitializationPending_DoesNotUseDisposedObjectReference** (VirtualizeTest.cs:1677; unit; gated `init`, InitialItemIndex 50) → removing the component while JS `init` is pending: no handled exceptions and no interop call with the disposed DotNetObjectReference.
- *unit* **Virtualize_DisposedWhileLaterRenderInteropPending_DoesNotUseDisposedObjectReference** (VirtualizeTest.cs:1720; unit; gated `setAnchorMode`) → same for a pending `setAnchorMode` call during a later render.
- *unit* **Virtualize exports expected functions** (tests/Virtualize.test.ts:5; JS unit) → the JS module exports init, dispose, scrollToBottom, refreshObservers, setAnchorMode, restoreAnchor.


---

## 10. Delta to Tsazor

Tsazor today: `packages/runtime/src/data/virtualize.ts` (248 lines, cited as `tsz:N`), tests in
`packages/runtime/test/data.test.ts:96-187` (6 tests). Callers: the DataGrid skins (`packages/fluent/src/DataGrid.tsazor:48`,
`packages/bootstrap/src/DataGrid.tsazor:48`, with `Overscan`, `ItemTemplate`, `refreshData()`) and
`apps/demo/src/Pages/VirtualizeDemo.tsazor:8`.

### 10.1 What Tsazor's implementation does today

- Parameters `items?: unknown[]`, `itemsProvider`, `itemSize = 50`, **`overscan = 3`** (markup `Overscan`, not
  `OverscanCount`), `itemTemplate` (markup `<ItemTemplate>`, not `ChildContent`/`ItemContent`), `spacerElement`
  (tsz:36-47). Non-generic (`unknown` items; the compiler keeps `any` for its context, packages/compiler/src/codegen.ts:2027-2033).
- Renders spacers with `class="virtualize-spacer"`, `aria-hidden`, and **inline `style="height: Npx; flex-shrink: 0;"`**
  (tsz:78-106); items via `b.addContent(nextSequence(), template(item))` — **one region per item with a
  position-based sequence number** (tsz:88-98); without a template, a `<div class="virtualize-item">String(item)</div>`.
- **Fixed item size:** spacer = `index × itemSize`; window from `floor(scrollTop / itemSize)` and
  `ceil(viewportHeight / itemSize)` (tsz:136-174). No measurement, no recalibration (even .NET 10 recalibrated).
- Driven by **`scroll` events** on the container/window plus a ResizeObserver on the spacer and container (tsz:109-134),
  no IntersectionObserver, no throttling; `Items` mode re-renders on every scroll event.
- Scroll container = the spacer itself or the nearest ancestor with `overflowY ∈ {auto, scroll, overlay}` **that
  currently overflows** (`scrollHeight > clientHeight || scrollTop > 0`, tsz:214-227); a 600px fallback viewport when
  nothing is measurable (tsz:207, 235-247).
- Provider: request `{ startIndex, count }` with `count` clamped to the known total (tsz:141-146); de-duplicated by
  start/count (tsz:155-157); superseded results dropped by a ticket — **no cancellation signal** to the provider
  (tsz:160-168); result fields optional (`totalItemCount` omitted keeps the previous total, tsz:13-19). The window only
  moves when the result arrives (old rows stay meanwhile) — **no placeholders**.
- `refreshData()` re-runs the window calculation (tsz:184-188); `dispose()` removes listeners (tsz:191-196).

### 10.2 Gaps

| Area | Blazor .NET 11 | Tsazor now | Needed |
|---|---|---|---|
| Parameter names | `OverscanCount`, `ChildContent`/`ItemContent`, `Placeholder`, `EmptyContent` | `Overscan`, `ItemTemplate` | Razor-1:1 names; decide whether `Overscan`/`ItemTemplate` stay as aliases (DataGrid skins, demo use them) |
| Defaults | OverscanCount 15, MaxItemCount 100, AnchorMode Start | overscan 3 | adopt .NET 11 defaults |
| Generic item type | `Virtualize<TItem>` | `unknown` | generic `TItem` (already a stated goal, docs/design-library-completeness.md:86-90) |
| Measurement | running average, no-placeholder rule, scale factor | none | §3 |
| Viewport loop | IO on spacers (rootMargin 50, rootBounds), RO re-trigger, 50ms throttle, slide-by-one, skip-next-refresh | scroll events, own math | §4 |
| Scroll container rule | computed `overflowY` ∉ {visible, hidden, clip}, regardless of overflow; stop at body/html | requires current overflow; checks the spacer itself | adopt Blazor's rule (a not-yet-overflowing `overflow:auto` panel must be picked) |
| Placeholders / EmptyContent | yes, absolute-index sequence | no | §2 |
| MaxItemCount + loop breaker | yes | no | §4.5 |
| Provider cancellation | `CancellationToken` per request, cancelled when superseded | ticket, no signal | `AbortSignal` in the request (tests count cancellations) |
| Provider request count | capacity (not clamped to total), look-ahead, re-clamp request | clamped to total | §5.1-5.4 (observable in provider-call assertions) |
| RefreshData semantics | resets average, look-ahead, prepend detection, no render on success | recompute + fetch | §5.6 |
| Prepend/append detection, `ItemComparer` | yes | no | §5.5 |
| Anchoring | native `overflow-anchor` with guards, manual path for tables/Safari, snapshot/restore, drift correction | none | §6 |
| AnchorMode / follow | Start/End/both, follow state machine | none | §6.3 — Tsazor's planned "sticking to the bottom" extension (docs/design-library-completeness.md:92) **is now Blazor parity** (`AnchorMode.End`) |
| Home/End, convergence, tabindex | yes | no | §4.8-4.9 |
| Tables | `display: table-row` spacers, manual anchoring | spacer tag only | §4.1, §6.5 |
| InitialItemIndex, ScrollToItem | yes | no | §7 |
| CSP | data attributes → CSSOM | inline `style` attribute | set styles via CSSOM (never a `style` attribute) |
| Keyed identity of rows | template emitted inline in one region; `@key` works across slides | one region per item at a position-based sequence → keys only compare within the same position's region | emit all rows inside one region (keys must survive window slides — native anchoring needs the anchor row's DOM node to persist) |
| Error surfacing | provider exception rethrown at render (error boundary) | rethrown from the tracked promise | follow Blazor |
| Spacer markup | no class, `aria-hidden` + data attribute | `class="virtualize-spacer"` | parity: no class (Tsazor tests select by class today) |

### 10.3 Exists only because of the .NET↔JS boundary (can be simpler in Tsazor)

| Blazor mechanism | Why it exists | Tsazor |
|---|---|---|
| `VirtualizeJsInterop`, `DotNetObjectReference`, per-dispatcher observer registry, `_disposed` guards, `JSDisconnectedException`/`ObjectDisposedException` handling (Interop.cs; Virtualize.ts:1037-1063) | two runtimes, async disposal | one object; dispose = disconnect observers, remove listeners, abort controllers. Keep the *behavior* of VirtualizeTest.cs:1677/1720 as "dispose while a provider call or post-render step is pending touches nothing afterwards" |
| Awaited JS queries `IsFollowingTopAsync`/`IsFollowingBottomAsync` with `ThrowIfCancellationRequested` after each await (Virtualize.cs:1099-1131, 1281-1318) | follow state lives in JS | synchronous reads of the follow state |
| `data-blazor-virtualize-*` attributes + MutationObserver mirroring to CSSOM (Virtualize.cs:563, 639-643; Virtualize.ts:97-167) | C# can only emit attributes, CSP forbids `style` attributes | set `style.height`/`transform`/`flexShrink` through CSSOM right after the DOM patch (or a renderer CSSOM-style binding); no MutationObserver. Keep the ordering "apply styles before any layout read" |
| `restoreAnchor(onNextMutation)` MutationObserver hook (Virtualize.ts:146-155, 748-755) | on Server the DOM patch lands after the C# decision; restore must run before paint | run the restore synchronously right after Tsazor's own DOM patch (same task as `onAfterRender`) |
| `_pendingAnchorRestore` callback suppression and `_deferAnchorRestoreClear` (Virtualize.cs:91-95, 494-511, 688, 740) | IO callbacks can arrive between data commit and the asynchronous restore | with a synchronous post-render restore the window between commit and restore closes; a plain "restore pending" flag suffices. Keep the Start-at-top behavior (restore → top convergence) |
| Fire-and-forget JS→C# callbacks with `float` marshalling; numeric enum mirrors kept in sync by comment (SpacerVisibilityReason.cs:6-9) | serialization | direct method calls, shared TS types, doubles |
| `TaskCompletionSource` render rendezvous `_nextRenderTcs` (Virtualize.cs:336-357, 461-467) | C# cannot observe DOM commit directly | still needed conceptually ("await the render that shows real rows for the window"), but can resolve from `onAfterRender` |
| `ValueTask` synchronous completion of `DefaultItemsProvider` (`Debug.Assert(IsCompletedSuccessfully)`, Virtualize.cs:441-444) | avoid async overhead | the `Items` path must stay **synchronous** (no `await`), or render counts/timings change |
| AppContext `…Virtualize.MaxItemCount` switch (Virtualize.cs:907-926) | .NET 8 patch back-compat | drop |
| `[CacheBehavior(CacheBehavior.Throw)]` | .NET 11 server caching | drop |
| BL0011 analyzer for `ItemComparer` | Roslyn | optional `tsazor check` warning |
| 50ms IO throttle (Virtualize.ts:20, 784-795) | limits interop traffic on Server | still useful to limit renders; keep (leading + trailing) for comparable behavior |

### 10.4 Must be kept (browser behavior, independent of the boundary)

- Spacer strategy: no own element, two spacers as siblings (`SpacerElement`), `aria-hidden`, `flex-shrink: 0`,
  `display: table-row` inside table sections, no wrapper around rows, rows emitted in one region.
- IO on the spacers with `rootMargin 50px`, `containerSize = rootBounds.height` (includes the margins), "both visible →
  report only the before spacer", RO re-observe trick, leading+trailing 50ms throttle.
- Scroll-container rule (§4.1), scale factor (§3.6).
- Window math (§4.4) incl. slide-by-one, end clamp, skip-next-refresh, look-ahead counts and the out-of-range re-clamp —
  the resulting provider call pattern is observable (gated-provider tests count calls).
- Measurement (§3): running average, no-placeholder rule, frozen size during initial positioning, invalidation points.
- MaxItemCount cap with overscan counted as used, and the loop-breaker transform.
- Placeholders with absolute-index identity, EmptyContent rule, provider cancellation, error-at-render.
- Prepend/append detection and comparer semantics (pure logic).
- All of §6: native anchoring with spacer exclusion and slide/convergence suspension, manual path for tables and
  browsers without `overflow-anchor`, snapshot/restore with pre-shift preservation and drift correction, follow state
  machine, input classification (wheel/touch/pointer-drag/keys = user; own writes ignored), Home/End, `tabindex=-1`,
  convergence.
- §7: last call wins = success, caller cancel = rejection, user scroll = success; align by measurement; window growth by
  doubling; the initial-index phases.

### 10.5 Suggested TypeScript surface (markup Razor 1:1, code clean TS)

| Blazor | Tsazor markup | TypeScript |
|---|---|---|
| `Items` | `Items` | `items?: readonly TItem[]` |
| `ItemsProvider` | `ItemsProvider` | `(request: { startIndex: number; count: number; signal: AbortSignal }) => Promise<{ items: Iterable<TItem>; totalItemCount: number }>` (keep today's optional fields as a superset if wanted) |
| `ChildContent` / `ItemContent` | child content / `<ItemContent Context="x">` | `(item: TItem) => RenderFragment` |
| `Placeholder` | `<Placeholder Context="p">` | `(context: { index: number; size: number }) => RenderFragment` |
| `EmptyContent` | `<EmptyContent>` | `RenderFragment` |
| `ItemSize` / `OverscanCount` / `MaxItemCount` / `SpacerElement` / `InitialItemIndex` | same names | `number` 50 / 15 / 100, `string` `"div"`, `number` 0 |
| `AnchorMode` | `AnchorMode="@VirtualizeAnchorMode.End"` | flags const `VirtualizeAnchorMode = { None: 0, Start: 1, End: 2 } as const` (so `Start \| End` works), default `Start` |
| `ItemComparer` | `ItemComparer` | `(a: TItem, b: TItem) => boolean`, default `Object.is` (same false-positive caveat as reference equality; a key-based comparer is the recommended pattern) |
| `RefreshDataAsync()` | — | `refreshData(): Promise<void>` (exists) |
| `ScrollToItemAsync(i, ct)` | — | `scrollToItem(index: number, signal?: AbortSignal): Promise<void>` — throws synchronously before the first render; rejects with an `AbortError` only when `signal` aborts; resolves when superseded or overridden by the user |

Internal structure that keeps Blazor's unit tests portable: a pure **window model** (the C# half: distribution,
measurement, provider orchestration, prepend detection, initial-index state machine — driven by
`onSpacerBeforeVisible/onSpacerAfterVisible(spacerSize, separation, containerSize, reason)`) and a **viewport driver**
(the JS half: observers, snapshot/restore, convergence, input classification) inside one component, calling each other
synchronously. The 47 unit tests then port almost 1:1 against the model in happy-dom (no layout needed); the 135
non-QuickGrid E2E tests need a real browser (Playwright, which the Tsazor apps already use) with Tsazor ports of the 20
test pages; the 33 QuickGrid tests map to the DataGrid skins.

Today's 6 Tsazor tests (data.test.ts:97-186) assume immediate rendering from a fallback/happy-dom viewport with
`Overscan` 2, the `virtualize-spacer` class and inline `style.height`; they must be rewritten against the model (or
fake IO/RO) once the IO-driven loop lands.

---

## Appendix A — Quirks and probable bugs in Blazor .NET 11 (decide per item whether to copy)

1. **NaN/∞ separation passes the guard.** `AccumulateMeasurement` rejects `spacerSeparation <= 0`, but `NaN <= 0` and
   `∞ <= 0` are false, so NaN/∞ are accumulated and poison the average until the next reset; spacers then render
   `"NaN"`/`"Infinity"` and JS removes their height (Virtualize.cs:870; Virtualize.ts:116-121). The unit tests only check
   "no crash" (VirtualizeTest.cs:332, 401). Use `Number.isFinite(sep) && sep > 0`.
2. **Over-render while a load is pending.** Items are taken as `Skip(itemsBefore − loadedStart).Take(lastItemIndex −
   loadedStart)` (Virtualize.cs:592-594): when the window moved down but the old data is still loaded
   (`loadedStart < itemsBefore`), up to `itemsBefore − loadedStart` rows beyond `lastItemIndex` can render if the loaded
   slice is long enough (look-ahead results make that possible). Clamp to `[itemsBefore, lastItemIndex)`.
3. **Two different placeholder sizes:** `PlaceholderContext.Size` is `_itemSize` (last window), the built-in placeholder
   and spacers use the average (Virtualize.cs:579, 630 vs 1202, 650).
4. **`ItemSize` change** resets the average but not `_itemSize` (Virtualize.cs:404-416).
5. **Prepend = whole delta:** a growth where the item at the comparison index changed is treated as a prepend of the
   entire `countDelta`; mixed insertions shift wrongly; deletes are never compensated (skipped test #66509).
6. **`CanDetectPrepend` is always true for value types** (`is not null` on a non-nullable `TItem`, Virtualize.cs:59).
7. **`containerSize` differs by source:** IO `rootBounds` (incl. 2×50px margin) vs. `RenderedContentMeasurement` using
   the scroll element's rect (the whole document for window scrolling); harmless because the latter's capacity is
   discarded (Virtualize.cs:667).
8. **Built-in placeholder heights** are only re-applied when a *spacer* attribute mutates (the MutationObserver watches
   only the spacers, Virtualize.ts:162-167); a placeholder rendered without a spacer change waits for the next flush.
9. **No container ResizeObserver:** capacity adapts to a container resize only at the next IO crossing.
10. **Asymmetric guard:** "initial index not yet started" is checked only for the before spacer (Virtualize.cs:692-695).
11. **`Items` mode prepend check uses `EqualityComparer.Default`, not `ItemComparer`** (by design, Virtualize.cs:198-200).
12. **Test inconsistencies:** `ScrollToItem_UserScrollDuringProviderFetch_UserScrollWins` comment vs assertion
    (VirtualizationTest.cs:6950 vs 6957); `AnchorMode_Start_AppendAtBottom_ViewportStable` appends 100, not 10
    (VirtualizationTest.cs:4096); `QuickGrid_AnchorMode_End_LargeAppendAtBottom_StillFollows` re-scrolls inside its own
    poll (VirtualizationTest.cs:2661); `Table_VariableHeight_IncrementalScrollDoesNotCauseWildJumps` checks only the signed
    maximum (VirtualizationTest.cs:3020); `Virtualize_ScrollToBottom_NotSetWhenMeasurementsNotApplied` runs in Start mode
    (VirtualizeTest.cs:594).
