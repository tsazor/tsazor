# @tsazor/compiler

The compiler of [Tsazor](../../README.md): `.tsazor` files — Razor markup with TypeScript in `@code` — become
TypeScript modules that build a render tree, as Blazor's Razor compiler does for `.razor`.

You rarely call it yourself: [`@tsazor/vite-plugin`](../vite-plugin) compiles your components and
[`@tsazor/cli`](../cli) checks them. A component library calls `buildPackageManifest` at build time to describe its
components for editors and `tsazor check` (see [component libraries](../../docs/component-libraries.md)).

- [Language reference](../../docs/language-reference.md)
- [Architecture](../../docs/architecture.md)
