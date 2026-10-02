# Design principles

## Why Tsazor

Blazor's component model — RenderTree, lifecycle, parameters, cascading values, DI, EditForm,
routing — is a well-thought-out model, and it is not tied to .NET. Tsazor brings it to
TypeScript: for .NET developers (low migration effort from Blazor, a bridge to the .NET backend)
**and** for frontend developers outside the Microsoft ecosystem who want to use this model in
idiomatic TypeScript. Both audiences are equally important.

In short: **Blazor, with C# replaced by TypeScript.** The same development model, the same Razor
templates, the same CSS (scoped CSS as `X.tsazor.css` with `::deep`, like `X.razor.css`) — and
TypeScript is TypeScript. No hybrid of C# and TS: it confuses both audiences. Porting effort is
handled elsewhere, mostly automated (codemod).

## Markup is Razor, code is TypeScript, the bridge is tooling

1. **Markup and directives: 1:1 Blazor.** Tags, attributes, `@bind`, `@onclick`, `@page`,
   `@layout`, `@inject Type Name`, `@code`, `@key`, `@ref`. This is where the low migration
   effort comes from — it is the bulk of a `.razor` file.
2. **Everything that is code is clean TypeScript.** `@code`, `@{ }`, control-block headers and
   expressions follow TypeScript syntax and semantics. No C# syntax, and no C# semantics that
   contradict TypeScript. TypeScript is not bent towards C#.
3. **Runtime API: Blazor semantics, TypeScript names.** `onInitialized` instead of
   `OnInitialized`, `bigint` instead of `long`, a boolean renders as `"true"`. Modern standard TS
   features take precedence (e.g. standard decorators instead of `experimentalDecorators`).
4. **Migration through tooling, not through compiler leniency.** Leftover C# in ported code is
   handled by a codemod (`.razor` → `.tsazor`) and LSP diagnostics with quick fixes. The
   compiler does not silently accept C# constructs — it reports them together with the
   TypeScript equivalent.

## What is not bending

Conventions of the Razor *template language* — not of C# — stay:

- **Free names in markup are members** (`@count` instead of `@this.count`), as in Vue, Angular
  or Svelte templates. Inside the `@code` block, `this.` remains mandatory.
- **Parameter names are matched case-insensitively in markup.** That way ported markup
  (`<Button Appearance="…">`) stays unchanged while the TS class keeps idiomatic camelCase
  (`appearance`). Members are not switched to PascalCase.
- **Bare text in a code context is an error** — this follows from Razor's markup/code boundary,
  not from C#.

## When in doubt, TypeScript

In contested cases, the **TypeScript convention wins, not Blazor's**. Fidelity to Blazor covers
markup, directives and the semantics of the component model; where it collides with idiomatic
TypeScript (naming, types, syntax, language features), TypeScript wins.

## The test question for new features

Would a TypeScript developer without a .NET background find this natural — and does a Blazor
port still stay cheap? If only the second question gets a yes, the help belongs in the codemod
or in a diagnostic, not in the language.
