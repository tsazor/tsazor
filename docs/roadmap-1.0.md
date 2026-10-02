# Roadmap — Tsazor 1.0

Status: **planning** (2026-10-02). The overview for version 1. Detailed plans live in the
linked roadmaps and design docs.

**Goal of 1.0:** a single-page-app framework with **Blazor parity** (markup and semantics),
superset-only Tsazor extensions, strict TypeScript, and the stability promise
([design-principles.md](design-principles.md): "Parity first, then scale", "Type safety is a
requirement"). Post-1.0: SSR ([roadmap-ssr.md](roadmap-ssr.md)), fine-grained reactivity.

Done before this roadmap: review roadmap phases 0–5 ([roadmap.md](roadmap.md)), English user
docs, `@Bindable`/`observe`/`disposeSignal` ([design-bindable-observe.md](design-bindable-observe.md)).

## 1 — Tutorial ([roadmap-tutorial.md](roadmap-tutorial.md))

M1 and M2 (Part 1) done · M3 (Part 2) in progress · M4 (Part 3, static deploy).

## 2 — Svelte-style features ([design-svelte-features.md](design-svelte-features.md))

F1a static markup frames (a Razor parity gap) · F1b update hints · F2 `@attach` · F3 `<Await>` ·
F4 `@transition`/`@in`/`@out` · F5 `@animate`. Open decisions D1–D4; F6 `@State` deferred. Each
feature gets its tutorial chapter.

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

## 5 — Release infrastructure

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
2. F1a static markup (parity), then the remaining Svelte-style features with their chapters.
3. R1 CI + S1 API snapshot (needed before anything is published).
4. Sleipnir integration.
5. S2, S4, R2, R3, R4, R5 → 1.0 release candidate.
