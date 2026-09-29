# Handoff — LSP v2 (Stand: VSIX 0.3.4 installiert, Restart ausstehend) — 2026-09-29

Session-Fortsetzungsdatei für Claude Code. **Alles von heute ist committet und als VSIX 0.3.4 installiert** — die offene User-Aktion ist nur noch: **VS Code neu starten** (Extension-Host-Reload reicht ggf.). Dieser Prozess (Claude-Session) überlebt den Restart ggf. nicht — alles Relevante steht hier und im Commit-Verlauf (`git log`).

## Getan heute (2026-09-29, committed auf `main`)

| Commit | Inhalt |
|---|---|
| `5e71b76` | Runtime: `AttributeValue \| object`, `ComponentType`-Union, `EventCallback<any>` (addEventHandler/AttributeValue), Re-Wrap-Fix `bind`/`invokeAsync` (+ Test) |
| `3a4b437` | Compiler: token-precise Source-Maps (codeStart-Spans; plumbing anchor-frei) |
| `a3288b0` | Workspace: Named-Export-Auflösung + `isJsGlobal`-Guard (+ Test) |
| `9c924de` | LSP: `prettifyHoverDisplay`/`sanitizeDoc` + Diag-Filter TS2307/TS2564 (+ Tests) |
| `6646392` | VS Code: Grammar `#component-tag` + 0.3.4 + `docs/handoff-lsp-v2.md` |

**Fix-Ursachen (Kernpunkt, nicht vergessen):**
1. **„`target` on `never`" auf `@bind`-Lambdas** (Login.tazor): `addEventHandler(…, EventCallback<never>)` war als *kontextueller* Rückgabetyp eine Inferencing-Falle — `bind<TArg>` leitete `TArg = never` her, und das generierte `(e) => …` bekam `e: never` → TS2339 auf `e.target`. Fix: `EventCallback<any>` in render-tree (Signatur + AttributeValue-Member). Die auffälligen Spalten 100/119 hinter dem Zeilenende kamen aus dem Synthetic-Region-Mapping dieser Diagnose und sind mit ihr weg.
2. **Double-Wrap `EventCallback.bind`**: der Compiler umwickelt ALLE on*-Attribute mit `bind(this, …)` — hält man eine `EventCallback`-Instanz in @code (FormDemo `handleSubmit`), gab es TS2345 im Shadow **und** einen latenten RuntimeError (EventCallback-Objekt als Funktion gerufen). Fix: `bind` akzeptiert `EventCallback` als Delegate, `invokeAsync` entpackt (Blazors EventCallbackFactory).
3. **Shadow-Falsch-Positive gefiltert** (`tsDiagnostics`): TS2307 auf statische Assets (`.css`/Fonts/Bilder — vite serviert, kein d.ts) und TS2564 für `@Parameter`-Properties (Renderer setzt Parameter vor dem ersten Render, Blazor-Semantik).

Gelöst in der Runde davor (ebenfalls committed): „Components sind rot" (TextMate `#component-tag`), `AttributeValue | object` (Checkout 2345), `isJsGlobal`-Guard (Rollup-Build brach an `import { Math }`).

## Verifizierung nach dem Restart (Checkliste)

VSIX 0.3.4 installiert (`code --list-extensions` → `tasor.tasor-vscode@0.3.4`); node_modules-Symlink zeigt auf packages/runtime/dist, das neu gebaut ist.

1. **Login.tazor** — 0 `tasor-ts`-Diagnostics (war der Ausgangspunkt: 2339 `target`/`never` @ 14:100/18:119).
2. **FormDemo.tazor** — 0 Diagnostics (Double-Wrap TS2345 @ 10:91 weg).
3. **EventLog.tazor / Sparkline.tazor** — TS2564 („no initializer") auf `@Parameter`-Properties weg.
4. **Map.tazor** — TS2307 auf `leaflet/dist/leaflet.css` weg.
5. **Checkout.tazor** — 0 Diagnostics (Regression-Check von 0.3.3).
6. **Tags blau** (Grammar, bestätigt in 0.3.3), Hover/Kompletion/Go-to-Def unverändert funktionieren.

**Erwartet WEITERHIN Probleme (echte User-Code-Fehler — absichtlich nicht gefiltert):**
- `blazing-pizza/src/App.tazor:1` — `NotFound="@notFound"`, Member existiert nicht in @code (nur `found`/`notAuthorized`).
- `blazing-pizza/…/ConfigurePizzaDialog.tazor:13` — `@PIZZA_MINIMUM_SIZE`/`@PIZZA_MAXIMUM_SIZE` nie deklariert; Workshop nutzt dort statische `min`/`max`.
- `demo/Pages/CodeBehindDemo.tazor:6` — `@(code)` wird als Ausdruck ausgewertet (Variable `code` existiert nicht); als Text: `@@code`.
- `sleipnir-ticker/…/EventLog.tazor:9` — `entry.snapshot.lastPrice?: number` → `price(value: number)`; `?? 0` im Markup oder Typ entschärfen.

Verifiziert vor dem Packen: Suites compiler 63 / workspace 6 / lsp 63 / runtime 51 grün, beide Smokes PASS (`node packages/vscode/scripts/smoke-*.mjs`).

## Offen / nicht committed

- **`apps/demo/src/Pages/Counter.tazor`** — User-Hand-Änderung (`private currentCount : number = 0;`) bleibt uncommitted bis zur Entscheidung des Users (reindehen als Mini-Commit oder zurücknehmen).
- **Dieser Handoff-Text** (die Überarbeitung nach dem Restart) ist uncommitted — bei nächster Freigabe mit einpacken.
- v3-Backlog (docs/language-server.md): Rename, Refactors, Suggestions, Code-Actions, Auto-Imports.
- Option für später: echte **Semantic-Tokens** im LSP (PascalCase-Tags als Token-Type „type") — könnte unresolvierte vs. aufgelöste Components unterscheiden; Grammar-Fix deckt das Red-Problem aber vollständig ab.
- `@(...)`-Explicit-Expression als Sprachfeature? (Parser kann es noch nicht; Blazor hat es.) CodeBehindDemo zeigt den praktischen Nutzen.
- 4 echte User-Code-Fehler oben — fixe ich auf Zuruf.

## Laufende Prozesse (überleben den VS-Code-Restart nur, wenn außerhalb gestartet)

- Blazing Pizza API: `pnpm --filter blazing-pizza server` → :5300 (Seed-User `test@example.com` / `test1234`)
- Blazing Pizza Frontend: `pnpm --filter blazing-pizza dev` → :5301
- sleipnir-ticker bei Bedarf: `pnpm --filter sleipnir-ticker api` (:5310) + `dev` (:5311)

## Gotchas (nicht verlieren)

1. **VSIX-Verifizierung per Extraktion braucht die VOLLE Entpackung** — ohne `extension/dist/lib` (100 d.ts) fällt `resolveLibDir` auf `dirname(getDefaultLibFileName)` = "" und die Typauflösung degradiert scheinbar. Einzeldatei-Extraktion fälscht kaputte Engines.
2. **LSP-Stand vs. Editor:** dist kann schon neu sein, ohne dass die VSIX neu geraakt war — deshalb „es hat nicht funktioniert". Regel: nach Engine-Änderungen IMMER build → pack → install → VS-Code-Reload.
3. **LSP-stdio-Probe:** `projectRootOf` liest nur `workspaceFolders[0]` (nicht `rootUri`) — Probes ohne `workspaceFolders` landen auf `process.cwd()`. Server-Fehler gehen als `window/logMessage` (nicht stderr). Publish ist debounced; **erste v2-Analyse großer Projekte > 5 s — Probe-Timeout ≥ 30 s**. didOpen MUSS den echten Disk-Inhalt senden (didOpen ersetzt den Dokumentinhalt!).
4. **Klasseninstanzen als Attributwerte:** `Record<string, unknown>` ist zu streng für TS-Klassen ohne Index-Signature — `AttributeValue` hat jetzt `object` als Fallback-Member. Konsum bleibt `unknown`.
5. **JS-Globals in `@code`:** `Math`, `Date`, `Record`, … dürfen NIEMALS importiert werden (Rollup bricht an fehlendem Export). Guard lebt in `resolveType` (Chokepoint für Compiler/vite/LSP-Shadow).
6. **Inferencing-Falle bei generierten Handlern:** kontextuelle `EventCallback<never>` macht Lambda-Parameter zu `never` — generierte Handler-Signaturen immer permissiv typisieren (`any`), nie `never`.
7. **Compiler Double-Wrap:** on*-Attribute werden ohne Typblick mit `EventCallback.bind` umwickelt — `@Parameter`-Metadaten/Halter-Felder mit EventCallback-Instanz müssen beim Runtime-Invoking entpackt werden (event-callback.ts).

## Architektur-Kurzreferenz (v2)

| File | Rolle |
|---|---|
| `packages/lsp/src/shadow-module.ts` | Shadow-Pipeline (Spiegel des vite-plugins) + Rewrites A (relative .tazor-Imports → eigene Shadows) / B (bare-Package → mitgelieferte `src/*.tazor`); `compile-throw → null` → v1-Fallback |
| `packages/lsp/src/ts-mapping.ts` | `TazorGenMap` — dependency-freie Positionsübersetzung über die rohen Compiler-Mappings (genLine 1-basiert am Eingang, → 0-basiert) |
| `packages/lsp/src/ts-service.ts` | `TasorTypeService` — Host + Shadow-Registry (mtime-Cache), `buildVariant` (Queries MÜSSEN den Variant-`virtualPath` adressieren, Base-Registry-Key zeigt weiterhin un-gepatcht) |
| `packages/lsp/src/ts-features.ts` | Routing + Übersetzung: `classifyCodeContext`, `tsCompletions/tsHover/tsDefinition/tsDiagnostics` (+ `prettifyHoverDisplay`/`sanitizeDoc`, Diag-Filter 2307/2564) |
| `packages/vscode/build.mjs` | Bundle + kopiert `typescript/lib/*.d.ts` → `dist/lib` (100 Dateien); resolveLibDir-Fallback: dirname(argv[1])/lib; env `TASOR_TS_LIB_DIR` |
| `packages/vscode/scripts/smoke-ts.mjs`, `smoke-completion.mjs` | stdio-Smokes; gegen alternative Server mit env `TASOR_SMOKE_SERVER=<pfad>` |

## Wichtigste v2-Erkenntnisse (Gotchas, nicht verlieren)

1. **Trailing-Dot-Split**: `<p>@ticker.</p>` compiliert in ZWEI Statements — die Expression endet VOR dem Punkt (Punkt = eigener Text-Knoten). Completion dahinter: Variante, die einen Platzhalter-Ident anfügt (`@ticker.` → `this.ticker.__tasorQuery`), dann Query direkt hinter dem gebackenen Punkt.
2. **`@(...)` ist KEINE Syntax des Tasor-Parsers** — compiliert als Literaltext; `@@` ist Escape.
3. **Klassifizierung ist end-exklusiv** vs. Cursor, und das Zeichen vor dem Cursor nach `@ticker.` liegt im Text-Knoten → `expressionPrefixBefore` (roher Text) übersteuert `classifyCodeContext`; Zeilenanfang `@word` bleibt v1-Direktiven-Kontext.
4. **Server-Gate in `onCompletion`** darf NICHT vorab auf `classify === "code"` prüfen — `tsCompletions` routet intern.
5. **TS-Lib-Optionen** brauchen volle Dateinamen (`lib.es2022.d.ts`, …), nie `types: []` mit expliziter lib, `libReplacement: false`.
6. **Windows:** Shadow-Keys lowercased, `getCanonicalFileName` lowercase, `getDefaultLibLocation`/`useCaseSensitiveFileNames` hinter `as ts.LanguageServiceHost`-Cast.
7. **Diagnostics-Policy**: nur gemappte semantische Diagnostics (nicht mappbares Plumbing fällt implizit weg), Cap 200, `source: "tasor-ts"`, Toggle `initializationOptions.tsDiagnostics`; Filter TS2307 (Assets) / TS2564 (@Parameter).
8. **VSIX-Verpackung**: `npx @vscode/vsce@3.1.0 package --no-dependencies` (neuere vsce bricht an ESM-only parse5); Extension lädt Server via `context.asAbsolutePath("dist/server.js")`.
9. **Build-Kette nach sourcnahen Änderungen**: `pnpm -r build` (topologisch: compiler → workspace → runtime → vite-plugin (esbuild!) → Components → Apps → tasor-vscode) → Smokes. Runtime-dist ist auch für den LSP relevant — der Shadow löst `@tasor/runtime` über die node_modules-Symlinks auf `packages/runtime/dist/index.d.ts` auf (nach Runtime-Änderungen IMMER `tsc -b` in runtime!)

## Git-Konventionen

- Commits nur nach User-Freigabe; Message-Ende: `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- Deutscher Ton mit dem User; Repo-Doku überwiegend Englisch.