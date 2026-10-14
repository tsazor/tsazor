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
- **`tsazor build-lib [dir] [--stylesheet <file>]`** builds a component library: `src/*.tsazor` and `src/*.ts`
  into `dist/`, with the component manifest, a declaration per component and the index, after type-checking the
  sources as `tsazor check` does (`--no-check` skips it); `--stylesheet` joins
  `src/styles/*.css` and the components' sidecar CSS into one file. A build script that needs more (internal
  components, aliases, re-exports) calls `buildLibrary(options)`; see
  [component libraries](../../docs/component-libraries.md#building-a-library).

See [migrating from Blazor](../../docs/migration.md) and the
[C# to TypeScript cheat sheet](../../docs/csharp-to-typescript.md).
