# Tsazor compared to React and Vue

React and Vue are the frameworks a team compares Tsazor with. This page says what the published numbers contain,
how the three work differently, and where React and Vue are ahead. The numbers come from the bench
([apps/bench](../apps/bench/README.md)) and from the fullstackhero port ([bundle-size.md](bundle-size.md)).

## What the numbers contain

Tsazor's runtime holds what React and Vue leave to libraries. That makes a bare comparison of framework sizes
misleading in both directions:

| | Tsazor | React | Vue |
|---|---|---|---|
| Routing | built in: `Router`, `NavLink`, layouts, hash or history mode | `react-router` | `vue-router` |
| Forms and validation | built in: `EditForm`, the inputs, DataAnnotations rules, Standard Schema | e.g. `react-hook-form` + `zod` | e.g. `vee-validate` + `zod` |
| Dependency injection | built in: services, `inject()`, `@inject` | context | `provide`/`inject` (built in) |
| Authorization | built in: `AuthorizeView`, `AuthenticationStateProvider` | own code | own code |
| Localization | built in: `StringLocalizer`, cultures | e.g. `i18next` | e.g. `vue-i18n` |
| Document head | built in: `PageTitle`, `HeadContent` | `<title>` in components (React 19) | e.g. `@unhead/vue` |
| Virtualized lists | built in: `Virtualize` | e.g. TanStack Virtual | e.g. `vue-virtual-scroller` |

What an app doesn't use stays out of its bundle. A few core parts always come along, such as the
`NavigationManager` that every app has, as in Blazor.

### The bench

The bench apps switch their two views with a few lines of hash switching, so that the table measures the
framework and not a router. Because Tsazor's router is part of its runtime, the bench also measures the same app
written the usual way, with each framework's router in hash mode (2026-10-15, gzip, all JavaScript):

| | Without a router | With its router (hash mode) | The router adds |
|---|---:|---:|---:|
| Tsazor | 24.3 KB | 28.2 KB (`Router`, a layout, `NavLink`) | 3.9 KB |
| Vue 3.5 | 26.3 KB | 35.4 KB (`vue-router` 5.4) | 9.1 KB |
| React 19.3 | 69.2 KB | 81.9 KB (`react-router` 8.4) | 12.7 KB |

Svelte (15.1 KB without a router) has no router of its own outside SvelteKit, so it has no second number. The
Vue and React router variants aren't in the repository, because they would add those packages to it. To rebuild
them, copy `apps/bench/vue` or `apps/bench/react`, add the router, and route `#/todo` and `#/rows` with
`createWebHashHistory` (Vue) or `HashRouter` with `NavLink` (React).

In the DOM operations Tsazor leads at create, update every 10th, swap, select and remove, and in retained memory,
with or without its router; React and Vue are slower in each of them. Append varies too much between runs to name
a winner: Tsazor and Svelte take turns. The table is in the bench README.

### A real app

The fullstackhero port has the same pages as its React original and passes the original's acceptance suite.
Its fixed part is much smaller: 31 KB for the runtime and its built-ins, against 142 KB for React, ReactDOM and
the libraries the original needs. Its code per component is larger: compiled `.tsazor` is about 1.4 times the
original's JSX. All chunks together come to 264 KB against 322 KB, and the first load to 98 KB against 187 KB. Tsazor's
lead is largest for small and mid-sized apps and shrinks as the number of components grows
([bundle-size.md](bundle-size.md)).

## How they work differently

- **When a component renders.** Tsazor follows Blazor. A component renders after its own event handlers, when
  its parameters change, and when it calls `stateHasChanged()` or assigns a `@State` field. There are no proxies
  and no dependency tracking, so what renders follows from events and explicit calls, and it is the same every
  time. A change from outside an event, such as a library's callback, needs `stateHasChanged()`
  ([guide-live-data.md](guide-live-data.md)).
  - Vue tracks which component reads which reactive value and re-renders only those. It does less work
    without any help, but the dependency graph is implicit.
  - React re-renders a component and its children when its state changes, unless they are memoized
    (`memo`, `useMemo`, `useCallback`).
- **How a render reaches the DOM.** Tsazor builds a flat list of frames and diffs it against the previous one,
  with sequence numbers from the compiler, as Blazor does. The compiler adds invisible hints: static markup as
  one block, stable event handlers, and keyed rows whose values didn't change are skipped
  ([design-render-hints.md](design-render-hints.md)). React diffs a tree of elements. Vue's compiler marks
  what can change in a template (patch flags).
- **Components.** A `.tsazor` file is Razor markup with a TypeScript class (`@code`). A Blazor team reads it at
  once, and `tsazor check` and the language server type-check the markup. React uses functions with JSX and
  hooks; Vue uses single-file components with a template and `<script setup>`.
- **Lifecycle and async.** Tsazor has Blazor's lifecycle (`OnInitializedAsync`, `OnParametersSetAsync`,
  `OnAfterRenderAsync`). By default an in-app navigation keeps the previous page until the new one has its data.
  React uses hooks and Suspense; Vue uses lifecycle hooks and, experimentally, Suspense.
- **Shared state.** Tsazor uses services and cascading values. React uses context and stores such as Redux or
  Zustand. Vue uses `provide`/`inject` and Pinia.

## Where React and Vue are ahead

- **Server rendering.** Next.js and Nuxt render on the server and hydrate. Tsazor 1.0 renders in the browser
  only; server rendering comes [after 1.0](after-1.0.md#server-side-rendering).
- **Ecosystem.** Both have far more component libraries, examples and people who know them. Tsazor has its own
  libraries (`@tsazor/fluent`, `@tsazor/bootstrap`, charts, markdown). Any plain JS or TS library works through
  `@attach`, but React or Vue components need their own runtime beside it.
- **Size per component.** JSX and Vue templates compile to less code per component than `.tsazor` does
  (see above).

## Who Tsazor is for

Tsazor is for teams with .NET backends that know Blazor and want the browser in TypeScript: Razor markup,
DataAnnotations, dependency injection and the authorization model carry over, and the backend stays as it is. A
team whose strength lies in React's or Vue's ecosystem gains less from it.
