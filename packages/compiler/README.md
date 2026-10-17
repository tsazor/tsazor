# @tsazor/compiler

The compiler of [Tsazor](https://github.com/tsazor/tsazor#readme): `.tsazor` files — Razor markup with TypeScript in `@code` — become
TypeScript modules that build a render tree, as Blazor's Razor compiler does for `.razor`.

You don't call it yourself: [`@tsazor/vite-plugin`](https://www.npmjs.com/package/@tsazor/vite-plugin) compiles your components and
[`@tsazor/cli`](https://www.npmjs.com/package/@tsazor/cli) checks them. Its programmatic API is for Tsazor's own tools: released in lockstep with them,
it may change in any release and is not covered by the stability promise
([support policy](https://github.com/tsazor/tsazor/blob/main/docs/support-policy.md), D-S7).

- [Language reference](https://github.com/tsazor/tsazor/blob/main/docs/language-reference.md)
- [Architecture](https://github.com/tsazor/tsazor/blob/main/docs/architecture.md)
