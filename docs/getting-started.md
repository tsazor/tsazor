# Getting Started

Coming from C#? The [C# to TypeScript cheat sheet](csharp-to-typescript.md) maps the language
and the base class library, and the interactive tutorial's Blazor track opens with a short
chapter, "TypeScript for C# developers".

## Setup

Tsazor apps run on Vite (dev server, build, HMR). The plugin compiles every `.tsazor` file to an
ES module on demand.

```bash
pnpm install
pnpm demo:dev
```

The demo (`apps/demo`) shows: Counter (@onclick + state), routing with a layout and NavLink, a
form with validation (`@bind` + EditForm), Virtualize over 10,000 items, and FetchData via
`TsazorHttp`.

### External use (npm)

The packages ship as `@tsazor/*` (tarball gate: `node scripts/tarball-smoke.mjs` tries exactly
this setup in an isolated project):

```bash
pnpm add @tsazor/runtime @tsazor/vite-plugin @tsazor/cli
pnpm add -D typescript vite
```

```ts
// vite.config.ts — exactly the form used by the gate
import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

export default defineConfig({
    plugins: [tsazor()],
});
```

The CLI also runs from an installed tarball: `npx tsazor check` or
`node node_modules/@tsazor/cli/dist/bin.js check .`. For component tests, add
`@tsazor/testing` as well (the Vitest config needs the same plugin call so that `.tsazor`
imports load in tests — see the form in the [Tests](#tests) section).

## Project structure

The minimal layout below; for an app that grows past a few pages (feature folders, services, containers
and presentational components, testing) see [patterns.md](patterns.md).

```
my-app/
├── index.html               # <div id="app"> + <script src="/src/Program.ts">
├── vite.config.ts           # plugins: [tsazor()]
└── src/
    ├── Program.ts           # createTsazorApp({ root: App, routes })
    ├── _Imports.tsazor       # project-wide directives (@layout, @using, standard @imports)
    ├── App.tsazor            # root component (Router)
    ├── MainLayout.tsazor     # layout (@inherits LayoutComponentBase, @Body)
    ├── MainLayout.tsazor.css # (optional) scoped CSS, MainLayout only
    └── Pages/
        ├── Home.tsazor       # @page "/"
        ├── Counter.tsazor    # @page "/counter"
        └── …
```

Every `X.tsazor` file can optionally have a sidecar stylesheet `X.tsazor.css` (CSS isolation,
[Scoped CSS](scoped-css.md)) and a code-behind class `X.tsazor.ts`
([Code-behind](code-behind.md)).

## tsconfig

Tsazor uses **standard decorators** (TC39, TS 5.2+) and standard class fields. The app needs
nothing special for this — just **no** `experimentalDecorators` (with it, every `@Parameter()`
would be checked as a legacy decorator and rejected at runtime):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "strict": true
  }
}
```

- **`strict: true` is the supported configuration** — and the only one. Templates, the tutorial
  and the typed checks of the markup assume it: without strict null checks a missing value slips
  through `@if` and bindings unnoticed, and without `noImplicitAny` an untyped lambda parameter
  disables the checks behind it. `tsazor check` (and the Vite plugin's `check` option) warn with
  `TSZSTRICT` when the tsconfig leaves `strict` off or switches one of its flags off again.
  Inference does most of the typing; annotate where it can't see far enough (parameters,
  empty arrays).
- `target` ES2022 or newer ⇒ `useDefineForClassFields` is `true` (the TS default), matching the
  generated code. A pure type redeclaration of an inherited field is written `declare x: T`.
- `lib` ES2023 ⇒ the newer array methods (`toSorted`, `toReversed`, `findLast`) type-check
  out of the box.
- Decorators are lowered by esbuild (via the Vite plugin, also for the app's `.ts` files); no
  browser runs them natively yet. The runtime polyfills `Symbol.metadata`.
- Hand-written components without decorator syntax (plain JS, tests) declare parameters with
  `defineParameter(Class, "name", options?)` from `@tsazor/runtime`.

## Bootstrap

```ts
import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import routes from "virtual:tsazor-routes";

createTsazorApp({ root: App, routes });
```

- `routes` comes from the virtual manifest that the plugin generates from all `@page` files
  (template, component and, if present, layout for each).
- `createTsazorApp` builds the DI container + NavigationManager, renders the root into `#app`,
  and registers the HMR hook (`globalThis.__tsazor`).

### Hosting: history or hash routing

Routing follows Blazor: the route is the URL path (`/orders/5`). A deep link or reload then hits the
server with that path, so the server must answer unknown paths with `index.html` (Vite's dev server
and `vite preview` do; for production configure a rewrite/fallback). If you **cannot** configure
that — plain static file hosting, an app embedded as an iframe whose host you do not control — opt
into hash routing (Tsazor extension):

```ts
createTsazorApp({ root: App, routes, routing: { mode: "hash" } });
```

Routes then live in the fragment (`index.html?token=abc#/orders/5`); pages, `@page` templates,
`NavLink` and `SupplyParameterFromQuery` stay unchanged, and the real query string is never touched.
Write plain route links as `href="#/…"` (or use `NavLink`). Details:
[Hash routing](language-reference.md#hash-routing-tsazor-extension).

## _Imports.tsazor

The counterpart of Blazor's `_Imports.razor`: its directives apply to all `.tsazor` files in the
same folder and below. Where Blazor writes `@using Microsoft.AspNetCore.Components`, Tsazor has
the **standard runtime set** as `@import`s (the build removes unused imports):

```razor
@layout MainLayout
@using ./Shared
@* Standard runtime set (Blazor: @using Microsoft.AspNetCore.Components.*). *@
@import { ComponentBase, LayoutComponentBase, Parameter, CascadingParameter, EventCallback, RenderTreeBuilder, inject } from "@tsazor/runtime"
@import { NavigationManager, Router, RouteView, AuthorizeRouteView, LayoutView, NavLink, NavLinkMatch } from "@tsazor/runtime"
@import { EditContext, AuthenticationState, AuthenticationStateProvider, TsazorHttp } from "@tsazor/runtime"
@import type { RenderFragment, RouteData, ModelValidator } from "@tsazor/runtime"
@* App-specific types/helpers (Blazor: @using MyApp.Models) *@
@import type { Order, Pizza } from "./models"
@import { formatDate } from "./format"
```

Names used by markup or `@code` must be imported — there is **no** import inference from
identifiers. A component class that `@code` needs as a value (e.g. `DefaultLayout` on the
Router) is imported explicitly:
`@import MainLayout from "./MainLayout.tsazor"`. See [`@import`](language-reference.md#import).

## Component resolution

Tags that start with an uppercase letter are components. They are resolved the way C# type names
are resolved via namespaces and `@using`:

1. **Explicitly imported** (`@import X from "./X.tsazor"`) ⇒ exactly that class.
2. **Enclosing folders:** the file's own directory, then the directories of the
   `_Imports.tsazor` chain (siblings are visible); the nearest match wins.
3. **`@using` sources** as a whole: `@using` folders (from the file and the `_Imports` chain),
   the runtime built-ins (`Router`, `NavLink`, `EditForm`, `InputText`, `Virtualize`, …) and
   bare-package `@using`s — a package only contributes names that its entry module actually
   exports. If a tag is found in **more than one** source ⇒ error TZS017 (ambiguous); in none ⇒
   warning TZS005 (emitted as a plain element).

`@using` forms:

| Syntax | Meaning |
|---|---|
| `@using ./Shared` | Directory containing components (and `@inject` types), relative to the file or `_Imports.tsazor` |
| `@using @tsazor/fluent` | npm package; tags/types only from its export list |

A `@using` folder or package that does not exist is a warning (TZS018).
`@inject`/`@inherits` types are resolved through the same sources; whether a default or a named
import is generated depends on the target file's **actual** export (`.tsazor` ⇒ default).

## Tests

```ts
import { expect, test } from "vitest";
import { render } from "@tsazor/testing";
import Counter from "./Pages/Counter.tsazor";

test("increments", async () => {
    const counter = await render(Counter, { parameters: { step: 1 } });
    await counter.click("button"); // clicks and waits for the render (async handlers too)
    expect(counter.find("strong").textContent).toBe("1");
});
```

`render` mounts the component (bUnit's `RenderComponent`) and returns helpers that act like a
user and wait for the render: `find`/`findAll` (CSS selectors; `find` fails when nothing
matches), `click`, `change` (sets a value and raises `change`, which `@bind` listens to),
`setParameters`, `settle`, plus `container`, `markup` and the `instance`. Parameters are typed
against the component's fields. A failure of the component — a missing service, an exception in
a lifecycle method or an event handler — fails the call that waited for it.

Fakes go in through DI, as in the app: `render(Page, { services: (s) => s.registerValue(Clock, fake) })`.
For HTTP, register a `TsazorHttp` with a `fetch` function that answers instead of the network:
`new TsazorHttp({ baseUrl, fetch: async (request) => new Response(JSON.stringify(data)) })`.

## Connecting a backend (`@tsazor/dotnet`)

For a .NET backend (ASP.NET Core, Swashbuckle/NSwag OpenAPI), [`@tsazor/dotnet`](https://www.npmjs.com/package/@tsazor/dotnet)
is the single bridge, instead of app-specific HTTP helpers (details and deviations: [README](../packages/dotnet/README.md)):

```bash
npx tsazor-dotnet generate https://my.app/swagger/v1/swagger.json --out src/api
```

```ts
import { PizzaApiClient } from "./api/pizza-api";

const client = new PizzaApiClient(new TsazorHttp());
const result = await client.getOrders();
if (result.ok) {
    // result.body is the DTO type from the schema
} else {
    // result.problem: ProblemDetails | null, result.validationErrors?: Record<string, string[]>
    console.error(problemMessage(result));
}
```

Errors are `HttpResult` values (ProblemDetails, envelope) — it only throws when the backend is
unreachable; the generated DTO classes carry the DataAnnotations decorators from the schema and
validate out of the box with EditContext + `DataAnnotationsValidator`.

Signing users in: [Authentication](auth.md) — the BFF pattern with an HttpOnly cookie is the
default, with an ASP.NET Core template; `AuthorizeView`/`@authorize` are UI only, the server
enforces.

## VS Code

`packages/vscode` contains the extension (v0.6.0): a TextMate grammar (`source.tsazor`) plus the
bundled language server (`@tsazor/lsp`, `--stdio`), which starts one server instance per
workspace:

- **Diagnostics** live from the compiler (catalog `TZS001…`) plus mapped TypeScript diagnostics
  from the typed shadow modules (toggleable)
- **Hover** over components, directives and slot tags
- **Go-to-definition** to `.tsazor` source files and `@inject` type modules
- **Auto-complete**: tag names, component parameters (including `@bind-<param>`),
  directive keywords and expression members
- **Quick fixes** for the mechanical C# → TypeScript compiler fixes (the same fixes
  `tsazor codemod` applies in bulk)

To test locally: open the `packages/vscode` folder in VS Code → `F5`
(Extension Development Host). Details: [language-server.md](language-server.md).
