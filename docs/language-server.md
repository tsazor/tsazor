# Language server (`@tasor/lsp`)

A stdio language server for `.tazor` files that ships with the VS Code extension
(`packages/vscode`). One server process per workspace; launched as
`node dist/server.js --stdio`.

## Capabilities

| Capability | What it does |
|---|---|
| Diagnostics | Compiler diagnostics as you type, published on open and every edit (error + warning, TZR codes, `source: "tasor"`). |
| Hover | Component tags (resolved source, or "not resolvable → TZR005"), directives (`@page`, `@inject` with the resolved type module), not inside `@code`. |
| Go-to-definition | Component tags → the `.tazor` file resolved through `@using`; `@inject` types → local `.ts`/`.tazor` modules. Built-ins resolve into `@tasor/runtime`, so they produce nothing (the package is not a file). |
| Completion | See below. |

## Completion

Trigger characters: `<`, `@`, space. Four contexts, classified per keystroke
from the cursor position:

| Context | Example | Candidates |
|---|---|---|
| Tag name | `<Gr` → `Greeter` | Components in `@using`-resolvable directories (directory scan) + runtime built-ins (`RUNTIME_COMPONENTS`). |
| Attribute name | `<Greeter ` | The resolved component's `@Parameter()` names, `@bind-<param>` pairs, directive attributes (`@bind`, `@onclick`, `@onchange`, `@oninput`, `@ref`, `@key`, `@attributes`); plain elements get a small HTML list (`class`, `style`, `id`, `href`, `type`, `value`, `data-testid`). |
| Directive | `@p` | Directive keywords with snippets (`@page "/route"`, `@code { … }`, `@if`, `@for`, `@foreach`, `@switch`, …). |
| Expression | `Count: @co` | Members of the component's own `@code` state, the code-behind sidecar (`X.tazor.ts`), and `@inject` fields. |

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

### Parameter and member sources (v1 heuristics)

- **`.tazor` components:** the tag is resolved via the workspace resolver
  (`resolveImportable`), the file's member `@code` blocks are parsed, and
  `@Parameter()`/`@CascadingParameter()` names are extracted by the same regex
  the code generator itself uses.
- **Runtime built-ins:** hand-maintained table `RUNTIME_COMPONENT_PARAMS` in
  `packages/workspace/src/builtins.ts`, transcribed from the runtime sources
  (input components share `InputBase`'s `Value`/`ValueChanged`/`ValueExpression`).
- **Expression members:** line-based regexes over member code (getter /
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
| `packages/lsp/src/ts-mapping.ts` | `TazorGenMap` — dependency-free position translation over the compiler's raw mappings. |
| `packages/lsp/src/ts-service.ts` | `TasorTypeService` — the per-workspace `ts.LanguageService` host, shadow registry (mtime/`on-demand` cache), variant-shadow builder. |
| `packages/lsp/src/ts-features.ts` | Routing + translation: `classifyCodeContext`, completions/hover/definition/diagnostics back into `.tazor` coordinates. |
| `packages/vscode/scripts/smoke-completion.mjs` | Programmatic smoke over the bundled `dist/server.js`: initialize → didOpen → completion requests (byte-buffered Content-Length framing). |
| `packages/vscode/scripts/smoke-ts.mjs` | Same framing, but exercising the v2 engine end-to-end: completion behind `@this.ticker.`, hover as `PricePoint[]`, definition into `TickerStore.ts`, mapped TS2322. |

## v2 — real TypeScript type knowledge

v1's expression completion is regex-heuristic: it reads member *declarations*
of `@code` and the code-behind sidecar as text. It cannot follow chains
(`@ticker.points.length`), inheritance, or imported types — v2 closes that
with a real `ts.LanguageService` (volar-style "shadow modules"):

- **One shadow module per `.tazor`** (`<dir>/<Name>.tazor.gen.ts`, virtual):
  the real `compile()` pipeline mirrored from the vite plugin — import
  collection, `_Imports`, code-behind sidecar import — plus two rewrites:
  component `.tazor` imports resolve to their own shadows (typed across
  files), bare-package components (`@tasor/components`, whose `dist` d.ts is
  deliberately `any`) resolve to the package's shipped `src/*.tazor` source.
- **One `ts.LanguageService` per workspace**, custom host: virtual shadow
  paths are served from memory, everything else (sidecars, project TS,
  `node_modules` d.ts) read from disk. Compiler options come from the
  project's `tsconfig.json` with non-negotiable overrides
  (`experimentalDecorators`, `useDefineForClassFields: false`,
  `moduleResolution: bundler`, `skipLibCheck`, ES2022 + DOM libs).
- **Position mapping**: `TazorGenMap` over the compiler's raw per-statement
  mappings (genLine 1-based → 0-based on entry, `srcCol` verbatim in `@code`,
  token-precise entries inside expressions). Unmappable → `null` → v1.
- **Completions in expressions** use two paths: the generated text already
  *bakes* `this.<chain>` (direct mapping answers `@ticker.poi|` without any
  patch); a bare prefix right behind `@` (`@ti`) gets a one-request **variant**
  shadow with `this.<prefix>` spliced in. The trailing dot (`@ticker.`) is a
  documented parser split — the expression ends *before* the dot, which
  becomes a separate text statement — so it gets a variant that appends a
  placeholder identifier (`this.ticker.__tasorQuery`) and queries TS right
  behind the baked dot, where TS answers with the full member list.
- **Routing/fallback contract** (`classifyCodeContext`): markup contexts stay
  v1; a cursor whose previous character sits inside an `@`-expression belongs
  to the TS layer even where the AST is end-exclusive against it; a bare `@`
  / `@word` at the start of a line remains a *directive* completion context
  (v1 offers directives and members together). Every feature returns
  `null`/`[]` instead of a wrong answer — the v1 fallback renders the feature
  exactly as before, the TS layer can only add.
- **Diagnostics** (`source: "tasor-ts"`, toggle per workspace via
  `initializationOptions.tsDiagnostics`): mapped semantic diagnostics only —
  anything that does not map back onto `.tazor` source (codegen plumbing,
  synthetic regions) is dropped, so squiggles are anchored on real source by
  construction. Capped at 200.
- **Go-to-definition** targets shadow modules map back onto their originating
  `.tazor` (with a real span); disk targets (`TickerStore.ts`, d.ts) are
  returned verbatim.

Windows note: shadow registry keys are case-folded, canonical file names are
lowercased, and the bundled VS Code server resolves TS lib d.ts from
`dist/lib/` (copied by the packaging build) — the bundle cannot resolve the
`typescript` package under pnpm. Env override: `TASOR_TS_LIB_DIR`.

### v3 backlog

Rename/refactor support, suggestion diagnostics, code actions, auto-imports.