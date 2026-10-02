# Roadmap — English docs + interactive tutorial

Status: **D and M1 done** (2026-10-02, merged into `roadmap/phase-0`); M2 in progress. Runs before [roadmap-sleipnir.md](roadmap-sleipnir.md).

## Decisions (2026-10-02)

- **Interactive, Svelte-style** ([reference](https://svelte.dev/tutorial/svelte/welcome-to-svelte)):
  lesson text on the left, editor + live preview on the right, compiler running in the browser,
  "Solve"/"Reset" per lesson. The tutorial app itself is **built in Tsazor** (dogfooding — gaps go
  to `docs/port-findings.md`).
- **Two tracks, shared exercises, separate prose**: same lesson skeleton and the same code
  exercises; text written per track. *Blazor track*: "you know this as …", explicit deviations.
  *TypeScript track*: from zero, no Razor/C#/.NET references at all. Track-specific extra lessons
  are allowed.
- **English user docs**: README, getting-started, language-reference, architecture,
  design-principles, code-behind, scoped-css, fluent, debugging, language-server, package READMEs.
  Internal working docs (roadmap*, handoffs, reviews, port-findings, design-2.4) stay German.

## D — English documentation

Translate (rewrite where German prose is awkward in English, not word-by-word) the user docs
above; keep anchors stable where other docs link to them; same commit updates cross-links.
Gate: no German left in the listed files, all relative links resolve.

## T — Tutorial app (`apps/tutorial`)

### Engine

- **Content layout** (Svelte-repo style):
  `content/<part>/<chapter>/<lesson>/{blazor.md, ts.md, app-a/…, app-b/…}` — `app-a` start state,
  `app-b` solution (only changed files). Shared `content/<part>/common/` base files.
  Front-matter: `title`, `focus` (file opened first). Track-only lessons have only one `.md`.
- **In-browser pipeline**: `@tsazor/compiler` → `typescript.transpileModule` → ES module blob URLs;
  preview in a sandboxed `<iframe>` with an import map for `@tsazor/runtime`/`@tsazor/components`
  (prebuilt bundles), scoped CSS injected, sourcemapped errors + compiler diagnostics shown inline.
  Compile in a Web Worker so typing stays responsive.
- **Editor**: CodeMirror 6, `.tsazor` mode (Razor markup + embedded TS), file tabs.
- **Shell**: track switch (persisted), chapter navigation, Solve/Reset, prev/next, deep links
  `/<track>/<lesson-slug>`; mobile layout stacks text / editor / preview.
- **Gate**: a test compiles and renders every lesson's `app-a` and `app-b` headlessly (no
  diagnostics in `app-b`; `app-a` may fail only where the lesson says so).

### Curriculum (shared exercises)

**Part 1 — Basics**
1. *Introduction*: Welcome · Your first component · Expressions in markup · Dynamic attributes ·
   Styling (scoped CSS) · Nested components · Raw HTML (`MarkupString`)
2. *State & rendering*: Fields are state · When a component re-renders (`stateHasChanged`) ·
   Derived values (getters) · Async work · Lifecycle (`onInitialized`, `onParametersSet`,
   `onAfterRender`, `dispose`)
3. *Parameters*: Declaring parameters · Defaults · Typed checks (`tsazor check`) · Attribute splatting
4. *Logic*: `@if`/`else` · `@foreach` · `@key` · Loading data (the async pattern)
5. *Events*: DOM events · Lambdas and arguments · `preventDefault`/`stopPropagation` ·
   Component events (`EventCallback`)
6. *Bindings*: Text · Numbers · Checkbox · Select · `@bind:event`/`@bind:after` · `@bind:format` ·
   Component bindings (`Value`/`ValueChanged`)
7. *Classes & styles*: Class expressions · Inline styles · `::deep`

**Part 2 — Advanced**
8. *Reusing content*: `ChildContent` · Named fragments · Templated components with context
9. *Cascading values*
10. *Services*: `@inject`, lifetimes
11. *Element references*: `@ref`
12. *Special components*: `ErrorBoundary` · `DynamicComponent` · `PageTitle`/`HeadContent` · Sections
13. *Organizing code*: Code-behind · `_Imports.tsazor` · `@import`

**Part 3 — Applications**
14. *Routing*: `@page` · Route parameters & constraints · `NavLink` · Navigation · Query parameters ·
    Not found
15. *Forms*: `EditForm` · Inputs · Validation decorators · `DataAnnotationsValidator` · `InputFile`
16. *Auth*: `AuthorizeView` · `@authorize` · `AuthenticationStateProvider`
17. *Talking to a backend*: `@tsazor/dotnet` (mocked fetch in the preview)
18. *Testing*: `@tsazor/testing`
19. *Next steps*

**Track extras** — Blazor: "What's different from Blazor" (documented deviations), "Migrating
`.razor` files (codemod)". TypeScript: none planned yet.

### Milestones

1. **M1** — engine + the 7 lessons of chapter 1 in both tracks → **review with the user** (tone,
   UX, lesson length) before writing more content.
2. **M2** — rest of Part 1 · **M3** — Part 2 · **M4** — Part 3, static build, deploy target decided.
