# @tsazor/cli

The command line of [Tsazor](../../README.md).

```bash
npm install -D @tsazor/cli
```

- **`tsazor check [root]`** type-checks every `.tsazor` component under `root` — markup, parameters, bindings and
  the TypeScript in `@code` — with the compiler's and TypeScript's diagnostics. Run it in CI like a build; it exits
  with 1 on any error.
- **`tsazor codemod <path> [--write]`** moves `.razor` files over: it converts the mechanical C# leftovers in the
  markup (`@foreach (var x in xs)`, `var`, `$"…"` strings) and writes `<name>.tsazor` beside each file with
  `--write`; without it, it reports what it would change. The C# in `@code` you port to TypeScript yourself.

See [migrating from Blazor](../../docs/migration.md) and the
[C# to TypeScript cheat sheet](../../docs/csharp-to-typescript.md).
