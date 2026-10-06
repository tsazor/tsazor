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

## Decisions (approved 2026-10-06)

- **D-R1 — H1 stable handlers**, `const`/parameter captures only. **Proposal: yes.**
- **D-R2 — H2 row skipping** for keyed `@foreach` bodies under the guards above. **Proposal: yes.**
- **D-R3 — H3** deferred. **Proposal: yes.**
- **D-R4 — Escape hatches.** `renderHints: false` (compiler and Vite plugin) emits today's code,
  like `staticMarkup: false` for F1a. **Plus one umbrella option `optimize: false`** that turns off
  every invisible compiler optimization (today `staticMarkup` and `renderHints`, later ones too):
  the generated code is then what Razor would generate — a diagnostic and emergency switch (A/B
  measurements, isolating a suspected optimizer bug), not a recommended mode. The single options
  are reviewed before 1.0; `optimize` stays. The gates run with and without optimizations.

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
