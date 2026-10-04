# Changelog

Notable changes to the published `@tsazor/*` packages. A change to a package's public API
(`api/<package>.api.d.ts`, checked in CI by `pnpm api:check`) needs an entry here.

## Unreleased

- API snapshots of every published package (`api/`), checked in CI (S1).
- `@tsazor/testing`: `render(Component, { parameters, services })` with typed parameters;
  `find`, `findAll`, `click`, `change`, `setParameters`, `settle`, `markup`; a component's
  failure rejects the call that waited for it.
- `@tsazor/runtime`: `TsazorHttp` takes a `fetch` option; `AuthorizeRouteView` derives from
  `RouteView`; `AuthorizeView`'s `ChildContent` receives the authentication state; hash mode
  works over a `MemoryHistory`.
- `@tsazor/compiler`: `TZS031` (names reserved by `ComponentBase`); unknown names in text read
  as an expression get an explanation (`explainExpressionValue`).
- `@tsazor/vite-plugin`: with `check: true`, the dev server reports type errors in the
  background without blocking.
- `@tsazor/dotnet`: generated code is commented in English and imports only the validation
  decorators it uses.
