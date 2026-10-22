# After 1.0

1.0 is Blazor parity: the component model, forms, routing, the component library and the tooling a Blazor team needs
to move its UI to TypeScript ([design-principles.md](design-principles.md), "Parity first, then scale"). What comes
after it is additive — new packages and options, nothing that breaks a 1.x app ([support-policy.md](support-policy.md)).

## Server-side rendering

Tsazor 1.0 renders in the browser; a public site that needs server rendering for SEO uses static prerendering until
then. Server rendering follows Blazor's render modes — static SSR by default, a render mode per component, streaming
rendering, persisted component state, enhanced navigation, forms in static SSR — but hydrates the server's DOM where
Blazor re-renders it. The renderer is TypeScript and runs wherever JavaScript runs (Node, Bun, Deno, edge runtimes);
.NET is one way to host it, next to an ASP.NET API. `InteractiveServer` — a circuit per user — is not planned.

## The Sleipnir binding

`@tsazor/sleipnir` binds a [Sleipnir](https://github.com/HolgerTheHuck/Sleipnir) backend as tightly as
`@tsazor/dotnet` binds REST and OpenAPI: typed DTO classes with validation, errors as values, subscriptions that end
with their component, the connection state and the sign-in as services. It is optional, a package of its own; nothing
in the core depends on it. The design: [design-sleipnir-binding.md](design-sleipnir-binding.md). Until then an app
uses Sleipnir's generated client directly, as `apps/sleipnir-ticker` does.

## `@tsazor/extensions`

`@tsazor/primitives` (`Decimal`, `DateOnly`, `TimeOnly`, `TimeSpan`, `Guid`) ships with 1.0. Its sibling brings the
services of `Microsoft.Extensions.*` that JavaScript has no counterpart for: `HttpClient` with named and typed clients
and a handler pipeline (retry, timeout, auth, correlation, logging), and more in that spirit
([design-extensions-primitives.md](design-extensions-primitives.md)).

## The extended library

Beyond the complete library: a scheduler, chat and prompt components, page templates, a pivot grid and a
spreadsheet ([design-extended-library.md](design-extended-library.md)). It grows alongside 1.0 and is marked as such
in the [CHANGELOG](../CHANGELOG.md): its API may still change until it is declared stable.

## Smaller items

- **Type checks and tooling:** an event handler's argument checked against the event; excludes for `tsazor check`;
  typed `@ref`s; `RenderFragment` among the auto-imports; the VS Code extension on the marketplace.
- **Library:** TreeView children loaded on demand and a TreeView as a dropdown; a virtualized option list; the
  DataGrid's density and sticky header; `immediate` on `NumberInput`; localized icon variants.
- **Runtime:** asynchronous Standard Schema validation on submit; prefetching a `NavLink`'s route.
- **`@tsazor/dotnet`:** remote `$ref`s in OpenAPI documents.
- **Tutorial:** a "What's different from Blazor" chapter and a codemod chapter on the Blazor track; several files in
  the lesson editor.
