# Roadmap — Tsazor 1.0

Status (2026-10-04): **steps 1 and 2 of the order below are done** — the tutorial's three parts
(M4 without the static deploy, whose target is still to decide), S3, S5, R1 CI and the S1 API
snapshot; E8 and E11 done; decisions D1–D4 and X1–X4 taken. Next: step 3.
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
the static build and deploy target open.

## 2 — Svelte-style features ([design-svelte-features.md](design-svelte-features.md))

F1a static markup frames (a Razor parity gap; **done 2026-10-04**, [design-static-markup.md](design-static-markup.md)) · F1b update hints · F2 `@attach` · F3 `<Await>` ·
F4 `@transition`/`@in`/`@out` · F5 `@animate` · F6 `@State`. Decided 2026-10-02: the `@` namespace is
reserved (D1), `@attach` (D2), the Svelte transition set (D3), `@State` in v1 (D4). Each feature
gets its tutorial chapter.

## 3 — Sleipnir integration ([roadmap-sleipnir.md](roadmap-sleipnir.md))

Track U upstream (U1–U4) and track T `@tsazor/sleipnir` (T1–T7). Its open decisions (where the
upstream work happens, where the emitter lives) need answers first.

## 4 — Stability promise and onboarding

- **S1 — API contract:** a snapshot of the public `.d.ts` surface of every package, checked in CI.
  A diff fails the build unless the snapshot is updated deliberately (with a changelog entry).
  **Done (2026-10-04):** `scripts/api-snapshot.mjs` → `api/<package>.api.d.ts`, `pnpm api:check` in
  CI, `pnpm api:update` + `CHANGELOG.md` for deliberate changes.
- **S2 — Strict only:** `getting-started`, templates and `npm create tsazor` use `strict: true`.
  `tsazor check` documents strict as the supported configuration.
- **S3 — Never block development:** verify, and pin in tests, that the dev server and HMR keep
  running with TS type errors (shown as an overlay or console output, not as a failed module).
  Production builds keep failing on errors. **Done (2026-10-04):** the transform never type-checks
  (pinned); with `check: true` the dev server runs the check in the background and prints the
  findings (`dev-check.ts`); the build fails on them.
- **S4 — Quick fix for missing types:** TS7006 (implicit `any`) in `.tsazor` files gets
  "infer parameter types from usage" in the LSP. Plain-language hints for the most common TS
  errors in `.tsazor` files.
- **S5 — Reserved-name diagnostic:** a component member that shadows a `ComponentBase` member
  (`observe`, `dispose`, `stateHasChanged`, …) gets a Tsazor diagnostic instead of a cryptic
  TS2416 (port-findings M.1). **Done (2026-10-04):** `TZS031`, the list checked against the
  runtime by a test.
- **S6 — Tutorial:** the TS track's "Typed checks" lesson carries the message "types keep your app
  stable, and inference does most of the work".

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
  vulnerability disclosure process. Zero runtime dependencies stays a policy.

**Architecture**
- **E4 — Architecture guide** (`docs/patterns.md`): layers, services via DI, feature folders, when
  to move to code-behind, presentational vs container components, testability with
  `@tsazor/testing`.
- **E5 — Lazy loading per feature or route** (router + vite plugin). **Decided (2026-10-05):** [design-lazy-routes.md](design-lazy-routes.md) —
  Blazor's `OnNavigateAsync`/`<Navigating>` first, then lazy manifest entries, opt-in per glob
  (`lazyRoutes`), one chunk per page, the layout loads with the page, a failed chunk reloads once. **Done
  (2026-10-05):** runtime (`OnNavigateAsync`/`Navigating`, `LazyRouteEntry`), vite plugin (`lazyRoutes`),
  the gallery's dashboard as the lazy feature (a build test checks its chunks).

**Migration**
- **E6 — Incremental migration:** run Blazor and Tsazor side by side, route by route (YARP in
  front of both, a shared auth cookie), with a reference setup and docs. **Decided (2026-10-05):** the
  reference setup shows a **Blazor Server** app (the common and harder case; it also shows the API
  boundary of E7).
- **E7 — Migration guide:** the codemod workflow, what is automatic and what is manual, effort
  figures from the FluentCMS-admin port. It has a dedicated step for **Blazor Server**: there,
  components call services and the database in-process, so there was never an API boundary. Before
  such an app can become a SPA, that boundary has to be drawn. The guide covers exposing the
  existing services as an API, either with OpenAPI controllers (`@tsazor/dotnet`) or, as an option,
  with Sleipnir commands. Blazor WebAssembly apps usually have the boundary already. **Decided
  (2026-10-05):** the effort figures may come from the local FluentCMS-admin port, as aggregated,
  generic numbers only (no code).
- **E7b — Coexistence guide:** not every team migrates. A common target is a Blazor app (e.g. an
  admin/backoffice) that stays, plus a public Tsazor frontend on the same .NET backend, which
  replaces e.g. a Svelte or React frontend chosen only because Blazor didn't fit. The guide
  covers sharing DTOs (one OpenAPI contract for both), auth (a shared cookie domain), CSS/design
  tokens, and how the same architecture vocabulary (components, DI, EditForm, validation) carries
  over.

**Operations**
- **E8 — Localization and culture** (done 2026-10-02, `475cec3`; open: the tutorial lesson,
  `Decimal` with `@bind:culture`): an `IStringLocalizer` counterpart, `CultureInfo` over `Intl`,
  `@bind:culture`, culture-aware formatting for display and input. Revisit the invariant-only policy
  (A5/B7): keep it for routing and data values, replace it for display and input.
- **E9 — Accessibility:** audit `@tsazor/components` and `@tsazor/fluent` against WCAG 2.2 AA (EU
  Accessibility Act / BFSG since June 2025), and add automated a11y checks to the E2E gates.
  **Decided (2026-10-04), staged:** now axe-core in the E2E gates (gallery: every `@tsazor/fluent`
  component; demo: `@tsazor/components`) plus keyboard/focus tests for the interactive components
  (dialog, tabs, select); the manual screen-reader audit is its own item before the 1.0 release.
  **Automated part done (2026-10-04):** `apps/gallery/scripts/verify-a11y.mjs` (axe on all 14 routes
  in light and dark, the open dialog, dialog and tabs keyboard behavior) and
  `apps/demo/scripts/verify-a11y.mjs` (axe on all 15 routes), both in CI. Fixed on the way: dark-theme
  fills behind white text (`--fui-brand-background*`, `--fui-color-*-filled`), the light subtle brand
  badge, the dialog's Shift+Tab trap, `Progress` without a name (`ariaLabel`), `Badge` text on
  warning (`text-bg-*`), `ListGroupItem` (an `<a>` in the `<ul>`, a clickable `<li>` the keyboard
  couldn't reach), and the demo's own labels and colors. **Open — `@tsazor/components` keyboard
  patterns** (the Bootstrap POC set; to be done with the planned component-library work): `Modal`
  (role dialog, aria-modal/labelledby, Escape, focus trap and restore), `Dropdown` (arrow keys,
  Escape, focus return), `Tabs` (roving tabindex, arrow keys, tab–panel ids).
- **E12 — Feel-at-home packages** ([design-extensions-primitives.md](design-extensions-primitives.md)):
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
- **E10 — Support policy:** LTS window and deprecation rules, extending the stability promise.

## 6 — Release infrastructure

- **R1 — CI** (GitHub Actions): build before test, all package and app tests, tarball smoke
  gate, E2E gates (tutorial, pizza, gallery, sleipnir-ticker in synthetic mode), API snapshot (S1).
  **Done (2026-10-04):** `.github/workflows/ci.yml` — job `check` (ubuntu: build, all tests, API
  snapshot, tarball smoke) and job `e2e` (windows: the four verify scripts in Edge, ticker via
  `dotnet`). It found two Linux-only bugs on its first runs (the `tsazor` bin link on a fresh
  checkout, the scope hash of backslash paths), both fixed.
- **R2 — npm publishing:** versioning, changelog, provenance, and the publish workflow.
- **R3 — `npm create tsazor`:** project starter (strict, Vite, `_Imports.tsazor`, a sample
  component and test, optional `@tsazor/dotnet`).
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
  README/roadmap still say 20.4) and benchmarks before claiming anything publicly.

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
5. Sleipnir integration; the remaining Svelte-style features with their chapters.
6. S2, S4, E3, E10, R2, R3, R4, R5 → 1.0 release candidate.
