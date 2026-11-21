# Feedback aus einer Erst-Integration (2026-10-16)

**Kontext**: Erster Konsum von Tsazor durch einen Agenten ohne Vorkenntnisse —
und zusätzlich der erste **Standalone-Konsum von außerhalb des Monorepos**:
eine eigenständige Vite-App, die die Pakete per `link:` verbraucht.
Referenz-App: `apps/sleipnir-ticker`. Die gebaute Anwendung: eine
Rechnungs-Review-UI (Dashboard, Dokumentenliste mit Filtern, Review mit
PDF-Vorschau, Ingestion-Seite mit Live-SSE).

**Versionen**: `@tsazor/*` 1.0.0-next.1 (runtime, compiler, cli, vite-plugin,
bootstrap, ui), Node 25.2.1, pnpm 10.34.5, Vite 7.3.7, TypeScript 5.9.

---

## Was sich getragen hat

- **Die Compiler-Diagnosen sind die stärkste Eigenschaft des Frameworks.**
  73 Fehler beim ersten Check, und fast jeder brachte die fertige Lösung mit:
  `TZS021 „C# form — use '@foreach (const stand of …)'"`,
  `TZS024 „C# interpolated string … use a template literal"`,
  `TZS018` für ein nicht existierendes `@using`-Verzeichnis. 73 → 0 in einem
  Durchgang, ohne ein einziges Mal in die Doku zu müssen. Auf diesem Niveau
  ist ein Wechsel von Blazor/Razor realistisch möglich — das ist der Grund,
  warum ein Fremd-Integrator hier in einer Session produktiv wird.
- **`@inject` per Datei-Konvention** (`SteuerStore.ts`, Default-Export → Typ
  auflösbar): elegant, Blazor-treu, funktionierte sofort.
- **`_Imports.tsazor`-Vererbung** inkl. Rebase relativer Specifier über
  Ordnerebenen: funktioniert still und korrekt.
- **Komponentenbibliothek**: breit (60+ Komponenten), konsistenter
  Bootstrap-Skin, `additionalAttributes`-Pass-Through (class, id, aria) tut,
  was man erwartet. `Select`/`Switch`/`TextInput` als InputBase mit `@bind`
  sind genau richtig.
- **vite-plugin**: compile + `virtual:tsazor-routes` ohne Konfiguration;
  `tsazor check` als eigene Stufe vor `vite build` ist das richtige CI-Modell.

## Reibungspunkte (nach Hebelwert sortiert)

1. **Standalone-Konsum per `link:` ist der größte Schmerz vor der npm-
   Veröffentlichung.** Relative Tiefe des `link:`-Pfads falsch gesetzt →
   Fehler kamen erst indirekt (leeres `dist`-Resolve, fehlende Bins,
   unbekannte Module). Dazu: pnpm verschluckt die Build-Scripte von
   `esbuild` (nur via `onlyBuiltDependencies` sichtbar zu machen).
   **Vorschläge**: (a) npm publish hat auf der 1.0-Roadmap ohnehin Vorrang —
   das bestätigt diese Erfahrung; (b) bis dahin ein dokumentierter
   Kurzpfad „Tsazor außerhalb des Monorepos nutzen" (exakte link:-Anatomie +
   onlyBuiltDependencies + erwartbare Fehlerbilder), am besten als
   `create-tsazor`-Preset, das das Scaffolding inkl. Link-Verifikation macht.

2. **Geerbter `@import type` korrumpiert `@inject`.** Ein
   `@import type { SteuerStore } from "./SteuerStore"` im `_Imports.tsazor`
   führte dazu, dass `@inject SteuerStore Store` `this.Store` als `unknown`
   typisierte — die resolveType-Auflösung wurde offenbar vom geerbten
   Type-Only-Binding verdrängt, **ohne Diagnose**. Ohne die Zeile: alles
   korrekt (auflösbar per Datei-Konvention).
   **Nachstellen**: `_Imports.tsazor` mit `@import type { X } from "./X"` +
   Komponente mit `@inject X Y`.
   **Vorschlag**: Entweder resolveType gewinnt gegen geerbte Type-Imports,
   oder eine Diagnose („X ist als type-only importiert, @inject braucht den
   Wert") — idealerweise TZS-artig mit Fix-Vorschlag, wie man sie vom
   Compiler gewohnt ist.

3. **`TextInput` kennt kein `type="date"`** (`"text" | "password" | "email" |
   "search" | "tel" | "url"`). Für eine 1.0 mit Formularen wäre ein Datumstyp
   (ISO-Konvertierung, Validation) sinnvoll; Native-Input mit
   `@bind-value` ist ein brauchbarer Workaround, fühlt sich aber im Formular-
   Mix inkonsistent an.

4. **`@bind` auf verschachtelte Pfade**: Ich habe bewusst lokale Felder
   gebunden statt Store-Properties (`@bind="this.Store.filterYear"`), weil ich
   nicht verifizieren konnte, ob Pfad-Bindings auf fremden Objekten
   funktionieren. Falls ja: kurz dokumentieren; falls nein: eine Diagnose
   wäre wichtig, weil stummes Nicht-Binden ein Klassiker von Formular-Bugs
   ist.

5. **Kleinigkeit**: `$"…"` (C#-Interpolation) wird sauber als TZS024
   erkannt — der Fix-Vorschlag nannte „template literal", die richtige Form
   war im Attribut aber `Href="@(\`/review/${id}\`)"`, nicht `$\`…\``. Der
   Vorschlag könnte die konkrete Ziel-Syntax direkt zeigen.

## Was ich nicht bewerten konnte

HMR (Dev-Server lief, aber ohne Edit-Zyklen getestet), `@tsazor/testing`,
LSP/IDE-Integration (nur `tsazor check` genutzt), Fluent-Skin.

## Fazit

Technisch trägt das Framework heute schon: ein Fremd-Entwickler (bzw. Agent)
schreibt in einer Session von null auf eine produktiv bauende App mit Formularen,
Routen und Live-Daten — die Fehlermeldungen fangen einen dabei ab, statt zu
blockieren. Punkt 1 und 2 sind die beiden Hebel, die Erst-Integrationen von
„macht man nochmal" zu „empfehlt man weiter" bringen; 3 und 4 sind
1.0-Politur.