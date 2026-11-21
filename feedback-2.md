# Feedback Runde 2 — Betriebs- und Wartungsphase (2026-10-16)

**Kontext**: Fortsetzung von `feedback.md`, gleiche Anwendung (Steuer-Review-UI,
inzwischen 6 Seiten: Dashboard, Documents mit Filter/Sortierung/Export,
Review, Ingestion mit Live-SSE, Warteschlange neu). Runde 1 war null → App;
Runde 2 war drei Featurezyklen auf bestehendem Gerüst plus ein neues
SSE-Live-Layout — dort zeigt sich, ob ein Framework wartbar bleibt.

**Versionen**: unverändert (`@tsazor/*` 1.0.0-next.1, Vite 7.3.7, TS 5.9).

---

## Was sich in Runde 2 getragen hat

- **Das Store-Muster (`observe(this.Store)`) trägt Wachstum.** Die neue
  Warteschlangen-Seite mischt Kachel-KPIs, Live-SSE (progressLog je Quelle)
  und eine persistente Lauf-Historie — komplett über denselben Store-Mechanis-
  mus wie die ersten Seiten, ohne dass das Muster an einer Stelle gedehnt
  wurde. `this.observe(this.Store)` skaliert über den Erstkontakt hinaus.
- **`@inject NavigationManager` + `navigateTo`**: identisch zu Blazor, null
  Überraschung. Die Finding-Buttons des Dashboards (je Befundtyp in eine
  andere Seite mit vorgesetzten Filtern) waren reine Domänenlogik.
- **Komponenten bei Repetition**: Eine dritte Liste (Lauf-Historie) mit
  Tabelle/Badges/Kacheln war Copy-Paste-and-Adjust vom bestehenden Layout —
  die Komponenten greifen konsistent ineinander, kein Stilbruch.
- **`tsazor check` als Gate hat drei Bugs gefangen, die der Browser still
  geschluckt hätte** (u. a. ein verlorener `this.`-Kontext in einer
  Callback-Zuweisung). Der Compiler ist das Produkt.

## Reibungspunkte Runde 2 (nach Hebelwert sortiert)

1. **Import-Auflösung ist je nach Dateityp unterschiedlich — und das ist
   stumm.** `@import type { … } from "…"` in einer **Page**-Datei resolvt
   relativ zur Page (`Pages/Queue.tsazor` braucht `../SteuerStore`, nicht
   `./SteuerStore`), während geerbte `_Imports`-Inhalte ab `src/` gelten.
   Der Fehler war ein roher `TS2307` ohne Hinweis auf das Basisverzeichnis.
   **Vorschlag**: Eine TZS-Diagnose für TS2307 in `.tsazor`-Dateien, die
   anbietet, den Specifier auf die relevante Basis umzuschreiben — analog
   zum Resolver-Output von TZS018 (`@using`). Alternativ (radikaler):
   Specifier in `.tsazor` immer ab Anwendungs-`src/` auflösen und geerbte
   relative Pfade rebasen — dasselbe Prinzip, das `_Imports` schon heute
   korrekt macht.

2. **`@bind` braucht ein dokumentiertes „immediate"-Gesicht.** Wir haben
   alle Filter der Documents-Seite von „Wert wählen → Filtern-Klick" auf
   Sofort-Anwendung umgebaut — und dafür jede `@bind`-Nutzung auf
   `Value`/`ValueChanged` umschreiben müssen, weil nicht klar war, wie man
   @bind zu `oninput`/sofortiger Reaktion bewegt. Blazor löst das mit
   `@bind:event="oninput"`. **Vorschlag**: (a) `@bind:event`-Äquivalent
   dokumentieren oder ergänzen, (b) falls es das längst gibt: in die
   Diagnose-Antwort von TZS-Meldungen rund um `@bind` aufnehmen — genau da
   sucht man, wenn ein Formular „zu träge" wirkt.

3. **Generierte Client-Properties sind optional — Narrowing-Falle.** Aus
   `contentBase64?: string | null` des Sleipnir-Clients folgt: `=== null`
   verfehlt `undefined`. Runde 1 hat das für die Nullability gelobt (zu
   Recht!), aber der Alltagstipp „immer `== null` prüfen" steht nirgends
   dort, wo er gebraucht wird. **Vorschlag**: Wenn es ohnehin ein
   Sleipnir-Codegen ist, der optional-Properties emittiert — eine kurze
   „Arbeiten mit generierten Typen"-Sektion in die Tsazor-Doku (oder ein
   Codegen-Kommentar im Header der generierten Datei). Zwei Zeichen
   Unterschied, eine halbe Stunde Debugging, wenn man sie nicht kennt.

4. **Kleinigkeit — Fehlermeldung statt Rat**: Ein Tippfehler in einem
   geerbten `@import`-Specifier (SteuerStore vs. Store) meldete sich als
   „unknown type" im @inject-Kontext statt als „cannot resolve import
   '…/SteuerStore'". Der import-Spezifier stand nirgends in der Meldung.
   Diagnosen, die den fehlgeschlagenen Specifier nennen, sparen das
   Augen-Suchen im Dateikopf.

## Nicht bewertet

HMR (auch Runde 2 ohne Edit-Zyklus-Test im Vite-Dev), Fluent-Skin,
`@tsazor/testing`, LSP-Integration.

## Fazit

Runde 2 bestätigt: Der Wert sitzt im Compiler — drei Featurezyklen ohne ein
einziges Debugging im Browser, weil `tsazor check` die Klasse von Fehlern
fängt, die sonst Laufzeit werden. Die Hebel liegen jetzt in der
**Konsistenz der Auflösungs-Regeln** (1): ob Page-relativ oder src-relativ
ist egal — aber es muss einerlei sein und bei Fehlern den verwendeten
Spezifier nennen. Punkt 2 ist der häufigste UX-Wunsch im Formularalltag,
Punkt 3 kostet Außenstehende am meisten Suchzeit pro Vorfall.