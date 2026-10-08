# Component libraries

Tsazor has no built-in component library and no "official" one. A library is an npm package of
`.tsazor` components, and an app uses it with `@using <package>`. `@tsazor/bootstrap` and
`@tsazor/fluent` are two such libraries. They are built on [`@tsazor/ui`](../packages/ui), the
toolkit for any library author, which provides behaviors, the DataGrid model and the shared
vocabulary. This page describes what a library declares so that tools can work with it. The
packages above serve as the reference implementation.

## What a library's `package.json` declares

```json
{
  "name": "my-components",
  "keywords": ["tsazor", "tsazor-components"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./styles.css": "./dist/styles.css",
    "./tsazor-components.json": "./dist/tsazor-components.json"
  },
  "tsazor": {
    "components": "./dist/tsazor-components.json",
    "setup": {
      "styles": ["my-components/styles.css"],
      "services": "addMyComponents",
      "layout": ["ToastRegion"]
    }
  },
  "peerDependencies": { "@tsazor/runtime": "^0.1.0" }
}
```

- **`tsazor.components`:** the component manifest, which holds every component's parameters
  ([architecture.md](architecture.md), "Manifests"). Editors and `tsazor check` read it instead
  of the sources. `buildPackageManifest` from `@tsazor/compiler` writes it at build time.
- **`tsazor.setup`:** what an app needs besides `@using`. `npm create tsazor --ui <package>` reads
  it and writes the setup into the new app:
  - **`styles`:** module specifiers that the app's `Program.ts` imports, either your own CSS
    (through an export) or a peer's (`bootstrap/dist/css/bootstrap.min.css`).
  - **`services`:** the name of an exported function `(services: ServiceCollection) => void`. It
    registers what your components inject; the app calls it in `createTsazorApp({ services })`. It
    is the counterpart of Blazor's `builder.Services.AddMudServices()`.
  - **`layout`:** components without parameters that the app's `MainLayout` renders once, such as
    a toast region or a popover host.
  
  Every field is optional. A library without `setup` still works: the app gets the dependency and
  `@using`, and the rest is up to your README.
- **`peerDependencies`:** what the app has to install alongside your library, for example the CSS
  framework your styles come from. `npm create tsazor` adds these to the app; `@tsazor/*` peers
  are there already.
- **The keyword `tsazor-components`:** `npm create tsazor` lists the packages the registry finds
  under this keyword when it asks for a library.

## In an app, by hand

Without the starter, the same setup takes three steps:

```
@* _Imports.tsazor *@
@using my-components
```

```ts
// Program.ts
import "my-components/styles.css";
import { addMyComponents } from "my-components";

createTsazorApp({ root: App, routes, services: addMyComponents });
```

```
@* Layout/MainLayout.tsazor *@
<ToastRegion />
```
