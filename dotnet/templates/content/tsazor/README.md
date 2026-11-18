# MyApp

An ASP.NET Core server and a [Tsazor](https://github.com/tsazor/tsazor) app in one solution.

| Project | |
|---|---|
| `MyApp.Server` | the API (`/api/weatherforecast`, `/api/signups`) and the host of the app (`Tsazor.AspNetCore`) |
| `MyApp.Client` | the Tsazor app: Razor components in TypeScript, built with Vite (Node.js 22.12 or later) |

```sh
dotnet run --project MyApp.Server     # npm install on the first build, then the Vite dev server behind the server
dotnet publish MyApp.Server           # the server and the built app in wwwroot
```

- **Development.** `MapTsazor()` sends every request no endpoint takes to the Vite dev server and starts it when it
  isn't running: edit a `.tsazor` file and the page updates.
- **The API client.** Every build of the server writes its OpenAPI document and, from it, the typed client in
  `MyApp.Client/src/api` (`@tsazor/dotnet`). Change a C# record, build, and the TypeScript follows.
- **Publish.** `dotnet publish` runs `npm run build` (`tsazor check`, then Vite) and puts `dist` into `wwwroot`. The
  server answers a route of the app with `index.html` and a missing file with a 404.
- **Visual Studio.** Open `MyApp.slnx` and press F5 on `MyApp.Server`. **VS Code.** F5 runs "Server + Browser".
