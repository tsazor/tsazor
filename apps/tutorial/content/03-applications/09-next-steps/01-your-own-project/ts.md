---
title: Your own project
keywords: new project, Vite, setup, migration
focus: Program.ts
---

You've built a bakery in the browser. Here's how to start an app on your own machine.
Tsazor runs on **Vite**, the usual dev server for TypeScript web apps. Install the packages:

```bash
npm install @tsazor/runtime @tsazor/vite-plugin @tsazor/cli
npm install -D typescript vite
```

Then add the plugin to `vite.config.ts`, so Vite compiles every `.tsazor` file:

```ts
import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

export default defineConfig({ plugins: [tsazor()] });
```

`index.html` needs a `<div id="app">` and loads `src/Program.ts`. That's the file on the
right: it starts the app, as in the lessons that had one. `npx vite` serves the app and
updates it as you type.

Two more commands do what this tutorial did for you:

- `npx tsazor check` type-checks every component, like the problems panel did. Run it
  before you deploy, and in your build pipeline.
- `npx vitest` runs your `*.test.ts` files. Add `@tsazor/testing`, and the same `tsazor()`
  plugin to the Vitest config.

The [getting started guide](https://github.com/HolgerTheHuck/Tsazor/blob/main/docs/getting-started.md)
has the complete setup, including the recommended `tsconfig.json` (strict, as everywhere in
Tsazor).
