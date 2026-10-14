# @tsazor/compiler

The compiler of [Tsazor](../../README.md): `.tsazor` files — Razor markup with TypeScript in `@code` — become
TypeScript modules that build a render tree, as Blazor's Razor compiler does for `.razor`.

You don't call it yourself: [`@tsazor/vite-plugin`](../vite-plugin) compiles your components and
[`@tsazor/cli`](../cli) checks them. Its programmatic API is for Tsazor's own tools: released in lockstep with them,
it may change in any release and is not covered by the stability promise
([support policy](../../docs/support-policy.md), D-S7).

- [Language reference](../../docs/language-reference.md)
- [Architecture](../../docs/architecture.md)
