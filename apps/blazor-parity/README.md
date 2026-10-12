# Blazor parity

Blazor's own E2E tests, run against Tsazor's components. The app holds Blazor's test pages, ported to
`.tsazor` with the same element ids, classes, structure, item counts and delays, so the Selenium tests port
line by line to Playwright. A component that passes them behaves as Blazor's does where Blazor tests it.

The first suite is Virtualize: Blazor 11's `VirtualizationTest.cs`, its 20 test pages
(`src/Pages/Virtualization/`) and the 5 QuickGrid pages it mounts (`src/Pages/QuickGrid/`). The tests are
grouped as in the behavior spec's catalog ([docs/blazor-virtualize-net11.md](../../docs/blazor-virtualize-net11.md)
§9), one module per group in `tests/virtualize/`; all groups, A–M, are ported.

The second suite is InputFile: Blazor 11's `InputFileTest.cs` with its page `InputFileComponent`
(`src/Pages/FormsTest/`), in `tests/input-file/`. Six of its seven tests run; `ThrowsWhenOversizedFileIsSelected`
is skipped because Tsazor hands the app the browser's `File`, which has no `OpenReadStream(maxAllowedSize)`.
The app's `index.html` has Blazor's `<base href="/">`, so a page's relative URLs (`images/…`) resolve as in
BasicTestApp.

Tsazor's QuickGrid is the `DataGrid` of its two component libraries, so group L runs once per skin. The app is
built once per skin (`vite build --mode fluent|bootstrap`, into `dist/<skin>/`): the QuickGrid pages say
`@using @tsazor/fluent`, and the bootstrap build points that package at `@tsazor/bootstrap`. They are lazy
routes that bring their skin's stylesheet, so no other page loads a skin's CSS. The runner's header
(`scripts/verify.mjs`) has the details.

```sh
pnpm --filter blazor-parity verify                         # build, serve on :5360, run every suite in Edge
TSAZOR_BROWSER=firefox pnpm --filter blazor-parity verify  # or webkit
pnpm --filter blazor-parity verify --skip-build --group a,f --grep EndKey   # a subset
pnpm --filter blazor-parity verify --skip-build --group l --skin bootstrap   # one skin's QuickGrid tests
pnpm --filter blazor-parity dev                            # the test pages on :5361 (dev:bootstrap: the other skin)
```

The index page mounts a test page by its Razor name (`<select id="test-selector">`), as Blazor's
BasicTestApp does; a test calls `t.mount("VirtualizationAnchorMode")` where Blazor calls
`MountTestComponent<VirtualizationAnchorMode>()`. The runner (`scripts/verify.mjs`) documents the module
contract: a new group is a new file in `tests/<suite>/`, a new suite a new folder.

Each ported test keeps Blazor's name (a Theory's arguments in parentheses), its waits and its tolerances,
with a `// Blazor: <TestName>` line. Where Tsazor deliberately fixes a Blazor bug
([design-virtualize.md](../../docs/design-virtualize.md) §6), the test asserts the fix and says
`// Tsazor deviation A<n>`. A test that can't apply is listed as `SKIP` with the reason.
