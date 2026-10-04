# Handoff: Sleipnir-Verbesserungen (Track U, upstream)

Stand: 2026-10-04. Für eine neue Sitzung, die die Upstream-Verbesserungen an
[Sleipnir](https://github.com/HolgerTheHuck/Sleipnir) umsetzt. Grundlage ist
[roadmap-sleipnir.md](roadmap-sleipnir.md); dieses Dokument macht daraus einen umsetzbaren
Auftrag, mit am Upstream-Code geprüften Befunden. Die Tsazor-Seite (`@tsazor/sleipnir`,
Track T) folgt später in diesem Repo und ist hier nur der Kontext.

## 1. Rahmen — bitte zuerst lesen

- **Arbeitsort:** ein **frischer Clone** von `HolgerTheHuck/Sleipnir` (z. B. `D:\Own\Sleipnir`;
  existiert noch nicht). Pro Punkt (U3, U4, U1, U2) ein **Feature-Branch** und ein **PR auf
  GitHub** zum Review durch den Maintainer. Nichts direkt auf `main`.
- **Vor dem Start: Plan-Review mit dem Maintainer** (Entscheidung 2026-10-02). Erst den Plan
  zeigen — insbesondere die offenen Fragen in §6 —, dann autonom umsetzen; Merges nur mit
  Freigabe.
- **Sleipnir bleibt framework-neutral.** Nichts Tsazor-Spezifisches upstream (kein
  `--lang tsazor`, keine Tsazor-Typen); der Tsazor-Emitter lebt später in `@tsazor/sleipnir`.
  Was upstream landet, muss auch Svelte-/JS-Konsumenten nützen.
- **Im Sleipnir-Repo gibt es eine eigene `CLAUDE.md`** — zuerst lesen; ihre Regeln gelten dort.
- **Kompatibilität:** alle Discovery-Erweiterungen sind additiv, `discoveryVersion` bleibt `"1"`.
  Bestehende 1.4.x-Clients und -Server müssen weiter funktionieren.

## 2. Ausgangslage (geprüft am 2026-10-04)

- Neueste Version **1.4.3** (Tag `v1.4.3`, npm `sleipnir-client`/`sleipnir-codegen`, NuGet
  `Sleipnir.*`). Letzte Änderung auf `main`: 2026-09-08 — die Befunde der Roadmap gelten noch.
- Referenz-Konsument in Tsazor: `apps/sleipnir-ticker` (Ticker-API in .NET, Synthetic-Modus für
  deterministische Tests; E2E-Gate in der Tsazor-CI).

### Befunde, am Code geprüft — mit zwei Korrekturen gegenüber der Roadmap

| Befund | Beleg | Status |
|---|---|---|
| **Pflicht/optional fehlt**: jede DTO-Property wird `name?: T` | `clients/codegen/src/emitters/ts.ts` `emitTypes` (`${p.wireName}?: ${ty}`) | bestätigt |
| **Nullability wird *beachtet***: `TypeRef.nullable` → `T \| null` | `clients/codegen/src/core/model.ts` `tsTypeOfRef`; `docs/discovery-schema.md` §2 | **Korrektur:** die Roadmap sagte „ignoriert `nullable`“. Was fehlt, ist die *Pflichtangabe* (`required`) pro Property — die kommt erst mit U1. Der Kommentar im Emitter („discovery carries no nullability“) ist veraltet. |
| **Property-Metadaten fehlen**: `PropertyMeta` hat nur `PropertyName`, `PropertyType`, `Navigation` | `DISCOVERY_REFERENCE.md` §TypeMeta/PropertyMeta | bestätigt; der Emitter gibt `documentation` schon aus, bekommt aber nie welche. Auch Parameter-Doku ist laut §6 nicht verdrahtet (fällt auf die Methoden-Doku zurück). |
| **Enums werden zu Zahlen** (`long`) | `model.ts` Kopfkommentar (Enum-Refs kollabieren auf den Wire-Typ) | bestätigt; `TypeMeta` mit `Members` wird aber schon emittiert — die Information ist da. |
| **Fehler-Kategorie fehlt im TS-Client**: Server hat `SleipnirError.Category`, `SleipnirErrorBody` (TS) nicht | `SleipnirCommon/Models/SleipnirError.cs`, `clients/ts/src/types.ts` | bestätigt (Drift) |
| **Kein gebündelter Verbindungsstatus** im `SleipnirTransportRouter` | `clients/ts/src/transport-router.ts` | bestätigt (kein State-Observable) |
| Event-Methoden ohne Optionen (`signal`, `resumePolicy`, `timeout`) | generierte `controllers.ts` | aus der Roadmap, nicht neu geprüft |
| Browser-WS sendet `?access_token=`, der Server liest es nicht | `guide/chapters/08-auth.md` | aus der Roadmap, nicht neu geprüft |
| Keine strukturierten Validierungsfehler; Validierungs-Interceptor nur Roadmap | `ERROR_CATALOG.md`, `ROADMAP.md`, `docs/design/phase-1-interceptor-pipeline.md` | aus der Roadmap, nicht neu geprüft |

Die als „nicht neu geprüft“ markierten Punkte zu Beginn kurz am Code bestätigen.

## 3. Reihenfolge

1. **U3 + U4** (klein, risikoarm) → Release **Sleipnir 1.5.0-preview**.
2. **U1 + U2** (Discovery-Erweiterung, Validierungs-Interceptor) → dann der Pflicht/optional-Teil
   von U3, der `required` aus U1 braucht.

Track T (Tsazor) startet nach dem Preview und arbeitet zunächst ohne U1/U2.

## 4. Die Punkte

### U3 — Codegen-Korrektheit (`clients/codegen`)

- **Pflicht/optional:** sobald U1 `required` liefert, die vier Kombinationen wie in
  `@tsazor/dotnet` abbilden — Pflicht + nicht nullable ⇒ `name: T`; Pflicht + nullable ⇒
  `name: T | null`; optional ⇒ `name?: T` bzw. `name?: T | null`. Bis dahin: Verhalten lassen,
  aber den veralteten Kommentar korrigieren („discovery carries no requiredness“).
- **Enums:** eine echte Enum-Identität im TS-Output, Wire bleibt die Zahl. Vorschlag:
  `export const OrderState = { Open: 0, Shipped: 1 } as const;` plus
  `export type OrderState = (typeof OrderState)[keyof typeof OrderState];` — Literal-Union der
  Zahlen, ohne TS-`enum` (Tree-Shaking, `isolatedModules`). Nutzungsstellen referenzieren den Typ
  statt `number`. Python-/C#-Emitter analog oder bewusst unverändert lassen (im PR begründen).
- **Event-Methoden:** ein Optionsparameter `{ signal?: AbortSignal; resumePolicy?; timeout? }`;
  `signal` beendet das Abo (Grundlage für die Lifecycle-Bindung in Tsazor: `observe()`/
  `disposeSignal`).
- **Tests:** die Codegen-Snapshot-/Unit-Tests erweitern; `--selfcheck` (Exit 4) bleibt grün.

### U4 — Client (`clients/ts`) und Server-Token

- **Verbindungsstatus:** ein Observable am `SleipnirTransportRouter` über alle Backends (WS, SSE,
  SignalR; REST ist zustandslos), z. B. `"connecting" | "open" | "reconnecting" | "closed"` mit
  `subscribe(listener) → unsubscribe` (die Form, die Tsazors `observe()` und Svelte-Stores
  verstehen).
- **`category`** in `SleipnirErrorBody` (TS) — die Server-Werte aus
  `SleipnirCommon/Results/SleipnirErrorCategory.cs`, als String-Literal-Union.
- **`access_token` beim WS-Upgrade/SSE serverseitig lesen** — nur auf diesen Endpunkten, nie für
  normale Requests; Token-Query aus Logs filtern. Cookie-Auth bleibt der empfohlene Weg (Tsazors
  BFF-Leitfaden `docs/auth.md`); die Query ist nur für Bearer-Szenarien im Browser.
- **401-Hook:** optional `onUnauthenticated` → Refresh → genau ein Retry.

### U1 — Discovery-Erweiterung (Server, additiv)

- `PropertyMeta` und `ParameterMeta` bekommen: `required`, `minLength`/`maxLength`, `range`
  (`min`/`max`), `pattern`, `email`, eine eigene Fehlermeldung (`message`), `documentation`,
  `displayName` — aus den DataAnnotations (`[Required]`, `[StringLength]`, `[Range]`,
  `[RegularExpression]`, `[EmailAddress]`, `[Display]`) und `[SleipnirDocumentation]`.
- Parameter-Dokumentation wirklich pro Parameter verdrahten (heute fällt sie auf die Methode
  zurück, `DISCOVERY_REFERENCE.md` §6).
- Event-Metadaten: `resumable`.
- **Bewusst nicht:** Autorisierung in der Discovery (Angriffsflächen-Orakel, Roadmap §9).
- `docs/discovery-schema.md` und `DISCOVERY_REFERENCE.md` nachziehen; Tests in
  `SleipnirDiscoveryServiceTests`/`SleipnirDiscoveryTypeRefTests`.

### U2 — Validierungs-Interceptor (Server, opt-in)

- DataAnnotations auf Methodenparametern und DTOs prüfen, opt-in über `SleipnirOptions`.
- Verletzungen ⇒ `Category = InvalidArgument`, Code 400, mit einer `errors`-Map in der Form von
  `ValidationProblemDetails` (Feldpfade in camelCase, wie auf dem Wire).
- `ERROR_CATALOG.md` und die Interceptor-Pipeline-Doku nachziehen.

## 5. Gates

- **Sleipnir:** `dotnet test`, die Client- und Codegen-Tests, `--selfcheck`; die vorhandene CI
  des Sleipnir-Repos (`.github/`).
- **Konsument:** `apps/sleipnir-ticker` in Tsazor gegen das Preview — Pakete auf
  `1.5.0-preview` heben (npm `sleipnir-client`/`sleipnir-codegen`, NuGet `Sleipnir.Server`), Typen
  neu generieren (`pnpm --filter sleipnir-ticker codegen`), `pnpm --filter sleipnir-ticker verify`
  (Synthetic-Modus) und die Tsazor-CI. Vor einem echten Release lokal per Tarball/Paket-Feed
  testen, nicht erst nach der Veröffentlichung.

## 6. Offene Fragen für das Plan-Review

1. **Enum-Darstellung:** `as const`-Objekt + Literal-Union (Vorschlag) oder TS-`enum`?
2. **Pflicht/optional vor U1?** Bis U1 alle Properties optional lassen (Vorschlag) oder
   übergangsweise Nicht-Nullable als Pflicht deuten (bricht bestehende Aufrufer)?
3. **`access_token` per Query** überhaupt unterstützen oder nur Cookies (Sicherheit: Tokens in
   URLs landen in Logs und Proxies)?
4. **Release:** `1.5.0-preview` auf npm/NuGet veröffentlichen oder nur als lokaler Feed, bis
   Track T die Form bestätigt hat?
5. **Andere Emitter** (`py.ts`, `cs.ts`, `js.ts`): U3 dort mitziehen oder getrennt?

## 7. Danach (Kontext, nicht Teil dieses Auftrags)

Track T in Tsazor: T1 Emitter auf der Upstream-IR (`tsazor-sleipnir generate`), T2
`SleipnirResult<T>` + `applyServerErrors(editContext, result)`, T3 lebenszyklus-gebundene
Abos über `observe()`, T4 Verbindungsstatus als Service, T5 Auth, T6 `services.addSleipnir(…)`,
T7 Migration der Ticker-App. Details: [roadmap-sleipnir.md](roadmap-sleipnir.md).
