# @tsazor/workspace

How a [Tsazor](../../README.md) project resolves its components: the `_Imports.tsazor` chain, `@using` directories,
components and types from packages, and the runtime's built-ins. Shared by [`@tsazor/vite-plugin`](../vite-plugin),
[`@tsazor/cli`](../cli) and the language server so that the build and the editor see the same project.

An internal building block: apps don't depend on it directly.
