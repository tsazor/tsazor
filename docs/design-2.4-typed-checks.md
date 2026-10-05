# 2.4 — Typed checks: design

Goal (roadmap 2.4): the type layer (shadow modules) checks component usage —
attribute values against parameter types, slot contexts against `RenderFragment<T>`,
`@ref` against the target type — and the types flow through the shadow graph even from
closed files. `tsazor check` turns the checks into a gate (non-zero exit).

## 1. Compiler — shadow emission (`typedShadow`)

`CompileOptions.typedShadow` enables shadow-only emission; real builds
stay byte-identical, except for the `@ref` form:

- **Attribute value checks** (T2, "`<Greeter Name="@(123)" Nmae="typo"/>` → 0
  diagnostics"): value attributes of known parameters (categories `value`/`string`,
  not `uncertain`, metadata complete) emit
  `__builder.addAttribute(seq, "Name", (value) satisfies Type)`. The check runs
  through the shadow TS cycle back into the source; `Nmae` is TZS025 (2.2),
  the value violation comes through the LSP/CLI layer as a TS diagnostic.
  Optional parameters get `Type | undefined`. Type text = substituted
  parameter annotation from the 2.1 metadata; unknown/uncertain types are
  not checked (the TZS026 warning stays).
- **Slot context types**: `RenderFragment<T>` emits
  `(context: Person) => (_builder) => …` instead of `(context: any) => …`. The type
  comes from `parameter.typeArgument` (new, computed like `type` with `references`),
  substituted with the tag's type arguments. Unresolvable ⇒ `any`, unchanged.
- **Type imports** (2.1 remainder): references of the parameter types land in the
  shadow as `import type …` — `runtime` via the runtime import alias,
  `import` via a `rebaseSpecifier` hook from `@tsazor/workspace`
  (declaring module + specifier → an import resolvable from the using module),
  `local` ⇒ parameter unchecked (the type cannot be imported from the
  foreign module).
- **`@ref` types** (TS2740 false positive): elements emit
  `this.x = el as HTMLElementTagNameMap[tag]` (SVG likewise; unknown tags without
  a cast), components `addComponentReferenceCapture(seq, (c) => { this.x = c as Type; })`.

## 2. Runtime — component `@ref` captures the instance

Real Blazor behavior: `@ref` on a component yields the instance, not
the parent element (until now the capture action did not fire on component frames at
all). New: `FrameType.ComponentReferenceCapture`,
`RenderTreeBuilder.addComponentReferenceCapture(sequence, action)`; the renderer
fires the captures of freshly created components with the instance. The codegen
switches to the new API for `@ref` on component tags — in the real build too
(DOM semantics unchanged, the cast is erased).

## 3. LSP — type layer for all project files (T4)

The shadow graph holds the shadows of all `.tsazor` files in the project, not just the
open documents: scanned on initialize, refreshed before every publish,
`didChangeWatchedFiles` keeps newly created/deleted files current. This way
`<Greeter @ref="g"/>` is checked against the source of closed components.

## 4. `TItem` inference via types

For generic tags without complete explicit type arguments, the type service
determines, from the TS program, the type of the attribute value whose parameter type
uses the type parameter (exactly or as an array), and checks against the
substituted variant shadow. Without resolution everything stays as before
(context `any`, parameter unchecked) — no false positives.

## 5. CLI `tsazor check` (T1) — `@tsazor/cli`

`tsazor check [root]`: compiles every `.tsazor` in the project (compiler diagnostics)
and loads all shadows into a `TsazorTypeService` (TS syntax and semantic
diagnostics, filtered like the LSP layer). Output `file(line,column) code message`,
exit 1 on errors, otherwise 0. The Vite plugin gets `check: true` (end of build).

## 6. Package types

`@tsazor/fluent` and `@tsazor/components` build a `.d.ts` per component with
typed parameters (from the manifest) instead of `export const X: any`. Ambient
types for `*.tsazor` and `virtual:tsazor-routes` move into
`@tsazor/vite-plugin/client` — the apps' copied `types.d.ts` files go away.
`tsazor check` goes into every app's gate scripts.

## 7. Status (implemented, branch `roadmap/p2-4-typed-checks`)

Implemented as in §1–§6, with these deltas:

- **Slot contexts:** the runtime placeholder `typeArgument === "unknown"`
  (untyped delegate, e.g. Virtualize `itemTemplate`) leaves the context
  `any` **deliberately** — the design only said "unresolvable ⇒ any"; the
  difference here is that it *is* resolvable, but there is no real type behind it.
- **Shadows re-export the component class by name** (`export { X }`) —
  not in the design, but needed because apps import package components as named imports
  (Rewrite B) and the shadows would otherwise throw TS2614.
- **Cross-package cascade:** the TypeService automatically builds shadows of imported
  foreign-package `.tsazor` files (Rewrite B targets outside the project root) during
  `buildEntry` — cycle-guarded via a `building` set. The design had planned the
  T4 scan only for files *inside* the root (TS2307 in the gallery).
- **`checkProject` is two-pass:** pass 1 compiler diagnostics + shadow build of all
  files, only then pass 2 TS diagnostics over the complete graph — otherwise
  a shadow's type-layer import reports the not-yet-built
  neighbor shadow as TS2307.
- **Acceptance measuring point:** the fixture `packages/lsp/test/check.test.ts` pins both
  `RedirectToLogin` bugs — `this.nav` on injected `Nav` as TS2551/TS2339
  (on a near match TS gives "Did you mean?" instead of 2339) and `buildRenderTree` in
  `@code` as TZS020; the corrected port checks clean. `tsazor check` against the
  untracked `apps/fluentcms-admin` (read-only): `RedirectToLogin.tsazor` 0 findings.
