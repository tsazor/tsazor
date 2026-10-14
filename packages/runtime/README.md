# @tsazor/runtime

The runtime of [Tsazor](../../README.md): Blazor's component model in the browser, in TypeScript — the render tree
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

`@tsazor/runtime/internal` holds the renderer's machinery for Tsazor's own packages and tests. It may change in any
release and is not covered by the stability promise ([support policy](../../docs/support-policy.md), D-S7); apps
use `@tsazor/runtime`.

- [Getting started](../../docs/getting-started.md)
- [Language reference](../../docs/language-reference.md)
- [Migrating from Blazor](../../docs/migration.md)
