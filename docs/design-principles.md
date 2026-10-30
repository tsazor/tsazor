# Design principles

## Why Tsazor

Tsazor is a component framework for TypeScript: a mature component model — RenderTree,
lifecycle, parameters, cascading values, DI, forms, routing — strict typing with a stability
promise, and a design for large public web apps. The model comes from Blazor, and it is not tied
to .NET.

**Two audiences, two equal entry points** (decided 2026-10-29):

- **TypeScript developers** who want this model in idiomatic TypeScript. For them Tsazor must
  stand on its own: nothing in it may require a .NET background or read as a Microsoft product.
- **Teams migrating from Blazor**, typically professional teams that **keep their .NET backend**
  but are unhappy with Blazor as their only SPA option. Tsazor gives them a TypeScript SPA that
  still feels familiar: the same component model, the same Razor markup, the same concepts
  (`@inject`, `EditForm`, DataAnnotations-style validation), and a typed bridge to their backend
  (`@tsazor/dotnet`). The migration is gentle and incremental, route by route instead of one big
  bang.

Neither audience is secondary, and neither entry point (README, docs, tutorial) leads through the
other's.

**Backend options stay open.** Nothing in the frontend may depend on .NET. The bridge is built on
OpenAPI, which is backend-agnostic, and .NET conventions (ProblemDetails, claim URIs, the
FluentCMS envelope) are supported but never required. Optional integrations such as
`@tsazor/sleipnir` are separate packages; nothing in the core depends on them. A team that later
wants to move its backend away from .NET can do so without touching the frontend architecture.

Because both audiences build professional apps, clean architecture, security and long-term
stability take priority.

In short: **a component framework for TypeScript, with Razor as its markup — and a low-effort
path from Blazor.** For a Blazor team the development model, the Razor templates and the CSS
(scoped CSS as `X.tsazor.css` with `::deep`, like `X.razor.css`) stay the same — and TypeScript
is TypeScript. No hybrid of C# and TS: it confuses both audiences. Porting effort is handled
elsewhere: mostly automated (codemod), and .NET naming and behavior for ported logic in a
separate migration library.

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
   A method keeps Blazor's name in camelCase, `Async` included (`refreshDataAsync`, `invokeAsync`,
   a Wizard's `goToStepAsync`), and a method Tsazor adds gets `Async` when it returns a Promise:
   the suffix is part of the name a Blazor developer looks for, not C# syntax (decided 2026-10-11).
   It also stands on its own in TypeScript: it marks a method that is asynchronous, and other
   JavaScript ecosystems name such methods the same way (e.g. Expo's `getItemAsync`; confirmed
   2026-10-29).
   A lifecycle pair (`OnInitialized`/`OnInitializedAsync`) is one method, `onInitialized`.
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
  (`appearance`). Members are not switched to PascalCase: `InputBase`'s `value`/`valueChanged`/`valueExpression` and
  `ValidationMessage`'s `for` follow the rule (2026-10-14). One named exception: `LayoutComponentBase.Body` stays
  PascalCase, because every Blazor layout reads it as `@Body` in markup, where the free name is the member.
- **Bare text in a code context is an error** — this follows from Razor's markup/code boundary,
  not from C#.

## When in doubt, TypeScript

In contested cases, the **TypeScript convention wins, not Blazor's**. Fidelity to Blazor covers
markup, directives and the semantics of the component model; where it collides with idiomatic
TypeScript (naming, types, syntax, language features), TypeScript wins. One decided exception: the
`Async` suffix of method names stays (above).

Not colliding is not enough. Blazor fidelity is kept only where it would also be the natural
TypeScript choice for someone without a Blazor background. Whatever makes sense only to .NET
developers — .NET naming, C# semantics, .NET types and format strings — does not belong in Tsazor.
It belongs in a separate migration library for C# teams, which Tsazor neither depends on nor
refers to in its API. Tsazor must not read as a Microsoft product to a TypeScript developer
(decided 2026-10-29).

## Parity first, then scale

Tsazor targets a different problem space than Blazor: public web apps for very large audiences,
where bundle size, startup time and rendering cost matter — a place nobody would deploy Blazor.
So Blazor compatibility is a **starting point, not a permanent constraint**. Tsazor does not
follow Blazor's roadmap and may develop in a different direction; nothing Blazor adds later is a
commitment for Tsazor. Compatibility is applied in stages and with restraint:

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
port still stay cheap? If only the second question gets a yes, the help belongs in the codemod,
in a diagnostic or in the separate migration library, not in Tsazor.
