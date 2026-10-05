# Handoff — LSP v2 (status: VSIX 0.3.4 installed, restart pending) — 2026-09-29

Session continuation file for Claude Code. **Everything from today is committed and installed as VSIX 0.3.4** — the only open user action is: **restart VS Code** (an extension host reload may suffice). This process (the Claude session) may not survive the restart — everything relevant is here and in the commit history (`git log`).

## Done today (2026-09-29, committed on `main`)

| Commit | Content |
|---|---|
| `5e71b76` | Runtime: `AttributeValue \| object`, `ComponentType` union, `EventCallback<any>` (addEventHandler/AttributeValue), re-wrap fix `bind`/`invokeAsync` (+ test) |
| `3a4b437` | Compiler: token-precise source maps (codeStart spans; plumbing anchor-free) |
| `a3288b0` | Workspace: named-export resolution + `isJsGlobal` guard (+ test) |
| `9c924de` | LSP: `prettifyHoverDisplay`/`sanitizeDoc` + diag filter TS2307/TS2564 (+ tests) |
| `6646392` | VS Code: grammar `#component-tag` + 0.3.4 + `docs/handoff-lsp-v2.md` |

**Root causes of the fixes (key point, do not forget):**
1. **"`target` on `never`" on `@bind` lambdas** (Login.tsazor): `addEventHandler(…, EventCallback<never>)` was an inference trap as a *contextual* return type — `bind<TArg>` inferred `TArg = never`, and the generated `(e) => …` got `e: never` → TS2339 on `e.target`. Fix: `EventCallback<any>` in render-tree (signature + AttributeValue member). The conspicuous columns 100/119 past the end of the line came from the synthetic-region mapping of this diagnostic and are gone with it.
2. **Double wrap `EventCallback.bind`**: the compiler wraps ALL on* attributes with `bind(this, …)` — if you hold an `EventCallback` instance in @code (FormDemo `handleSubmit`), there was TS2345 in the shadow **and** a latent RuntimeError (EventCallback object called as a function). Fix: `bind` accepts an `EventCallback` as delegate, `invokeAsync` unwraps it (Blazor's EventCallbackFactory).
3. **Shadow false positives filtered** (`tsDiagnostics`): TS2307 on static assets (`.css`/fonts/images — served by Vite, no d.ts) and TS2564 for `@Parameter` properties (the renderer sets parameters before the first render, Blazor semantics).

Solved in the round before (also committed): "components are red" (TextMate `#component-tag`), `AttributeValue | object` (Checkout 2345), `isJsGlobal` guard (the Rollup build broke on `import { Math }`).

## Verification after the restart (checklist)

VSIX 0.3.4 installed (`code --list-extensions` → `tsazor.tsazor-vscode@0.3.4`); the node_modules symlink points to packages/runtime/dist, which is freshly built.

1. **Login.tsazor** — 0 `tsazor-ts` diagnostics (this was the starting point: 2339 `target`/`never` @ 14:100/18:119).
2. **FormDemo.tsazor** — 0 diagnostics (double-wrap TS2345 @ 10:91 gone).
3. **EventLog.tsazor / Sparkline.tsazor** — TS2564 ("no initializer") on `@Parameter` properties gone.
4. **Map.tsazor** — TS2307 on `leaflet/dist/leaflet.css` gone.
5. **Checkout.tsazor** — 0 diagnostics (regression check from 0.3.3).
6. **Tags blue** (grammar, confirmed in 0.3.3), hover/completion/go-to-definition keep working unchanged.

**STILL expected to show problems (real user code errors — deliberately not filtered):**
- `blazing-pizza/src/App.tsazor:1` — `NotFound="@notFound"`, the member does not exist in @code (only `found`/`notAuthorized`).
- `blazing-pizza/…/ConfigurePizzaDialog.tsazor:13` — `@PIZZA_MINIMUM_SIZE`/`@PIZZA_MAXIMUM_SIZE` never declared; the workshop uses static `min`/`max` there.
- `demo/Pages/CodeBehindDemo.tsazor:6` — `@(code)` is evaluated as an expression (variable `code` does not exist); as text: `@@code`.
- `sleipnir-ticker/…/EventLog.tsazor:9` — `entry.snapshot.lastPrice?: number` → `price(value: number)`; defuse with `?? 0` in the markup or in the type.

Verified before packing: suites compiler 63 / workspace 6 / lsp 63 / runtime 51 green, both smokes PASS (`node packages/vscode/scripts/smoke-*.mjs`).

## Open / not committed

- **`apps/demo/src/Pages/Counter.tsazor`** — the user's manual change (`private currentCount : number = 0;`) stays uncommitted until the user decides (fold in as a mini commit or revert).
- **This handoff text** (the revision after the restart) is uncommitted — include it with the next approval.
- v3 backlog (docs/language-server.md): rename, refactors, suggestions, code actions, auto-imports.
- Option for later: real **semantic tokens** in the LSP (PascalCase tags as token type "type") — could distinguish unresolved vs. resolved components; but the grammar fix fully covers the red problem.
- `@(...)` explicit expression as a language feature? (The parser cannot do it yet; Blazor has it.) CodeBehindDemo shows the practical benefit.
- 4 real user code errors above — I fix them on request.

## Running processes (survive the VS Code restart only if started outside it)

- Blazing Pizza API: `pnpm --filter blazing-pizza server` → :5300 (seed user `test@example.com` / `test1234`)
- Blazing Pizza frontend: `pnpm --filter blazing-pizza dev` → :5301
- sleipnir-ticker when needed: `pnpm --filter sleipnir-ticker api` (:5310) + `dev` (:5311)

## Gotchas (do not lose)

1. **VSIX verification by extraction needs the FULL unpack** — without `extension/dist/lib` (100 d.ts) `resolveLibDir` falls back to `dirname(getDefaultLibFileName)` = "" and type resolution appears to degrade. Single-file extraction fakes broken engines.
2. **LSP state vs. editor:** dist can already be new without the VSIX having been repacked — hence "it didn't work". Rule: after engine changes ALWAYS build → pack → install → VS Code reload.
3. **LSP stdio probe:** `projectRootOf` reads only `workspaceFolders[0]` (not `rootUri`) — probes without `workspaceFolders` land on `process.cwd()`. Server errors go out as `window/logMessage` (not stderr). Publishing is debounced; **the first v2 analysis of large projects > 5 s — probe timeout ≥ 30 s**. didOpen MUST send the real disk content (didOpen replaces the document content!).
4. **Class instances as attribute values:** `Record<string, unknown>` is too strict for TS classes without an index signature — `AttributeValue` now has `object` as a fallback member. Consumption stays `unknown`.
5. **JS globals in `@code`:** `Math`, `Date`, `Record`, … must NEVER be imported (Rollup breaks on the missing export). The guard lives in `resolveType` (chokepoint for compiler/vite/LSP shadow).
6. **Inference trap with generated handlers:** a contextual `EventCallback<never>` turns lambda parameters into `never` — always type generated handler signatures permissively (`any`), never `never`.
7. **Compiler double wrap:** on* attributes are wrapped with `EventCallback.bind` without looking at types — `@Parameter` metadata/holder fields with an EventCallback instance must be unwrapped when the runtime invokes them (event-callback.ts).

## Architecture quick reference (v2)

| File | Role |
|---|---|
| `packages/lsp/src/shadow-module.ts` | Shadow pipeline (mirror of the vite-plugin) + rewrites A (relative .tsazor imports → own shadows) / B (bare package → shipped `src/*.tsazor`); `compile-throw → null` → v1 fallback |
| `packages/lsp/src/ts-mapping.ts` | `TsazorGenMap` — dependency-free position translation over the raw compiler mappings (genLine 1-based at the input, → 0-based) |
| `packages/lsp/src/ts-service.ts` | `TsazorTypeService` — host + shadow registry (mtime cache), `buildVariant` (queries MUST address the variant's `virtualPath`, the base registry key still points to the unpatched one) |
| `packages/lsp/src/ts-features.ts` | Routing + translation: `classifyCodeContext`, `tsCompletions/tsHover/tsDefinition/tsDiagnostics` (+ `prettifyHoverDisplay`/`sanitizeDoc`, diag filter 2307/2564) |
| `packages/vscode/build.mjs` | Bundles + copies `typescript/lib/*.d.ts` → `dist/lib` (100 files); resolveLibDir fallback: dirname(argv[1])/lib; env `TSAZOR_TS_LIB_DIR` |
| `packages/vscode/scripts/smoke-ts.mjs`, `smoke-completion.mjs` | stdio smokes; against alternative servers with env `TSAZOR_SMOKE_SERVER=<path>` |

## Key v2 insights (gotchas, do not lose)

1. **Trailing-dot split**: `<p>@ticker.</p>` compiles into TWO statements — the expression ends BEFORE the dot (the dot = its own text node). Completion after it: a variant that appends a placeholder identifier (`@ticker.` → `this.ticker.__tsazorQuery`), then query directly behind the baked dot.
2. **`@(...)` is NOT syntax of the Tsazor parser** — compiles as literal text; `@@` is the escape.
3. **Classification is end-exclusive** relative to the cursor, and the character before the cursor after `@ticker.` lies in the text node → `expressionPrefixBefore` (raw text) overrides `classifyCodeContext`; `@word` at line start stays the v1 directive context.
4. **The server gate in `onCompletion`** must NOT check `classify === "code"` up front — `tsCompletions` routes internally.
5. **TS lib options** need full file names (`lib.es2022.d.ts`, …), never `types: []` with an explicit lib, `libReplacement: false`.
6. **Windows:** shadow keys lowercased, `getCanonicalFileName` lowercase, `getDefaultLibLocation`/`useCaseSensitiveFileNames` behind an `as ts.LanguageServiceHost` cast.
7. **Diagnostics policy**: only mapped semantic diagnostics (unmappable plumbing drops out implicitly), cap 200, `source: "tsazor-ts"`, toggle `initializationOptions.tsDiagnostics`; filter TS2307 (assets) / TS2564 (@Parameter).
8. **VSIX packaging**: `npx @vscode/vsce@3.1.0 package --no-dependencies` (newer vsce breaks on ESM-only parse5); the extension loads the server via `context.asAbsolutePath("dist/server.js")`.
9. **Build chain after source-level changes**: `pnpm -r build` (topological: compiler → workspace → runtime → vite-plugin (esbuild!) → components → apps → tsazor-vscode) → smokes. The runtime dist matters for the LSP too — the shadow resolves `@tsazor/runtime` via the node_modules symlinks to `packages/runtime/dist/index.d.ts` (after runtime changes ALWAYS `tsc -b` in runtime!)

## Git conventions

- Commits only after user approval; message ending: `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- German with the user; repo docs mostly English.
