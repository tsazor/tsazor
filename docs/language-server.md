# Language server (`@tsazor/lsp`)

A stdio language server for `.tsazor` files that ships with the VS Code extension
(`packages/vscode`). One server process per workspace; launched as
`node dist/server.js --stdio`.

## Capabilities

| Capability | What it does |
|---|---|
| Diagnostics | Compiler diagnostics as you type, published on open and every edit (error + warning, TZS codes, `source: "tsazor"`). |
| Hover | Component tags (resolved source, or "not resolvable → TZS005"), directives (`@page`, `@inject` with the resolved type module), not inside `@code`. |
| Go-to-definition | Component tags → the `.tsazor` file resolved through `@using`; `@inject` types → local `.ts`/`.tsazor` modules. Built-ins resolve into `@tsazor/runtime`, so they produce nothing (the package is not a file). |
| Completion | See below. |

## Completion

Trigger characters: `<`, `@`, space. Four contexts, classified per keystroke
from the cursor position:

| Context | Example | Candidates |
|---|---|---|
| Tag name | `<Gr` → `Greeter` | Components in `@using`-resolvable directories (directory scan) + runtime built-ins (`RUNTIME_COMPONENTS`). |
| Attribute name | `<Greeter ` | The resolved component's parameters from the 2.1 metadata (own, code-behind and inherited; cascading parameters excluded), `@bind-<param>` where `<param>Changed` is an `EventCallback`, directive attributes (`@bind`, `@onclick`, `@onchange`, `@oninput`, `@ref`, `@key`, `@attributes`); plain elements get a small HTML list (`class`, `style`, `id`, `href`, `type`, `value`, `data-testid`). |
| Directive | `@p` | Directive keywords with snippets (`@page "/route"`, `@code { … }`, `@if`, `@for`, `@foreach`, `@switch`, …). |
| Expression | `Count: @co` | Members of the component's own `@code` state, the code-behind sidecar (`X.tsazor.ts`), and `@inject` fields. |

Directives and members are offered **together** when a line starts with `@word`
(such a line could be either) — the editor filters by the remaining prefix.

### How positions are classified

The compiler AST has no per-attribute name/value spans, so completion
classifies the cursor from the **raw source slice** of the deepest containing
AST node (`nodeAt`, 0-based LSP positions over the compiler's 1-based lines):

- Cursor in an opening tag → `classifySlice(slice)` scans the tag name (stops
  at whitespace or unquoted `>`), then walks the attribute region with a
  quote-state scanner: unterminated quote or trailing quoted value / `=…` →
  *value* (no candidates); last non-space token → *attribute name* prefix.
- Cursor past the opening `>` → the element's **content**: freshly typed
  `<tag` → tag candidates; `@…` → directives (line start) or members (mid-line).
- Cursor inside `@code` → nothing (that region is TypeScript; a future
  integration with a TS server could complete there).

### Parameter and member sources

- **Component parameters** come from the parameter metadata (roadmap 2.1,
  [architecture.md](architecture.md#parameter-metadaten-21)):
  `context.resolveComponentMetadata(tag, usings, imports)` resolves the tag
  exactly like the build (`@import` binding, enclosing folders, `@using`
  sources, runtime built-ins, packages) and returns every parameter the
  component accepts — `@code`, the code-behind class and the whole base chain
  (`@inherits LayoutComponentBase`, `extends InputBase<string>` with
  substituted type arguments). Runtime built-ins come from the embedded
  runtime manifest, package components from their `dist/tsazor-components.json`.
  The item detail shows `Tag · category · type`, the doc is the member's JSDoc.
  Cascading parameters are not offered (Blazor rejects them as attributes);
  `@bind-X` is offered only when an `XChanged` parameter of category
  `EventCallback`/`EventCallback<T>` exists. The metadata cache is shared and
  stamped per file, so edits of another component, its code-behind or a base
  show up on the next completion without a restart.
- **Expression members (v1 heuristic):** line-based regexes over member code (getter /
  `@Parameter()`-decorated field / method / field), matched in order per line.
  This is intentionally best effort — no TypeScript type analysis yet — so
  rename tracking, inherited members beyond the direct sidecar, and
  discriminated property types are not offered.

### Architecture

| File | Role |
|---|---|
| `packages/lsp/src/analysis.ts` | Pure core: parse + compile per document, diagnostics, `nodeAt`, hover, definition; caches per `uri`/`version` in the server. |
| `packages/lsp/src/completions.ts` | `completeAt()` — context classification + candidate generation (no state). |
| `packages/lsp/src/server.ts` | stdio plumbing: `vscode-languageserver/node`, document sync, diagnostics publishing, handler registration. |
| `packages/lsp/src/shadow-module.ts` | Shadow pipeline (mirror of the vite plugin) + the two component-import rewrites; `compile-throw → null` drives the v1 fallback. |
| `packages/lsp/src/ts-mapping.ts` | `TsazorGenMap` — dependency-free position translation over the compiler's raw mappings. |
| `packages/lsp/src/ts-service.ts` | `TsazorTypeService` — the per-workspace `ts.LanguageService` host, shadow registry (mtime/`on-demand` cache), variant-shadow builder. |
| `packages/lsp/src/ts-features.ts` | Routing + translation: `classifyCodeContext`, completions/hover/definition/diagnostics back into `.tsazor` coordinates. |
| `packages/vscode/scripts/smoke-completion.mjs` | Programmatic smoke over the bundled `dist/server.js`: initialize → didOpen → completion requests (byte-buffered Content-Length framing). |
| `packages/vscode/scripts/smoke-ts.mjs` | Same framing, but exercising the v2 engine end-to-end: completion behind `@this.ticker.`, hover as `PricePoint[]`, definition into `TickerStore.ts`, mapped TS2322. |

## v2 — real TypeScript type knowledge

v1's expression completion is regex-heuristic: it reads member *declarations*
of `@code` and the code-behind sidecar as text. It cannot follow chains
(`@ticker.points.length`), inheritance, or imported types — v2 closes that
with a real `ts.LanguageService` (volar-style "shadow modules"):

- **One shadow module per `.tsazor`** (`<dir>/<Name>.tsazor.gen.ts`, virtual):
  the real `compile()` pipeline mirrored from the vite plugin — import
  collection, `_Imports`, code-behind sidecar import — plus two rewrites:
  component `.tsazor` imports resolve to their own shadows (typed across
  files), bare-package components (`@tsazor/components`, whose `dist` d.ts is
  deliberately `any`) resolve to the package's shipped `src/*.tsazor` source.
- **One `ts.LanguageService` per workspace**, custom host: virtual shadow
  paths are served from memory, everything else (sidecars, project TS,
  `node_modules` d.ts) read from disk. Compiler options come from the
  project's `tsconfig.json` with non-negotiable overrides
  (Standard-Decorators — `experimentalDecorators: false` —, `useDefineForClassFields: true`,
  `moduleResolution: bundler`, `skipLibCheck`, ES2022 + DOM libs).
- **Position mapping**: `TsazorGenMap` over the compiler's raw per-statement
  mappings (genLine 1-based → 0-based on entry, `srcCol` verbatim in `@code`,
  token-precise entries inside expressions). Unmappable → `null` → v1.
- **Completions in expressions** use two paths: the generated text already
  *bakes* `this.<chain>` (direct mapping answers `@ticker.poi|` without any
  patch); a bare prefix right behind `@` (`@ti`) gets a one-request **variant**
  shadow with `this.<prefix>` spliced in. The trailing dot (`@ticker.`) is a
  documented parser split — the expression ends *before* the dot, which
  becomes a separate text statement — so it gets a variant that appends a
  placeholder identifier (`this.ticker.__tsazorQuery`) and queries TS right
  behind the baked dot, where TS answers with the full member list.
- **Routing/fallback contract** (`classifyCodeContext`): markup contexts stay
  v1; a cursor whose previous character sits inside an `@`-expression belongs
  to the TS layer even where the AST is end-exclusive against it; a bare `@`
  / `@word` at the start of a line remains a *directive* completion context
  (v1 offers directives and members together). Every feature returns
  `null`/`[]` instead of a wrong answer — the v1 fallback renders the feature
  exactly as before, the TS layer can only add.
- **Diagnostics** (`source: "tsazor-ts"`, toggle per workspace via
  `initializationOptions.tsDiagnostics`): mapped semantic diagnostics only —
  anything that does not map back onto `.tsazor` source (codegen plumbing,
  synthetic regions) is dropped, so squiggles are anchored on real source by
  construction. Capped at 200.
- **Go-to-definition** targets shadow modules map back onto their originating
  `.tsazor` (with a real span); disk targets (`TickerStore.ts`, d.ts) are
  returned verbatim.

Windows note: shadow registry keys are case-folded, canonical file names are
lowercased, and the bundled VS Code server resolves TS lib d.ts from
`dist/lib/` (copied by the packaging build) — the bundle cannot resolve the
`typescript` package under pnpm. Env override: `TSAZOR_TS_LIB_DIR`.

### v3 backlog

Rename/refactor support, suggestion diagnostics, code actions, auto-imports.