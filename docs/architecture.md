# Architektur & HMR

## Render-Pfad (Blazor 1:1)

```
.tsazor  ──(Vite-Plugin: @tsazor/compiler)──►  TS-Modul
              export default class X extends ComponentBase {
                  buildRenderTree(b: RenderTreeBuilder): void { … }
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
  (Blazor-Semantik). Async-Lifecycle-Hooks: siehe B4 (R6).
- **ComponentState/RenderHandle** spiegeln Blazor; `RenderHandle.track(promise)` nimmt
  in-flight Async-Arbeit auf, damit `waitUntilIdle` sie einschließt (z. B. Virtualize-Loads).

## Compiler

Pipeline: Markup-Tokens + TS-Span-Scan (balancierte Klammern, überspringt
Strings/Templates/Kommentare/Regex) → AST → Codegen. Der Compiler bleibt „dumm“ auf
TS-Ebene: `@code`-Blöcke sind wörtlich, Markup-Expressions werden minimal umgeschrieben
(bare Identifier → `this.X`, C#-Konvention).

Das **Vite-Plugin** ergänzt das, was Blazors Build (Roslyn) sonst leistet:

1. `_Imports.tsazor`-Kette + `@using` → `resolveComponent`/`resolveType` per Dateisystem,
2. Runtime-Built-ins als Markup-Tags (Blazors `Microsoft.AspNetCore.Components.Web`),
3. Import-Ermittlung für PascalCase-Identifer in `@code` (z. B. `Parameter`-Dekorator,
   `EventCallback`, lokale Komponentenklassen) — zweistufig: Pass 1 listet die vom
   Compiler selbst erzeugten Imports, Pass 2 ergänzt die Restlichen,
4. `virtual:tsazor-routes`-Manifest aus allen `@page`-Dateien.

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