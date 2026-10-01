# Design-Prinzipien

## Warum Tsazor

Blazors Komponentenmodell — RenderTree, Lifecycle, Parameter, Cascading Values, DI, EditForm,
Routing — ist ein gut durchdachtes Modell, und es ist nicht an .NET gebunden. Tsazor bringt es nach
TypeScript: für .NET-Entwickler (geringer Migrationsaufwand von Blazor, Brücke zum .NET-Backend)
**und** für Frontend-Entwickler außerhalb des Microsoft-Umfelds, die dieses Modell in idiomatischem
TypeScript nutzen wollen. Beide Zielgruppen sind gleichrangig.

## Markup ist Razor, Code ist TypeScript, die Brücke ist Werkzeug

1. **Markup und Direktiven: 1:1 Blazor.** Tags, Attribute, `@bind`, `@onclick`, `@page`,
   `@layout`, `@inject Typ Name`, `@code`, `@key`, `@ref`. Hier entsteht der geringe
   Migrationsaufwand — es ist der Großteil einer `.razor`-Datei.
2. **Alles, was Code ist, ist sauberes TypeScript.** `@code`, `@{ }`, Control-Block-Köpfe und
   Ausdrücke folgen TypeScript-Syntax und -Semantik. Keine C#-Syntax, und keine C#-Semantik, die
   TypeScript widerspricht. TypeScript wird nicht in Richtung C# verbogen.
3. **Runtime-API: Blazor-Semantik, TypeScript-Namen.** `onInitialized` statt `OnInitialized`,
   `bigint` statt `long`, ein Boolean rendert `"true"`. Moderne Standard-TS-Features haben Vorrang
   (z. B. Standard-Decorators statt `experimentalDecorators`).
4. **Migration über Werkzeuge, nicht über Compiler-Toleranz.** C#-Reste in portiertem Code
   behandelt ein Codemod (`.razor` → `.tsazor`) und LSP-Diagnosen mit Quick-Fix. Der Compiler
   akzeptiert C#-Konstrukte nicht still — er meldet sie mit dem TypeScript-Gegenstück.

## Was keine Verbiegung ist

Konventionen der Razor-*Templatesprache* — nicht von C# — bleiben:

- **Freie Namen im Markup sind Member** (`@count` statt `@this.count`), wie in Vue-, Angular- oder
  Svelte-Templates. Im `@code`-Block bleibt `this.` Pflicht.
- **Parameter-Namen werden im Markup case-insensitiv zugeordnet.** So bleibt portiertes Markup
  (`<Button Appearance="…">`) unverändert, während die TS-Klasse beim idiomatischen camelCase
  (`appearance`) bleibt. Members werden nicht auf PascalCase umgestellt.
- **Nackter Text in einem Code-Kontext ist ein Fehler** — das folgt aus Razors Markup/Code-Grenze,
  nicht aus C#.

## Im Zweifel TypeScript

Bei strittigen Fällen gilt die **TypeScript-Konvention, nicht die von Blazor**. Blazor-Treue
betrifft Markup, Direktiven und die Semantik des Komponentenmodells; wo sie mit idiomatischem
TypeScript kollidiert (Namensgebung, Typen, Syntax, Sprach-Features), gewinnt TypeScript.

## Prüffrage für neue Features

Würde ein TypeScript-Entwickler ohne .NET-Hintergrund das natürlich finden — und bleibt ein
Blazor-Port trotzdem billig? Wenn nur die zweite Frage mit Ja beantwortet wird, gehört die Hilfe
in den Codemod oder in eine Diagnose, nicht in die Sprache.
