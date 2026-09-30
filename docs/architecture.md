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
  die Edits an (Sibling-Index → DOM-Knoten per Vorwärts-Cursor; Komponenten- und
  Markup-Ausgaben sind Kommentar-begrenzte Bereiche, die als Einheit verschoben/entfernt
  werden). Direkte DOM-Patches (keine Zwischen-VDOM), Property-first
  für `value`/`checked`, Event-Listener direkt am Knoten (bewusst: Blazors Delegation
  existiert wegen der WASM-Bridge, die hier entfällt).
- **Dispatcher/Batching:** Microtask-Flush; `EventCallback` re-rendert den Owner nach
  dem Handler (Blazor-Semantik). Async-Lifecycle-Hooks rendern nach jedem await-Abschnitt.
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