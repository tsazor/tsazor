# Tsazor.AspNetCore

Hosts a [Tsazor](https://github.com/tsazor/tsazor) app in ASP.NET Core: in development behind the Vite dev server
(started for you, hot reload included), in production from the built files. `dotnet new tsazor` (the
`Tsazor.Templates` package) sets all of it up.

```csharp
builder.Services.AddTsazor(o => o.ClientProject = "../MyApp.Client");
// …
app.MapTsazor();   // after the app's own endpoints
```

In the server's project file:

```xml
<PropertyGroup>
  <TsazorClientProject>../MyApp.Client</TsazorClientProject>
</PropertyGroup>
```

## What `MapTsazor()` does

Outside Development, from `wwwroot` (`SpaRoot`), read from disk on every request — a new build needs no restart:

| Request | Answer |
|---|---|
| a file that exists | the file; `/assets/*` (Vite's hashed files) with `Cache-Control: public, max-age=31536000, immutable`, everything else `no-cache` |
| `GET` of a path without a file extension (`/runs/42`) | `index.html`, `no-cache` |
| a missing file (`/assets/app-1234.js`, `/logo.png`) | 404 — never `index.html` |
| below an API prefix (`/api`, `ApiPrefixes`) and no endpoint | 404 |
| a path above the root (`..`), a dot file | 404 |

`AddFileRoot("/files", "uploads")` serves another directory under a path with the same rules.

In Development, with `ClientProject` set: every request that no endpoint of the app takes goes to the Vite dev server
at `DevServer.Url` (default `http://localhost:5173`), the HMR WebSocket and server-sent events included. When nothing
answers there, `DevServer.Command` (`npm run dev -- --port {port} --strictPort`) starts it in the client project;
it stops with the app. `DevServer.Enabled = false` serves `SpaRoot` as production does.

## The build

| Property | Default | |
|---|---|---|
| `TsazorClientProject` | — | the client's directory; nothing runs without it |
| `TsazorNpmInstall` | `true` | `npm install` when `package.json` or the lock file changed |
| `TsazorBuildClient` | Release, publish | `npm run build`, incremental; `false` skips it, `true` builds in every configuration |
| `TsazorGenerateApiClient` | `false` | `tsazor-dotnet generate` from the OpenAPI document the build writes (`Microsoft.Extensions.ApiDescription.Server`) into `src/api` (`TsazorApiClientOutput`; more options in `TsazorApiClientArguments`) |

`dotnet publish` puts the client's `dist` into the output's `wwwroot`; a Release build copies it to
`bin/Release/<tfm>/wwwroot`. Without Node.js the build stops with TSAZOR001 and says how to skip the client.
