# Roadmap — English docs + interactive tutorial

Status: **D, M1, M2, M3 and the C# chapter done** (2026-10-02; M1–M3 merged into
`roadmap/phase-0`, the Blazor-track chapter "TypeScript for C# developers" on
`tutorial/csharp-to-ts`); M4 next. Runs before [roadmap-sleipnir.md](roadmap-sleipnir.md).

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
   Derived values (getters) · Async work · External data (`this.observe`, `disposeSignal`) ·
   Lifecycle (`onInitialized`, `onParametersSet`,
   `onAfterRender`, `dispose`)
3. *Parameters*: Declaring parameters · Defaults · Typed checks (`tsazor check`) · Attribute splatting
4. *Logic*: `@if`/`else` · `@foreach` · `@key` · Loading data (the async pattern)
5. *Events*: DOM events · Lambdas and arguments · `preventDefault`/`stopPropagation` ·
   Component events (`EventCallback`)
6. *Bindings*: Text · Numbers · Checkbox · Select · `@bind:event`/`@bind:after` · `@bind:format` ·
   Component bindings (`@Bindable`, the `Value`/`ValueChanged` pair)
7. *Classes & styles*: Class expressions · Inline styles · `::deep`

**Part 2 — Advanced**
8. *Reusing content*: `ChildContent` · Named fragments · Templated components with context
9. *Cascading values*
10. *Services*: `@inject`, lifetimes
11. *Element references*: `@ref`
12. *Special components*: `ErrorBoundary` · `DynamicComponent` · `PageTitle`/`HeadContent` · Sections
13. *Organizing code*: Code-behind · `_Imports.tsazor` · `@import`
- *Planned, once the features land* ([design-svelte-features.md](design-svelte-features.md)):
  *Attachments* (`@attach`) · *Transitions* · *Animations* (`@animate`) · an `<Await>` lesson

**Part 3 — Applications**
14. *Routing*: `@page` · Route parameters & constraints · `NavLink` · Navigation · Query parameters ·
    Not found
15. *Forms*: `EditForm` · Inputs · Validation decorators · `DataAnnotationsValidator` · `InputFile`
16. *Auth*: `AuthorizeView` · `@authorize` · `AuthenticationStateProvider`
17. *Talking to a backend*: `@tsazor/dotnet` (mocked fetch in the preview)
18. *Testing*: `@tsazor/testing`
19. *Next steps*

**Track extras** — Blazor: **"TypeScript for C# developers"** (a short chapter before chapter 1
in the Blazor track ✅; see below), "What's different from Blazor"
(documented deviations), "Migrating `.razor` files (codemod)". TypeScript: none planned yet.

**"TypeScript for C# developers"** (Blazor track only): the primary audience keeps its .NET
backend and leaves only Blazor. They should feel they are staying in something familiar. The
chapter is a side-by-side ("in C# you write…, in TypeScript…"): types and nullability (`null` vs
`undefined`), `Task` ↔ `Promise` and `async`/`await` (nearly identical), LINQ ↔
`map`/`filter`/`reduce`, classes/interfaces/generics, properties ↔ getters/setters, attributes ↔
decorators, namespaces ↔ modules, plus the real traps (`this` in callbacks, `==` vs `===`). The
message: "you already know most of this". A companion cheat sheet lives at
`docs/csharp-to-typescript.md`.

### Milestones

1. **M1** — engine + the 7 lessons of chapter 1 in both tracks → **review with the user** (tone,
   UX, lesson length) before writing more content. ✅ (user: "exactly the look and feel of the
   Svelte tutorial")
2. **M2** — rest of Part 1 ✅: chapters 2–7, 27 lessons in both tracks (34 in Part 1). The
   TypeScript track is written as the primary one (TS-native motivation: plain fields as
   state, getters, decorators, narrowing, `tsazor check`); the Blazor track as "you know
   this, here's what differs". Engine: in-browser `tsazor check` (type diagnostics in the
   problems panel and as squiggles, two-phase worker answer, lesson gate type-checks every
   `app-a`/`app-b`), control-block bodies highlighted as code, interaction steps in the
   gate (`gate:` front-matter), table styles. Framework fixes found by the lessons
   (port-findings J): `ComponentBase` state as `#private`, `EventCallback` lambdas returning
   values, `@attributes` with no captured values, `@bind` on range and date inputs, empty
   number input. Claims pinned in `test/claims-part1.test.ts`; E2E smoke check per chapter.
3. **M3** — Part 2 ✅: chapters 8–13, 17 lessons in both tracks (51 in total): Child
   content · Named fragments · Templated components (incl. the `@if`-narrowing caveat for
   deferred content, H.3) · Passing values down · Names and types · Injecting services ·
   Lifetimes · Element references (`disposeSignal` for listeners) · Component references ·
   Error boundaries · Dynamic components · Page title and head · Sections · Code-behind ·
   Shared imports · Logic in modules · Containers and views (the last three: patterns against
   logic-heavy templates). Engine: `Program.ts` as the app's start (services in the
   preview), the preview's document title shown as a tab in its bar, `.tsazor` imports from
   `.ts` and the LSP's `TItem` inference in the in-browser type check, `_Imports.tsazor`
   diagnosed, gate runs like the preview (head outlet, `Program.ts`), `refactor: true`
   lessons must render identically. Framework fixes (port-findings N): `@ref` on a
   component cut off its child content, `EventCallback` type-only import, argument-less
   `EventCallback.invokeAsync()`, TS2869 on mixed attribute values. Claims pinned in
   `test/claims-part2.test.ts`; E2E smoke check per chapter (8–13). The planned Svelte-style
   chapters (attachments, transitions, animations, `<Await>`) wait for their features.
4. **C# chapter** ✅ (after M3): "TypeScript for C# developers", 9 Blazor-only lessons before
   chapter 1 (`content/01-basics/00-typescript-for-csharp`), each a `.ts` module with its output in
   the preview: Types and nullability (`null`/`undefined`, `??` vs `||`, narrowing) · Tasks and
   promises (`Promise.all`) · LINQ and array methods (`toSorted`, no deferred execution) · Classes,
   interfaces, generics (structural typing) · Properties and access (getters/setters, `#private`) ·
   Attributes and decorators (a `@logged` method decorator) · Namespaces and modules · Records,
   enums and unions (string-literal unions, exhaustive `switch`) · The real traps (`this` in
   callbacks, double arithmetic and money, `==`, `Date`). Companion cheat sheet
   [csharp-to-typescript.md](csharp-to-typescript.md) (linked from README, getting-started and the
   chapter). Engine: the in-browser type check uses the ES2023 lib (`toSorted`); the track switch
   from a track-only lesson goes to the other track's next lesson (`TutorialState.counterpart`)
   instead of a dead link. Claims pinned in `test/claims-csharp.test.ts`; the lesson gate allows
   exactly this chapter to be Blazor-only; E2E smoke checks (menu, track switch, lessons in the
   preview, TS2683 in the problems panel).
5. **M4** — Part 3, static build, deploy target decided.

Open for M4: routing lessons need an in-memory history in the `srcdoc` preview
(port-findings H.7 — `NavigationManager` takes a `historyApi`; the preview's
`createTsazorApp` would pass an in-memory one, and the preview bar could show the URL next
to the title tab); creating/deleting files in the editor (lessons ship empty placeholder
files instead, O); `RenderFragment<T>` as a generic runtime type and `RenderFragment` in the
auto-imports (P.5, P.6); `createTsazorApp().dispose()` should dispose the service provider
(P.10). Still open from M2: `@bind:format` on text inputs (K.7), handler-type checks against
the event name (K.9), the TS1360 squiggle fix in the LSP (K.10), a `FileSystemHost` so the
tutorial stops duplicating resolution, shadow building and now `TItem` inference (G.2, L, O).
