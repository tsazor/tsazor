# Roadmap — Tsazor 1.0

Status (2026-10-08): **steps 1–4 of the order below are done**, and of step 5 the Svelte-style features,
the component library (Tier 1, both skins) and `@tsazor/worker`. **Scope cut (owner, 2026-10-08):** E12
and the Sleipnir integration move after 1.0, E12 first. Both are separate, additive packages; neither
changes the API of the runtime or the compiler. **Left for 1.0:** R2, E3, E10, the E9 screen-reader
audit, the known follow-ups, then going public (R4, provenance). The repository stays private until then.
(2026-10-14: R2, E3 and E10 are done; the API review is the basis of the freeze.)
**2026-10-15:** the library's waves A and B are done too. What is left is listed in §7 (the way to 1.0). **Scope (owner,
2026-10-15):** E12's `@tsazor/primitives` (`Decimal`, `DateOnly`, `TimeOnly`, `TimeSpan`, `Guid`, with the generator's
mappings on by default, X4) and the BlazorHero port's phases 5 and 6 come before 1.0; `@tsazor/extensions` stays after.
**Library completeness (owner, 2026-10-09):** 1.0 also waits for a complete component library, waves A and B of
[design-library-completeness.md](design-library-completeness.md) (§3b).
The overview for version 1. Detailed plans live in the linked roadmaps and design docs.

**Goal of 1.0:** a single-page-app framework with **Blazor parity** (markup and semantics),
superset-only Tsazor extensions, strict TypeScript, and the stability promise
([design-principles.md](design-principles.md): "Parity first, then scale", "Type safety is a
requirement"). Post-1.0: SSR ([roadmap-ssr.md](roadmap-ssr.md)), fine-grained reactivity.

Done before this roadmap: review roadmap phases 0–5 ([roadmap.md](roadmap.md)), English user
docs, `@Bindable`/`observe`/`disposeSignal` ([design-bindable-observe.md](design-bindable-observe.md)).

## 1 — Tutorial ([roadmap-tutorial.md](roadmap-tutorial.md))

M1 and M2 (Part 1) done · M3 (Part 2) done · M4 (Part 3, static deploy) in progress: Routing,
Forms, Auth, Talking to a backend, Testing, Localization and Next steps done (all of Part 3);
the static build and the deploy target are prepared (R4) and go live with the public repository.

## 2 — Svelte-style features ([design-svelte-features.md](design-svelte-features.md))

F1a static markup frames (a Razor parity gap; **done 2026-10-04**, [design-static-markup.md](design-static-markup.md)) · F1b update hints · F2 `@attach` · F3 `<Await>` (F1b–F3 done 2026-10-06) ·
F4 `@transition`/`@in`/`@out` · F5 `@animate` · F6 `@State` ([design-state.md](design-state.md)) — all done 2026-10-06. Decided 2026-10-02: the `@` namespace is
reserved (D1), `@attach` (D2), the Svelte transition set (D3), `@State` in v1 (D4). Each feature
gets its tutorial chapter.

## 3 — Sleipnir integration ([roadmap-sleipnir.md](roadmap-sleipnir.md))

**After 1.0, after E12 (owner, 2026-10-08):** nice to have, not needed for 1.0.

Track U upstream (U1–U4) and track T `@tsazor/sleipnir` (T1–T7). Its open decisions (where the
upstream work happens, where the emitter lives) need answers first.

## 3b — Component library ([design-component-library.md](design-component-library.md))

As important as the framework itself. **Decided (2026-10-06):** one behavior core, two skins —
Bootstrap 5 first (every `dotnet new blazor` template ships it), Fluent 2 second. Proposal: core
`@tsazor/ui` (behaviors as attachments, headless state models, field base), skins
`@tsazor/bootstrap` and `@tsazor/fluent` on one shared vocabulary, a QuickGrid-shaped DataGrid, Tier 1
scope for 1.0. Absorbs the open E9 keyboard patterns. Comes before R3 (`npm create tsazor --ui`).

**Completeness (decided 2026-10-09, [design-library-completeness.md](design-library-completeness.md)):** Tier 1
is done in both skins. The first new app (the AgentView dogfood) hit missing components at once. Owner: "Without a
complete library, nobody will move to Tsazor." So both waves come before 1.0, measured against Fluent UI Blazor and
MudBlazor:
- **Wave A:** icons (F17), Markdown, Avatar, Chip, Timeline, Stepper, Splitter, Toolbar, Slider, a DatePicker popup,
  an upload drop zone and a sortable list, plus the Bootstrap catch-up;
- **Wave B:** the rest of the inventory, and `@tsazor/charts`.

Each component goes into both skins at once. Building them is also a core test vehicle: core bugs found on the way
become fixes with tests. The core goes first: Virtualize at Blazor 11 parity, including `AnchorMode.End` for feeds
and chats ([design-virtualize.md](design-virtualize.md); the parity baseline is Blazor 11, owner 2026-10-09).

## 3c — Heavy work off the main thread ([design-worker.md](design-worker.md))

`@tsazor/worker`, Tsazor's answer to `Task.Run`: typed calls into Web Workers, callbacks on the main
thread, cancellation, transfer, pools, a test double. **Decided and implemented (2026-10-07,** W1–W5,
with the tutorial chapter and worker support in the preview).

## 4 — Stability promise and onboarding

- **S1 — API contract:** a snapshot of the public `.d.ts` surface of every package, checked in CI.
  A diff fails the build unless the snapshot is updated deliberately (with a changelog entry).
  **Done (2026-10-04):** `scripts/api-snapshot.mjs` → `api/<package>.api.d.ts`, `pnpm api:check` in
  CI, `pnpm api:update` + `CHANGELOG.md` for deliberate changes.
- **S2 — Strict only:** `getting-started`, templates and `npm create tsazor` use `strict: true`.
  `tsazor check` documents strict as the supported configuration. **Done (2026-10-06):** `tsazor check`
  (and the Vite plugin's check) warns `TSZSTRICT` for a tsconfig that leaves `strict` or one of its
  flags off; getting-started states strict as the only supported configuration. The starter's template
  is strict too (R3, 2026-10-08).
- **S3 — Never block development:** verify, and pin in tests, that the dev server and HMR keep
  running with TS type errors (shown as an overlay or console output, not as a failed module).
  Production builds keep failing on errors. **Done (2026-10-04):** the transform never type-checks
  (pinned); with `check: true` the dev server runs the check in the background and prints the
  findings (`dev-check.ts`); the build fails on them.
- **S4 — Quick fix for missing types:** TS7006 (implicit `any`) in `.tsazor` files gets
  "infer parameter types from usage" in the LSP. Plain-language hints for the most common TS
  errors in `.tsazor` files. **Done (2026-10-06):** the LSP offers TypeScript's "Infer parameter types
  from usage" for TS7006 & co. (mapped into `@code`, usages in the markup count); `explainTypeScriptError`
  appends a `Hint:` to the common TS errors in the LSP, `tsazor check` and the tutorial.
- **S5 — Reserved-name diagnostic:** a component member that shadows a `ComponentBase` member
  (`observe`, `dispose`, `stateHasChanged`, …) gets a Tsazor diagnostic instead of a cryptic
  TS2416 (port-findings M.1). **Done (2026-10-04):** `TZS031`, the list checked against the
  runtime by a test.
- **S6 — Tutorial:** the TS track's "Typed checks" lesson carries the message "types keep your app
  stable, and inference does most of the work". **Done (2026-10-06)** (both tracks).

## 5 — Enterprise readiness

Target audience: business developers and companies migrating (Blazor/.NET shops first). Clean
architecture and security take priority.

**Security**
- **E1 — CSP and Trusted Types:** document and CI-test that apps run under a strict CSP. Verified
  2026-10-02: there is no `eval`/`new Function` in runtime or components, and `innerHTML` is used
  only for `MarkupString`. `MarkupString` gets a Trusted Types integration. **Done (2026-10-04):**
  [csp.md](csp.md); the `tsazor` Trusted Types policy for `MarkupString`; `strictCsp: true` writes
  style attributes through the CSSOM (a strict `style-src` blocks `setAttribute("style")`, found by
  the new browser check); CI runs the demo's build under the policy (`verify-csp.mjs`).
- **E2 — Auth guidance:** the BFF pattern with an HttpOnly cookie (`CookieAuthenticationStateProvider`)
  is the documented default, with an ASP.NET BFF template. JWT in the browser only with a stated
  reason. Fix `@tsazor/dotnet` comments that suggest storing tokens in `localStorage`
  (`packages/dotnet/src/auth.ts`). State clearly that `AuthorizeView`/`@authorize` are UI only;
  enforcement happens on the server. **Done (2026-10-04):** [auth.md](auth.md) with the ASP.NET
  Core BFF template; the `localStorage` hint in `auth.ts` replaced.
- **E3 — Supply chain:** npm provenance, SBOM, signed releases, and a `SECURITY.md` with a
  vulnerability disclosure process. Zero runtime dependencies stays a policy. **Provenance prepared (2026-10-12):**
  `release.yml` publishes with `--provenance` through Trusted Publishing (R2). **Done (2026-10-14):** the SBOM
  (CycloneDX, `pnpm release:sbom`, written by every publish and checked by the rehearsal; `release.yml` attests it
  for the tarballs with Sigstore, the signed part next to npm's provenance) and [SECURITY.md](../SECURITY.md)
  (private reporting through GitHub, response times, scope). On the way: the icon packages and both skins now carry
  the upstream icons' MIT license in their `LICENSE`. Release day: turn on private vulnerability reporting.

**Architecture**
- **E4 — Architecture guide** (`docs/patterns.md`): layers, services via DI, feature folders, when
  to move to code-behind, presentational vs container components, testability with
  `@tsazor/testing`. **Done (2026-10-05):** [patterns.md](patterns.md) (also carries the localization
  snapshot-trap rule from E8).
- **E5 — Lazy loading per feature or route** (router + vite plugin). **Decided (2026-10-05):** [design-lazy-routes.md](design-lazy-routes.md) —
  Blazor's `OnNavigateAsync`/`<Navigating>` first, then lazy manifest entries, opt-in per glob
  (`lazyRoutes`), one chunk per page, the layout loads with the page, a failed chunk reloads once. **Done
  (2026-10-05):** runtime (`OnNavigateAsync`/`Navigating`, `LazyRouteEntry`), vite plugin (`lazyRoutes`),
  the gallery's dashboard as the lazy feature (a build test checks its chunks).

**Migration**
- **E6 — Incremental migration:** run Blazor and Tsazor side by side, route by route (YARP in
  front of both, a shared auth cookie), with a reference setup and docs. **Decided (2026-10-05):** the
  reference setup shows a **Blazor Server** app (the common and harder case; it also shows the API
  boundary of E7). **Done (2026-10-05):** [apps/migration-sample](../apps/migration-sample/README.md) (Blazor
  Server + YARP gateway + Tsazor pages, one cookie, `verify` in CI) and [migration.md](migration.md).
- **E7 — Migration guide:** the codemod workflow, what is automatic and what is manual, effort
  figures from the FluentCMS-admin port. It has a dedicated step for **Blazor Server**: there,
  components call services and the database in-process, so there was never an API boundary. Before
  such an app can become a SPA, that boundary has to be drawn. The guide covers exposing the
  existing services as an API, either with OpenAPI controllers (`@tsazor/dotnet`) or, as an option,
  with Sleipnir commands. Blazor WebAssembly apps usually have the boundary already. **Decided
  (2026-10-05):** the effort figures may come from the local FluentCMS-admin port, as aggregated,
  generic numbers only (no code). **Done (2026-10-05):** [migration.md](migration.md) — the codemod workflow, automatic vs
  manual, the Blazor Server API boundary (what crosses it), figures from the FluentCMS corpus probe
  (157/217 clean as is, 182/217 after the codemod). The local FluentCMS-admin port is too early for
  hour figures (3 pages); they are added once measured.
- **E7b — Coexistence guide:** not every team migrates. A common target is a Blazor app (e.g. an
  admin/backoffice) that stays, plus a public Tsazor frontend on the same .NET backend, which
  replaces e.g. a Svelte or React frontend chosen only because Blazor didn't fit. The guide
  covers sharing DTOs (one OpenAPI contract for both), auth (a shared cookie domain), CSS/design
  tokens, and how the same architecture vocabulary (components, DI, EditForm, validation) carries
  over. **Done (2026-10-05):** [coexistence.md](coexistence.md).

**Operations**
- **E8 — Localization and culture** (done 2026-10-02, `475cec3`, with its tutorial lesson; `Decimal` with
  `@bind:culture` belongs to E12, after 1.0): an `IStringLocalizer` counterpart, `CultureInfo` over `Intl`,
  `@bind:culture`, culture-aware formatting for display and input. Revisit the invariant-only policy
  (A5/B7): keep it for routing and data values, replace it for display and input.
- **E9 — Accessibility:** audit `@tsazor/bootstrap` and `@tsazor/fluent` against WCAG 2.2 AA (EU
  Accessibility Act / BFSG since June 2025), and add automated a11y checks to the E2E gates.
  **Decided (2026-10-04), staged:** now axe-core in the E2E gates (gallery: every `@tsazor/fluent`
  component; demo: `@tsazor/bootstrap`) plus keyboard/focus tests for the interactive components
  (dialog, tabs, select); the manual screen-reader audit is its own item before the 1.0 release.
  **Automated part done (2026-10-04):** `apps/gallery/scripts/verify-a11y.mjs` (axe on all 14 routes
  in light and dark, the open dialog, dialog and tabs keyboard behavior) and
  `apps/demo/scripts/verify-a11y.mjs` (axe on all 15 routes), both in CI. Fixed on the way: dark-theme
  fills behind white text (`--fui-brand-background*`, `--fui-color-*-filled`), the light subtle brand
  badge, the dialog's Shift+Tab trap, `Progress` without a name (`ariaLabel`), `Badge` text on
  warning (`text-bg-*`), `ListGroupItem` (an `<a>` in the `<ul>`, a clickable `<li>` the keyboard
  couldn't reach), and the demo's own labels and colors. **`@tsazor/bootstrap` keyboard patterns done
  (2026-10-07,** on the `@tsazor/ui` core): `Dialog`/`Modal` (role dialog, aria-modal/labelledby, Escape,
  focus trap and restore, scroll lock), `Dropdown` (menu button: arrow keys, typeahead, Escape and
  focus return, positioning), `Tabs` (roving tabindex, arrow keys, tab–panel ids); the demo gate checks
  them in Edge, with axe on the open dialog and menu.
- **E12 — Feel-at-home packages** ([design-extensions-primitives.md](design-extensions-primitives.md)):
  **After 1.0, before Sleipnir (owner, 2026-10-08)** — new packages, so they don't touch the 1.0 API.
  `@tsazor/primitives` (`Decimal` first, since money in `number` drifts; then
  `TimeSpan`/`DateOnly`/`TimeOnly`/`Guid`) and `@tsazor/extensions` (`HttpClient` + factory +
  handler pipeline, `Logger<T>`, `Options<T>`). Opt-in and idiomatic TS; no BCL clones. Decided: two packages (X1); an `HttpClient` alias in the
  runtime for `@inject HttpClient Http` parity (X2); `toEven` rounding (X3); generator mappings on by
  default (X4).
  `Decimal` comes with E8.
- **E11 — Opt-in hash routing** (Tsazor extension; Blazor has none, default stays history
  routing). For hosting without an `index.html` fallback, static hosting and iframe-embedded apps.
  Route and route query live in the fragment (`#/x?y=1`), and the real query string (e.g. an
  access token) is left untouched. Needed by the first business-SPA port; done (merged in `205b30a`).
- **E13 — Holding the previous page on navigation** (Tsazor extension; Blazor's static SSR with enhanced
  navigation behaves like this, its interactive modes don't). A navigation keeps the previous page on screen until
  the new one has its data, then shows it in one step, without the empty frames of a page still loading. On by
  default (owner, 2026-10-09), `routing.holdPreviousPage: false` turns it off. Found by the FluentCMS port (F39);
  done 2026-10-09, [design-navigation-hold.md](design-navigation-hold.md).
- **E10 — Support policy:** LTS window and deprecation rules, extending the stability promise. **Done
  (2026-10-14, owner):** [support-policy.md](support-policy.md), D-S1…D-S7; Node 22.12 is the tools' floor.
  **API review (2026-10-14):** [api-review-1.0.md](api-review-1.0.md), the basis for the freeze: what the promise
  covers (public, ABI, internal), what to hide or rename before 1.0, fifteen decisions, the gates.

## 6 — Release infrastructure

- **R1 — CI** (GitHub Actions): build before test, all package and app tests, tarball smoke
  gate, E2E gates (tutorial, pizza, gallery, sleipnir-ticker in synthetic mode), API snapshot (S1).
  **Done (2026-10-04):** `.github/workflows/ci.yml` — job `check` (ubuntu: build, all tests, API
  snapshot, tarball smoke) and job `e2e` (windows: the four verify scripts in Edge, ticker via
  `dotnet`). It found two Linux-only bugs on its first runs (the `tsazor` bin link on a fresh
  checkout, the scope hash of backslash paths), both fixed.
- **R2 — npm publishing:** versioning, changelog, provenance, and the publish workflow. **Done (2026-10-12,**
  [design-release.md](design-release.md)): one version for every package (owner: lockstep, `1.0.0-next.N` until
  1.0), prereleases only to a local Verdaccio while the repository is private (owner); `scripts/release.mjs` sets the
  version, packs and checks every tarball (README, LICENSE, the files `exports` names, no tests, no `workspace:`) and
  publishes; `pnpm registry` runs the local registry, `pnpm release:local` publishes to it; the rehearsal (CI's check
  job) publishes to a fresh Verdaccio and builds an app from `npm create tsazor`. `release.yml` (Trusted Publishing,
  provenance) is prepared for `tsazor/tsazor`. **1.0.0-next.1** is in the local registry.
- **R3 — `npm create tsazor`:** project starter (strict, Vite, `_Imports.tsazor`, a sample
  component and test, optional `@tsazor/dotnet`). **Done (2026-10-08,**
  [design-create-tsazor.md](design-create-tsazor.md)): the package `create-tsazor` writes the shape of
  `dotnet new blazorwasm` (MainLayout, NavMenu, Home, Counter, Weather, a test). `--ui` sets up any
  library from its `tsazor.setup` ([component-libraries.md](component-libraries.md)); the skins declare
  theirs like any third party. The tarball smoke builds the packed starter's app. The `starter` gate
  drives it in three engines, with Bootstrap, with Fluent and without a library. Found on the way:
  `NavLink` didn't take `class` (Blazor parity), and the skins lacked `sideEffects` (the app was
  66.7 KB gz instead of 30.7).
- **R6 — Browser support** (added 2026-10-07): [browser-support.md](browser-support.md) — the current
  Chrome/Edge, Firefox and Safari; CI runs the browser gates in Firefox and WebKit (job `engines`).
  The first runs found three real differences: Virtualize rendered every item in a scrolling panel
  (all browsers), focus didn't return to a mouse-opened dialog in Safari, the tutorial's console
  panel lost error messages in Firefox/Safari — all fixed.
- **R4 — Docs site:** the tutorial plus user docs, statically deployed. **Decided (2026-10-04):**
  GitHub Pages. The repository is private (Pages needs a paid plan there, and the site would be
  public): the static build with an SPA fallback and a deploy workflow are prepared now; it runs
  once Pages is enabled in the repository settings. **Prepared (2026-10-04):** `TUTORIAL_BASE` sets the base path
  (`<base href="%BASE_URL%">`), `pnpm --filter tutorial build:pages` adds the `404.html` fallback,
  `.github/workflows/pages.yml` deploys on pushes to `main` and by hand; CI checks the Pages build
  in Edge (`verify-pages.mjs`: entry, deep link, preview, navigation below `/Tsazor/`). **To go
  live:** Settings → Pages → Source "GitHub Actions", then the repository variable
  `PAGES_ENABLED` = `true`.
- **R5 — Numbers:** a current bundle-size figure (25.28 KB gz on the bench as of 2026-10-02;
  README/roadmap still say 20.4) and benchmarks before claiming anything publicly. **Refreshed
  (2026-10-05):** [apps/bench/README.md](../apps/bench/README.md) — the bench measured 29.4 KB gz;
  the document head/sections, localization and error boundaries are now opt-in for the bundle (no
  API change), giving **25.4 KB gz** (Vue 26.3, Svelte 15.1, React 69.2). Tsazor leads at create 10k,
  swap and heap, is on a par at append, update and remove, and trails at select (21 vs 10 ms for
  Svelte — the F1b target). The bench now keys the Tsazor and Blazor rows like the others do
  (without `@key` remove took 313 ms). The bench retries loads the cold
  browser held back (a ~0.9 s stall before the request that had made Tsazor look 20× slower to load).
  **After F1b (2026-10-06,** [design-render-hints.md](design-render-hints.md) **H1 + H2):** Tsazor leads
  at create 10k (283 ms), update every 10th (66), swap (94), select (7.8 vs Svelte 9.9) and remove
  (98) and in heap (15.3 MB); it trails only at append (68 vs Svelte 47 ms) and in size (26.2 KB gz
  vs Svelte 15.1). **Re-measured (2026-10-15):** the Tsazor app now switches views with a hash switch
  like the JS apps (it had measured its Router, which grew with E13 and the parity work to 29.9 KB);
  with the runtime's components compact and the ES2022 build target it is **24.3 KB gz** (Vue 26.3), and
  28.2 with its Router in hash mode (a second row; Vue's router adds 9.1 KB, React's 12.7 —
  [compared-to-react-and-vue.md](compared-to-react-and-vue.md)). It keeps its leads (create 283 ms,
  update 63, swap 100, select 8.2, remove 98, heap 15.2 MB); append varies too much between runs to
  rank (Tsazor and Svelte take turns).

## Order (proposal)

1. Tutorial M3 → M4, in parallel with S3 and S5 (small, they protect the tutorial experience).
2. R1 CI + S1 API snapshot (needed before anything is published).
3. Enterprise must-haves: E8 localization/culture, E9 accessibility, E2 auth guidance, E1 CSP,
   F1a static markup (a parity gap).
3b. **Decided 2026-10-04:** after step 3 and before step 4 — a tutorial introduction (landing page:
   what Tsazor is, the three parts, the track choice), a keyword index (front-matter `keywords`,
   an index page with search, checked by a test), and the **reference** in the tutorial app as
   part of R4: the language reference split into pages, the components generated from the
   manifests, the runtime API from the `.d.ts`, cross-linked with the lessons.
   **Done (2026-10-05):** start page and keyword index (a4c8488). **Decided (2026-10-05):** the reference
   as in `docs/design-reference.md` (D-R1…D-R5), except that `docs/language-reference.md` stays
   one document, shown as one page. **Done (2026-10-05):** the reference with language, diagnostics,
   components and API pages, cross-linked with the lessons and the index (see the design doc).
4. E4–E7 architecture and migration (incremental migration E6 is the main sales argument).
5. ~~Sleipnir integration;~~ the remaining Svelte-style features with their chapters (done).
6. ~~R3 (with the S2 templates)~~ (done 2026-10-08); the FluentCMS port (main track since 2026-10-08); the library's
   waves A and B (§3b, 2026-10-09); R2, E3, E10, the E9 screen-reader audit, the follow-ups → 1.0 release
   candidate → public repository, docs site (R4), npm with provenance → 1.0.

After 1.0: E12's `@tsazor/extensions` (its `@tsazor/primitives` moved before 1.0, owner 2026-10-15), then the
Sleipnir integration; SSR and fine-grained reactivity as planned.

## 7 — The way to 1.0 (2026-10-15)

Collected from the port documents, the design documents, the handoffs and the code (owner: "Wir müssen jetzt auf
1.0 hinarbeiten"). The code itself has no open markers: no skipped tests, and the only TODOs are lesson stubs.

### Before 1.0

| Item | Why before 1.0 |
|---|---|
| ~~**K.11** — `@tsazor/testing`: in happy-dom 18, `nextSibling` of a `<form>` (or `<select>`) is `null`, so updating anything after a form fails in a component test~~ **done 2026-10-15** (happy-dom 21) | Every `EditForm` test can hit it |
| ~~**P.10** — `createTsazorApp().dispose()` doesn't dispose the service provider~~ **done 2026-10-15** | A behavior change; Blazor disposes its services |
| ~~**Workflows** — `release.yml` and `pages.yml` run on `ubuntu-latest`, which becomes 26 on 2026-10-19~~ **done 2026-10-15** | Pin as `ci.yml` is, before the date |
| ~~**DataGrid column options** — QuickGrid's and Fluent UI Blazor's `ColumnOptions` (a column's filter UI) has no counterpart~~ **done 2026-10-15** | Parity with the grid both references build on; library completeness |
| ~~**K.7, K.8** — `@bind` converts by the element, not the bound value: `@bind:format` on a text input (Blazor's date idiom) and a `<select>` bound to a number write strings~~ **done 2026-10-15** | A common Blazor idiom; changing it later changes behavior |
| ~~**P.5** — `RenderFragment<T>` (a template with a context) as a type~~ **done 2026-10-15** | Blazor code names it everywhere; cheap now |
| ~~**X6** — `@tsazor/markdown`: `externalLinks: "same"` next to `"new-tab"`~~ **done 2026-10-15** (`"same-tab"`) | A name; renaming it later breaks |
| ~~**Stale docs** — roadmap-tutorial (M4), §3c, E8, design-virtualize, design-localization, the BlazorHero B3 row, a comment in `codegen.ts`~~ **done 2026-10-15** | Going public |
| **E9** — the screen-reader audit, by a person: [screen-reader-audit.md](screen-reader-audit.md) | WCAG 2.2 AA |
| ~~**E12 `@tsazor/primitives`** — `Decimal` (with `@bind` and validation), `DateOnly`, `TimeOnly`, `TimeSpan`, `Guid`; `@tsazor/dotnet` maps to them by default~~ **done 2026-10-15** ([design-extensions-primitives.md](design-extensions-primitives.md)) | Owner 2026-10-15 (X4): the mapping is the default from 1.0 on, so the types come first |
| ~~**BlazorHero phases 5 and 6** — the dashboard with charts and the chat (SignalR); the languages with right-to-left~~ **done 2026-10-21** | Owner 2026-10-15: they test charts, real time and RTL in the skins before the freeze |
| ~~**P.8** — an unnamed `@CascadingParameter()` without `type` takes any unnamed cascade~~ **done 2026-10-21**: `tsazor check` warns (TZS039), in `@code` and in `.ts` classes, with the annotation's class as the fix | Owner 2026-10-21: the Radzen port had 15 such bugs (spreadsheet tools got an `UndoRedoStack` as their worksheet) |
| ~~**B32** — every DataGrid column had a move grip and a resize handle~~ **done 2026-10-21**: `resizableColumns`, `reorderableColumns`, off by default | Owner 2026-10-21: no reference grid has them by default; changing it after 1.0 would break |
| ~~**Abstract members in component declarations** — a field or `protected` member that implements an abstract base member was missing from the `.d.ts` (TS2654 without `skipLibCheck`)~~ **done 2026-10-21**: declared by the base's own type (`kind: Series<number>["kind"]`) | Owner 2026-10-21: the targeted fix (the base chain's abstract members in the metadata), before 1.0 |
| ~~**`<html lang>` follows the culture** (BlazorHero B34)~~ **done 2026-10-21**: on by default with `localization`, `documentLanguage: false` turns it off | A default to decide before 1.0 (WCAG 3.1.1) |
| ~~**BlazorHero phase 3** — identity: users, roles, role permissions, user roles, the account, sign-up, forgot and reset password~~ **done 2026-10-21**: every page of the original ported, `verify.mjs` 153 checks | The last phase; with it the port is complete |
| ~~**`readOnly` on the inputs** (BlazorHero B48)~~ **done 2026-10-21**: every 1.0 input of both skins (the native readonly, else `aria-readonly` and a value that holds) | MudBlazor's and Fluent UI Blazor's `ReadOnly`; `disabled` was the only way, which greys a value out |
| ~~**AppLayout follows the breakpoint** (BlazorHero B52)~~ **done 2026-10-21**: narrower past 960px closes the column, wider opens it | MudBlazor's responsive drawer; a column closed on a narrow window stayed closed |

### For the owner to decide

| Item | The question |
|---|---|
| ~~**X4**~~ | **Decided 2026-10-15:** E12's types before 1.0, the mapping on by default (see above) |
| **The skins' own repository at 1.0** | Lockstep (one version for every package) and the skins' own versions after the move: when do they move? |
| ~~**The rc on npm**~~ | **Decided 2026-10-15:** release candidates only in the local registry; npm gets 1.0.0 first |
| **The first public commit** | Which files it carries (no handoffs or internal notes; THIRD-PARTY-NOTICES.md) |
| **A `Decimal` field in the skins** (BlazorHero B42) | `NumberInput` is number-only: a generic `NumberInput<TValue>` (`FluentNumberField<TValue>`, `MudNumericField<T>`) or a `DecimalInput`? A generic one changes an existing component's type |
| **A typed `Select`** (B43) | `Select` binds a string: a `Select<TValue>` with typed options (`FluentSelect<TOption>`, `MudSelect<T>`) — the same question of an existing component's type |
| **DataGrid detail rows** (B44) | MudTable's `ChildRowContent`, MudDataGrid's `HierarchyColumn`: the API, with virtualization and grouping |
| **A DateRangePicker** (B45) | MudDateRangePicker; the Calendar already selects a range |
| **`@bind` by the declared type** (B46) | A `Decimal \| null` (or `number \| null`) that starts as null binds the text: the compiler knows the declared type and could hand the converter over — a behavior change of K.7/K.8's documented rule |
| ~~**Cleanup**~~ | **Done 2026-10-15:** `apps/fluentcms-admin` deleted (`apps/fluentcms` replaced it); the fullstackhero containers, their images and volumes removed (owner) |

### After 1.0 (additive)

Type checks and tooling: the event argument's type against the event (K.9), the LSP's squiggle after a
`satisfies` (K.10), `tsazor check` excludes (H.4), `@ref` typing (H.6/P.7), `RenderFragment` in the auto-imports
(P.6), a self-import hint (R.9), fullstackhero F19, a `FileSystemHost` (G.2), the recovery after a mid-line
`@page` (two follow-up errors). Library: TreeView children on demand and as a dropdown, a virtual option list, the
DataGrid's density and sticky header, `NumberInput`'s `immediate`, localized icon variants. Runtime: async Standard
Schema on submit, NavLink prefetch, H3, the whitespace question (D-S2). `@tsazor/dotnet`: remote `$ref`s and the
schemas it degrades (documented as limits). Hygiene: the tutorial's test-file type errors, assertion-free guards in
two tests, the dev server's stale `dist` on Windows, `TS private` → `#private` (≤ 0.7 KB). Tutorial: "What's different
from Blazor" and a codemod chapter on the Blazor track; files in the lesson editor. Measured effort figures for E7.

### Release steps (design-release.md)

1. The items above; the proposals that change behavior decided before the release candidate.
2. `1.0.0-next.N` (`pnpm release:version`, `pnpm release:local`); the owner's apps run on it; then `1.0.0-rc.N` — in the
   local registry only (owner 2026-10-15): npm's first publish, which also sets `latest`, is 1.0.0.
3. The full CI by hand (check, e2e, engines), then `main`.
4. The curated first commit to `tsazor/tsazor`, the repository public; its settings: private vulnerability reporting,
   Pages (`PAGES_ENABLED`), `RELEASE_ENABLED`, the `npm` environment, a short-lived `NPM_TOKEN`.
5. `release.yml`: provenance and the SBOM; then a Trusted Publisher per package, and the token deleted.
6. 1.0.0. The VS Code extension's marketplace publishing is not described yet.
