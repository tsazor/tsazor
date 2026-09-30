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
    <Button appearance="primary" onClick="@(() => this.save())">Save</Button>
</FluentProvider>
```

Theming: light by default, `data-fluent-theme="dark"` on `<html>` for dark,
plus a compact density attribute. `FluentProvider` takes `tokenOverrides` for
single-token customizations.

## The Add-CLI (copy-in)

```bash
npx @tsazor/fluent list
npx @tsazor/fluent add Dialog
```

Copies real `.tsazor` sources (component + sidecar CSS + needed siblings) into
`src/components/` and the tokens once into `src/styles/`. `--print` is the
dry-run. The copied sources compile through your own vite-plugin pipeline —
they are yours to edit.

## Docs

Full documentation lives in [`docs/fluent.md`](../../docs/fluent.md).
The gallery app (`apps/gallery`) demonstrates every component plus an
admin dashboard (filter/sort/paging table, validated form, dialogs, toasts)
with light/dark theming.