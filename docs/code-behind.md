# Code-behind (`X.tsazor.ts`)

Tsazor mirrors Blazor's two-file component layout, resolved through **inheritance**
instead of partial classes (TypeScript has no partial classes):

```
X.tsazor        (markup, @code optional)          → generated class
X.tsazor.ts     (state + logic, default export)   → generated class extends it
```

```
generated class X extends (default export of X.tsazor.ts)
  extends <own base of the code-behind, usually ComponentBase>
```

## Conventions

- **Pairing by stem.** `CodeBehindDemo.tsazor` ↔ `CodeBehindDemo.tsazor.ts` — same
  directory. Without a sibling, nothing changes: the file compiles exactly as before.
- **Default export required.** The class name in the sidecar is irrelevant (the
  compiler imports the *default* export under a stable binding, `<ClassName>Base`).
- **The sidecar declares its own base.** `export default class X extends
  ComponentBase { … }`. This is where `@inherits` chains move to — e.g.
  `extends LayoutComponentBase` when the markup has `<@Body>` projection (or a
  shared app base class).
- **Markup stays in the .tsazor.** The sidecar holds state, methods, getters,
  decorators (`@Parameter()`, `@CascadingParameter()`) and lifecycle overrides
  (`onInitialized`, `onParametersSet`, `onAfterRender`, `shouldRender`).
- **`@code` still works alongside.** Both merge: sidecar members are the base,
  `@code` members join the generated class. Overriding a code-behind method in
  `@code` is plain TS inheritance.
- **What the markup reads is `protected` (or public).** The markup's class is a
  *subclass* of the sidecar, so a `private` member used in the markup is TS2341
  in `tsazor check` (*Property 'x' is private and only accessible within class
  'XBase'*) — unlike a C# partial class, which shares `private` members. Keep
  `private` for helpers only the sidecar itself uses.

## What already works through the chain (runtime)

- `@Parameter()` / `@CascadingParameter()` in the code-behind are discovered: they
  are standard decorators recording into the code-behind class's own
  `Symbol.metadata`; `getParameterInfo` walks the class chain (base first, the
  generated class's re-declaration wins).
- Lifecycle overrides in the code-behind are called (plain inheritance).
- Bare identifiers in markup (`@count`) are baked to `this.*` by the compiler and
  resolve to code-behind members at runtime.
- Own `inject()` fields work in the sidecar: field initializers run during
  constructor-time DI scope activation (`withServices` around instantiation).

## Class fields (`[[Define]]`)

Fields follow standard semantics (`useDefineForClassFields`, the TS default for
ES2022): the code-behind's fields are defined first, then the generated class's
`@inject` fields and `@code` fields. Consequences for `@code` next to a sidecar:

- A field re-declared in `@code` **without** an initializer resets the sidecar's
  value to `undefined`; for a type-only re-declaration write `declare count: number;`
  (the editor reports TS2612 otherwise).
- A `@code` field named like a sidecar getter/setter **shadows** the accessor (the
  setter is not called) — TS reports TS2610.
- Methods, getters and `override`s are unaffected (prototype members).

## Known limits (documented, v1)

| Limit | Why | What to do |
|---|---|---|
| Code-behind members are not **type-seen** by the generated class's `@inject` fields | TypeScript: base-class methods can't reference derived-class members | Runtime works via dynamic `this`; for typed access, declare the service in the code-behind itself (`private readonly nav = inject(NavigationManager)`) |
| `@inherits` in the .tsazor is ignored when a sidecar exists | One base class, two writers — the sidecar wins | Compiler emits a `TZS011` warning; keep the base in the sidecar |
| Editing the sidecar causes a full reload, not HMR | `.tsazor` module only self-accepts; a `.ts` edit bubbles to the app root (same as editing any `models.ts` today) | `acceptDependencies` is a possible v2 refinement |
| Non-default exports (no `export default class`) fail at module load ("extends undefined") | v1 has no sidecar content pre-gate | Always default-export the class |
| Spread attributes can theoretically override the scope attribute | see docs/scoped-css.md | — |

## Implementation

| Concern | Location |
|---|---|
| `codeBehindClass` option + `extends` emission + TZS011 | `packages/compiler/src/codegen.ts` |
| Sidecar detection (`existsSync`), import push, option pass | `packages/vite-plugin/src/index.ts` |
| `.ts` sidecar transpile (class fields per the app tsconfig; standard decorators lowered via the plugin's `esbuild.supported`) | Vite's normal TS pipeline |
| Parameter-chain discovery (decorator metadata per class) | `packages/runtime/src/components/parameter-metadata.ts` |
| Demo + browser checks | `apps/demo/src/Pages/CodeBehindDemo.tsazor(.ts)`, `scripts/verify-code-behind.mjs` |