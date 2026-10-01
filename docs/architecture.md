# Architektur & HMR

## Render-Pfad (Blazor 1:1)

```
.tsazor  ──(Vite-Plugin: @tsazor/compiler)──►  TS-Modul
              export default class X extends ComponentBase {
                  buildRenderTree(__builder: RenderTreeBuilder): void { … }
              }
TS      ──(esbuild)──►  JS (Sourcemap-Kette Compiler → esbuild; Standard-Decorators gesenkt)
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
  Delegation existiert wegen der WASM-Bridge, die hier entfällt). Event-Modifier sind wie in
  Blazor eigene Attribut-Frames (`__internal_preventDefault_onclick`,
  `__internal_stopPropagation_onclick`, bool) und damit pro Render änderbar: sie setzen Flags
  des Listeners dieses Events (kein DOM-Attribut); ein Flag ohne Handler hält einen eigenen
  Listener (`@onsubmit:preventDefault`). Die statischen `EventHandlerFlags` von
  `addEventHandler` bleiben kompatibel und werden mit den Attribut-Flags verodert.
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
  Pass derselben Komponente diffed gegen den committeten Baum. Fehler sind pro
  Komponente isoliert (Phasen `render|diff|apply|lifecycle|afterRender|event|dispose|batch`):
  alles außer Dispose und Batch-internen Fehlern wird zuerst der nächsten Error-Boundary
  am logischen Parent-Kreis angeboten (siehe unten, **ErrorBoundary (3.1)**); ohne eine geht
  es an `renderer.errorHandler` (`{ error, component, phase }`, Default `console.error`); der
  Rest des Batches läuft weiter, der
  Live-Baum der fehlerhaften Komponente bleibt Diff-Basis. Render-Schleifen (> 100 Passes einer
  Komponente pro Batch) werden gemeldet und abgebrochen. Event-Tracking läuft pro
  Renderer (kein globaler Renderer). `EventCallback` re-rendert den Owner nach dem Handler
  (Blazor-Semantik).
- **ErrorBoundary (3.1):** die `ErrorBoundary`/`ErrorBoundaryBase`-Komponenten und das
  Renderer-Routing sind der Port von Blazors `HandleExceptionViaErrorBoundary`
  (Renderer.cs) + `ErrorBoundaryBase.cs` (Semantik Stand dotnet/aspnetcore main, Stand
  2026-10-01). `handleComponentError` geht alle Phasen außer `dispose` und `batch` (und ohne
  identifizierbare Komponente) entlang `state.parent` inkl. der Quelle selbst — ein Fehler im
  eigenen ErrorContent wird also wieder von der Boundary gefangen, begrenzt durch
  `maximumErrorCount`. Die erste gefundene Komponente mit `isErrorBoundary === true`
  (Tsazors IErrorBoundary-Marker, `isIErrorBoundary`) erhält den Fehler; vorher rendert der
  Renderer ihren nächsten Pass als leeren Baum (`state.forcedRenderFragment`, Blazors
  `AddToRenderQueue(boundary, empty)`) — der fehlgeschlagene Subtree wird dadurch diff- und
  dispose-technisch abgebaut, auch wenn eine eigene Unterkasse keinen Unterschied rendert —
  und danach wieder als eigener Output (ErrorContent). `handleException` zählt Fehler zwischen
  zwei Recoveries (`maximumErrorCount`, Default 100, Blazor); darüber hinaus wird der Fehler
  auf der Boundary-Stelle als fatal an den Error-Handler geroutet (Blazor rethrowt in
  `HandleException`, was in `HandleExceptionViaErrorBoundary` landet). `Recover()` wirkt nur
  im Fehlerzustand (Zähler-Reset + Rerender). Abweichungen (alle dokumentiert): kein
  `NavigationException` (nexist. in TS; Navigation ist synchron, kein Redirect-Ausnahme-Pfad),
  `ErrorContent`-Kontext ist `unknown` statt `Exception`, das `onError`-Logging-Hook loggt per
  `console.error` statt über einen injizierten `IErrorBoundaryLogger`, und ein fehlgeschlagenes
  async `onError` wird als unbehandelte Promise-Ablehnung sichtbar statt Blazors
  Exception-in-RenderFragment-Kaskade.
- **DynamicComponent (3.2):** Port von Blazors `DynamicComponent.cs` (Komponente, kein
  Renderer-Hook): `type`/`parameters` als Parameter, das Kind wird in `buildRenderTree` per
  `openComponent(0, toComponentDefinition(type))` geöffnet. Der `defineComponent`-Cache macht
  gleiche Typen zu identischen Definitionsobjekten, also normales Komponenten-Diffing: gleicher
  `Type` aktualisiert das Kind per Parameter-Neusetzung, ein `Type`-Wechsel ersetzt es (Dispose
  + neu). `instance` wird über den Component-Reference-Capture gesetzt (Blazor `Instance` —
  kein Parameter). Nur `Type`/`Parameters` werden akzeptiert; jeder andere Parameter wirft
  Blazors „does not accept a parameter with the name
  'X'" in `applyParameterValues` (vor der Zuweisung), ein null-`Type` Blazors „requires a
  non-null value for the parameter Type." (nach ihr — Blazors Reihenfolge). Im Markup fängt
  TZS025 (2.1-Metadaten) den Fall statisch.
- **Lifecycle** (`ComponentBase`, Blazors `SetParametersAsync`): Parameter werden zuerst
  gesetzt — ein nicht deklarierter Parameter (weder `@Parameter` noch `@CascadingParameter`,
  case-insensitiv, kein `captureUnmatchedValues`) wirft Blazors „Object of type 'X' does not
  have a property matching the name 'Y'" (Phase `lifecycle`; der Compiler meldet ihn seit 2.2
  schon statisch, TZS025, und emittiert `ValueExpression` nur, wenn deklariert). Dann beim ersten Mal
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
- **Parameter-Metadaten (Standard-Decorators, TC39):** `@Parameter(options?)` und
  `@CascadingParameter(options?)` sind Field-Decorators (auch auf `accessor`-Feldern und
  Settern; `static`/`#private` ⇒ Fehler). Sie tragen den Member in die Decorator-Metadaten
  der Klasse ein (`context.metadata`, von der Sprache als `Klasse[Symbol.metadata]`
  veröffentlicht) — unter einem privaten Schlüssel, **eine eigene Map pro Klasse**; die
  Metadaten-Objekte erben prototypisch wie die Klassen, geschrieben wird nur in die eigene.
  Gelesen wird über die Klassenkette (`getParameterInfo`: Basis zuerst, eine Neudeklaration in
  der abgeleiteten Klasse gewinnt; `getOwnParameterMetadata` liefert nur die eigenen), das
  Ergebnis wird pro Klasse gecacht (B6). Decorators laufen während der Klassendefinition, also
  bevor irgendetwas die Metadaten lesen kann — sie invalidieren den Cache nicht; nur
  `defineParameter(Klasse, name, options)` (handgeschriebene Komponenten ohne
  Decorator-Syntax, Tests) tut das. **Polyfill:** `Symbol.metadata` fehlt in Browsern noch;
  `parameter-metadata.ts` setzt es auf `Symbol.for("Symbol.metadata")` (das Symbol, auf das
  auch esbuilds Decorator-Helfer zurückfallen). tscs Emit legt `context.metadata` nur an, wenn
  `Symbol.metadata` bei der Klassendefinition existiert — die Reihenfolge garantiert ESM: jede
  dekorierte Klasse importiert die Decorators aus diesem Modul, und es importiert selbst nichts
  (Blatt, kein Zyklus möglich), wird also vorher ausgewertet. Es ist das einzige Modul mit
  Seiteneffekt (`"sideEffects"` im Runtime-Paket), ungenutzte Built-ins fallen im Bundle weg.
  Ein Legacy-Aufruf (`experimentalDecorators`) wirft mit Hinweis.
- **Klassenfelder (`[[Define]]`, TS-Default ab ES2022):** jedes deklarierte Feld wird per
  `defineProperty` auf der Instanz angelegt, auch ohne Initializer (dann `undefined`).
  Folgen, auf die Runtime und Compiler achten: Feld-Initializer laufen im Konstruktor
  (`inject()` löst daher aus dem Service-Kontext auf, den der Renderer um die Instanziierung
  aktiviert — `withServices`); ein Feld in einer abgeleiteten Klasse überschattet einen
  Accessor gleichen Namens der Basis (statt wie bei `[[Set]]` den Setter zu rufen) und ein
  Feld ohne Initializer setzt den Basiswert auf `undefined` — eine reine Typ-Neudeklaration
  schreibt man `declare x: T` (TS meldet sonst TS2612/TS2610 im Editor). Die generierte Klasse
  deklariert selbst nur `@inject`-Felder und die `@code`-Member, nie Felder der
  Code-behind-Klasse.
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
4. `virtual:tsazor-routes`-Manifest aus allen `@page`-Dateien,
5. Parameter-Metadaten der Ziel-Komponenten (`resolveComponentMetadata`, 2.1).

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

### Parameter-Metadaten (2.1)

Statische, rein syntaktische Beschreibung der Parameter jeder Komponente — das
Gegenstück zu den Laufzeit-Metadaten der Decorators (`getParameterInfo`), ohne
Type-Checker. Zwei Schritte:

1. **Extraktion pro Datei** (`@tsazor/compiler`, `metadata.ts`):
   `extractTsazorMetadata` (`.tsazor`: `@code`-Member der generierten Klasse,
   `@typeparam`, Basis = Code-behind-Klasse ⇒ `@inherits` ⇒ `ComponentBase`, wie
   der Compiler; eigene + geerbte `@import`s) und `extractModuleMetadata`
   (`.ts`: alle Klassen, Imports, lokale Typ-Aliase, Exporte/Re-Exporte,
   `defineParameter(K, "x", …)`-Aufrufe). Parameter sind `@Parameter(…)`/
   `@CascadingParameter(…)` auf Feldern, `accessor`-Feldern und Settern, deren
   Decorator an den Runtime-Export gebunden ist (auch umbenannt oder über
   `* as rt`); `static`/`#private` zählen nicht (die Runtime wirft dort). Namen,
   die der Compiler selbst importiert (`Parameter`, `CascadingParameter`,
   `EventCallback`, `RenderFragment`, `ComponentBase`), gelten in `.tsazor` ohne
   `@import` als Runtime-Namen.
2. **Auflösung** (`resolveComponentMetadata` über einen `MetadataHost`): die
   Basisklassen-Kette wird wie in der Runtime geflacht — Basis zuerst, eine
   Neudeklaration gewinnt auf dem Platz der Basis (Map-Semantik) —, über relative
   `.ts`/`.tsazor`-Dateien, die Code-behind-Datei und für `@tsazor/runtime`- bzw.
   Paket-Basen über deren Manifest. Typargumente der Basis werden eingesetzt
   (`extends InputBase<string>` ⇒ `Value: string`, Kategorie `string`).

Pro Parameter (`ComponentParameter`): `name`, `category`, `typeArgument`
(`T` von `EventCallback<T>` bzw. Kontexttyp von `RenderFragment<T>`), `type`
(Annotation als Quelltext), `inferredType` (Literal-Initializer ohne
Annotation), `optional` (`?:` oder `| undefined`), `hasInitializer`, `member`
(`field`/`accessor`/`setter`), `cascading` (`name`, `type` als Quelltext), `doc`
(JSDoc), `declaredBy`, `uncertain` und `references` — die Bindung jedes
Wurzel-Bezeichners im Typ (`runtime`, `import` mit Specifier + Datei, `local`,
`typeParameter`, `global`), also der Import-Kontext, mit dem 2.4 den Typ im Shadow
referenzieren kann. Pro Komponente: `typeParameters` (Name, Constraint, Default),
`base`, `isComponent` (Kette erreicht `ComponentBase`), `abstract`, `incomplete`
(Basis nicht auflösbar).

**Kategorien** (aus der Annotation, Klammern und `null`/`undefined` in Unions
entfernt): `string` — `string`, String-Literal-/Template-Literal-Typen oder eine
Union, die einen davon enthält (`"a" | "b"`, `string | number`: ein statischer
Attributwert bleibt ein gültiger String); `EventCallback` / `EventCallback<T>` —
der Runtime-Export, auch in einer Union (`EventCallback<X> | ((x) => void)`);
`RenderFragment`; `RenderFragment<T>` — Funktionstyp `(ctx: T) => RenderFragment`
(Tsazors Schreibweise) oder eine generische `RenderFragment<T>`-Referenz;
`captureUnmatchedValues` — aus der Decorator-Option; sonst `value` (Delegates
wie `(e) => void` sind Werte, wie Blazors `Action<T>`, mit `delegate: true` — eine
Method-Group darauf wird gebunden). Typ-Aliase werden
verfolgt — lokal und über relative Imports inkl. Re-Exporten, generische Aliase
mit eingesetzten Argumenten. Ohne Annotation entscheidet ein Literal-Initializer
(`href = ""` ⇒ `string`).

**Ohne Checker nicht entscheidbar** (Kategorie `value`, `uncertain: true`):
Typen aus Bare-Paketen außer der Runtime (z. B. ein Alias in einer Fremd-
Bibliothek), nicht auflösbare relative Imports, nicht-literale Initializer ohne
Annotation (`label = defaultLabel()`). Bedingte, gemappte und Indexzugriffs-Typen sowie Typparameter
(`TItem`, ohne Einsetzung) sind `value` — sicher genug, weil ein Attribut auf
einem solchen Parameter ein Ausdruck sein muss. Der Typ von `typeArgument` ist
Quelltext im Scope, in dem er steht (bei einem Alias: dessen Modul).

**Auflösung im Resolver:** `FileContext.resolveComponentMetadata(tag, usings,
imports?)` liefert die Metadaten der Zielkomponente — dieselbe Auflösung wie
`resolveComponent` (`@import`-Bindung zuerst, dann Ordner, `@using`-Quellen,
Runtime-Built-ins, Pakete); `resolutionOptions` reicht sie als
`CompileOptions.resolveComponentMetadata` an Compiler, Plugin, Library-Builds und
LSP. Seit 2.2 senkt die Codegen Komponenten-Attribute danach ab (Kategorie des
Parameters, TZS025/TZS026 — [language-reference.md](language-reference.md#komponenten-attribute-nach-parametertyp)).

**Manifeste:** `@tsazor/runtime`, `@tsazor/components` und `@tsazor/fluent`
erzeugen beim Build `dist/tsazor-components.json` (`{ tsazorComponentManifest: 1,
package, components: { Tag: ComponentMetadata } }`, Parameter bereits geflacht,
Pfade paketrelativ; `package.json` → `tsazor.components` und Export
`./tsazor-components.json`) mit demselben Extraktor
(`buildPackageManifest`/`buildRuntimeManifest`). Konsumenten lesen das Manifest
statt Quellen zu parsen. Das Runtime-Manifest ist zusätzlich in
`@tsazor/workspace` eingebettet (`runtime-manifest.generated.ts`, erzeugt von
`scripts/gen-runtime-manifest.mjs`), damit Built-ins ohne installierte Runtime
bekannt sind (gebündelter Language Server, temporäre Workspaces);
`RUNTIME_COMPONENTS` ist daraus abgeleitet (konkrete Komponenten),
`RUNTIME_COMPONENT_PARAMS` entfällt. Tests halten das eingebettete Manifest
synchron zu den Runtime-Quellen und zu `getParameterInfo` jedes Built-ins (Namen,
Reihenfolge, Capture, Cascading-Optionen).

**Cache und Abhängigkeiten** (`MetadataCache`, geteilt als
`defaultMetadataCache`): Modul-Einträge pro Datei, gestempelt mit mtime+Größe der
Datei, bei `.tsazor` auch der Code-behind-Datei (auch solange sie fehlt) und der
`_Imports`-Ebenen; aufgelöste Komponenten gestempelt mit allen Dateien der
Basiskette und gelesenen Paket-Manifesten. Ein Eintrag gilt, solange alle Stempel
passen — eine Änderung an Komponente, Code-behind oder Basis löst genau die
abhängigen Einträge neu auf. Für 4.1 (HMR) liegen die Kanten offen:
`dependenciesOf(file)`, `dependentsOf(file)` (Rückwärtskanten) und
`invalidate(file)`. Grenze: eine neu angelegte `_Imports.tsazor` oberhalb
invalidiert nicht von selbst (4.1 ruft `invalidate`).

### MarkupString (3.3)

Blazors `MarkupString` (rohes HTML): die Runtime-Klasse `MarkupString` (`value`, `toString`) —
`RenderTreeBuilder.addContent` entpackt Instanzen in Markup-Frames (Blazors
`AddContent(MarkupString)`), der Diff vergleicht den `markupContent`-Text wie Blazor. Im
Compiler erkennt der Markup-Expression-Knoten (`markupStringContent`) `new MarkupString(inner)`
und `inner as MarkupString` (Pendant zu C#s `(MarkupString)s`) per TS-Parser und emittiert
direkt `addMarkupContent(seq, inner)` — kein Instanz-Objekt, der gebackene Ausdruck ist der
Wert. Die Erkennung bindet an `collectImports` (neu: `runtimeBoundNames`, local → exportierter
Name je Modul-Specifier), damit nur der Name der `@tsazor/runtime` umgeschrieben wird —
 Umbenennungen (`as Raw`) zählen mit, ein gleichnamiger lokaler Typ niemals.
Gewöhnliche `@`-Ausdrücke bleiben escaped (Blazor).

### Templated Components (2.3)

Slot vs. Komponente wird **vor** der Tag-Auflösung aus den Metadaten des
Elternteils entschieden (`classifyChildContent` in codegen.ts): ein direktes
Kind, das einen `RenderFragment`-/`RenderFragment<T>`-Parameter der
übergeordneten Komponente benennt, ist ein Child-Content-Element (`slotElements`),
auch wenn eine gleichnamige Komponente existiert — Razor rewrites einen
`ChildContent`-Tag-Helper am Elternteil (`ComponentLoweringPass`) vor dem
Component-Fallback. Ohne Eltern-Metadaten bleibt alles 2.2-Verhalten; unaufgelöste
Großbuchstaben-Tags, die wie Slots aussehen, bekommen hier TZS025/TZS027/TZS028
(wobei TZS005 entfällt). Die Emission (`emitComponent`/`emitFragment`) setzt jeden
Slot per `addAttribute` unter dem kanonischen Parameternamen;
`RenderFragment<T>` wird zu `(context) => (__builder) => {…}` — der Kontextname
kommt vom Slot-`Context`, sonst vom Komponenten-`Context` (Schablonen-Attribut,
wie Razor RZ10002 konsumiert), sonst `context` — und als Body-lokal registriert;
der `@context`-Bind-Schutz kennt die Art `context`. Typargument-Attribute der
`@typeparam`s (`TItem="Person"`) werden konsumiert und ihr Wert per
`typeSyntaxError` (rewrite.ts) auf einen TS-Typ geprüft. Whitespace zwischen Slots
ist kein Content; lose Inhalte neben Slots, doppelte Slots, unbekannte
Slot-Attribute und Nicht-Fragment-Parameter als Element sind TZS027/TZS028 —
Meldungstexte folgen Razors ComponentDiagnosticFactory (RZ9995–RZ9999/RZ10002).

### Typisierte Shadows, Type-Service und tsazor check (2.4)

Der Type-Service (`@tsazor/lsp`, ts-service.ts) kompiliert jede `.tsazor` zu einem
**Shadow-Modul** `<dir>/<Name>.tsazor.gen.ts` — virtuell (In-Memory-Programm, nie auf
der Platte). Der Shadow ist der generierte TS-Code plus Typ-Emission: `satisfies`-
Prop-Prüfungen je Komponenten-Tag (Value/`string`-Kategorien, Metadaten aus dem
Package-Manifest), typisierte Slot-Kontexte aus `RenderFragment<T>`-`typeArgument`,
Element-`@ref` per `HTML/SVGElementTagNameMap`-Cast und Komponenten-`@ref` per
`ComponentReferenceCapture`, Runtime-Kurz-refs über hygienische
`alias()`-Namen, Import-Typen über den `rebaseTypeImport`-Hook. `TItem`-Inferenz
läuft über die Typschicht (4-Pass-`buildEntry`: erst kompilieren, dann `typedInference`-
Requests je Tag-Position unify-en, exakt oder via `TItem[]`). Shadows einer Komponente
exportieren die Klasse zusätzlich per Name — Rewrite-B-named-Imports
(`@tsazor/fluent`) lösen gegen die Schatten auf; Schatten von
Paket-`.tsazor`-Abhängigen stellt der Service automatisch sicher (Cascade über
Paketgrenzen, cycle-guarded).

Der Check (`check.ts` in `@tsazor/lsp`) läuft in zwei Durchläufen: Pass 1
Compiler-Diagnosen + Shadow-Bau **aller** `.tsazor` unter dem Projektroot (T4 — auch
nicht geöffnete Dateien), Pass 2 TypeScript-Diagnosen über den kompletten
Schatten-Graphen. `@tsazor/cli` packt das als `tsazor check [root]` (Exit 1 bei
Fehlern), das Vite-Plugin als `check: true` ans Build-Ende. Pro Komponente schreibt
`componentTypeDeclarations` (workspace/metadata.ts) aus dem Package-Manifest ein echtes
`dist/<Name>.d.ts` (eigene Parameter mit Doc-Kommentar, generisches `@inherits` als
Klassen-Generikum, Runtime-Typen via `@tsazor/runtime`-Import); Ambient-Deklarationen
für `*.tsazor` und `virtual:tsazor-routes` liefert `@tsazor/vite-plugin/client`. Details:
[design-2.4-typed-checks.md](design-2.4-typed-checks.md).

### LSP projektweit, Slots und Codemod (2.5)

**Project-Routing über alle Workspace-Folder.** Der Language Server baut eine
`ProjectRegistry` (`packages/lsp/src/projects.ts`) über jeden Workspace-Folder; eine Datei
gehört zum Projekt der **nächsten** `tsconfig.json` oberhalb ihrer (keine tsconfig ⇒ das
Folder-Root — früher: pauschal `workspaceFolders[0]`, was die App-Optionen einer Multi-App-Mappe
verfälschte). Schlüssel-Konvention: **Projekt**-Keys sind `` `${root}|${config}` `` — derselbe
tsconfig an zwei Roots ist zweimal eigenständig; **Datei**-Keys sind posix-Pfad **+ lowercase**
(getrimmt auf Windows-Groß/Klein), die Registry vergleicht nur diese Keys. `didChangeWatchedFiles`
wird dynamisch nach Initialized registriert (`**/*.tsazor`, `**/tsconfig.json`): Create/Change
frischen den Disk-Shadow und re-checken die Dependents (`dependentsOf` aus dem 2.4-Import-Graph),
Delete entfernt den Shadow; tsconfig-Change baut das besitzende Projekt neu (Compiler-Optionen und
Lib-Auflösung) und re-publish alle offenen Dokumente. Nach jedem Edit einer offenen Datei wird ihr
eigenes Shadow zuerst rebuilt, danach die Dependents re-publish — deren Cache ist geworfen, denn
auch ihre Komponenten-Metadaten hängen an der Änderung. Die v1-Analyse jeder offenen Datei
kompiliert weiter lokal (`registry.rootOf` als Import-Root — der Workspace-Folder, so wie
der Build das Projekt sieht); das TS-Layer kommt per `registry.projectFor`.

**Slots als eigenes Klassifikations-Modul** (`packages/lsp/src/slots.ts`). Die LSP-Features
(Hover, Completion) brauchen dieselbe Slot-Logik wie der Compiler (2.3): eine Ancestor-Kette
(`chainAt`, äußerst→innerst am Cursor), Fragment-Parameter nur vom **direkten** Parent
(`fragmentParametersOfParent` — `<Row>` unterhalb eines Nicht-Parents ist TZS027, nicht ein Slot),
und der Kontext-Name durch einen Walk **innen→außen** (eigener `Context=`-Wert vor dem des Slots
vor dem Default `context`; nur `RenderFragment<T>`-Parameter und ein generisches
`ChildContent` als Loose-Inhalt bekommen eine Kontext-Variable). Hover an einem Slot-Tag spricht vom Slot statt von einer
Komponente gleichen Namens; die Completion schattet Slot-Tags über Komponenten (die gleiche
Bindungs-Reihenfolge, die der TZS025-Umbenennungsfix verlangt). Slot-Body-Kandidaten bleiben aus
Completion außen vor (TZS027-Nestings).

**Codemod-Kern im Compiler** (`@tsazor/compiler`, `src/codemod.ts`). `codemodSource` läuft die
A7-`fix`-Payloads zum Fixpunkt (max. 8 Passes) und re-schreibt daneben die PascalCase-API-Formen
im Markup (`.ToString()/.Length/.ToLower()/.ToUpper()` — außerhalb `@code`/`@functions`, deren
Blanks sich `markupRegions`/`blankCodeBlocks` merken). Pro Pass werden Fix-Edits und API-Formen
auf demselben Stand berechnet und gemeinsam via `applyTextEdits` (absteigend) angewandt — Fix
gewinnt jede Überlappung, die API-Form folgt im nächsten Pass; ein Crash startet einen
Blank-Re-Lauf (Positionen bleiben, Fixes adressieren das Original). Konsument ist
`tsazor codemod <path> [--write]` (`@tsazor/cli`, dry-run default, `.tsazor` neben `.razor`);
dieselben Formen sind die LSP-Quick-Fixes. Regeln: [language-reference.md](language-reference.md#codemod-razor--tsazor-25).

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
   frischen Probe-Instanz übernommen (State-Retention). Mit `[[Define]]`-Feldern ist jedes
   deklarierte Feld eine eigene Property — auch ohne Initializer; ein Feld, das die neue
   Version zum Getter/Setter gemacht hat, wird deshalb von der Instanz entfernt (sonst
   überschattete es den Accessor). Die Parameter-Metadaten kommen nach dem Swap aus der
   neuen Klasse,
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