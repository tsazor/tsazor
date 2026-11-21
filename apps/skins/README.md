# One set of pages, two skins

The same `.tsazor` pages built twice: with `@tsazor/bootstrap` and with `@tsazor/fluent`. The pages
say `@using @tsazor/bootstrap` (in `src/_Imports.tsazor`); the fluent build points that package at
`@tsazor/fluent` (`vite.config.ts`) and loads `fluent.css` instead of Bootstrap's stylesheet
(`src/Program.ts`). In an app of your own, switching the skin is that `@using` line and the stylesheet.

```sh
pnpm --filter skins dev          # Bootstrap on http://localhost:5323
pnpm --filter skins dev:fluent   # Fluent on http://localhost:5324
pnpm --filter skins verify       # builds both, runs the same checks on both
```

The link at the top right of every page opens the same page in the other build.

The pages use only what both skins share — the component names (`Dialog`, `Dropdown`, `Form`, …,
with aliases where the design systems name things differently: `Modal`/`Dialog`, `Menu`/`Dropdown`,
`FluentForm`/`Form`) and their parameters (`intent`, `appearance`, `size`, `label`, `help`,
`ariaLabel`, …). Skin extras (Fluent's `shape`, Bootstrap's `pill`) exist on top; a page that uses
them is tied to its skin.

`scripts/verify.mjs` serves both builds and runs axe (WCAG 2.2 AA) on every page plus the
behaviors — menu, popover, tooltip, form validation, grid sorting/paging/selection, dialog, drawer,
toasts, tabs, accordion, pagination — found by role, label and text, so both skins must behave
alike.
