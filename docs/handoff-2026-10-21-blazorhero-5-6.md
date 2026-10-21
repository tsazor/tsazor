# Handoff 2026-10-21 — BlazorHero phases 5 and 6, the ports' task lists, next.7

The owner's plan for the day: push, then BlazorHero phases 5 and 6 (both 1.0 items), and a task list for each of the
two library ports (MudBlazor, Radzen) for their agents. Two review agents drafted the lists read-only; what they found
in Tsazor itself was fixed first (core work has priority).

## State

| | |
|---|---|
| Pushed | `190a575..64f03b8` (the 2026-10-19 work) |
| Local registry | **1.0.0-next.7** (see below); Verdaccio running from this session (`pnpm registry`) |
| Unpushed | `2967ab4` (next.6) … the next.7 release commit |
| BlazorHero | phases 0–2, 5, 6 done; `scripts/verify.mjs` 90 checks; phases 3 (identity) and 4 (documents, audit) open |

## Done today

| Commit | What |
|---|---|
| `2967ab4` | 1.0.0-next.6 to the local registry (the 2026-10-19 fixes) |
| `512cfb8` | BlazorHero phase 5: the dashboard (tiles, the monthly bar chart, UpdateDashboard from another tab) and the chat with a second user (presence by the hub, a message on both sides at once, the receiver's notification with "Chat?", the contacts in a Drawer); verify 83 |
| `64fa89b` | build-lib: a helper's declaration from the program also when the tsconfig sets `declaration` (next.6 stayed `noEmit` — the MudBlazor port's build); the Vite plugin dedupes the app's own `@tsazor/*` packages (a `file:` library with its own `node_modules` brought a second runtime) |
| `416747c` | A component's declaration imports what its base's type arguments name (`@inherits Picker<DateRange>`; the Radzen port) |
| `1af71b3` | Right to left in the skins: the horizontal arrows follow the reader (WAI-ARIA APG) in tabs, toolbars, trees, sortable lists, the Calendar's month and year views, the DataGrid's column keys; a resize drag to the left widens; the pager's, Pagination's, the Scheduler's and Bootstrap's Calendar arrows are mirrored |
| `e17d9fa` | BlazorHero phase 6: the eleven languages, Arabic right to left (products, dashboard, chat), the preference with the original's C# names, `<html lang>`; verify 90. Migration guide: `ToString("d")` wrote a two-digit year, `"G"` added |

Port findings of the day (docs/port-blazorhero.md): B30–B36, U11–U13. Migration lessons: a cascaded value that comes
later arrives as a parameter (B31), Blazored.LocalStorage's C# names (B33), `<html lang>` (B34).

## The ports' task lists

`D:\Own\MudTsazor\TASKS.md` (English, M1–M23 + C1–C9) and `D:\Own\RadzenTsazor\TASKS.md` (German, R1–R30), each
self-contained (the port agents never read this repository): switch from the `file:` links into this working tree to
the registry's next.7, the port bugs (Mud: snackbars never register, 116 `unbound` handlers that must re-render,
named suppliers a by-type parameter never matches; Radzen: 15 untyped `@CascadingParameter()`s that take the wrong
supplier, 7 methods passed without `this`, `portal()` for the popups, TZS038 spots), the workarounds next.5–next.7
made obsolete, and versioned tests (Vitest + `@tsazor/testing`, browser checks in the repositories). Not committed in
the port repositories — the owner's or the port agents' step.

Learned on the way: both ports resolved `@tsazor/*` through junctions into `D:\Own\Tsazor\packages` — they compiled
against whatever was built here, not against a release.

## Open for the owner

- **B32:** every DataGrid column has a move grip and a resize handle (tab stops) since the extended line's column
  work — no reference grid does this by default. My advice: opt-in parameters (`resizableColumns`, `reorderableColumns`)
  before the freeze; it changes next.x behavior.
- **P.8 before 1.0?** An unnamed `@CascadingParameter()` without `type` takes the nearest unnamed cascade of any value;
  the Radzen port has 15 such bugs (spreadsheet tools got an `UndoRedoStack` as their worksheet). The roadmap has the
  `tsazor check` warning after 1.0; it is additive and would have caught all 15.
- **Abstract members in component declarations** (the Radzen agent's (a), confirmed): a field or `protected` member
  that implements an abstract base member is missing from the `.d.ts` → TS2654 for a consumer without
  `skipLibCheck`. Needs the base chain's abstract members in the metadata (with type-argument substitution) or
  TypeScript's own declaration emit for components — a design choice.
- B30 (Chart `width`/`height` as CSS lengths too?), B34 (should `CultureService` keep `<html lang>` in step?), B36
  (a Paginator without the page text?).
- BlazorHero phases 3 and 4: phase 4's extended attributes are an abstract generic base with four type parameters
  (`@inherits ExtendedAttributes<int, int, Document, DocumentExtendedAttribute>` + `@Inherited()`) — a good test.
