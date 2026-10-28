# Handoff 2026-10-28 — E9 pre-audit, wave 1 done

## Done today (travel laptop; nothing pushed)

All 13 wave-1 items of the E9 pre-audit (handoff-2026-10-27-rc1.md), each with a test:

| Item | Commit |
|---|---|
| 1 `FluentForm` `novalidate` | `3154c8d` |
| 2–4 Toast assertive, Spinner's text, Tooltip kept in the DOM | `d1cd708`, `e22a370` |
| 12 SortableList as a listbox (the NVDA/JAWS blocker) | `0d4c4cf` |
| 6 Bootstrap Pagination and TimePicker default names | `fa381ba` |
| 10 `FocusOnInvalidSubmit` focuses into a fieldset or Rating | `6e76817` |
| 11, 13 Chat, PromptInput, FileUpload, Chart, PivotDataGrid, AuthorizeRouteView texts (`tsazor.auth.*`) | `fa3e948`, `a11bbed` |
| 9 Calendar announces the month | `bd238d9` |
| 5 Paginator/Pagination keep the focus (`aria-disabled`) | `1b68436` |
| 5 Autocomplete chip, closed toast, AppLayout + Escape | `3660237`, `f30ac8a`, `b0b3b23` |
| 5 ScrollToTop, Wizard Next → Done | `4f0ca42`, `e586cc1` |
| 7 DataGrid header and group-toggle names | `f1160be` |
| 8 DataGrid and Paginator announce loads, filters, pages | `b6c2dda` |

Also:

- **Runtime diff, one deviation from Blazor** (`3660237`, documented in architecture.md `d391da8`): an old keyed
  item gone from the new tree is removed *before* an unkeyed new frame is inserted. Blazor inserts first, so the
  unkeyed sibling after a shrinking keyed loop was re-created — the Autocomplete's input lost the focus on
  Backspace. Regression test in `runtime/test/diff.test.ts`; the parity gate stays green.
- Two load-dependent test timeouts on this laptop (the ABI corpus test, the DI service-default test): `c696be9`,
  `d3a51a5`.
- The gates' tooltip checks wait for a *visible* tip (`80e69eb`); every tooltip now keeps its hidden tip in the DOM.

## Checked today

- `pnpm test`: green (2957 tests).
- `node scripts/public-tree.mjs --verify` on `9773703`: install, build and every test green in the export; RED only
  for a trace ("(owner)" in design-release.md, `a15a3ce`). The export and trace checks alone on `a15a3ce`: **GREEN**.
  The first run, on `14af24c`, also timed out in the globals check — the tests that start a Node process have 60 s
  now (`9773703`).
- `pnpm gates` (edge, firefox, webkit): **all 35 green**, after the re-runs below. The first full run had 9 red:
  - the a11y and skins gates in all three browsers: their tooltip checks (`80e69eb`) and the chart names in the
    skins gate (`3d6f7fe`) — gate scripts behind today's fixes, not product bugs;
  - edge only: Blazor parity (a leftover process on :5360), the migration sample and FluentCMS (stale `obj/`, see
    "This laptop"). Re-run green.

## Owner, open

1. `git push origin roadmap/phase-0`, then CI → Run workflow (ci:local needs WSL, not on this laptop).
   The owner is back home around 2026-11-04: no CI before then, so CI and its fixes have ~6 days before rc.1
   (2026-11-10). Until then the laptop's substitutes (`pnpm test`, `pnpm gates`, `public-tree.mjs --verify`) carry it.
2. The five behavior decisions from the pre-audit (handoff-2026-10-27-rc1.md, "Decisions") — still open.
3. **The VS Code extension** (`packages/vscode`, grammar + our LSP — the Svelte-style extension exists already):
   publish it with rc.1 on the Marketplace and Open VSX, or attach the `.vsix` to the GitHub release? The roadmap
   has the Marketplace after 1.0; with the repository public at rc.1, people will look for it.
   The checked-in `tsazor-vscode-*.vsix` files are from 2026-10-01 and stale — repack before attaching any.
4. Everything else from handoff-2026-10-27-rc1.md "Owner, open" stands.

## This laptop

- The .NET apps' `obj/` folders came from a checkout at `D:\Own\Tsazor`: the static-web-assets manifest kept that
  path and an incremental `dotnet build` doesn't rewrite it, so FluentCMS's bff and the migration Gateway crashed
  at start (`DirectoryNotFoundException …\jsmodules\`). Cleared (they're ignored); a fresh clone doesn't have this.
- The VS Code extension is built from the current sources and installed.

## Next (wave 2)

Started:

- The tooltip's Escape no longer closes the dialog it sits in (`b2cdd53`): its listener is on the window, capturing.
- A focus trap skips elements CSS hides (`58e204d`): `focusableElements` asks `checkVisibility`.
- A TreeView never loses its tab stop (`dda8fde`): a selection in a closed node gives it to the open ancestor.
- A full-screen Overlay leaves the ToastRegion (in the top layer, above it) alone (`46840d6`): toasts during a
  blocking load were inert — neither announced nor pressable. A ToastRegion nested inside a covered container stays
  inert; it belongs at the layout's top level.
- A Splitter bar that collapses a pane takes Tab without `resizable` (`901c48f`).
- A Progress without a label is named "Progress" (`ec98239`, library text `progress`).
- A virtualized DataGrid's `aria-rowcount` counts the rows a filter leaves, not all items (`8bd2b6f`).

Looked at, left open:

- DecimalInput ↑/↓: a feature (step, min/max, decimal arithmetic on a text field), not a fix — after rc.1.
- Rating at 0: clearing works (a click or Space on the value's star); the audit note says no more — what was meant?
- A virtualized DataGrid's detail rows have no `aria-rowindex` (the data and placeholder rows do), and
  `aria-rowcount` doesn't count them. Options: `role="presentation"` on the detail row (its content stays, the cell
  semantics go) or a row index scheme that counts open details. A semantics choice — not made.

The rest of the wave-2 list in handoff-2026-10-27-rc1.md stands; it is after rc.1, so no rush.
