# Handoff: the owner's decisions after the fullstackhero port (2026-10-13)

> **Update (2026-10-13, later the same day) — all twelve decisions are implemented:**
>
> | Item | Commit |
> |---|---|
> | B20 FluentProvider `"system"` (light pins; space-toggle aliases follow the nearest theme) | `90d1ba0` |
> | F5 ValidationSummary in Blazor's markup | `1b44a08` |
> | F1 computed parameter types take text as text | `b42d35f` |
> | B12 `@authorize` in `_Imports` inherited, `@allowAnonymous` | `e7d2cf9` |
> | F15 `immediate`, F16 `<FocusOnInvalidSubmit />` | `80ae76d` (+ `a33e8a3` runtime doc gaps) |
> | B2 `--envelope data,messages,succeeded`, B3 lesson | `78e187a` |
> | F2 overlays in the top layer (`topLayer` in @tsazor/ui, both skins) | `9186844` |
> | C12 fullstackhero acceptance is a gate (`pnpm --filter fullstackhero verify`, CI e2e) | `51b96b4` |
> | F3/F17 Razor templates in `@code` (+ fullstackhero's OptionalFooterSection and two-branch sections gone) | `b32af2a` |
> | C11 StandardSchemaValidator stays public | nothing to do |
>
> Checks: root vitest 2546/2546, tutorial 1255/1255, fullstackhero acceptance 111/111. A full `pnpm gates` (all
> three browsers) over B20…C12: 33 of 35 green; after F3 all gates once more in Edge: 13 of 15. The red ones:
> - **fullstackhero:** a fresh headless Edge sometimes closes right after its launch (`browser.newContext: … has
>   been closed`, always before a test's first step; 2 of 7 runs lost one test). The gate now retries as the
>   original's CI does (`--retries=2`) and names any test that passed only on a retry (`802f567`).
> - **Edge's Blazor parity, `DynamicContent_AppendItemsWhileAtBottom_ViewportStaysStable`:** red in every full gate
>   run (from F1 on), green alone and in its group (124/124, 3×). Bisected with `--suite virtualize` in a worktree:
>   3d46416, B20+F5, F1, B2 and F2 all 514/514; HEAD once red — but the parity app built with and without F1, and
>   with and without F3, is byte-identical (same content hashes in both skins). So the code under test is the same:
>   a timing flake of that test in Edge under load, not a regression. Worth a closer look at the test's wait (it
>   measures right after the status text appears) — not changed here. **Fixed 2026-10-14 (`f6fe15b`):** not load
>   but a race in the test's "before" read; see [handoff-2026-10-14-api-review.md](handoff-2026-10-14-api-review.md).
>
> Pushed through `802f567` (2026-10-13).
>
> Working tricks of this session: `stage-hunks.mjs` (scratchpad) stages chosen hunks of a file (`git apply
> --cached`), for docs that carry two items' changes; a `git rm` stays staged — don't commit with it unintended.

**Read first:** this document, then [port-fullstackhero.md](port-fullstackhero.md) (findings F1–F20) and the
update box of [handoff-2026-10-07-component-library.md](handoff-2026-10-07-component-library.md) (the earlier
state). Branch `roadmap/phase-0`, HEAD `9f46c04`, everything pushed.

## State

- **fullstackhero port done** (`apps/fullstackhero`): all 32 pages, the original's Playwright suite unchanged
  **111/111** (`pnpm --filter fullstackhero acceptance`, `--port=` for parallel runs), `visual` 94/111 within 0.5%.
  The backend (Aspire + Docker) hasn't run: Docker Desktop hung in "starting" (the owner restarts it).
- **Framework fixes from it** in `5618fb6`: nested layouts (F10), `StandardSchemaValidator` (F8),
  `historyEntryState` (F7), `getUriWithQueryParameter(s)` (F11), `aria-invalid` + `cssClass` /
  `attributesWithValidation` on InputBase (F6, F14), tsconfig `paths` in metadata and type checker (F4, F13),
  `addAttribute` takes `unknown` (F12).
- **Checks:** root vitest 2514/2514; `pnpm gates` (edge, firefox, webkit) 34/34 after three check fixes (demo
  a11y locator, starter font quotes in Firefox, skins' native time input absent in Playwright's WebKit on Windows).

## The owner's decisions (2026-10-13: "Alles nach Empfehlung")

Do them in this order — first what changes existing behavior (it must land before 1.0), small ones first.

### A. Behavior changes (before 1.0)

1. **B20 — `FluentProvider` theme default `"system"`** (Fluent UI Blazor's `DesignThemeModes.System`): `theme:
   "system" | "light" | "dark" = "system"`; `"system"` follows the OS, an explicit `"light"` is light even under a
   dark OS. Files: `packages/fluent/src/FluentProvider.tsazor` (today `theme: "light" | "dark" = "light"`, light
   meaning inherit), the token sheet's `data-fluent-theme` rules (`packages/fluent/src/*.css`, the alias blocks for
   light, dark and the OS-dark media block), docs, the skins gate. Afterwards BlazorHero's workaround
   (`apps/blazorhero/index.html`: `data-fluent-theme="light"` on `<html>`) can go; port-blazorhero.md B20 → fixed.
2. **F5 — `ValidationSummary` renders Blazor's markup:** `<ul class="validation-errors">` with
   `<li class="validation-message">` (Blazor sets its class after AdditionalAttributes, so it wins). File:
   `packages/runtime/src/forms/validation.ts`; tests that read `ul.validation-summary`
   (`packages/runtime/test/forms.test.ts`, `packages/runtime/test/standard-schema-validator.test.ts`); the tutorial
   CSS (15 files under `apps/tutorial/content/**/Bread.tsazor.css`, `apps/tutorial/test/claims-part3.test.ts`),
   `apps/demo/scripts/verify-3-7.mjs`, `packages/bootstrap/.build/probe-run.mjs`. CHANGELOG (breaking for CSS).
3. **F1 — computed parameter types:** the compiler's syntactic categorizer (`categorizeNode` in
   `packages/compiler/src/metadata.ts`) treats an indexed access (`VariantProps<…>["variant"]`), a conditional or
   mapped type, `typeof`, and a global utility over such a type (`NonNullable<…>`) as **"text when there is no
   `@`"** — the uncertain category's lowering — but without TZS026: `tsazor check` checks the value against the
   real type anyway (the shadow's `satisfies`). `NonNullable<T>`/`Readonly<T>` of a followable T take T's category.
   Tests in `packages/compiler/test` (metadata/component-attributes). Afterwards
   `apps/fullstackhero/src/components/ui/variants.ts` can type its parameters with cva's `VariantProps` again.
4. **B12 — `@authorize` in `_Imports.tsazor` is inherited** (Blazor's `@attribute [Authorize]` in `_Imports`), with
   **`@allowAnonymous`** to opt a page out. Today `@authorize` doesn't inherit (decided earlier; TZS014 for the
   Blazor-only form). Compiler: the imports chain's `@authorize` merges into each page's route metadata (the vite
   plugin's route manifest: `packages/vite-plugin/src/routes.ts`), `@allowAnonymous` clears it; language-reference.md;
   tests. Afterwards BlazorHero's per-page `@authorize` can move into `_Imports` (port-blazorhero.md B12 → fixed).
5. **F2 — the skins' overlays in the browser's top layer** (Radix's Portal without a portal): a `topLayer`
   attachment in `@tsazor/ui` (model: `apps/fullstackhero/src/lib/top-layer.ts` — `popover="manual"` +
   `showPopover()` on the overlay's outermost element; a parent's attachments run before its children's; the
   toasts re-raise themselves when an overlay opened after them). Both skins: Dialog, Drawer, Popover, Menu/
   Dropdown, Tooltip, ToastRegion, the listboxes and pickers (Select, Autocomplete, DatePicker, TimePicker,
   ColorPicker) — undo the popover's UA box (margin, inset, border, background, padding). Check z-index assumptions
   and the skins/a11y/parity gates in all three browsers. Afterwards the port's own `lib/top-layer.ts` can use the
   library's.

### B. Additive

6. **F3/F17 — Razor templates:** `@<tag>…</tag>` inside `@code` is a `RenderFragment`
   (`private readonly body: RenderFragment = @<div>…</div>;`), and `(item: T) => @<li>@item.name</li>` a
   `RenderFragment<T>` (Blazor's templated delegates). Parser (find `@<` in member code outside strings, comments and
   template literals; the element's extent), codegen (a lambda over `__builder`, `this` captured), the typed shadow
   and its mappings, the language server, language-reference.md, tests. Then the port's workarounds (row-body
   components, `OptionalFooterSection`, two-branch slots) can be simplified.
7. **F15 — `immediate` on `InputText` / `InputTextArea`** (superset; MudBlazor's `Immediate`): the value binds on
   `input`, the EditContext's field change stays on `change`, and a field that already has a message re-validates per
   keystroke (react-hook-form's reValidateMode). Model: `apps/fullstackhero/src/components/ui/LiveInputText.tsazor`.
8. **F16 — focus the first invalid field after a failed submit**: an opt-in runtime component placed in the
   EditForm (model: `apps/fullstackhero/src/components/FocusFirstError.tsazor` — on `onValidationRequested`, after
   the render, focus the form's first `[aria-invalid="true"]`). Name it as the codebase names such things.
9. **B2 — `@tsazor/dotnet`: a success flag in the response envelope** (BlazorHero answers HTTP 200 with
   `succeeded: false` and `messages` on success too). Today `--envelope data,errors` (`packages/dotnet/src/cli.ts`,
   EnvelopeOptions) reads non-empty messages as failure. Add the flag field (e.g. `--envelope
   data,messages,succeeded`), tests; port-blazorhero.md B2 → fixed.
10. **B3 — no generator option** for response types missing from Swagger: a lesson in migration-practices.md
    ("a Swagger document without response types: hand-written services, as the original's managers").

### C. Confirmations

11. **`StandardSchemaValidator` stays** public runtime API.
12. **fullstackhero's acceptance becomes a gate** in `scripts/gates.mjs` (Edge; it needs the upstream clone and its
    `npm ci` first — `apps/fullstackhero/scripts/upstream.mjs` — and runs on its own port). Mind the
    `server.warmup` in `apps/fullstackhero/vite.config.ts`: without it the lazy pages compile under the test load.

After each item: findings rows in port-fullstackhero.md / port-blazorhero.md to "fixed", CHANGELOG, tests,
`node scripts/api-snapshot.mjs`, `node packages/workspace/scripts/gen-runtime-manifest.mjs` when runtime components
change, root `npx vitest run`, `pnpm --filter fullstackhero acceptance`, and `pnpm gates` (edge at least; all three
browsers before pushing a behavior change).

## Working rules (unchanged)

- Never commit the owner's WIP: `pnpm-lock.yaml` changes from `apps/fluentcms-admin` and that folder. A new
  dependency goes in with the lockfile staging technique (back up `pnpm-lock.yaml` and `pnpm-workspace.yaml`, add
  `"!apps/fluentcms-admin"`, `git show HEAD:pnpm-lock.yaml > pnpm-lock.yaml`, `pnpm install --lockfile-only
  --offline`, keep LF, `git hash-object -w --no-filters` + `git update-index --cacheinfo`, restore both).
- Stage files explicitly; never `git add -u`.
- Never rebuild packages while root tests or gates run.
- Stop only processes you started, by PID — never by image name (a broad `taskkill /IM node.exe` was run on
  2026-10-13; it matched nothing, but don't).
- After the restart: ports 5410/5411 (AllesZusammen) weren't listening on 2026-10-13 — the owner checks.
- Answer the owner in German; repo artifacts in English. Push at milestones or session end; CI only via
  workflow_dispatch.
