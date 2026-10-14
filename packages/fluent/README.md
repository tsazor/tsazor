# @tsazor/fluent

Fluent 2 design system for [Tsazor](../../README.md) — token-driven, accessible
components written in `.tsazor`. No external UI kit underneath: the tokens and
chrome are in-house, and the **components belong to you** (copy-in via the CLI).

```bash
pnpm add @tsazor/fluent
```

```ts
import "@tsazor/fluent/fluent.css";
```

## Quick start

```html
<FluentProvider theme="@this.theme">
    <Button intent="primary" onClick="@(() => this.save())">Save</Button>
</FluentProvider>
```

Theming: `FluentProvider`'s `theme` is `"system"` by default (the OS's preference) or pins
`"light"` / `"dark"`; `data-fluent-theme` on `<html>` (or any element) does the same, plus a compact
density attribute. `FluentProvider` takes `tokenOverrides` for
single-token customizations, typed as `FluentTokenOverrides`: the brand ramp and the
semantic tokens are public, the sheet's other tokens internal.

## The Add-CLI (copy-in)

```bash
npx @tsazor/fluent list
npx @tsazor/fluent add Dialog
```

Copies real `.tsazor` sources (component + sidecar CSS + needed siblings) into
`src/components/` and the tokens once into `src/styles/`. `--print` is the
dry-run. The copied sources compile through your own vite-plugin pipeline —
they are yours to edit. They expect the standard runtime `@import` set in your
`_Imports.tsazor` (see `docs/getting-started.md`), like `src/_Imports.tsazor`
in this package.

## Docs

Full documentation lives in [`docs/fluent.md`](../../docs/fluent.md).
The gallery app (`apps/gallery`) demonstrates every component plus an
admin dashboard (filter/sort/paging table, validated form, dialogs, toasts)
with light/dark theming.