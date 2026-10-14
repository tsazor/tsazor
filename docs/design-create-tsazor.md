# Design — `npm create tsazor` (R3)

Status: **decided** (2026-10-08, D-N1–D-N4 as proposed). Roadmap: [roadmap-1.0.md](roadmap-1.0.md) R3, with the S2 templates.

## Goal

A Blazor developer types `npm create tsazor@latest my-app` and gets what `dotnet new blazorwasm`
gives them: a running app with a layout, a nav menu, the pages Home, Counter and Weather, a test,
strict TypeScript and the VS Code extension recommended. `--ui <package>` sets up a component
library — **any** library. `@tsazor/bootstrap` and `@tsazor/fluent` are examples, not built in
(the decision of 2026-10-07: no "official" libraries, no special cases in the tooling).

## Command

```bash
npm create tsazor@latest my-app            # pnpm create tsazor, yarn create tsazor, bun create tsazor
npm create tsazor@latest my-app -- --ui @tsazor/bootstrap
```

| Option | Effect |
|---|---|
| `[dir]` | target directory; also the package name |
| `--ui <package>` | a component library: a registry name (with an optional version), a local directory or a `.tgz` |
| `--dotnet` | adds `@tsazor/dotnet` and an `api` script that generates the client from an OpenAPI URL |
| `--no-install` | writes the files only |
| `--force` | writes into a directory that is not empty |

Missing answers are asked interactively when stdin is a terminal (name, library, install now);
otherwise the defaults apply. The package manager comes from `npm_config_user_agent`, as with
`create-vite`.

- Package `create-tsazor` (`packages/create-tsazor`), **no dependencies** (`node:util` `parseArgs`,
  `node:readline`), Node 22.12+.
- The template files ship in the package (`template/`). The `@tsazor/*` versions in the generated
  `package.json` are the starter's own version (lockstep until 1.0).

## Template — the shape of `dotnet new blazorwasm`

```
my-app/
├── index.html
├── package.json              dev · build (tsazor check + vite build) · preview · test · check
├── tsconfig.json             strict (S2)
├── vite.config.ts            plugins: [tsazor()]
├── vitest.config.ts          happy-dom
├── public/sample-data/weather.json
├── .vscode/extensions.json   the Tsazor extension
├── .gitignore · README.md
└── src/
    ├── Program.ts
    ├── _Imports.tsazor
    ├── App.tsazor            Router, NotFound
    ├── app.css
    ├── Layout/MainLayout.tsazor (+ .css)
    ├── Layout/NavMenu.tsazor    (+ .css)
    └── Pages/Home.tsazor · Counter.tsazor · Weather.tsazor · Counter.test.ts
```

The file names and pages match the Blazor template one to one. A Blazor developer finds every file
where they expect it, and the tutorial and the docs can refer to the same three pages.

## The library contract

A library describes its setup in its own `package.json`, next to the `tsazor.components` manifest
it already has:

```json
"tsazor": {
  "components": "./dist/tsazor-components.json",
  "setup": {
    "styles": ["bootstrap/dist/css/bootstrap.min.css", "@tsazor/bootstrap/tsazor-bootstrap.css"],
    "services": "addBootstrap",
    "layout": ["ToastRegion"]
  }
}
```

- **Always:** the dependency and `@using <package>` in `_Imports.tsazor`.
- **`styles`:** module specifiers that `Program.ts` imports. They can be the library's own CSS or a
  peer's.
- **`services`:** a named export `(services) => void` that `createTsazorApp({ services })` calls.
  This is Blazor's `builder.Services.AddMudServices()`.
- **`layout`:** components without parameters that `MainLayout` renders once, such as a toast
  region or a popover host.
- **`peerDependencies`** of the library, apart from `@tsazor/*`, are added to the app. For example
  `bootstrap`, which `@tsazor/bootstrap` needs for its CSS.

The starter reads this before it writes a file:
- from the registry with `npm view <spec> tsazor peerDependencies --json`, which uses the user's
  npm configuration, so a private registry works too;
- for a local directory or `.tgz`, from its `package.json`.

A package without `tsazor.setup` still works: it gets the dependency and `@using`, plus a note to
look at its docs.

**The two skins get the contract like any third-party library:**
- `@tsazor/bootstrap` gets `bootstrap` as a peer, and `addBootstrap` registers the `Toaster`;
- `@tsazor/fluent` gets `addFluent`;
- both declare `layout: ["ToastRegion"]`.

`addBootstrap` and `addFluent` are new public API, so they go into the API snapshot and the
changelog. The guide for library authors documents the contract.

**Choosing a library interactively:**
- The prompt lists the packages the registry finds under the keyword `tsazor-components`, plus
  "none" and "another package…".
- Offline, it asks for a free-text package name.
- The starter has no built-in list; the two skins carry the keyword like any other library.

## Tests

- **Unit tests:**
  - parsing the arguments;
  - writing the template;
  - applying a setup, with fixture `package.json` files: with a setup, without one, and with peers.
- **Tarball smoke (CI check job):** the smoke scaffolds its app with the packed `create-tsazor`
  (`--ui <bootstrap.tgz> --no-install`) instead of writing the files by hand. Then it installs from
  the tarballs and builds, tests and runs `tsazor check` as today. The starter is tested on every
  run, exactly as a user gets it.
- **A browser gate "Starter":** a scaffolded app with each skin in all three engines:
  - Home, then Counter, where a click increments the count;
  - Weather, which shows the table;
  - axe on every page.

## Out of scope for 1.0

- `tsazor add <package>` for an existing app (the same contract, applied later). After 1.0.
- Variants: hash routing, PWA, an ASP.NET Core host (the `dotnet new` side).

## Decisions (2026-10-08, as proposed)

| # | Question | Decision |
|---|---|---|
| D-N1 | The template's content | as `dotnet new blazorwasm`: MainLayout and NavMenu, Home, Counter, Weather (sample JSON), a Counter test |
| D-N2 | How a library sets itself up | `tsazor.setup` in its `package.json` (styles, services, layout) plus its peers; read before any file is written |
| D-N3 | The library choice in the prompt | registry search by the keyword `tsazor-components` plus free text; no list in the starter |
| D-N4 | `tsazor add` for existing apps | after 1.0 |
