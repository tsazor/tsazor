# Handoff 2026-10-21 — BlazorHero phases 4–6, the owner's pre-1.0 decisions, the ports' task lists, next.6–next.8

The owner's plan for the day: push, BlazorHero phases 5 and 6, a task list for each library port (MudBlazor, Radzen),
then — after deciding four questions ("Ja" to every recommendation) — "Arbeite autonom weiter": the decisions, the
smaller defaults, BlazorHero phase 4.

## State

| | |
|---|---|
| Pushed | through `81f853e` (next.7) |
| Local registry | **1.0.0-next.8** (`c4f529d`); Verdaccio running from this session (`pnpm registry`) |
| Unpushed | `dd27138` … `c4f529d` (9 commits); `ci:local` green on `e32d3e8` |
| BlazorHero | phases 0–2, 4, 5, 6 done; `scripts/verify.mjs` 103 checks; phase 3 (identity) open |
| Gates | skins, both a11y, gallery green on `a4bc1d3`; the parity gate was stopped in Edge after its QuickGrid tests passed (441 checks) — run the full one again |

## Done

| Commit | What |
|---|---|
| `2967ab4`, `81f853e`, `c4f529d` | 1.0.0-next.6, next.7, next.8 to the local registry |
| `512cfb8` | BlazorHero phase 5: the dashboard and the chat with a second user |
| `64fa89b`, `416747c` | Found by the port review agents: build-lib declarations with `declaration: true`; the plugin dedupes the app's `@tsazor/*`; a base's type arguments imported into declarations |
| `1af71b3` | Right to left in the skins (arrow keys follow the reader, mirrored arrows) |
| `e17d9fa` | BlazorHero phase 6: eleven languages, Arabic right to left |
| `dd27138` | **Owner:** DataGrid `resizableColumns`, `reorderableColumns` — off by default (B32) |
| `e2aaa72` | **Owner:** TZS039 — an untyped `@CascadingParameter()`, in `@code` and `.ts` classes; the cascading lessons give the type |
| `739413d` | **Owner:** a component's declaration names the members that implement its base's abstract ones |
| `dfbe72d` | `<html lang>` follows the texts' language (`documentLanguage`, B34); `Paginator showPageNumber` (B36); MudChart's sizes in the migration guide (B30) |
| `a4bc1d3` | BlazorHero: the products' provider keeps nothing from a superseded request (B37, a cold backend showed it) |
| `caa6fca` | Abstract components (B38); menu link entries (B40); Tabs over a changing set, a tab's badge (B41) |
| `ff95acd` | BlazorHero phase 4: document types, the document store, extended attributes on the abstract generic base, the audit trails |

Port findings: docs/port-blazorhero.md B30–B47, U11–U14. Migration lessons (migration-practices.md): a cascaded value
that comes later (B31), Blazored.LocalStorage's C# names (B33), `<html lang>` (B34), the provider's `signal` (B37),
open-generic services (B39), a decimal's scale from JSON (B47).

## The ports' task lists

`D:\Own\MudTsazor\TASKS.md` (English, M1–M23 + C1–C9) and `D:\Own\RadzenTsazor\TASKS.md` (German, R1–R30), each
self-contained, now on **next.8**: from the `file:` links into this working tree to the registry, the port bugs, the
workarounds next.5–next.8 made obsolete, versioned tests. Not committed in the port repositories.

## Open for the owner (also in roadmap-1.0.md §7)

- **B42** a `Decimal` field in the skins (a generic `NumberInput<TValue>` or a `DecimalInput`), **B43** a typed
  `Select<TValue>` — both change an existing component's type, so before the freeze.
- **B44** DataGrid detail rows, **B45** a DateRangePicker — MudBlazor features the port worked around.
- **B46** `@bind` of a `Decimal | null` that starts as null binds the text (the runtime converts by the current
  value); the compiler knows the declared type — a change of K.7/K.8's documented rule.
- BlazorHero phase 3 (identity) is next.
