---
title: Typed checks
keywords: type checking, parameters, compile-time errors
focus: App.tsazor
typeErrors: true
---

The preview says "Welcome back, !" and "1 new messages". In Blazor, neither bug would get
past the C# compiler. Here the app runs — and that's the first thing to internalize about
building TypeScript: the build transpiles, it doesn't type-check.

Type checking is a separate step: `tsazor check`. It generates the same code as the compiler
plus type checks for the markup (each component attribute against its parameter type), and
runs TypeScript over all of it — the counterpart of the Razor/Roslyn compile. The tutorial
runs it live; the problems panel shows:

- **TS2339** — `user` has no property `nmae`. Fix the typo.
- **TS1360** — `Badge`'s `count` is a `number`; `unread` is the string `"1"`, so
  `count === 1` is false and the badge says "messages". Make `unread` a number.

There isn't a type annotation in either file: TypeScript infers `{ name: string }` and
`number` from the values, as `var` does in C# — only further. Types keep the app stable, and
inference does most of the work; annotate parameters and empty arrays. Tsazor projects run
strict TypeScript (`"strict": true`, the counterpart of nullable reference types with warnings
as errors); `tsazor check` warns when a tsconfig isn't strict.

> **Coming from Blazor:** treat `tsazor check` like the C# compiler step you no longer get
> for free. Run `npx tsazor check` in CI (it exits non-zero on errors), set `check: true` in
> the Vite plugin to fail production builds, and rely on the VS Code extension while
> editing — it reports the same diagnostics. `TZS…` codes are compiler errors (like Razor's
> `RZ…`): those stop the build, and the preview keeps the last good version.
