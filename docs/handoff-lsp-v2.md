# Handoff — LSP v2 / Components-Fix / AttributeValue-Diagnostics (2026-09-29)

> **Addendum (Session 2, 2026-09-29):** Die oben beschriebenen Fixes plus zwei Runden
> Diagnostic-Fixes sind committet und als **VSIX 0.3.4** geraakt:
>
> 1. **`tasor-ts` 2339 „`target` does not exist on type `never`" auf `@bind`-Lambdas** (Login.tazor 14/18): `addEventHandler(…, callback: EventCallback<never>)` war als *kontextueller* Rückgabetyp eine Inferencing-Falle — `bind<TArg>` leitete `TArg=never` her, und das generierte `(e) => …` bekam `e: never`. Fix: `EventCallback<any>` (render-tree: Signaturen + AttributeValue-Member). Spalten 100/119 hinter dem Zeilenende = Synthetic-Region-Mapping, durch das Wegfallen der Diagnose obsolet.
> 2. **Double-Wrap `EventCallback.bind`** (FormDemo `OnValidSubmit="@handleSubmit"` bei Vorhalten einer `EventCallback`-Instanz in @code): TS2345 im Shadow **und** latent RuntimeError (Objekt als Funktion gerufen). Fix: `bind` akzeptiert `EventCallback` als Delegate, `invokeAsync` entpackt (Blazors EventCallbackFactory-Semantik); Renderer-Build-Parameter-View war schon korrekt.
> 3. **Shadow-Falsch-Positive gefiltert** (`tsDiagnostics`): TS2307 auf statische Assets (`leaflet/dist/leaflet.css` — vite serviert), TS2564 auf `@Parameter`-Properties (Renderer setzt Parameter vor dem ersten Render, Blazor-Semantik).
> 4. Ebenfalls committet (Session-1-WIP): `AttributeValue | object`, `ComponentType`-Union, Compiler token-precise Source-Maps, Workspace named-exports + `isJsGlobal`, LSP `prettifyHoverDisplay`/`sanitizeDoc`.
>
> **Echte User-Code-Fehler aus dem App-Scan (blieben absichtlich stehen):** App.tazor `NotFound="@notFound"` (Member fehlt in @code), ConfigurePizzaDialog `@PIZZA_MINIMUM_SIZE`/`@PIZZA_MAXIMUM_SIZE` (deklariert nichts; Workshop nutzt statische `min`/`max`), CodeBehindDemo `@(code)` ( evaluates variable — als Text `@@code`), EventLog `entry.snapshot.lastPrice?: number` → `price(value: number)` (Null-Handling im Markup oder Typ entschärfen).
> Suites grün: compiler 63, workspace 6, lsp 63, runtime 51 (neuer Re-Wrap-Test), Smokes PASS.

Session-Fortsetzungsdatei für Claude Code. Stand: **User startet VS Code neu** (läuft schon durch VSIX 0.3.3; Restart ist das übliche Reload). Der Prozess überlebt das nicht — alles Relevante hier.

## Aktueller Stand (Ende der Session)

**Drei Themen sind gelöst und verifiziert:**

1. **„Components sind rot"** — KEINE LSP-Regression, sondern Syntax-Highlighting: Markup fiel auf VS Codes eingebautes `text.html.basic` zurück und PascalCase-Tags landeten in `tags-invalid` (= rot). Fix: TextMate-Regel `#component-tag` in `packages/vscode/syntaxes/tazor.tmLanguage.json` (begin `(</?)([A-Z][\w$]*)`, Scopes `entity.name.tag.component.tazor entity.name.tag.html`, im Top-Patterns VOR dem `text.html.basic`-Include). **Vom User bestätigt: Tags nicht mehr rot.** ✅
2. **`tasor-ts` 2345 auf Klasseninstanzen als Attributwerte** (Checkout.tazor: `Order`, `Address`): `AttributeValue` in `packages/runtime/src/render-tree/render-tree.ts` erlaubte als Objekttyp nur `Record<string, unknown>` — Klasseninstanzen ohne Index-Signature strukturell unzulässig. Fix: Union um **`object`** erweitert (Blazors Attributwert ist `object`); Konsum-Seite liest Frames ohnehin als `unknown` (renderer.ts:103, dom-renderer.ts:396, diff.ts:102).
3. **Rollup-Build-Bug (dabei entdeckt):** `pnpm -r build` brach in apps/demo/sleipnir-ticker an `import { Math } from "@tasor/components"` — `collectCodeImports` sammelt ALLE PascalCase-Bezeichner (inkl. JS-Globals aus @code wie `Math`), und die Neue „bare-package trust"-Branch in `resolveType` (resolver.ts) akzeptierte sie blind. Fix: **`isJsGlobal`-Guard** in `packages/workspace/src/resolver.ts` — `Object.getOwnPropertyNames(globalThis)` + TS-Utility-Types (`Record`, `Partial`, …) werden NIE importiert; lokale Dateien/Exports shadowen weiterhin bewusst. Regression-Test in `packages/workspace/test/resolution.test.ts`.

**Verifizierung (alles grün):**

- `pnpm -r build` (alle Packages + Apps; Rollup in demo/sleipnir-ticker/blazing-pizza läuft durch)
- Suites: compiler 63, workspace 6 (+1 neu), vite-plugin 19, lsp 61, components 22, runtime+testing 134 — alles PASS
- Beide Smokes PASS (`node packages/vscode/scripts/smoke-ts.mjs`, `smoke-completion.mjs`)
- **stdio-Probe über den gebauten Server auf dem echten blazing-pizza-Projekt: `Checkout.tazor` → 0 Diagnostics** (2345 weg). Probe-Skript liegt AUSSERHALB des Repos: `%TEMP%\tasor-probe\probe-checkout.mjs` (didOpen mit ECHTEM Dateiinhalt vom Disk lesen! `didOpen` ersetzt den Dokumentinhalt — Platzhaltertext probe auf die falsche Seite). Wichtig: erste Analyse großer Projekte dauert > 5 s — Timeout ≥ 30 s setzen, sonst sieht der Probe still aus.
- **VSIX 0.3.3** gebaut (`pnpm --filter tasor-vscode build`), geraakt (`npx @vscode/vsce@3.1.0 package --no-dependencies`), installiert (`code --install-extension ..\tasor-vscode-0.3.3.vsix --force`). Bestätigt: `tasor.tasor-vscode@0.3.3`.

**Offene User-Aktion: VS Code neu starten → `apps/blazing-pizza/src/Pages/Checkout.tazor` prüfen** — Tags blau (bestätigt), 0 Diagnostics erwartet. Nach Restart sind die installierten 0.3.3 + die frische Runtime-Typen (node_modules-Symlink auf packages/runtime/dist) aktiv.

## Uncommitted WIP (Commit erst nach User-Freigabe, siehe Git-Konventionen)

Kohärente Multi-WIP-Session — alle Gates grün. Ziel: **mehrere sinnvolle Commits:**

| File | Änderung |
|---|---|
| `packages/runtime/src/render-tree/render-tree.ts` | `AttributeValue` + `object`-Member (Klasseninstanzen als Attributwerte, vgl. Blazor `object`) |
| `packages/runtime/src/components/component-definition.ts` | `ComponentType<T>`-Union (ComponentDefinition \| abstract new), Renderer/RenderTree akzeptieren Klassen direkt |
| `packages/compiler/src/parser.ts`, `ast.ts`, `codegen.ts` (+ Tests) | Token-precise Source-Maps: `codeStart`-Spans für Attribute/Expressions/`@ref`/`@key`; `plumbingStmt` ohne Mapping (closeElement/closeComponent anchor-frei, vgl. Kommentar in codegen.ts) |
| `packages/workspace/src/resolver.ts`, `code-imports.ts` (+ Test) | Named-Export-Auflösung für beliebige .ts-Module in den Candidate-Dirs (Barrel-Import in @code; `exportCache` per mtime) **+ `isJsGlobal`-Guard** in `resolveType` (JS-Globals/TS-Utility-Types niemals importieren) |
| `packages/lsp/src/ts-features.ts` (+ Test) | `prettifyHoverDisplay` (Strippt `(alias) __tasor_comp_X`/Import-Kontextzeile), `sanitizeDoc` (Blazor-Lineage/„v1 deviation"-Sätze raus aus Editor-Surfaces) |
| `packages/vscode/package.json` + `syntaxes/tazor.tmLanguage.json` | Version 0.3.3 + component-tag-Regel (0.3.2→0.3.3) |
| `apps/demo/src/Pages/Counter.tazor` | **MANUELL vom User editiert** um 16:16 (`private currentCount : number = 0;`) — nicht von Claude, nicht anfassen, mit dem User klären |

Untracked: `docs/handoff-lsp-v2.md` (diese Datei).

## Laufende Prozesse (überleben Restart NICHT — bei Bedarf neu starten)

- Blazing Pizza API: `pnpm --filter blazing-pizza server` → :5300 (Seed-User `test@example.com` / `test1234`)
- Blazing Pizza Frontend: `pnpm --filter blazing-pizza dev` → :5301
- sleipnir-ticker bei Bedarf: `pnpm --filter sleipnir-ticker api` (:5310) + `pnpm --filter sleipnir-ticker dev` (:5311)

## Gotchas / Erkenntnisse (nicht verlieren)

1. **VSIX-Verifizierung per Extraktion braucht die VOLLE Entpackung** — ohne `extension/dist/lib` (100 d.ts) fällt `resolveLibDir` auf `dirname(getDefaultLibFileName)` = "" und die Typauflösung degradiert scheinbar (Hover `points: {}` statt `PricePoint[]`). Einzeldatei-Extraktion fälscht kaputte Engines — 0.3.1 war in Wahrheit NICHT kaputt.
2. **LSP-Stand vs. Editor:** dist kann schon neu sein, ohne dass die VSIX neu geraakt war — deshalb „es hat nicht funktioniert". Regel: nach Engine-Änderungen IMMER build → pack → install → VS-Code-Reload.
3. **LSP-stdio-Probe:** `projectRootOf` liest nur `workspaceFolders[0]` (nicht `rootUri`) — Probes ohne `workspaceFolders` landen auf `process.cwd()`. Server-Fehler gehen als `window/logMessage` (nicht stderr). Publish ist debounced; **erste v2-Analyse großer Projekte > 5 s — Probe-Timeout ≥ 30 s**.
4. **Klasseninstanzen als Attributwerte:** `Record<string, unknown>` ist zu streng für TS-Klassen ohne Index-Signature — `AttributeValue` braucht `object` als Fallback-Member. Konsum bleibt `unknown`.
5. **JS-Globals in `@code`:** `collectCodeImports` sammelt alle PascalCase-Bezeichner aus der Quelle — `Math`, `Date`, `Record`, … dürfen NIEMALS importiert werden (Rollup bricht an fehlendem Export). Der Guard gehört in `resolveType` (Chokepoint, den Compiler/vite/LSP-Shadow alle nutzen).
6. Restliche Gotchas aus der v2-Runde (Nr. 1–9 der Architektur-Sektion unten) weiter gültig.

## Architektur-Kurzreferenz (v2)

| File | Rolle |
|---|---|
| `packages/lsp/src/shadow-module.ts` | Shadow-Pipeline (Spiegel des vite-plugins) + Rewrites A (relative .tazor-Imports → eigene Shadows) / B (bare-Package → mitgelieferte `src/*.tazor`); `compile-throw → null` → v1-Fallback |
| `packages/lsp/src/ts-mapping.ts` | `TazorGenMap` — dependency-freie Positionsübersetzung über die rohen Compiler-Mappings (genLine 1-basiert am Eingang, → 0-basiert) |
| `packages/lsp/src/ts-service.ts` | `TasorTypeService` — Host + Shadow-Registry (mtime-Cache), `buildVariant` (Queries MÜSSEN den Variant-`virtualPath` adressieren, Base-Registry-Key zeigt weiterhin un-gepatcht) |
| `packages/lsp/src/ts-features.ts` | Routing + Übersetzung: `classifyCodeContext`, `tsCompletions/tsHover/tsDefinition/tsDiagnostics` + neu `prettifyHoverDisplay`/`sanitizeDoc` |
| `packages/vscode/build.mjs` | Bundle + kopiert `typescript/lib/*.d.ts` → `dist/lib` (100 Dateien); resolveLibDir-Fallback: dirname(argv[1])/lib; env `TASOR_TS_LIB_DIR` |
| `packages/vscode/scripts/smoke-ts.mjs`, `smoke-completion.mjs` | stdio-Smokes; gegen alternative Server mit env `TASOR_SMOKE_SERVER=<pfad>` |

## Wichtigste Erkenntnisse (Gotchas, nicht verlieren)

1. **Trailing-Dot-Split**: `<p>@ticker.</p>` compiliert in ZWEI Statements — die Expression endet VOR dem Punkt (Punkt = eigener Text-Knoten). Completion dahinter: Variante, die einen Platzhalter-Ident anfügt (`@ticker.` → `this.ticker.__tasorQuery`), dann Query direkt hinter dem gebackenen Punkt.
2. **`@(...)` ist KEINE Syntax des Tasor-Parsers** — compiliert als Literaltext; `@@` ist Escape.
3. **Klassifizierung ist end-exklusiv** vs. Cursor, und das Zeichen vor dem Cursor nach `@ticker.` liegt im Text-Knoten → `expressionPrefixBefore` (roher Text) übersteuert `classifyCodeContext`; Zeilenanfang `@word` bleibt v1-Direktiven-Kontext.
4. **Server-Gate in `onCompletion`** darf NICHT vorab auf `classify === "code"` prüfen — `tsCompletions` routet intern.
5. **TS-Lib-Optionen** brauchen volle Dateinamen (`lib.es2022.d.ts`, …), nie `types: []` mit expliziter lib, `libReplacement: false`.
6. **Windows:** Shadow-Keys lowercased, `getCanonicalFileName` lowercase, `getDefaultLibLocation`/`useCaseSensitiveFileNames` hinter `as ts.LanguageServiceHost`-Cast.
7. **Diagnostics-Policy**: nur gemappte semantische Diagnostics (nicht mappbares Plumbing fällt implizit weg), Cap 200, `source: "tasor-ts"`, Toggle `initializationOptions.tsDiagnostics`.
8. **VSIX-Verpackung**: `npx @vscode/vsce@3.1.0 package --no-dependencies` (neuere vsce bricht an ESM-only parse5); Extension lädt Server via `context.asAbsolutePath("dist/server.js")` → nach Engine-Änderungen IMMER neu bauen + packen + installieren + VS-Code-Reload.
9. **Build-Kette nach sourcnahen Änderungen**: `pnpm -r build` (topologisch: compiler → workspace → runtime → vite-plugin (esbuild!) → Components → Apps → tasor-vscode) → Smokes.

## Offene Aufgaben / Backlog

- **Reload-Verifizierung durch User** (s. oben). Ergebnis abwarten, dann:
- Commit der WIP-Änderungen nach User-Freigabe. Vorschlag zur Aufteilung:
  1. Runtime: `AttributeValue|object` + `ComponentType`-Union
  2. Compiler: token-precise Source-Maps (+ Tests)
  3. Workspace: Named-Exports + `isJsGlobal`-Guard (+ Tests)
  4. LSP: `prettifyHoverDisplay`/`sanitizeDoc` (+ Tests)
  5. VS Code: Grammar-Regel + VSIX 0.3.3 (+ `docs/handoff-lsp-v2.md` als letzte Doc-Commit-Zeile)
- v3-Backlog (siehe docs/language-server.md): Rename, Refactors, Suggestions, Code-Actions, Auto-Imports.
- Option für später: echte **Semantic-Tokens** im LSP (PascalCase-Tags als Token-Type „type") — würde unresolvierte vs. aufgelöste Components unterscheidenkönnen; Grammar-Fix deckt das Red-Problem aber vollständig ab.
- `@(...)`-Explicit-Expression als Sprachfeature? (Parser kann es noch nicht; Blazor hat es.)

## Git-Konventionen

- Commits nur nach User-Freigabe; Message-Ende: `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- Deutscher Ton mit dem User; Repo-Doku überwiegend Englisch.