# Handoff 2026-10-19 — the MudBlazor and Radzen ports, X8, the port gaps

The owner ported **MudBlazor v9** (`D:\Own\MudTsazor`) and **Radzen.Blazor** (`D:\Own\RadzenTsazor`) to Tsazor with
agents — chosen for their size — to stress the public API. Their FINDINGS.md files fed next.3 (Radzen) and next.4/next.5
(MudBlazor). Today: X8 closed, both ports reviewed on next.5, the gaps the review found fixed. The ports' own
repositories were only read; nothing was changed there.

## State

| | |
|---|---|
| Last push | `190a575` (1.0.0-next.5, 2026-10-18) |
| Local registry | **1.0.0-next.5** — the Verdaccio process was stopped by Claude Code (low memory); start with `pnpm registry` |
| Unpushed | `bf20bc4` … `1372de8` (7 commits, below); all suites green locally; `pnpm ci:local` on `1372de8` was running at session end — check its result first |
| Stash | `stash@{0}`: the obsolete X8 A18 attempt — can be dropped |

## Done today (unpushed)

| Commit | What |
|---|---|
| `bf20bc4` | **X8 closed as no longer reproducible** — a light trace showed the expansion's report is the after spacer's (as Blazor's); it re-pointed only with the item height still at the estimate. 160/160 runs of the test and 4 full virtualize suites at 515/515; the distribution stays Blazor's ([handoff-2026-10-17-virtualize.md](handoff-2026-10-17-virtualize.md) X8). Gates: Edge launches with `--no-proxy-server` (`scripts/browsers.mjs`) — an auto-detected system proxy hung every page load |
| `fe89ab9` | A base imported by name (`@import { Button }` + `@inherits Button`) resolves — both ports lost the derived component; a component's declaration exports its class by name and declares its public getters (what a `@ref` reads) |
| `b967a4a` | Every library helper gets its declaration: what `transpileDeclaration` can't give comes from the program `tsazor check` builds (`emitDeclarations` in `@tsazor/lsp`); one that can't be given is a build error. `builtSpecifiers` leaves comments alone |
| `a8ae6af` | `@this.#name` in markup; `RenderFragment<any>` is a template |
| `0b6b51d` | TZS038 also warns about an operator after an expression (`title="@label ?? undefined"`), quick fix `@(…)` |
| `e242088` | TS2307's hint names an installed package a misspelled one is near (`@tszor/runtime`) |
| `1372de8` | `portal(element, target)` (runtime): a rendered element moved elsewhere keeps its place in the render through a placeholder (the Radzen port's F333) |

F246 (markup `const` across nested fragments) didn't reproduce in its simple form.

## The port review (2026-10-19, read-only, both on next.5)

- **MudBlazor**: 159/164 components, 86.6k lines, `tsazor check src` 0 errors. Port bugs: the snackbars don't work (their
  registration stands after `@code`, renders as text — `static { }`), the charts use `EventCallback.unbound` where
  upstream binds (`Factory.Create(this, …)`) so hover/selection don't re-render (126 `unbound` against upstream's 25
  non-rendering handlers), 9 operator-after-expression spots (TZS038), its build fails next.5's export validation
  (14 type annotations missing in `icons.ts`, `dialog-service.ts`, `mud-global.ts`). Obsolete now: `fix-declarations*.mjs`,
  `validate-index.mjs`, `check:helpers` and the 31 structural views it caused, ~50 name cascades (`type: () => X`),
  13 F1702 casts, the memoized attachments for `panel.panelRef`. **Correction:** Sankey's `strokeWidth="@0"` is not a bug.
- **Radzen**: 424 `.tsazor` / 617 `.ts`, ~192k lines, inventory closed, near-complete DataGrid (editing, grouping and
  virtualization not yet shown in a browser), `tsazor check src` 0 errors, demos mirror ~15%. Obsolete: the `baseModule`
  map in `scripts/build.mjs`, 74 `?raw` wrappers, ~100 name cascades, the skipped `@ref="item.element"`. Port bugs:
  5 `var` loop counters, 98 gallery files importing the misspelled `tszor-radzen`, 12 TZS038 spots.
- **Neither has versioned tests.** Lists for the port agents were offered to the owner (writing into the port repos
  only with the owner's go).

## What the ports taught (for the owner's 1.0 question)

The breadth holds (two of the largest Blazor libraries, 0 type errors); silent failures are the expensive class (code
that compiles and renders text or loses types) — every diagnostic against them paid off at once; library authors are an
audience of their own (most friction sat in build-lib and the declarations); agents mistranslate systematically
(`unbound` for `bind`, name cascades, `tsc` gates, `var` loops); without tests, runtime bugs stay hidden. The owner asked
whether "Tsazor" is too unusual: my advice was to keep it (meaning, availability); the agents' misspellings are the one
hard data point; a rename only before the first public commit — the owner's decision.

## Next

1. `pnpm ci:local` result on `1372de8`; then push (the owner approves pushes).
2. On the owner's word: 1.0.0-next.6 to the local registry (`pnpm release:version`, build, `pnpm registry`, `pnpm release:local`).
3. The road to 1.0 ([roadmap-1.0.md](roadmap-1.0.md) §7): BlazorHero phases 3–6 (5 and 6 are 1.0 items: charts,
   SignalR chat, languages with RTL) — the freeze signal: they run through with only additive findings; the owner's
   E9 screen-reader audit and two decisions (the skins' repository at 1.0, the first public commit's contents).
4. F333 alternative, after 1.0 if at all: Blazor-style logical children (tolerates any external DOM move), instead of
   `portal`.
