# Sprach-Referenz (.tsazor)

## Direktiven

| Direktiv | Beispiel | Semantik |
|---|---|---|
| `@page` | `@page "/user/{Id:int}"` | Routen-Template, siehe [Routen](#routen). Mehrere `@page` ⇒ jedes Template ist eine Route (Blazor) |
| `@layout` | `@layout MainLayout` | Layout für diese Route (überschreibt `_Imports`) |
| `@using` | `@using ./Shared` | Komponenten-Tags und `@inject`-/`@inherits`-Typen (siehe Getting Started) |
| `@import` | `@import { Status, formatDate } from "./utils"` | TypeScript-Import für Markup und `@code` (siehe unten); in `_Imports.tsazor` vererbt |
| `@inject` | `@inject NavigationManager Nav` | DI: Feld-Initializer `inject(<Type>)` |
| `@inherits` | `@inherits LayoutComponentBase` | Basisklasse (Standard: `ComponentBase`) |
| `@typeparam` | `@typeparam TItem` / `@typeparam T extends X` | generische Typparameter (v1 deklarativ); C#-Constraint `where T : …` wird mit Warnung TZS014 ignoriert |
| `@attribute` | `@attribute [Decorators.X]` | wörtliche Deklaration über der Klasse |
| `@code` / `@functions` | `@code { … }` | TypeScript-Klassenmember, wörtlich |
| `@namespace`, `@implements`, `@rendermode`, `@preservewhitespace` | `@namespace App.Pages` | Blazor-only: akzeptiert und ignoriert (`@rendermode`/`@preservewhitespace` mit Warnung TZS014) |
| `@@` | `@@` | literals `@` |

Direktiven gelten nur auf Dokumentebene; innerhalb von Elementen oder Code-Blöcken ⇒ TZS013.
Ein unbekanntes `@wort` ist keine Direktive, sondern eine implizite Expression (Razor).

## Routen

Templates wie Blazor: Literale (case-insensitiv), `{name}`, `{name:constraint}` (mehrere: `{id:int:regex(...)}`),
optional `{name?}`/`{id:int?}` (nur am Ende, ggf. vor einem Catch-all), Catch-all `{*path}`/`{**path}` (letztes Segment).
Query-String und Hash zählen nicht zum Matching. Ungültige Templates und unbekannte Constraints sind Fehler (Blazors Meldungen).

| Constraint | Wert im Page-Parameter | Anmerkung |
|---|---|---|
| `int` | `number` | 32-Bit-Bereich, Vorzeichen erlaubt |
| `long` | `bigint` | 64-Bit-Bereich; `bigint`, damit Werte > 2^53 exakt bleiben |
| `bool` | `boolean` | case-insensitiv (`True` ⇒ `true`) |
| `double`, `float` | `number` | Dezimalpunkt, Exponent, Tausender-Komma (`float` via `Math.fround`) |
| `decimal` | `number` | ohne Exponent; JS hat keinen Decimal-Typ (Double-Genauigkeit) |
| `datetime` | `Date` | ISO `yyyy-MM-dd`, optional `THH:mm[:ss[.f]]` und `Z`/`±hh:mm`; ohne Offset lokale Zeit |
| `guid` | `string` | Formate D, N, B, P; Wert = URL-Text |
| `alpha`, `alphaNumeric` | `string` | |
| `regex(...)` | `string` | als `^(?:…)$` verankert, case-insensitiv; `{{`/`}}` für geschweifte Klammern |

Jedes Constraint ist verankert und gruppiert (`regex(a|b)` matcht nur `a` oder `b`). Segmente werden URL-dekodiert,
außer `%2F` (.NET 8); ein Catch-all erhält den dekodierten Rest mit `/` verbunden, leer ⇒ `null`. Ein fehlender
optionaler Parameter ist `null`, ebenso Parameter, die nur in einem *anderen* `@page`-Template derselben Seite vorkommen.
Mehrere Constraints müssen alle passen; das erste typisierte bestimmt den Wert.

**Präzedenz** (Blazors Route-Table): Segmente von links verglichen — Literal vor Constraint-Parameter vor Parameter vor
Constraint-Catch-all vor Catch-all; bei Gleichstand gewinnt die Route mit weniger Segmenten. Die Reihenfolge im Manifest
spielt keine Rolle (`/users/new` schlägt `/users/{id}`). Zwei Routen mit gleicher Präzedenz, gleichen Literalen und
gleichen Constraints (`/a/{x}` und `/A/{y}`) ⇒ Fehler „The following routes are ambiguous“ beim Aufbau der Route-Table
(Router-Lifecycle). Gleiche Präzedenz, aber verschiedene Constraints (`{x:int}` vs. `{x:bool}`) ⇒ Manifest-Reihenfolge.

## @import

Nach `@import` steht die Syntax einer TypeScript-Import-Deklaration — der Compiler parst
sie mit dem TS-Parser (syntaktisch) und emittiert sie als echten Modul-Import:

```razor
@import { Status, formatDate as fmt } from "./utils"
@import Api, { MAX_ITEMS } from "./api"
@import * as icons from "./icons"
@import type { Order } from "./models"
@import "./print.css"
@import {
    PIZZA_MINIMUM_SIZE,
    PIZZA_MAXIMUM_SIZE,
} from "./models"

<p>@Status.Open · @fmt(order.date) · max @MAX_ITEMS</p>
```

- **Freie Namen:** jede importierte lokale Bindung bleibt in Markup, `@{ }` und
  Control-Headern unverändert (`@Status.Open`, nicht `this.Status.Open`); alles andere
  Nicht-Lokale/Nicht-Globale wird weiter zu `this.X` (die „importiert ⇒ bleibt"-Regel;
  vollständige Scope-Analyse folgt mit A4). Ausnahme: ein `@inject`-Feld gleichen Namens
  (`@inject NavigationManager NavigationManager`) ist ein Member.
- **Vererbung:** `@import` in `_Imports.tsazor` gilt für alle Dateien darunter (wie `@using`).
  Relative Specifier sind relativ zur `_Imports.tsazor` geschrieben und werden pro Datei
  umgeschrieben (`"./utils"` in `src/` ⇒ `"../utils"` für `src/Pages/X.tsazor`); Paket-
  und absolute Specifier bleiben. Eine Bindung der Datei selbst überschattet eine geerbte,
  eine nähere `_Imports`-Ebene eine entferntere.
- **Komponenten:** ein importierter Wert kann direkt als Tag dienen
  (`@import Badge from "./widgets/Badge.tsazor"` ⇒ `<Badge />`), ohne `@using`.
- Ungenutzte Imports entfernt der Build (esbuild); ein Standard-Set in `_Imports.tsazor`
  kostet nichts. Ungültige Formen (`@import X`, `@import x = require(…)`, fehlende Klammer, …)
  ⇒ Fehler TZS016.
- Nicht importiert wird nur, was der Compiler selbst für den erzeugten Code braucht:
  `ComponentBase`/`RenderTreeBuilder`/`EventCallback`/`Parameter`/`inject` (sofern kein
  `@import` sie schon bindet), aufgelöste Komponenten-Tags und `@inject`-/`@inherits`-Typen.

## Expressions

- `@expression` — implizit: Identifier + Dot-Chains + balancierte Aufrufe; endet konservativ
  bei Whitespace/`<`/`>`. Bei Mehrdeutigkeit `@(...)` verwenden.
- `@(expression)` — explizit.
- E-Mail-Regel: `@` direkt nach einem alphanumerischen Textzeichen ist literal
  (`info@example.com`, auch in Attributwerten).
- `@* … *@` — Razor-Kommentar (überall, mehrzeilig, darf Markup und `@` enthalten).
- `<text>…</text>` — Markup-Ausnahmezone.
- Attribute: `Name="@expr"`, Events `@onclick="handler"` mit Modifiern
  `@onclick:preventDefault` / `@onclick:stopPropagation`, `@key="…"`, `@ref="…"`.
  Unquoted Werte (`type=checkbox`) wie in HTML; ein wertloses Attribut (`disabled`) wird
  wie in Razor als `true` übergeben.

## Code-Kontexte (code-first, wie Razor)

In `@{ … }` und in den Bodies von `@if`/`else`, `@for`, `@foreach`, `@while`,
`@do … while`, `@switch` und `@try`/`catch`/`finally` ist der Inhalt **TypeScript**
(gescannt mit dem TS-Lexer — Strings, Template-Literals, Kommentare und Regex sind sicher).
Markup beginnt nur

- an einem Tag in Statement-Position (`<p>…</p>`, `<Comp />`),
- bei `@:` (Rest der Zeile ist Markup, inkl. `@`-Transitions),
- bei `<text>…</text>`,
- bei `@expr` / `@(expr)` (Ausgabe).

```razor
@foreach (var item in items) {
    const label = item.name.toUpperCase();
    if (item.active) {
        <li>@label</li>
    } else {
        @:inactive: @label
    }
}
```

- Locals (`const`/`let`/`var`, auch Destructuring, `function`), Schleifenvariablen und
  `catch`-Parameter sind für nachfolgendes Markup im selben Scope sichtbar. `@{ }` öffnet
  keinen eigenen Scope (Razor) — seine Locals gelten für das folgende Markup.
- Whitespace in Code-Kontexten wird nicht gerendert (`@foreach (…) { <li/> }` erzeugt keine
  Leerzeichen-Textframes).
- Nackter Text in einem Code-Kontext ist ein Fehler (TZS015), kein stiller Text.
- `@switch`: gestapelte Labels (`case 1:\ncase 2:`) fallen durch; eine Section ohne
  abschließendes `break`/`return`/`throw`/`continue` bekommt ein implizites `break`.
- `@foreach`-Header: `var x in xs`, typisiert `string s in xs`, Dekonstruktion
  `var (k, v) in pairs` (⇒ `for (const [k, v] of …)`).
- C#-Konstrukte ohne TS-Entsprechung — `@using (…) { }`, `lock (…)`, `@await` im Markup —
  sind Fehler (TZS012).

## @bind (Blazor .NET-7-Semantik)

| Schreibweise | Erzeugt |
|---|---|
| `<input @bind="name">` | `value`-Attribut + `onchange`-Handler mit Zuweisung |
| `<input type="checkbox" @bind="flag">` | `checked` + Handler |
| `<input type="number" @bind="n">` | `Number()`-Coercion |
| `@bind:event="oninput"` | anderes DOM-Event |
| `@bind:get` / `@bind:set` / `@bind:after` | unabhängige get-/set-Seiten (auch ohne Basis-`@bind`) |
| `<Stepper @bind-Value="current" />` | `Value` + `ValueChanged` (EventCallback) |
| `<InputText @bind="name" />` | Komponenten-Tag ⇒ wie `@bind-Value` |

`@bind:format` ist in v1 begrenzt (native Parsing für number/date) → Warnung TZS008.

## Komponenten

```razor
<Greeter Name="@name" />
<NavLink Href="/counter">Counter</NavLink>

<EditForm Model="@model" OnValidSubmit="@submit">
    <InputText @bind="model.name" />
    <ValidationMessage For="name" />
    <ValidationSummary />
    <button type="submit">Send</button>
</EditForm>

<Virtualize Items="@items" ItemSize="32" ItemTemplate="@renderItem" />
```

- Element-Inhalt einer Komponente → `ChildContent`-Parameter.
- Unbekannte Attribute → Parameter mit `captureUnmatchedValues` (`additionalAttributes`).
- Cascading: `@CascadingParameter({ type: EditContext })` (by-type) oder
  `@CascadingParameter({ name: "x" })` (by-name) — `CascadingValue`/`EditForm` liefern.

## Kompatibilität .razor ↔ .tsazor

| Konstrukt | Status |
|---|---|
| Markup, Komponenten-Tags, Attribut-Syntax | identisch |
| `@page`, `@layout`, `@typeparam`, `@attribute`, `@bind` (+Modifier), `@onclick`-Familie, `@key`, `@ref`, `@inject`, Expressions, `@@`, `<text>`, `@code`/`@functions` | identisch |
| `@using` | Komponenten-Ordner/Pakete statt Namespaces; Typen/Werte für Markup und `@code` kommen per `@import` |
| C#-Code in `@code` | abweichend (→ TypeScript — der eigentliche Punkt) |
| Code in `@{ }` und Control-Bodies | code-first wie Razor, aber TypeScript; `using (…)`, `lock`, `@await` ⇒ Fehler |
| `@namespace`, `@rendermode`, `@preservewhitespace` | akzeptiert, ignoriert |
| DataAnnotations-Validierung | abweichend (funktionsbasiert: `validators: Record<string, (value, model) => string \| null>`) |
| `@bind:format` | begrenzt v1 |
| Benannte Child-Slots (`<Found Context>`-Stil) | Phase 2 |
| `@inherits`, Partials (code-behind) | `@inherits` ja; Code-behind (`X.tsazor.ts`, via Vererbung — [docs/code-behind.md](code-behind.md)) ja |
| `@authorize` | ja (Tsazor-Erweiterung, bare Direktive) |
| `@implements` | akzeptiert, ignoriert (TS-Interfaces sind strukturell) |

## Diagnostics

Der Compiler scheitert nie still — Codes `TZS001`–`TZS018` mit Quellposition
(`TZS011` und `TZS014` sind Warnungen, z. B. `@inherits`-Konflikt mit Code-behind bzw.
ignorierte Direktive/Klausel). Neu mit dem code-first-Parser: `TZS012` C#-Konstrukt ohne
TS-Entsprechung, `TZS013` Direktive außerhalb der Dokumentebene, `TZS015` ungültiges
TypeScript (oder nackter Text) in einem Code-Kontext. Import-Modell: `TZS016` ungültiges
`@import`, `TZS017` mehrdeutiger Komponenten-Tag (Fehler), `TZS018` `@using`-Ordner bzw.
-Paket existiert nicht (Warnung; für `_Imports.tsazor` in dieser Datei gemeldet).
Fehler landen im Vite-Dev-Overlay, Warnungen auf der Konsole.