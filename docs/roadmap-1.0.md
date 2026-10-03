# Roadmap — Tsazor 1.0

Status (2026-10-03): **step 1 of the order below** — tutorial M1–M3 done, M4 half done
(Routing, Forms); E8 and E11 done; decisions D1–D4 and X1–X4 taken; no CI yet (R1).
The overview for version 1. Detailed plans live in the linked roadmaps and design docs.

**Goal of 1.0:** a single-page-app framework with **Blazor parity** (markup and semantics),
superset-only Tsazor extensions, strict TypeScript, and the stability promise
([design-principles.md](design-principles.md): "Parity first, then scale", "Type safety is a
requirement"). Post-1.0: SSR ([roadmap-ssr.md](roadmap-ssr.md)), fine-grained reactivity.

Done before this roadmap: review roadmap phases 0–5 ([roadmap.md](roadmap.md)), English user
docs, `@Bindable`/`observe`/`disposeSignal` ([design-bindable-observe.md](design-bindable-observe.md)).

## 1 — Tutorial ([roadmap-tutorial.md](roadmap-tutorial.md))

M1 and M2 (Part 1) done · M3 (Part 2) done · M4 (Part 3, static deploy) in progress: Routing and
Forms done; Auth, Talking to a backend, Testing, Next steps open.

## 2 — Svelte-style features ([design-svelte-features.md](design-svelte-features.md))

F1a static markup frames (a Razor parity gap) · F1b update hints · F2 `@attach` · F3 `<Await>` ·
F4 `@transition`/`@in`/`@out` · F5 `@animate` · F6 `@State`. Decided 2026-10-02: the `@` namespace is
reserved (D1), `@attach` (D2), the Svelte transition set (D3), `@State` in v1 (D4). Each feature
gets its tutorial chapter.

## 3 — Sleipnir integration ([roadmap-sleipnir.md](roadmap-sleipnir.md))

Track U upstream (U1–U4) and track T `@tsazor/sleipnir` (T1–T7). Its open decisions (where the
upstream work happens, where the emitter lives) need answers first.

## 4 — Stability promise and onboarding

- **S1 — API contract:** a snapshot of the public `.d.ts` surface of every package, checked in CI.
  A diff fails the build unless the snapshot is updated deliberately (with a changelog entry).
- **S2 — Strict only:** `getting-started`, templates and `npm create tsazor` use `strict: true`.
  `tsazor check` documents strict as the supported configuration.
- **S3 — Never block development:** verify, and pin in tests, that the dev server and HMR keep
  running with TS type errors (shown as an overlay or console output, not as a failed module).
  Production builds keep failing on errors.
- **S4 — Quick fix for missing types:** TS7006 (implicit `any`) in `.tsazor` files gets
  "infer parameter types from usage" in the LSP. Plain-language hints for the most common TS
  errors in `.tsazor` files.
- **S5 — Reserved-name diagnostic:** a component member that shadows a `ComponentBase` member
  (`observe`, `dispose`, `stateHasChanged`, …) gets a Tsazor diagnostic instead of a cryptic
  TS2416 (port-findings M.1).
- **S6 — Tutorial:** the TS track's "Typed checks" lesson carries the message "types keep your app
  stable, and inference does most of the work".

## 5 — Enterprise readiness

Target audience: business developers and companies migrating (Blazor/.NET shops first). Clean
architecture and security take priority.

**Security**
- **E1 — CSP and Trusted Types:** document and CI-test that apps run under a strict CSP. Verified
  2026-10-02: there is no `eval`/`new Function` in runtime or components, and `innerHTML` is used
  only for `MarkupString`. `MarkupString` gets a Trusted Types integration.
- **E2 — Auth guidance:** the BFF pattern with an HttpOnly cookie (`CookieAuthenticationStateProvider`)
  is the documented default, with an ASP.NET BFF template. JWT in the browser only with a stated
  reason. Fix `@tsazor/dotnet` comments that suggest storing tokens in `localStorage`
  (`packages/dotnet/src/auth.ts`). State clearly that `AuthorizeView`/`@authorize` are UI only;
  enforcement happens on the server.
- **E3 — Supply chain:** npm provenance, SBOM, signed releases, and a `SECURITY.md` with a
  vulnerability disclosure process. Zero runtime dependencies stays a policy.

**Architecture**
- **E4 — Architecture guide** (`docs/patterns.md`): layers, services via DI, feature folders, when
  to move to code-behind, presentational vs container components, testability with
  `@tsazor/testing`.
- **E5 — Lazy loading per feature or route** (router + vite plugin).

**Migration**
- **E6 — Incremental migration:** run Blazor and Tsazor side by side, route by route (YARP in
  front of both, a shared auth cookie), with a reference setup and docs.
- **E7 — Migration guide:** the codemod workflow, what is automatic and what is manual, effort
  figures from the FluentCMS-admin port. It has a dedicated step for **Blazor Server**: there,
  components call services and the database in-process, so there was never an API boundary. Before
  such an app can become a SPA, that boundary has to be drawn. The guide covers exposing the
  existing services as an API, either with OpenAPI controllers (`@tsazor/dotnet`) or, as an option,
  with Sleipnir commands. Blazor WebAssembly apps usually have the boundary already.
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
- **R2 — npm publishing:** versioning, changelog, provenance, and the publish workflow.
- **R3 — `npm create tsazor`:** project starter (strict, Vite, `_Imports.tsazor`, a sample
  component and test, optional `@tsazor/dotnet`).
- **R4 — Docs site:** the tutorial plus user docs, statically deployed.
- **R5 — Numbers:** a current bundle-size figure (25.28 KB gz on the bench as of 2026-10-02;
  README/roadmap still say 20.4) and benchmarks before claiming anything publicly.

## Order (proposal)

1. Tutorial M3 → M4, in parallel with S3 and S5 (small, they protect the tutorial experience).
2. R1 CI + S1 API snapshot (needed before anything is published).
3. Enterprise must-haves: E8 localization/culture, E9 accessibility, E2 auth guidance, E1 CSP,
   F1a static markup (a parity gap).
4. E4–E7 architecture and migration (incremental migration E6 is the main sales argument).
5. Sleipnir integration; the remaining Svelte-style features with their chapters.
6. S2, S4, E3, E10, R2, R3, R4, R5 → 1.0 release candidate.
