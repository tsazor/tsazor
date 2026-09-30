# Scoped CSS

Tsazor implements Blazor's CSS isolation mechanism 1:1. Every `.tsazor` file that has a
sidecar stylesheet `X.tsazor.css` gets its markup stamped with a scope attribute
`b-<hash>`, and the stylesheet's selectors are rewritten to target `[b-<hash>]`.
The runtime needs no changes — scoping is entirely a compile-time mechanism in the
compiler and the vite plugin.

## How it works

```
Greeter.tsazor        →  compiler emits  b.addAttribute(n, "b-1a2b3c4d", "")
                        on every plain DOM element
Greeter.tsazor.css    →  vite-plugin rewrites selectors via postcss
                        h1 { color: red; }        →  h1[b-1a2b3c4d] { color: red; }
                        injects  import "./Greeter.tsazor.css"  into the compiled module
```

- **Opt-in, sidecar-gated.** A `.tsazor` file without a `X.tsazor.css` sidecar compiles
  byte-identically to before (no scope frames, no CSS import). Existing apps are
  unaffected until they add a stylesheet.
- **Hash.** `b-` + first 8 hex chars of `sha1(<project-root-relative POSIX path of the
  .tsazor file>)`. Deterministic, stable across rebuilds, unique per file. Two files
  in different directories with the same basename get different hashes — scoping is
  per *file*, not per component.
- **Components are left alone.** Only plain DOM elements get the attribute, exactly
  like Blazor. A child component's DOM is untouched, so your stylesheet cannot style
  it — that's what `::deep` is for (below).

## `::deep` semantics

Everything before `::deep` is scoped; everything after it is emitted raw:

| Source selector | Rewritten |
|---|---|
| `::deep .child` | `[b-h] .child` |
| `.parent ::deep .child` | `.parent[b-h] .child` |
| `.a > ::deep .b` | `.a[b-h] > .b` |
| `::deep` | `[b-h]` |

Notes:

- If the scoped part before `::deep` is a bare combinator (`.a > ::deep .b`), the
  scope attribute is placed on the last compound before the combinator and the
  combinator is preserved: `.a[b-h] > .b`. The target element itself does not need
  the attribute in this variant — reaching into child DOM via a parent anchor is the
  whole point.
- `::deep` can appear only once per selector; anything after it stays untouched
  (including pseudo-classes, attribute selectors, and further combinators).

## What is rewritten

| Case | Behavior |
|---|---|
| Simple / descendant selectors | Every compound gets `[b-h]` before its first pseudo (`h1[b-h]`, `.list[b-h] > .item[b-h]:hover`) |
| Pseudo-classes/elements | Attribute lands before `:` (`p[b-h]::after`, `a[b-h]:focus`) |
| Attribute selectors | Attribute lands after them (`input[type="x"][b-h]`) |
| `@media`, `@supports` | Traversed normally |
| `@keyframes` | Selectors (`from`, `to`, percentages) untouched |
| Comments | Untouched (postcss AST guarantees free selectors) |

## Specificity

The attribute selector adds one class-level weight (+0,1,0) to every rewritten
selector. This matters only when page-level global CSS and isolated CSS fight over
the same element — as in Blazor, the isolated selector ends up one class stronger
than the equivalent unscoped one. Design stylesheets accordingly.

## Limitations (v1)

- **Attribute spread can override the scope frame.** `@attributes`-style splat
  (`b.addMultipleAttributes`) is emitted after the scope frame and may set/remove
  attribute names that collide. A user-set `class` or `style` never collides, but an
  explicit `b-<hash>`-looking attribute in spread data would. Documented, not fixed.
- **No build-time hash collisions** by design (sha1 over path), but renaming/moving a
  file changes its hash — global CSS that (ab)uses `b-*` selectors would break.
- **HMR**: editing only the sidecar goes through Vite's normal CSS hot path (the
  `.tsazor` module is unchanged); adding/removing a sidecar triggers a `.tsazor` module
  invalidation.

## Implementation map

| Concern | Location |
|---|---|
| Scope-attribute emission (compiler, opt-in `scopeHash` option) | `packages/compiler/src/codegen.ts` |
| Hash derivation + `::deep` rewriter (postcss plugin) | `packages/vite-plugin/src/scoped-css.ts` |
| Sidecar detection, CSS import injection, `.tsazor.css` transform | `packages/vite-plugin/src/index.ts` |