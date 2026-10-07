---
title: Your own project
keywords: new project, Vite, setup, migration
focus: Program.ts
---

A Tsazor app is a Vite project with the Tsazor plugin. Install the packages, then add
`tsazor()` to the plugins in `vite.config.ts`:

```bash
npm install @tsazor/runtime @tsazor/vite-plugin @tsazor/cli
npm install -D typescript vite
```

`Program.ts`, on the right, is your `Program.cs`: it registers services and mounts the root
component. `npx vite` runs the app with hot reload, `npx tsazor check` type-checks every
component (run it in CI, like a build), and `npx vitest` runs your bUnit-style tests.

Moving existing `.razor` files? `npx tsazor codemod Pages --write` converts the mechanical
C# leftovers in the markup: `@foreach (var x in xs)`, `var`, `$"…"` strings,
`.ToString()`. The C# in `@code` you port to TypeScript yourself. The
[C# to TypeScript cheat sheet](https://github.com/HolgerTheHuck/Tsazor/blob/main/docs/csharp-to-typescript.md)
maps the language and the base class library.

> **Coming from Blazor:** your ASP.NET Core backend stays as it is. Point
> `npx tsazor-dotnet generate` at its OpenAPI document for a typed client, as in the
> backend chapter. The full setup is in the
> [getting started guide](https://github.com/HolgerTheHuck/Tsazor/blob/main/docs/getting-started.md).
