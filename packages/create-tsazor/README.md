# create-tsazor

Creates a [Tsazor](https://github.com/tsazor/tsazor#readme) app in the shape of `dotnet new blazorwasm` — a layout with a nav menu, Home,
Counter and Weather, a component test — with strict TypeScript and Vite.

```bash
npm create tsazor@latest my-app
```

| Option | |
|---|---|
| `--ui <package>` | a component library: any package that ships `.tsazor` components, such as `@tsazor/fluent` or `@tsazor/bootstrap`; its setup (styles, services, layout) goes into the app |
| `--dotnet` | adds `@tsazor/dotnet`, the client for an ASP.NET Core backend, and an `api` script that generates it from the OpenAPI document |
| `--no-install` | writes the files only |
| `--force` | writes into a directory that isn't empty |

With npm, options go after `--`: `npm create tsazor@latest my-app -- --ui @tsazor/fluent`. In a terminal it asks
for what's missing: the name, the component library, whether to install.
