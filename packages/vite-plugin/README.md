# @tsazor/vite-plugin

The Vite plugin of [Tsazor](../../README.md): compiles `.tsazor` components, applies their scoped CSS
(`X.tsazor.css`), builds the route table from the `@page` directives (`virtual:tsazor-routes`) and keeps hot module
replacement working.

```bash
npm install -D @tsazor/vite-plugin vite
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

export default defineConfig({
  plugins: [tsazor()],
});
```

For plain `tsc` over your own `.ts` files, add the ambient types of `.tsazor` modules and the routes module:

```json
{ "compilerOptions": { "types": ["vite/client", "@tsazor/vite-plugin/client"] } }
```

Type errors inside components come from `tsazor check` (`@tsazor/cli`). See
[getting started](../../docs/getting-started.md).
