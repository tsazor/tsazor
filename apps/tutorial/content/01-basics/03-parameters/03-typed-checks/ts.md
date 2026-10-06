---
title: Typed checks
keywords: type checking, parameters, compile-time errors
focus: App.tsazor
typeErrors: true
---

Look at the preview: "Welcome back, !" and "1 new messages". Two bugs — and the app runs
anyway. Like every TypeScript build, compiling a component removes the types; nothing
stops at a type error.

That's why Tsazor comes with `tsazor check`. It sees each component the way TypeScript sees
any class: the markup becomes code in the component's `buildRenderTree`, so every
expression in it is checked against your fields, and every attribute against the parameter
it sets. This tutorial runs the check as you type — look at the problems panel below the
editor:

- **TS2339** — `user` has no property `nmae`. The markup reads members of the component, and
  TypeScript knows their types. Fix the typo.
- **TS1360** — `count` is a `number` parameter of `Badge`, but `unread` is the string `"1"`.
  That's why the badge says "messages": `"1" === 1` is false. Make `unread` a number.

Both problems point at the exact spot in the `.tsazor` file, and the squiggles in the editor
are the same diagnostics.

Notice what you *didn't* write: not a single type. `user = { name: "Ada" }` is known to have a
`name`, `@Parameter() count = 0` is known to be a number — TypeScript **infers** the types from
the values. That's the deal: you write ordinary code, and the types come along for free and
keep the app stable as it grows. Rename a field, change a parameter, and every place that no
longer fits lights up before anyone opens the page. You add a type yourself only where
inference can't see far enough — a function parameter, an empty array that will hold orders
later. That's also why Tsazor projects run TypeScript in **strict** mode: it's what lets the
checks catch a missing value or an untyped parameter instead of letting it slide.

In your own project, run `npx tsazor check` (it exits with an error code, so it fits right
into CI), or set `check: true` in the Vite plugin to make the production build fail on type
errors. The editor extension shows the same diagnostics while you work.

Compiler errors — the codes starting with **TZS**, like the unknown parameter in the
previous lessons — are different: the component can't be built at all, and the preview
keeps showing the last version that compiled.
