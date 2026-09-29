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
| `packages/vscode/scripts/smoke-completion.mjs` | Programmatic smoke over the bundled `dist/server.js`: initialize → didOpen → completion requests (byte-buffered Content-Length framing). |