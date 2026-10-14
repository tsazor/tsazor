# Component libraries

Tsazor has no built-in component library and no "official" one. A library is an npm package of
`.tsazor` components, and an app uses it with `@using <package>`. `@tsazor/bootstrap` and
`@tsazor/fluent` are two such libraries. They are built on [`@tsazor/ui`](../packages/ui), the
toolkit for any library author, which provides behaviors, the DataGrid model and the shared
vocabulary. Its root entry is covered by the stability promise. `@tsazor/ui/kit` holds the
helpers of the skins' components (calendar and color math, keyboard maps, label builders,
form-field state): use them if they fit, but they may change in any release, so a library that
imports them depends on `@tsazor/ui` at an exact version. This page describes what a library declares so that tools can work with it. The
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
  of the sources. The library build writes it (see "Building a library").
- **`tsazor.setup`:** what an app needs besides `@using`. `npm create tsazor --ui <package>` reads
  it and writes the setup into the new app:
  - **`styles`:** module specifiers that the app's `Program.ts` imports, either your own CSS
    (through an export) or a peer's (`bootstrap/dist/css/bootstrap.min.css`). With styles, the
    starter leaves its template's body font out of `app.css`, so your styles set the document's
    typeface: a zero-weight `:where(body) { font-family: … }`, which any rule of the app's own
    still beats (`@tsazor/fluent` ships one; Bootstrap's reboot sets `body` itself).
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

## Building a library

`tsazor build-lib` (from `@tsazor/cli`, a dev dependency) builds the package as an app is built:
the sources are type-checked first (`tsazor check`, so the package needs a strict
`tsconfig.json`), and an error stops the build; then they compile as the Vite plugin compiles an
app:

```json
"scripts": { "build": "tsazor build-lib --stylesheet my-components.css" }
```

- every `src/*.tsazor` (but `_Imports.tsazor`) becomes `dist/<Name>.js`, exported from
  `dist/index.js`, with a declaration `dist/<Name>.d.ts` from its parameters;
- every `src/*.ts` helper becomes `dist/<name>.js` beside them, with the declaration TypeScript
  derives from the file alone (a function needs its return type written for that);
- `dist/tsazor-components.json` is the manifest;
- with `--stylesheet`, `src/styles/*.css` and each component's `<Name>.tsazor.css` are joined
  into `dist/<file>` in that order.

A library that needs more writes a build script around `buildLibrary`, which takes the same
defaults:

```js
// build.mjs — "build": "node build.mjs"
import { buildLibrary } from "@tsazor/cli";

const result = await buildLibrary({
  internal: ["GridRow"],                         // compiled for the others, not exported
  aliases: { Modal: "Dialog" },                  // more names for a component
  exports: ['export { addMyComponents } from "./services.js"'],
  typeExports: ['export type { Intent } from "@tsazor/ui"'],
  stylesheet: { file: "my-components.css" },
});
if (result.errors.length > 0) process.exit(1);
```

`@tsazor/bootstrap`, `@tsazor/fluent`, `@tsazor/charts` and `@tsazor/markdown` build this way
(their `build.mjs`).

## The manifest across versions

A library is built with one Tsazor and used in an app with another: a library built with
Tsazor 1.4 ends up in an app on 1.1. The manifest's format follows these rules:

- **Its version is `tsazorComponentManifest: 1` for all of 1.x.** A 1.x release adds optional
  fields only. It never removes a field, renames one or changes its meaning.
- **A reader ignores the fields it doesn't know.** An app on 1.1 reads a 1.4 manifest as far as
  1.1 knows the format. What the newer fields add (a hint, a doc link) is missing there, but
  every component resolves.
- **A newer format version is reported, not silent.** A 2.x library in a 1.x app is the warning
  TZS036 in `tsazor check` and in the Vite plugin. The components are still read as far as this
  version knows them. A manifest that can't be read (not JSON, no `components`) is the error
  TZS036 at the manifest. It names the cause, where otherwise the package's tags would only be
  unresolved (TZS005) or untyped.

A test reads a manifest written by Tsazor 1.0 (`packages/workspace/test/fixtures/manifest-1.0`)
in every later 1.x release.

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
