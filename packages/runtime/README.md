# @tsazor/runtime

The runtime of [Tsazor](https://github.com/tsazor/tsazor#readme): Blazor's component model in the browser, in TypeScript — the render tree
and its diff, the component lifecycle, parameters and cascading values, dependency injection, routing with layouts,
`EditForm` validation, `Virtualize`, auth (`AuthorizeView`, `AuthenticationStateProvider`) and `TsazorHttp`.

```bash
npm install @tsazor/runtime
npm install -D @tsazor/vite-plugin @tsazor/cli
```

`Program.ts` is your `Program.cs`:

```ts
import { createTsazorApp } from "@tsazor/runtime";
import routes from "virtual:tsazor-routes";
import App from "./App.tsazor";

createTsazorApp({
  root: App,
  routes,
  services: (services) => {
    // services.registerValue(…), as builder.Services.Add…
  },
});
```

The fastest start is `npm create tsazor@latest my-app`.

## Coming from Blazor: where things are

The full migration guide — every C# keyword, Razor directive and Blazor API with its Tsazor form, the
diagnostics you meet first, the traps — ships in this package: [MIGRATION.md](MIGRATION.md). The essentials:

| Blazor | Tsazor |
|---|---|
| `[Parameter] public string Title { get; set; }` | `@Parameter() title = "";` — markup's `Title="…"` sets the camelCase member |
| A parameter property with logic (`get => _x ?? Default; set => _x = value;`) | `@Parameter() set title(value) { … }` with its getter, or `@Parameter() accessor title` — a getter alone is no parameter |
| `EventCallback` / `EventCallback<T>` | `EventCallback` (its argument optional) / `EventCallback<T>` — not `EventCallback<void>` |
| `@inject NavigationManager Nav` | `@inject NavigationManager nav`, or `inject(NavigationManager)` in a field initializer |
| `IServiceProvider`, `GetService<T>() ?? fallback` | `@inject ServiceProvider services`, then `services.tryGet(T) ?? fallback` |
| `services.AddScoped<T>()`, with a factory, `AddSingleton(instance)` | `services.registerType(T, { lifetime: "scoped" })` (built as `new T(services)`), `services.register(T, (sp) => new T(sp.get(Nav)))`, `services.registerValue(T, instance)` |
| A library's `services.AddXyz()` | The same function over a `ServiceCollection` — or `registerServiceDefault(T, create)` in the service's module, and it works unregistered |
| `ParameterView.GetValueOrDefault`, `ToDictionary`, `FromDictionary` | `getValue`, `toDictionary`, `ParameterView.fromDictionary` |
| `EditContext.FieldCssClass`, `SetFieldCssClassProvider` | `editContext.fieldCssClass(field)`, `editContext.setFieldCssClassProvider(…)` with a `FieldCssClassProvider` |
| `CultureInfo.CurrentCulture.NumberFormat` | `@inject CultureService cultures`, then `cultures.current.numberFormatInfo` |
| `ElementReference` | The DOM `Element` itself (`@ref` on an element) |
| `IJSRuntime` | Not needed: a component's code runs in the browser and calls DOM APIs directly |
| `@($"/orders/{id}")` | `` @(`/orders/${id}`) `` — and `@(…)` around anything beyond a plain expression in an attribute |
| A `static` helper in `@code` | A `static` member, reached as `MyComponent.helper()`; types and helpers several files share live in `.ts` modules |

`tsazor check` reports what doesn't fit, most of it with the fix in the message — run it before `vite build`.

`@tsazor/runtime/internal` holds the renderer's machinery for Tsazor's own packages and tests. It may change in any
release and is not covered by the stability promise ([support policy](https://github.com/tsazor/tsazor/blob/main/docs/support-policy.md),
D-S7); apps use `@tsazor/runtime`.

- [Getting started](https://github.com/tsazor/tsazor/blob/main/docs/getting-started.md)
- [Language reference](https://github.com/tsazor/tsazor/blob/main/docs/language-reference.md)
- [Migrating from Blazor](https://github.com/tsazor/tsazor/blob/main/docs/migration.md)
- [C# to TypeScript](https://github.com/tsazor/tsazor/blob/main/docs/csharp-to-typescript.md)
