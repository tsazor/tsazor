# Changelog

Notable changes to the published `@tsazor/*` packages. A change to a package's public API
(`api/<package>.api.d.ts`, checked in CI by `pnpm api:check`) needs an entry here.

## Unreleased

- `@tsazor/runtime`: features an app does not use stay out of its bundle — the document head
  (`HeadOutlet` and the sections it needs) is mounted once `PageTitle` or `HeadContent` is part of the
  app, `CultureService`/`StringLocalizer` are service defaults their own modules register (still
  resolvable without registration; `createTsazorApp({ localization })` unchanged), and the renderer's
  error-boundary check no longer imports the `ErrorBoundary` components. The bench app: 29.4 → 25.4 KB gz.
- `@tsazor/runtime`: `Router` gets Blazor's `OnNavigateAsync` (`NavigationContext { path, signal }`) and
  `<Navigating>`. Lazy routes (E5): `LazyRouteEntry { template, load, authorize }` in the manifest
  (`RouteManifestEntry`), loaded once on the first navigation; `RouteTable.match`/`matchRoute` return
  a `RouteMatch` (eager or lazy entry); a failed chunk reloads the target once.
- `@tsazor/vite-plugin`: `lazyRoutes: true | string[]` — the matched pages load lazily, each as its
  own chunk, its layout with it.
- `@tsazor/runtime`: `CultureService.setDefault` applies while the culture is still the previous
  default (it compared against the new default and never applied). Every public export and member
  of runtime, testing, dotnet and vite-plugin is documented (the reference's API pages).
- `@tsazor/compiler`: `DIAGNOSTIC_CATALOG` (every code: severity, when it is reported, an example,
  the fix) and `DIAGNOSTIC_MESSAGES` are exported — the source of the reference's diagnostics page;
  `RETIRED_DIAGNOSTIC_CODES` (`TZS007`, `TZS010`). `TZS001` reads "Invalid or misplaced directive."
  (it was "Unknown directive.", which never matched what it reports).
- `@tsazor/runtime`: scrolling on navigation as in Blazor — after an internal navigation the
  `Router` scrolls to the fragment's element (`orders#total`, by id, else by name) or to the top;
  a link that only changes the fragment of the current page adds a history entry and scrolls,
  without `LocationChanging`/`LocationChanged`.
- Component manifests (`tsazor-components.json`, `@tsazor/compiler` `ComponentMetadata`): a
  component `doc` (the class JSDoc, or a leading `@** … *@` in a `.tsazor` file — the markup
  counterpart of `/** */`) and the parameter `default` as written. Every component of
  `@tsazor/components` and `@tsazor/fluent` is documented.
- API snapshots of every published package (`api/`), checked in CI (S1).
- `@tsazor/testing`: `render(Component, { parameters, services })` with typed parameters;
  `find`, `findAll`, `click`, `change`, `setParameters`, `settle`, `markup`; a component's
  failure rejects the call that waited for it.
- `@tsazor/runtime`: `TsazorHttp` takes a `fetch` option; `AuthorizeRouteView` derives from
  `RouteView`; `AuthorizeView`'s `ChildContent` receives the authentication state; hash mode
  works over a `MemoryHistory`.
- `@tsazor/compiler`: `TZS031` (names reserved by `ComponentBase`); unknown names in text read
  as an expression get an explanation (`explainExpressionValue`).
- `@tsazor/runtime`: `createTsazorApp({ strictCsp: true })` writes style attributes through the
  CSSOM, for a CSP without `'unsafe-inline'`; `MarkupString` goes through a Trusted Types policy
  named `tsazor` (see docs/csp.md).
- F1a static markup blocks: `@tsazor/compiler` emits a static subtree as one `addMarkupContent`
  frame (option `staticMarkup`, default on; the Vite plugin passes `staticMarkup: false` through as
  an escape hatch); `@tsazor/runtime` parses each markup string once, clones it per insertion and
  inserts single-node blocks without boundary comments.
- Accessibility (E9): `@tsazor/fluent` dark-theme fills meet 4.5:1 (`--fui-brand-background*`,
  `--fui-color-*-filled`), the light subtle brand badge too, and the dialog's Shift+Tab focus trap
  is fixed; `@tsazor/components`: `Progress` gets `ariaLabel` (its name), `Badge` uses Bootstrap's
  `text-bg-*`, `ListGroupItem` is always an `<li>` with a real `<a>`/`<button>` inside.
- `@tsazor/vite-plugin`: with `check: true`, the dev server reports type errors in the
  background without blocking.
- `@tsazor/dotnet`: generated code is commented in English and imports only the validation
  decorators it uses.
