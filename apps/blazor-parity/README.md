# Blazor parity

Blazor's own E2E tests, run against Tsazor's components. The app holds Blazor's test pages, ported to
`.tsazor` with the same element ids, classes, structure, item counts and delays, so the Selenium tests port
line by line to Playwright. A component that passes them behaves as Blazor's does where Blazor tests it.

The first suite is Virtualize: Blazor 11's `VirtualizationTest.cs` and its 20 test pages
(`src/Pages/Virtualization/`). The tests are grouped as in the behavior spec's catalog
([docs/blazor-virtualize-net11.md](../../docs/blazor-virtualize-net11.md) §9), one module per group in
`tests/virtualize/`. Groups A–F, I and J are ported. G, H, K and M (and L, QuickGrid, against the DataGrid
skins) follow.

```sh
pnpm --filter blazor-parity verify                         # build, serve on :5360, run every suite in Edge
TSAZOR_BROWSER=firefox pnpm --filter blazor-parity verify  # or webkit
pnpm --filter blazor-parity verify --skip-build --group a,f --grep EndKey   # a subset
pnpm --filter blazor-parity dev                            # the test pages on :5361
```

The index page mounts a test page by its Razor name (`<select id="test-selector">`), as Blazor's
BasicTestApp does; a test calls `t.mount("VirtualizationAnchorMode")` where Blazor calls
`MountTestComponent<VirtualizationAnchorMode>()`. The runner (`scripts/verify.mjs`) documents the module
contract: a new group is a new file in `tests/<suite>/`, a new suite a new folder.

Each ported test keeps Blazor's name (a Theory's arguments in parentheses), its waits and its tolerances,
with a `// Blazor: <TestName>` line. Where Tsazor deliberately fixes a Blazor bug
([design-virtualize.md](../../docs/design-virtualize.md) §6), the test asserts the fix and says
`// Tsazor deviation A<n>`. A test that can't apply is listed as `SKIP` with the reason.
