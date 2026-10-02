# Design principles

## Why Tsazor

Blazor's component model — RenderTree, lifecycle, parameters, cascading values, DI, EditForm,
routing — is a well-thought-out model, and it is not tied to .NET. Tsazor brings it to
TypeScript: for .NET developers (low migration effort from Blazor, a bridge to the .NET backend)
**and** for frontend developers outside the Microsoft ecosystem who want to use this model in
idiomatic TypeScript. Both audiences are equally important.

**Primary audience:** professional teams that **keep their .NET backend** but are unhappy with
Blazor as their only SPA option. Tsazor gives them a TypeScript SPA that still feels familiar:
the same component model, the same Razor markup, the same concepts (`@inject`, `EditForm`,
DataAnnotations-style validation), and a typed bridge to their backend (`@tsazor/dotnet`). The
migration is gentle and incremental, route by route instead of one big bang.

**Backend options stay open.** Nothing in the frontend may depend on .NET. The bridge is built on
OpenAPI, which is backend-agnostic, and .NET conventions (ProblemDetails, claim URIs, the
FluentCMS envelope) are supported but never required. Optional integrations such as
`@tsazor/sleipnir` are separate packages; nothing in the core depends on them. A team that later
wants to move its backend away from .NET can do so without touching the frontend architecture.

Because the primary audience is professional teams, clean architecture, security and long-term
stability take priority.

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

## Parity first, then scale

Tsazor targets a different problem space than Blazor: public web apps for very large audiences,
where bundle size, startup time and rendering cost matter — a place nobody would deploy Blazor.
So Blazor compatibility is a **starting point, not a permanent constraint**. It is applied in
stages and with restraint:

- **Version 1: Blazor parity.** Every valid `.razor` construct keeps its Blazor meaning;
  nothing is reinterpreted. Extensions are allowed only as a superset: on the TypeScript side
  (decorators, runtime API) or in markup syntax that Razor rejects or gives no meaning to. Each
  extension desugars to the Blazor form with identical semantics, is marked "Tsazor extension"
  in the docs, and the codemod always emits the Blazor form.
- **After version 1: deliberate divergence.** Where Blazor's semantics stand in the way of scale
  (performance, payload, rendering), Tsazor may diverge, but only through an explicit decision
  record (what changes, why, which ports break, what the codemod/diagnostic does about it).
  Each divergence must earn its keep. Convenience alone is not a reason.

## Type safety is a requirement — the stability promise

Tsazor is TypeScript-only, and **strict** type checking is a requirement, not an option. This
is what allows a promise no untyped framework can make:

> **Code that passes `tsazor check` (strict) behaves the same on every 1.x release. Every
> breaking change shows up as a `tsazor check` error, with a codemod or quick fix.**

- The public API surface (the published `.d.ts`) is the contract. CI snapshots it, so any
  change to it is deliberate and versioned.
- Strict is the only supported configuration for `tsazor check` and production builds. There is
  no relaxed profile, because it would void the promise.
- **Strict at the door, gentle on the way in.** Developers used to loosely typed JavaScript are
  welcome and must not be lost at the start:
  - Development never blocks on type errors: the dev server, HMR and the tutorial preview keep
    running and show the errors next to the code. The promise applies to what is deployed, not
    to the first minute.
  - Inference does most of the work (`count = 0` is a `number`, markup handlers are contextually
    typed); explicit annotations are rarely needed beyond method parameters.
  - Tooling writes the types: a quick fix infers missing parameter types from usage.
  - The tutorial presents types as what keeps an app stable, not as an entry fee.

## The test question for new features

Would a TypeScript developer without a .NET background find this natural — and does a Blazor
port still stay cheap? If only the second question gets a yes, the help belongs in the codemod
or in a diagnostic, not in the language.
