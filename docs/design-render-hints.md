# Design: F1b — skipping work for unchanged rows

Status: **approved** (2026-10-06, D-R1…D-R4; D-R4 extended by `optimize`). [design-svelte-features.md](design-svelte-features.md) F1b, after
F1a ([design-static-markup.md](design-static-markup.md)). Invisible: no syntax, no API, Blazor's
render semantics unchanged.

## Where the time goes

The bench (`apps/bench`, 11k keyed rows, Edge) after R5: Tsazor is on a par or ahead everywhere
except **select** — 16 ms vs Svelte's 10 ms (after the inline-handler fix, 19 → 16 ms). Selecting
changes two rows; Tsazor re-renders the page and diffs all 11k. A CPU profile of one select
(`measure`, sampling 50 µs, 8 rounds):

| Work | ms |
|---|---:|
| Diff of 11k rows (`appendDiffEntriesForRange`, same-sequence frames, key lookup) | ~5 |
| Building the frames (`buildRenderTree`, builder calls, closures) | ~2 |
| Swapping 22k event handlers (`setEventHandler`, edits) | ~1.5–2 |
| Applying edits | ~1 |
| Style, layout, GC (native; the same for every framework) | rest |

Two causes:

1. **Handlers always differ.** `@onclick="e => this.select(e, row)"` is a new closure per render;
   `EventCallback.equals` compares delegates by identity, so every row's two handler frames are
   "changed": 22k `SetAttribute` edits and handler swaps per select, although nothing changed.
2. **Unchanged rows are still built and walked.** 10,998 rows render the same frames as before;
   the diff confirms that frame by frame.

Blazor has both costs too (lambdas are new delegates there as well); this is where a compiler can
do better without changing what the app sees.

## Proposal

**H1 — Stable event handlers.** The compiler hoists an event-handler lambda into a per-component
factory and binds the values it captures as arguments:

```ts
// today
__builder.addEventHandler(8, "onclick", EventCallback.bind(this, (e) => this.select(e, row)));
// H1
__builder.addEventHandler(8, "onclick", EventCallback.bindWith(this, Rows.__h0, row));
static __h0 = (self, row) => (e) => self.select(e, row);
```

*Implemented (2026-10-06)* as a prototype method instead of a static factory — `this` and the
class's type parameters stay valid inside the handler:
`EventCallback.bindWith(this, Rows.prototype.__tsazor_h0, [row])` with
`__tsazor_h0(row) { return (e) => this.select(e, row); }`; the handler is created on first use.

Two callbacks are equal when receiver, factory and every bound value are identical (`Object.is`) —
then the diff sees no change and no handler is swapped. **Only when it is the same behavior:** the
compiler applies H1 only when every captured local is a `const` (loop variables of `@foreach
(const … of …)`, `const` locals) or a parameter, never reassigned after the capture; anything else
(a `let` that changes later, `arguments`, `this`-rebinding constructs) keeps today's closure.
`this.field` inside the handler is read when the handler runs, as before.

**H2 — Skipping unchanged keyed rows.** For a `@foreach` body with `@key`, the compiler evaluates
the body's dynamic values first (in source order, into temporaries) and emits:

```ts
if (!__builder.reuseRegion(seq, key, [cls, row.id, row.label, handler1, handler2])) {
    /* … the body, using the temporaries … */
}
```

The builder compares the values with the previous render's region of the same key; if all are
identical it copies that region's frames instead of building them and marks the region
unchanged, so the diff skips it by its subtree length. A changed value builds and diffs the row
as today.

*Implemented (2026-10-06)* as `RenderTreeBuilder.reuseKeyed(site, key, values)` (`@internal`),
called before the row's `openElement`; the body is built only when it returns false. `site` is a
module constant per row site (one array per module evaluation, so an HMR update never reuses a
stale row) holding a check per value: 1 for a child component parameter (reused only while it is a
primitive), 2 for content (never a fragment). A reused row's frames are the previous render's frame
objects (an element's frames are never changed after it closed); each builder of a component reads
the other one's records, found by position (rows usually keep their order) or by key. The diff
skips an element whose old and new frame are the same object — it still counts as one sibling, and
its child components keep their instances (change detection then sees identical parameters).
Beyond the guards below: no control flow or code blocks inside the row, no inner `@key`, no
`yield`/`delete`; component parameters must be plain values (no child content, callbacks or
delegates; a declared object type rules the row out at compile time); a handler closure H1 cannot
hoist makes the row a plain block (never equal, so never compared). Bench (11k rows, Edge, A/B on
one machine against H1 alone): select 13.5 → 8–10 ms, swap ~107 → ~97 ms, remove ~104 → ~95 ms;
create, append and update every 10th unchanged within noise.

**Guards (Blazor semantics):**
- Only bodies **without child components** — or whose components get only primitive parameters
  (string, number, boolean, `null`), which Blazor itself does not re-render when unchanged. A
  component with an object, array or delegate parameter re-renders with its parent in Blazor
  (`ChangeDetection`), so such rows are never skipped.
- Only bodies whose expressions are side-effect free as far as the compiler can tell (no
  assignments, `++`, `await`, `@{ … }` statement blocks); otherwise the order of evaluation would
  change. Calls are allowed (a call is how `rowClass(row)` computes a class) — evaluated once, as
  now, only earlier.
- `@ref`, `@attributes`, `@bind` and event modifiers in the body: not skipped (they carry identity
  or two-way state).

**H3 — Update hints for attributes ("patch flags").** Measured as small here: attribute
comparisons are a minor share once H1/H2 remove the walk. Deferred; revisit with a bench where
large non-list trees re-render.

**H4 — Stable child content** (added 2026-10-09, port finding F38). Not an optimization first: it
gives compiled child content C#'s delegate equality. A Razor child content lambda that uses only
`this` is a new delegate on every render, but an *equal* one (`Delegate.Equals`: same method, same
target), and Blazor relies on that where it keys on a fragment: `SectionOutlet` renders its
content through an inner component keyed by the fragment, so the content's DOM and component
instances stay while the providing component re-renders. A JS arrow function is a new, unequal
object every render, so Tsazor rebuilt every `<HeadContent>` and `<SectionContent>` on every
render of its component: stylesheets in the head were removed and re-added, the page lost its
styles for a frame and flickered. The FluentCMS port's public site showed it on every navigation.

The compiler caches a fragment whose body uses no local declared outside it on the component:

```ts
__builder.addContent(1, this[__tsazor_f0] ??= (__builder) => { … });
const __tsazor_f0 = Symbol();                 // module level, ahead of the class
declare private [__tsazor_f0]?: (__builder: RenderTreeBuilder) => void;   // in the class
```

A body that uses an outer local — a loop variable, a markup local, an enclosing template's
context, a handler that captures one — stays a new closure per render, as in C# (a new closure
object, a new target). Locals the body declares itself don't count. The slot is a module symbol,
so a module re-evaluated by HMR gets new slots and never renders the old version's fragment; a
private `#field` would break on HMR's prototype swap. The cache sits on the component (the
lambda's `this`), not in the builder: nested child content runs in another component's builder,
and a host that renders fragments from several owners must not reuse one owner's fragment for
another. Hand-written fragments in TS follow the same rule by hand: the runtime's `PageTitle` and
`HeadOutlet` pass one function per instance, as Blazor passes a method group.
H4 is parity, so `renderHints: false` keeps it: that switch turns off the invisible hints, and the
tutorial's gate compares the DOM with and without them. Only the emergency switch `optimize: false`
("what Razor would generate") turns H4 off, at the cost of the parity: section content is then
rebuilt on every render of its component.

## Decisions (approved 2026-10-06)

- **D-R1 — H1 stable handlers**, `const`/parameter captures only. **Proposal: yes.**
- **D-R2 — H2 row skipping** for keyed `@foreach` bodies under the guards above. **Proposal: yes.**
- **D-R3 — H3** deferred. **Proposal: yes.**
- **D-R4 — Escape hatches.** `renderHints: false` (compiler and Vite plugin) emits today's code,
  like `staticMarkup: false` for F1a. **Plus one umbrella option `optimize: false`** that turns off
  every invisible compiler optimization (today `staticMarkup` and `renderHints`, later ones too):
  the generated code is then what Razor would generate — a diagnostic and emergency switch (A/B
  measurements, isolating a suspected optimizer bug), not a recommended mode. The single options
  are reviewed before 1.0; `optimize` stays. The gates run with and without optimizations. **Reviewed
  (2026-10-14, the API review's T5):** the Vite plugin's `staticMarkup` and `renderHints` are gone; `optimize`
  is its one switch (the compiler keeps the single options for its own tests). It turns off the compact
  field decorators (2026-10-15, `decorateFields`; language-reference.md) as well.

## Gates

- The conformance suite and the tutorial's DOM-equality gate (every lesson, with and without
  hints) — as for F1a.
- New tests: handler equality and its guards (a `let` capture stays a closure), row skipping and its
  guards (child component with an object parameter re-renders; a changed value rebuilds the row).
- Bench: select should approach Svelte's 10 ms; nothing else may get slower.

## Expected effect

H1 removes the 22k handler swaps and their edits (~2 ms). H2 removes building and diffing 10,998
unchanged rows (most of ~7 ms). Select from 16 ms to roughly 7–9 ms; the other operations are not
affected (create/append/remove build every row anyway; update every 10th skips 90 % of the rows).
