# 2.4 — Typisierte Prüfungen: Entwurf

Ziel (Roadmap 2.4): Der Typ-Layer (Shadow-Module) prüft die Komponenten-Verwendung —
Attributwerte gegen Parametertypen, Slot-Kontexte gegen `RenderFragment<T>`,
`@ref` gegen den Ziel-Typ — und die Typen wandern durch den Shadow-Graph auch aus
geschlossenen Dateien. `tsazor check` macht die Prüfungen zum Gate (nichtnull Exit).

## 1. Compiler — Schatten-Emission (`typedShadow`)

`CompileOptions.typedShadow` aktiviert schatten-exclusive Emission; echte Builds
bleiben byte-identisch, außer der `@ref`-Form:

- **Attribut-Wert-Checks** (T2, „`<Greeter Name="@(123)" Nmae="typo"/>` → 0
  Diagnostik“): Wert-Attribute bekannter Parameter (Kategorien `value`/`string`,
  nicht `uncertain`, Metadaten vollständig) emittieren
  `__builder.addAttribute(seq, "Name", (Wert) satisfies Typ)`. Die Prüfung läuft
  über den Shadow-TS-Zyklus zurück in die Quelle; `Nmae` ist TZS025 (2.2),
  der Wert-Verstoß kommt als TS-Diagnostik durch die LSP/CLI-Schicht.
  Optionale Parameter erhalten `Typ | undefined`. Typ-Text = substituierte
  Parameter-Annotation aus den 2.1-Metadaten; unbekannte/unsichere Typen werden
  nicht geprüft (TZS026-Warnung bleibt).
- **Slot-Kontexttypen**: `RenderFragment<T>` emittiert
  `(context: Person) => (_builder) => …` statt `(context: any) => …`. Der Typ
  kommt aus `parameter.typeArgument` (neu wie `type` mit `references` berechnet),
  substituiert mit den Typ-Argumenten des Tags. Unauflösbar ⇒ unverändert `any`.
- **Typ-Imports** (2.1-Rest): Referenzen der Parametertypen landen als
  `import type …` im Schatten — `runtime` über den Runtime-Import-Alias,
  `import` über einen `rebaseSpecifier`-Hook aus `@tsazor/workspace`
  (deklarierendes Modul + Spezifier → vom nutzenden Modul auflösbaren Import),
  `local` ⇒ Parameter ungeprüft (der Typ ist aus dem fremden Modul nicht
  importierbar).
- **`@ref`-Typen** (TS2740-False-Positive): Elemente emittieren
  `this.x = el as HTMLElementTagNameMap[tag]` (SVG analog; unbekannte Tags ohne
  Cast), Komponenten `addComponentReferenceCapture(seq, (c) => { this.x = c as Typ; })`.

## 2. Runtime — Komponenten-`@ref` fängt die Instanz

Echtes Blazor-Verhalten: `@ref` an einer Komponente liefert die Instanz, nicht
das Elternelement (bislang feuerte die Capture-Aktion an Komponenten-Frames gar
nicht). Neu: `FrameType.ComponentReferenceCapture`,
`RenderTreeBuilder.addComponentReferenceCapture(sequence, action)`, der Renderer
feuert die Captures frisch erstellter Komponenten mit der Instanz. Der Codegen
wechselt für `@ref` an Komponenten-Tags auf die neue API — auch im echten Build
(DOM-Semantik unverändert, der Cast wird ausgestrichen).

## 3. LSP — Typ-Layer für alle Projektdateien (T4)

Der Shadow-Graph hält die Schatten aller `.tsazor` des Projekts, nicht nur der
offenen Dokumente: Scan beim Initialize, vor jedem Publish aktualisiert,
`didChangeWatchedFiles` hält neu erstellte/löschbare Dateien aktuell. Damit
wird `<Greeter @ref="g"/>` gegen die Quelle geschlosener Komponenten geprüft.

## 4. `TItem`-Inferenz über Typen

Der Type-Service ermittelt für generische Tags ohne vollständige explizite
Typ-Argumente den Typ des Attributwerts, dessen Parametertyp den Typparameter
nutzt (exakt oder als Array), aus dem TS-Programm und prüft gegen die
substituierte Varianten-Schatten. Ohne Auflösung bleibt alles wie bisher
(Kontext `any`, Parameter ungeprüft) — keine False Positives.

## 5. CLI `tsazor check` (T1) — `@tsazor/cli`

`tsazor check [root]`: kompiliert jedes `.tsazor` des Projekts (Compiler-Diagnostik)
und lädt alle Schatten in einen `TsazorTypeService` (TS-Syntax- und Semantik-
Diagnostik, gefiltert wie die LSP-Schicht). Ausgabe `file(line,column) code message`,
Exit 1 bei Fehlern, sonst 0. Das Vite-Plugin erhält `check: true` (Build-Ende).

## 6. Paket-Typen

`@tsazor/fluent` und `@tsazor/components` bauen pro Komponente ein `.d.ts` mit
typisierten Parametern (aus dem Manifest) statt `export const X: any`. Ambient-
Typen für `*.tsazor` und `virtual:tsazor-routes` ziehen in
`@tsazor/vite-plugin/client` — die kopierten `types.d.ts` der Apps entfallen.
`tsazor check` kommt in die Gate-Scripts jeder App.