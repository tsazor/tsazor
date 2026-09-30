# Sprach-Referenz (.tsazor)

## Direktiven

| Direktiv | Beispiel | Semantik |
|---|---|---|
| `@page` | `@page "/user/{Id:int}"` | Routen-Template (Constraints: `int`, `long`, `bool`, `guid`, `alpha`, `alphaNumeric`, `regex(...)`; Catch-all `{*Path}`) |
| `@layout` | `@layout MainLayout` | Layout für diese Route (überschreibt `_Imports`) |
| `@using` | `@using ./Shared` | Komponenten-/Typ-Auflösung (siehe Getting Started) |
| `@inject` | `@inject NavigationManager Nav` | DI: Feld-Initializer `inject(<Type>)` |
| `@inherits` | `@inherits LayoutComponentBase` | Basisklasse (Standard: `ComponentBase`) |
| `@typeparam` | `@typeparam TItem` | generische Typparameter (v1 deklarativ) |
| `@attribute` | `@attribute [Decorators.X]` | wörtliche Deklaration über der Klasse |
| `@code` / `@functions` | `@code { … }` | TypeScript-Klassenmember, wörtlich |
| `@@` | `@@` | literals `@` |

## Expressions

- `@expression` — implizit: Identifier + Dot-Chains + balancierte Aufrufe; endet konservativ
  bei Whitespace/`<`/`>`. Bei Mehrdeutigkeit `@(...)` verwenden.
- `@(expression)` — explizit.
- `@{ statement; statement; }` — Code-Statement-Block.
- `<text>…</text>` — Markup-Ausnahmezone.
- Attribute: `Name="@expr"`, Events `@onclick="handler"` mit Modifiern
  `@onclick:preventDefault` / `@onclick:stopPropagation`, `@key="…"`, `@ref="…"`.

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
| `@page`, `@layout`, `@using`, `@typeparam`, `@attribute`, `@bind` (+Modifier), `@onclick`-Familie, `@key`, `@ref`, `@inject`, Expressions, `@@`, `<text>`, `@code`/`@functions` | identisch |
| C#-Code in `@code` | abweichend (→ TypeScript — der eigentliche Punkt) |
| DataAnnotations-Validierung | abweichend (funktionsbasiert: `validators: Record<string, (value, model) => string \| null>`) |
| `@bind:format` | begrenzt v1 |
| Benannte Child-Slots (`<Found Context>`-Stil) | Phase 2 |
| `@inherits`, Partials (code-behind) | `@inherits` ja; Code-behind (`X.tsazor.ts`, via Vererbung — [docs/code-behind.md](code-behind.md)) ja |
| `@authorize` | ja (Tsazor-Erweiterung, bare Direktive) |
| `@implements` | out-of-scope (TS-Interfaces sind strukturell) |

## Diagnostics

Der Compiler scheitert nie still — Codes `TZS001`–`TZS011` mit Quellposition
(`TZS011` ist eine Warnung, z. B. `@inherits`-Konflikt mit Code-behind).
Fehler landen im Vite-Dev-Overlay, Warnungen auf der Konsole.