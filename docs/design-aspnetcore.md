# Design: ASP.NET Core hosting and `dotnet new tsazor`

Status: **decided** 2026-11-18 (D-A1–D-A13). Packages `Tsazor.AspNetCore` and `Tsazor.Templates`, version
`1.0.0-rc.1`, not on nuget.org yet.

## Goal

A .NET developer adds one package and two lines and the ASP.NET Core app serves a Tsazor app: behind the Vite dev
server in development, from the built files in production, with `dotnet run` and `dotnet publish` and no npm command
of their own. And `dotnet new tsazor` starts a solution of both, as `dotnet new blazorwasm` starts a Blazor app.

```csharp
builder.Services.AddTsazor(o => o.ClientProject = "../MyApp.Client");
app.MapTsazor();   // after the API
```

```sh
dotnet new tsazor -n MyApp --ui fluent     # MyApp.Server + MyApp.Client + MyApp.slnx
dotnet run --project MyApp/MyApp.Server
```

## Decisions

- **D-A1 — `dotnet/` at the root, its own build.** The pnpm workspace and `release.mjs` treat every directory in
  `packages/` as an npm package; a .NET project there would be one without a `package.json`. `dotnet/Tsazor.slnx`
  holds the library, its tests and the template package. `dotnet/Directory.Build.props` reads the version from
  `packages/runtime/package.json`: the NuGet packages are part of the lockstep release (D-P1), never a version of
  their own.
- **D-A2 — The .NET door on the .NET side.** `Tsazor.AspNetCore` and `Tsazor.Templates` are what `@tsazor/dotnet` is
  on npm: everything .NET-like, behind one door (design-principles.md). No npm package knows them; the client a
  template writes is an ordinary Tsazor app.
- **D-A3 — Production: the files on disk, read per request.** `MapTsazor()` serves `SpaRoot` (`wwwroot`) through a
  `PhysicalFileProvider` that is looked up on every request and created once the directory exists — no manifest, so a
  new build with new hashes needs no restart. `MapStaticAssets` is not used: its endpoint table is written at build
  time, the frozen table the feedback ran into. The rules:
  - `GET`/`HEAD` of a path without a file extension (MapFallback's `{*path:nonfile}`) outside `ApiPrefixes` (`/api`,
    matched by segments) is `index.html`, `Cache-Control: no-cache`, with an ETag;
  - a missing file — any last segment with a dot — and a path below an API prefix are a 404: a missing `.js` never
    gets `index.html` (the browser refuses the module, the page stays blank). `/runs/v1.2` is a file name, so a 404;
  - files below `ImmutablePrefixes` (`/assets`, Vite's hashed output) get `public, max-age=31536000, immutable`, every
    other file `no-cache`;
  - the provider refuses every path above its root (`..`, `\`, encoded or not) and hides dot files; `AddFileRoot`
    serves further directories with the same rules.
- **D-A4 — Development: the server in front of Vite, not a redirect to it.** `Microsoft.AspNetCore.SpaProxy` sends the
  browser to the dev server's origin, which then proxies the API back. Tsazor keeps one origin: the browser talks to
  ASP.NET Core, which forwards every request no endpoint takes to Vite. The API, its cookies (the BFF pattern of
  auth.md) and the app share the origin in development as in production; the HMR WebSocket connects to the page's own
  port, so it goes through the server too. When nothing answers at `DevServer.Url`, a hosted service starts
  `DevServer.Command` (`npm run dev -- --port {port} --strictPort`) in the client project, logs its output and kills
  its process tree when the app stops; requests wait until Vite answers (`StartupTimeout`, then 502). A server that is
  killed hard leaves Vite running; the next start attaches to it. The template gives each app its own Vite port, so
  two apps never attach to each other's. The build-time OpenAPI generation runs the entry point without starting the
  host: no dev server for it.
- **D-A5 — YARP's forwarder, not a proxy of our own.** `IHttpForwarder` (`Yarp.ReverseProxy`, Microsoft's, already in
  `apps/migration-sample` and the FluentCMS BFF) handles the WebSocket upgrade, streams without buffering
  (server-sent events), hop-by-hop headers and cancellation. A minimal proxy would rebuild exactly those parts and get
  them wrong first. The cost is one dependency in production too, of which only the forwarder is used.
- **D-A6 — The client's build in the server's build.** `buildTransitive/Tsazor.AspNetCore.targets`, active when
  `TsazorClientProject` is set:
  - `npm install` on every build when `package.json` or the lock file is newer than the last install (a stamp in
    `node_modules`), so the first `dotnet build` or `dotnet run` installs;
  - `npm run build` (`tsazor check`, `vite build`) on Release builds and on every publish, incremental: skipped when
    no client file is newer than `dist/index.html`;
  - `dotnet publish` puts `dist` into the output's `wwwroot` (`ResolvedFileToPublish`); a Release build copies it to
    `bin/Release/<tfm>/wwwroot`. Never into the project's own `wwwroot`: no build output in the source tree, and the
    Web SDK's static web assets would see the files only from the second build on;
  - Node.js missing is TSAZOR001, with the properties that skip the client (`TsazorNpmInstall`, `TsazorBuildClient`,
    `TsazorGenerateApiClient`). Design-time builds run nothing.
- **D-A7 — The typed client as a build step, opt-in.** `TsazorGenerateApiClient=true` runs
  `tsazor-dotnet generate` on the OpenAPI document that `Microsoft.Extensions.ApiDescription.Server` writes on every
  build (`obj/<project>.json`), into `src/api`, when the document changed. A changed C# record changes the TypeScript
  on the next build: the closest thing to Blazor's shared models. The generated files stay in version control
  (`@tsazor/dotnet`'s rule), so a client build never needs .NET.
- **D-A8 — The template's client is written by create-tsazor.** `dotnet pack` of `Tsazor.Templates` runs
  `templates/scripts/write-content.mjs`: `scaffold()` from `packages/create-tsazor/dist` with `--dotnet`, once per
  `--ui` choice, then the template's changes — Weather asks `/api/weatherforecast`, a sign-up page, the `.esproj`,
  `src/api`, the lower-case package name. A patch that no longer fits the starter fails the pack. Nothing of the
  starter is copied into the repository, so the two cannot drift. `template.json` takes one of the three clients.
- **D-A9 — Options.** `--ui bootstrap|fluent|none` (default `bootstrap`: the look of Blazor's templates),
  `--framework net10.0|net11.0` (default the LTS), the restore. **No `--auth` yet:** Individual accounts are a login UI,
  a session endpoint and Identity storage — a feature of its own, not an option of a starter; docs/auth.md is the
  recipe until it is. The solution is an `.slnx` (the .NET 10 SDK's default; Visual Studio 2022 17.13+, Rider).
- **D-A10 — The editors.** Visual Studio: `MyApp.Client.esproj` (`Microsoft.VisualStudio.JavaScript.Sdk`) for npm, the
  tests and the TypeScript debugger; F5 on the server is enough, since it starts Vite itself. The `.esproj` neither
  installs nor builds (the server's build does) and the solution doesn't build it, so the CLI never needs its SDK.
  VS Code: `.vscode/` with the recommended extensions (C# Dev Kit, Tsazor), tasks (build, npm install, Vite as a
  background task, the client's test), file nesting for `X.tsazor` / `.tsazor.css` / `.tsazor.ts`, and F5
  "Server + Browser": the `coreclr` launch starts the browser debug session (Edge) when the server prints its
  address (`serverReadyAction`). A compound would start the browser before the server listens.
- **D-A11 — The sample.** `/api/weatherforecast` for the Weather page; `POST /api/signups` with DataAnnotations
  (`AddValidation`, which finds public types only) and one rule only the server knows, answered as a
  ValidationProblemDetails that the sign-up page puts next to its fields (a `ValidationMessageStore` beside
  `DataAnnotationsValidator`, which checks the rules the generated model brings). `JsonNumberHandling.Strict`, so
  .NET 10's OpenAPI document says `integer` and not `integer` or `string`.
- **D-A12 — The gate.** `node dotnet/scripts/template-e2e.mjs` (CI's `dotnet` job, after `pnpm -r build`): both
  packages packed, the npm packages in a fresh Verdaccio, the template in a hive of its own, `dotnet new tsazor` with
  each `--ui`, build, Release build, the client's test; then for the Bootstrap app `dotnet publish`, the published
  server's answers (fallback, 404s, caching, a new build without a restart), the pages in a browser (the API, the
  server's validation errors) and `dotnet run` (the dev server started by the server, hot reload through it). The
  NuGet packages stay out of the machine's caches (`NUGET_PACKAGES` in the scratch directory).
- **D-A13 — Publishing, later.** `release.yml` gets a step after the npm publish (the template's clients install the
  npm packages of the same version, so npm goes first): `dotnet pack dotnet/src/Tsazor.AspNetCore` and
  `dotnet pack dotnet/templates` with `-c Release -o .release/nuget`, then `dotnet nuget push .release/nuget/*.nupkg
  --source https://api.nuget.org/v3/index.json`, authenticated by NuGet's Trusted Publishing (`NuGet/login`, OIDC,
  like npm's) or, for the first push, a short-lived API key. Before that: reserve the `Tsazor` ID prefix on nuget.org.

## Found on the way (2026-11-18)

- `@tsazor/dotnet` turns .NET 10's `"type": ["integer", "string"]` with its `pattern` into `@RegularExpression` on a
  number field. The template avoids it with strict number handling (D-A11). **Fixed 2026-11-18:** the generator
  takes a pattern for string fields only.
- Vite's dependency scan reads no `.tsazor` file: a package that only pages import is optimized when the first page
  loads, and that load can fail with 504 "Outdated Optimize Dep" and no reload — with `npm run dev` alone as well.
  **Fixed 2026-11-18 in `@tsazor/vite-plugin`:** it reads the imports of the project's `.tsazor` and `.ts` files and
  hands the installed dependencies to `optimizeDeps.include`; the template's own list went. The gate still loads the
  page a second time if the first stays empty, and says so.

## Not in this step

`--auth Individual`; an icon for Visual Studio's dialog; precompressed static files (`MapStaticAssets` does this, with
the manifest D-A3 avoids); `dotnet watch` for the server together with Vite; the gate on Linux and macOS (the library's
tests run there, the gate drives Edge on Windows like the other browser gates).
