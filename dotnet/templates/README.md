# Tsazor.Templates

`dotnet new` templates for [Tsazor](https://github.com/tsazor/tsazor), Razor components in TypeScript.

```sh
dotnet new install Tsazor.Templates
dotnet new tsazor -n MyApp                 # MyApp.Server (ASP.NET Core) + MyApp.Client (Tsazor) + MyApp.slnx
cd MyApp && dotnet run --project MyApp.Server
```

| Option | |
|---|---|
| `--ui bootstrap\|fluent\|none` | the component library (default `bootstrap`, as in Blazor's templates) |
| `--framework net10.0\|net11.0` | the server's target framework (default `net10.0`, LTS) |
| `--no-restore` | skips the restore after creating |

The client is what `npm create tsazor -- --dotnet` writes, with the server's weather forecast, a sign-up form that
shows the server's validation errors, and the typed client of the server's API. It needs Node.js 22.12 or later.
The server hosts it with `Tsazor.AspNetCore`.
