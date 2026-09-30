# Architektur & HMR

## Render-Pfad (Blazor 1:1)

```
.tsazor  ──(Vite-Plugin: @tsazor/compiler)──►  TS-Modul
              export default class X extends ComponentBase {
                  buildRenderTree(__builder: RenderTreeBuilder): void { … }
              }
TS      ──(esbuild)──►  JS (Sourcemap-Kette Compiler → esbuild)
Browser ──(Renderer)──►  RenderTree-Frames ──(Diff)──►  Edit-Liste ──(DomRenderer)──►  DOM
```

- **RenderTree:** flaches Frame-Array (`FrameType`: Element, Text, Attribute, Component,
  Region, ElementReferenceCapture, Markup) mit monotonen Sequenz-Nummern pro Pfad —
  Grundlage des Blazor-ähnlichen Diffs (Sequenz-Matching, `@key`-Support).
- **Diff** (`render-tree/diff.ts`): Port von Blazors `RenderTreeDiffBuilder` — geordneter
  Zwei-Zeiger-Walk über Sequenznummern, Key-Dictionary nur wenn Keys vorkommen, Key-Miss ⇒
  Remove + Insert, doppelte Keys ⇒ Fehler. Reine Daten ohne DOM-Zugriff: Edit-Liste
  (`RenderTreeEditType`, Blazors Edit-Typen mit Sibling-Indizes, `StepIn`/`StepOut`,
  Permutationslisten) plus Kind-Komponenten zum Instanziieren/Behalten und zum Disposen
  (auch verschachtelt in entfernten Elementen). Der erste Render ist ein Diff gegen den
  leeren Baum.
- **Renderer/DomRenderer:** Renderer instanziiert/disposed laut Diff, der DomRenderer wendet
  die Edits an: Sibling-Index → DOM-Knoten per Vorwärts-Cursor (`LogicalChildren`) über die
  logischen Kinder eines Elements oder einer `LogicalRange` (logical-range.ts, Blazors
  „logical elements"). Komponenten-Ausgaben (`ComponentState.range`) und Markup-Blöcke sind
  Ranges aus Start-/End-Kommentar; sie zählen als ein Kind, werden als Einheit eingefügt,
  permutiert und entfernt und verschachteln sich. Die Anwendung ist transaktional: ein
  `DomJournal` protokolliert jede Mutation vorher bestehenden DOMs, ein scheiternder Pass wird
  zurückgerollt, das DOM zeigt wieder den Live-Baum (Grenzen: Ref-Captures,
  Custom-Element-Callbacks, Fokus/Caret). Frische Teilbäume werden detached gebaut und einmal
  eingefügt. Attribute (dom-attributes.ts): `value`/`checked`/`selected` als Property (Select-
  Sollwert wird nach den Optionen gesetzt und bei Optionsänderungen neu angewandt), Booleans
  als minimierte Attribute, Primitive als Attribut, Objekte an schreibbare Properties;
  Event-Listener direkt am Knoten, pro Eventname ein stabiler Listener (bewusst: Blazors
  Delegation existiert wegen der WASM-Bridge, die hier entfällt).
- **Dispatcher/Batching:** Eine Render-Queue pro Renderer (`RenderQueue`, Parent-first:
  geringste Baumtiefe zuerst, FIFO bei gleicher Tiefe). Die erste Render-Anforderung plant
  über den `Dispatcher` des Renderers einen Batch (Microtask); der Batch rendert, bis die
  Queue leer ist — Anforderungen *während* des Batches (`stateHasChanged` im Render oder in
  synchronen Lifecycle-Hooks, vom Diff instanziierte Kinder) laufen im selben Batch. Ein
  synchroner Lifecycle fordert seinen Render synchron an (Blazors
  `RunInitAndSetParametersAsync`), nur zurückgegebene Promises werden awaited. Batch-Ende
  ist ein definierter Punkt (`renderer.onBatchCompleted`, liefert die Render-Passes des
  Batches in Reihenfolge). Jeder Render-Pass wendet seine Edits sofort an (B3-Entscheidung:
  Blazors Batch-am-Stück dient der WASM→JS-Grenze; hier läuft der Batch synchron, ein
  Batch-Ende-Applier müsste nur die per Index referenzierten Frames kopieren); der nächste
  Pass derselben Komponente diffed gegen den committeten Baum. Fehler (Render, Diff, DOM, Lifecycle, OnAfterRender, Events, Dispose) sind pro
  Komponente isoliert und gehen an `renderer.errorHandler` (`{ error, component, phase }`,
  Default `console.error`); der Rest des Batches läuft weiter, der Live-Baum der
  fehlerhaften Komponente bleibt Diff-Basis. Render-Schleifen (> 100 Passes einer
  Komponente pro Batch) werden gemeldet und abgebrochen. Event-Tracking läuft pro
  Renderer (kein globaler Renderer). `EventCallback` re-rendert den Owner nach dem Handler
  (Blazor-Semantik).
- **Lifecycle** (`ComponentBase`, Blazors `SetParametersAsync`): Parameter werden zuerst
  gesetzt — ein nicht deklarierter Parameter (weder `@Parameter` noch `@CascadingParameter`,
  case-insensitiv, kein `captureUnmatchedValues`) wirft Blazors „Object of type 'X' does not
  have a property matching the name 'Y'" (Phase `lifecycle`; einzige Ausnahme bis 2.2: das
  vom Compiler immer emittierte `ValueExpression` wird verworfen). Dann beim ersten Mal
  `onInitialized`, danach `onParametersSet`, dann `stateHasChanged`. Synchrone Hooks laufen
  synchron weiter und rendern genau einmal, im Batch des Parents. Gibt ein Hook ein Promise
  zurück, wird sofort der Stand nach seinem synchronen Teil gerendert (Loading-State) und nach
  Abschluss weitergemacht: nach async `onInitialized` folgt `onParametersSet` + Render, nach
  async `onParametersSet` ein weiterer Render (`CallStateHasChangedOnAsyncCompletion`).
  Abweichung: Blazor spart den Zwischen-Render, wenn der Task synchron fertig war — ein
  JS-Promise lässt sich nicht synchron prüfen, ein `async`-Hook ohne echtes `await` rendert
  also einmal mehr. Fehler (sync oder Rejection) gehen an den Error-Hook, `waitUntilIdle`
  wartet auf laufende Hooks. `stateHasChanged` fordert höchstens einen Render an und fragt
  `shouldRender()` — außer vor dem ersten Render, der immer stattfindet (R5; HMR umgeht
  `shouldRender` wie Blazors Metadata-Update). `onAfterRender(firstRender)` läuft am
  Batch-Ende (vor den `onBatchCompleted`-Listenern) für jede Komponente mit committetem Pass,
  einmal pro Batch, **Kinder vor Parents** (tiefste zuerst, bei gleicher Tiefe
  Render-Reihenfolge), im Batch disposte Komponenten nicht; `firstRender` ist genau einmal pro
  Instanz `true`. Abweichung: Blazor ruft es pro Render-Eintrag in Render-Reihenfolge (bei
  einem neuen Teilbaum also Parent zuerst). Ein async `onAfterRender` wird getrackt, rendert
  danach nicht (Blazor), Fehler → Phase `afterRender`; `stateHasChanged` darin startet den
  nächsten Batch. **Disposal** wie Blazors Disposal-Queue: Parent vor Kindern (breadth-first),
  nach dem Pass, der sie entfernt; `disposeAsync` hat Vorrang (dann kein `dispose`, wie
  Blazor bei `IAsyncDisposable` + `IDisposable`), ein laufendes `disposeAsync` wird getrackt,
  Fehler → Phase `dispose`, die übrigen Disposals laufen weiter.
- **Cascading Values** (Blazors `CascadingParameterState`): ein Supplier ist jede Komponente
  mit `isCascadingValueSupplier` (`CascadingValue`, EditForm, CascadingAuthenticationState,
  Tabs, …). Matching wie `CanSupplyValue`: ohne Namen auf beiden Seiten by-type (statischer
  `cascadeType` oder Laufzeitwert), sonst by-name case-insensitiv; der nächste Supplier gewinnt.
  Cascades werden bei jedem Parameter-Set frisch aufgelöst; der Consumer abonniert jeden
  nicht-fixen Supplier, auf den er auflöst (`IsFixed` ⇒ kein Abo), und behält seinen letzten
  direkten Parameter-Snapshot. Vor jedem Render-Pass eines Suppliers prüft der Renderer
  `mayHaveChanged(vorheriger, aktueller cascadeValue)`; bei möglicher Änderung setzt er die
  Parameter aller Abonnenten direkt neu (Snapshot + frische Cascades) — Zwischenkomponenten
  mit `shouldRender() === false` halten das Update nicht auf. Dispose meldet ab.
- **Parameter-Change-Detection** (Blazors `ParameterView.DefinitelyEquals`): rendert ein
  Parent neu, bekommt ein behaltenes Kind nur dann `setParametersAsync`, wenn sich ein Parameter
  geändert haben kann — andere Namen/Reihenfolge oder ein Wert mit `mayHaveChanged` (Blazors
  `ChangeDetection`). Unverändert gelten nur gleiche Primitive (string, number, boolean, bigint,
  symbol; `Object.is`), `null`/`undefined` und `EventCallback`s mit gleichem Receiver + Delegate;
  Objekte, Arrays, Funktionen (jedes `ChildContent`) und `Date` gelten immer als geändert.
  Cascading-Werte laufen über die Subscription. Parameter-Metadaten (inkl. geerbter,
  case-gefalteter Namen, Capture-Property, Cascading-Liste) werden pro Klasse gecacht.
- **ComponentState/RenderHandle** spiegeln Blazor; `RenderHandle.track(promise)` nimmt
  in-flight Async-Arbeit auf, damit `waitUntilIdle` sie einschließt (z. B. Virtualize-Loads).

## Compiler

Pipeline: Markup-Tokens + TS-Span-Scan (balancierte Klammern, überspringt
Strings/Templates/Kommentare/Regex) → AST → Codegen. Der Compiler bleibt „dumm“ auf
TS-Ebene: `@code`-Blöcke sind wörtlich, Markup-Expressions, Attributwerte, Control-Header
und Statement-Läufe werden über den TS-AST umgeschrieben (`rewrite.ts`: syntaktischer Parse,
Scope-Kette, Member → `this.X`, C#-Konvention; Regel in
[language-reference.md](language-reference.md#member-und-freie-namen)). Die Global-Liste ist
aus TypeScripts `lib.es*`/`lib.dom`-Deklarationen generiert (`scripts/gen-globals.mjs`,
ein Test hält sie synchron).

Das **Vite-Plugin** ergänzt das, was Blazors Build (Roslyn) sonst leistet:

1. `_Imports.tsazor`-Kette + `@using` → `resolveComponent`/`resolveType` per Dateisystem,
2. Runtime-Built-ins als Markup-Tags (Blazors `Microsoft.AspNetCore.Components.Web`),
3. geerbte `@import`s der `_Imports`-Kette, relative Specifier auf die Datei umgeschrieben,
4. `virtual:tsazor-routes`-Manifest aus allen `@page`-Dateien.

### Import-Modell und Auflösung (A3)

Es gibt keine Import-Inferenz aus Bezeichnern. Ein freier Name in Markup/`@code` ist
entweder lokal, ein JS-Global, per `@import` gebunden (eigene Datei oder `_Imports`-Kette)
— oder ein Member (`this.X`). Die Auflösung lebt in `@tsazor/workspace`
(`createFileContext` + `resolutionOptions`) und wird identisch vom Vite-Plugin
(`transformTsazor`), den Library-Builds (`components`, `fluent`) und dem Language Server
(Shadow-Module, Diagnostics, Hover, Completions) benutzt:

- **`@import`**: der Compiler parst den Wert syntaktisch mit dem TS-Parser (TZS016 bei
  ungültiger Form) und emittiert ihn wörtlich (gemappt); geerbte Imports kommen als
  `inheritedImports` (nächste Ebene zuerst, bereits umgeschrieben) — die Datei überschattet
  die Kette, doppelte Bindungen/Side-Effect-Imports fallen weg. Die gebundenen Namen sind
  freie Namen im Expression-Rewriter — außer ein deklarierter Member (`@code`, Code-behind,
  `@inject`) heißt gleich.
- **Compiler-eigene Imports** bleiben generiert: `ComponentBase`, `RenderTreeBuilder`,
  `EventCallback`, `Parameter`/`CascadingParameter`/`inject` (wenn der Code sie braucht und
  kein `@import` sie bindet), Komponenten aus Tags und `@inject`-/`@inherits`-Typen. Der
  erzeugte Code selbst greift über hygienische Aliase zu (`… as __tsazor_EventCallback`,
  Builder-Parameter `__builder` wie Razor), damit weder ein `@import type` noch ein
  gleichnamiger Local kollidiert.
- **Default vs. Named** kommt aus dem tatsächlichen Export der Zieldatei
  (`scanModuleExports`, syntaktisch: Named-Export gleichen Namens, sonst Default;
  `.tsazor` ⇒ Default) — nie aus dem Dateinamen.
- **Tags**: explizit importiert ⇒ direkt; sonst umschließende Ordner (Datei, `_Imports`-Ebenen;
  nächster gewinnt), sonst alle `@using`-Quellen gemeinsam — Ordner, Runtime-Built-ins,
  Bare-Pakete. Ein Bare-Paket liefert nur Namen seiner **Export-Liste**: das Entry-Modul aus
  `package.json` (`exports["."]` → `module` → `main` → `types`) wird syntaktisch gelesen,
  relative `export *` werden verfolgt (kein separates Manifest nötig, die Library-Builds
  erzeugen ohnehin `dist/index.js` mit `export { default as X }`). Mehr als eine Quelle ⇒
  TZS017, keine ⇒ TZS005, fehlender `@using`-Ordner/-Paket ⇒ TZS018 (Warnung).
- Diagnostics einer `_Imports.tsazor` hängen an ihrer Ebene (`ImportsLayer.diagnostics`);
  das Plugin wirft ihre Fehler beim importierenden Modul und meldet Warnungen einmal.

## HMR (State-Retention)

Jede `.tsazor`-Datei akzeptiert ihre eigenen Updates:

```js
if (import.meta.hot) {
  import.meta.hot.data.previousDefault ??= Counter;
  import.meta.hot.accept((mod) => {
    const previous = import.meta.hot.data.previousDefault;
    import.meta.hot.data.previousDefault = mod.default;
    globalThis.__tsazor?.hmrSwap(previous, mod.default);
  });
}
```

`Renderer.hmrSwap(oldType, newType)` (aufgerufen über `createTsazorApp`):

1. findet alle ComponentStates mit dem alten Typ und setzt die neue Definition,
2. **behält die Instanz-Objekte**: Prototyp-Swap auf die neue Klasse; Felder, die der
   neue Konstruktor initialisiert und die alte Instanz nicht hat, werden von einer
   frischen Probe-Instanz übernommen (State-Retention),
3. triggert `stateHasChanged` — der neue `buildRenderTree` diffed das bestehende DOM.

Der Diff toleriert Hot-Swaps auch bei Parent-Re-Renders: Frames mit gleichem
Klassennamen, dessen Modul gehot-swapped wurde (`wasHmrSwapped`), werden statt neu
gemountet **in place** übernommen.

**Dokumentierte Grenzen:** Neue/entfernte `@page`-Routen brauchen ein Reload des
Route-Manifests (Dev-Server-Reload); Parameter-Additionen, die eine Neu-Instantiierung
erfordern, fallen auf Best-Effort zurück — bei unerwartetem Zustand Seite neu laden.

## Fehler-Overlay

Compiler-Fehler (`TZS001…` mit Position) werden vom Transform-Hook als located Error
geworfen — Vites Dev-Server zeigt sie im Standard-Overlay an; Warnungen erscheinen auf
der Konsole.