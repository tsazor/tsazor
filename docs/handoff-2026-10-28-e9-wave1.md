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

- Release dry run, 2026-10-28 on `7e676a3`: `pnpm release:pack` (19 tarballs, all checked: version, no
  `workspace:` ranges, README and LICENSE, every `exports`/`types`/`bin` target present, nothing forbidden),
  `pnpm smoke` (the starter from the tarballs: build, test, `tsazor check`, every bin) and `pnpm rehearsal`
  (Verdaccio: publish as `next`, SBOM, `npm create tsazor` with @tsazor/fluent and --dotnet, install, check, build,
  test) — **all green**. Every JS export has its `types` condition, first.

- After the five decisions: `pnpm gates` all 35 green on `e88cf02`. The root `pnpm test` (2970) doesn't run the
  apps' own suites — `public-tree --verify` (`pnpm -r test`) does, and caught the tutorial's two markup tests behind
  the ValidationMessage ids and the workspace's generated runtime manifest behind its doc (`e6677be` and the commit
  after it). Before a release: `pnpm -r --filter "./apps/**" test` as well.

- **Final state 2026-10-28: `node scripts/public-tree.mjs --verify` GREEN on `5594fee`** (3107 files; install, build
  and every package's and app's tests in the export). On the way, besides the two real misses above: tests that build a
  TypeScript program timed out at vitest's 5 s with every package testing at once — lsp and cli have 30 s per test in
  their vitest configs, dotnet 30 s, the declaration tests and two others 60 s (`df5536e`, `18183e0`, `5594fee`).

- **Final run after wave 2, 2026-10-29 on `ceab0de`:** `node scripts/public-tree.mjs --verify` **GREEN** (3107
  files; install, build, every package's and app's tests). `pnpm gates`: 34 of 35 green; red only the skins gate in
  WebKit — a real bug its new reduced-motion check found: a click on the carousel's stop/start button replaces the
  icon under the pointer, WebKit then misses the carousel's `pointerleave`, and the slides never turned again. Fixed
  (`0e10f43`, a pointerover outside ends the hover; a unit test per skin); the skins gate then green in WebKit,
  Firefox and Edge.

## Owner, open

1. `git push origin roadmap/phase-0`, then CI → Run workflow (ci:local needs WSL, not on this laptop).
   The owner is back home around 2026-11-04: no CI before then, so CI and its fixes have ~6 days before rc.1
   (2026-11-10). Until then the laptop's substitutes (`pnpm test`, `pnpm gates`, `public-tree.mjs --verify`) carry it.
2. ~~The five behavior decisions~~ — **decided 2026-10-28: yes to all five**, as recommended
   (handoff-2026-10-27-rc1.md, "Decisions"): toasts with an action stay until closed; `aria-invalid` as soon as the
   field shows invalid, the message still deferred; runtime inputs tie their ValidationMessage with
   `aria-describedby`; disabled menu items stay focusable (`aria-disabled`); single-character hotkeys documented with
   `enabled` as the way to turn them off. **Done 2026-10-28**, each with a test: toasts `6fbcfa1`; menu items
   `3967340` (rovingFocus `skipDisabled`, the gallery gate stops on the item now); hotkeys `703c9a5` (the parameter is
   `disabled`); `aria-invalid` `ea05799` (FieldState.aria takes `invalid`); ValidationMessage ids and the inputs
   `aria-describedby` — the commit after `ea05799` (Blazor parity gate: 521 passed).
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
- A DataGrid resize handle's `aria-valuenow` is the column's laid-out width in px (measured at focus), a drag and the
  keys start from it, the keys stop at 40 px (`d244f4a`; the showcase smoke checks it in a browser).
- A DetailsColumn toggle keeps its label open or closed; `aria-expanded` says which (`a6a4288`, `beb7cfd`).
- Overflow's +N button has no `aria-haspopup` — the popup is a group, not a menu (`f49f787`).
- An Avatar's badge joins its name by `aria-labelledby` (itself and the badge); an unnamed one with a badge isn't
  hidden (`dcdec55`).
- A Chip whose text is its content names its close button by what it shows (`0842a6a`).
- A Carousel under reduced motion starts stopped, and its start button turns the slides (`08587d2`, skins gate).
- A ColorPicker's hsv square says the color it makes (`e3d5234`); a ColorPickerInput with `hideTextInput` is named
  by its label and carries the field's help, message and invalid state (`f9666b0`).
- A Slider on a labelled tick says the tick's label (`605cd2a`).
- A Wizard's done steps say "completed" (`bf5a537`).
- A FileUpload shows and announces its errors; its status is always in the page, so the first text is heard too
  (`c8144ff`, skins gate).
- A RichText's `ariaLabel` names the engine's editing surface; the area is a named group, or the textbox when the
  engine edits on it (`b1b8db5`, showcase smoke).
- Date fields describe their format; a DateRangePicker's ends are "Trip Start date" (`b797895`; skins gate, and the
  BlazorHero gate's date range check passed — its language phase imports a `.ts` file, which Node 22.12 on this
  laptop can't without `--experimental-strip-types`; BlazorHero isn't a CI gate).
- A ListGroupItem says active (aria-current) and disabled (aria-disabled), and a disabled link loses its href
  (`77f1bf6`).
- The demo and skins apps have FocusOnNavigate, and their result texts are `role="status"` (`6dbc460`).
- The skin differences, closed toward the more accessible side: Bootstrap's Dialog and Drawer titles are h2 (in the
  h5 look, `3fc7d84`); Bootstrap's AccordionItem has Fluent's h3, `aria-controls` and labelled region (`a7f2308`); a
  Fluent tab panel is a Tab stop (`c320cad`); a Fluent Switch shows its field's message (`b68452b`); Bootstrap's
  field messages are `role="alert"` as Fluent's (they show only after a submit; `e4efbd3`).
- Library texts added: `colorPicker.squareColorValue`, `wizard.completed`, `fileUpload.fileError`,
  `datePicker.format` (CHANGELOG, Unreleased).

Looked at, left open:

- DecimalInput ↑/↓: a feature (step, min/max, decimal arithmetic on a text field), not a fix — after rc.1.
- Rating at 0: checked 2026-10-28, no finding — clearing (a click or Space on the value's star), the keys from 0
  (→ 1, ← stays, End 5, focus on the star), `readOnly` (a click puts the check back), RatingDisplay "Rated 0 out of 5".
- A virtualized DataGrid's detail rows have no `aria-rowindex` (the data and placeholder rows do), and
  `aria-rowcount` doesn't count them. Options: `role="presentation"` on the detail row (its content stays, the cell
  semantics go) or a row index scheme that counts open details. A semantics choice — not made.

With these, the wave-2 list in handoff-2026-10-27-rc1.md is done except the two items above (DecimalInput ↑/↓, the
detail rows' semantics). Every fix has a test that fails without it; the ones a browser decides (names by
`aria-labelledby`, focus, reduced motion) are checked in the skins gate or the showcase smoke as well.
