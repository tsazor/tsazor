# Debugging `.tazor` files in DevTools

The compiler and the vite plugin produce a chained inline sourcemap per `.tazor`
module (compiler → esbuild), so the browser debugger works on the **real
`.tazor` source** — breakpoints in `@code`, `this.*` state inspection and
step-through all behave like authored code. Verified against a real browser
(Edge via CDP) by `apps/demo/scripts/verify-debugging.mjs` — 14/14 checks.

## DevTools walkthrough (manual)

1. Open the dev server page, e.g. `http://localhost:5199/counter`, DevTools F12 → **Sources**.
2. The module tree shows `Counter.tazor` (that's the module URL — vite serves the
   component under its real name). Its content in the editor is the actual
   `.tazor` source, `@code` block included — the sourcemap embeds `sourcesContent`.
3. Click a line inside `@code` (e.g. `this.currentCount++;`) to set a breakpoint.
4. Click the counter button. DevTools pauses **inside the original line of the
   `.tazor` file**, not somewhere in generated code.
5. In the **Scope** pane your members are live state: fields (`this.currentCount`),
   methods (`this.incrementCount`), getters (`this.doubleCount`, code-behind too),
   and `@inject` fields — `this` is the component instance.
6. Step over / step into moves along the mapped `.tazor` lines; resume returns to
   a live page. State changes made at the breakpoint flow into the DOM after
   resume (the render happens after your handler returns).

**Code-behind (`X.tazor.ts`)** is plain TypeScript from Vite's perspective —
breakpoints in the sidecar work natively with no extra machinery; members are
reachable through the inheritance chain in the Scope pane. Editing the sidecar
reloads the page (HMR v1 limit, see docs/code-behind.md), so re-arm manual
breakpoints after a sidecar save.

## Programmatic verification (CDP)

`apps/demo/scripts/verify-debugging.mjs` runs the same steps headless. Two CDP
details it documents by construction:

- **`Debugger.setBreakpointByUrl` does not resolve sourcemaps** (that mapping is
  the DevTools frontend layer above raw CDP). The script decodes the inline map
  itself (minimal VLQ decoder) and sets `Debugger.setBreakpoint` on the **mapped
  compiled location**. The check still proves the chain: source line → map →
  compiled line → breakpoint → pause reported *in that script*.
- Input is dispatched with `Input.dispatchMouseEvent`, not a Playwright click:
  while the runtime is paused, a Playwright click waits on the (paused) event
  handler and times out.

## How the maps are built

| Stage | Contribution |
|---|---|
| Compiler (`@tasor/compiler`) | Line-accurate mappings from the original `.tazor` into the generated component module (RenderTreeBuilder frames + `@code` as class members). |
| Vite plugin | Chained: `import "./X.tazor.css"` etc. after the transform; the esbuild transpile keeps the compiler map and produces an inline `sourcesContent` bundle, sources named e.g. `Counter.tazor`. |
| Vite dev / build | Serves the inline map with the module — no extra file, no server config. |

## Limits (v1)

- Breakpoint accuracy is line-level; column-level granularity within a line is
  not guaranteed (esbuild may merge adjacent statements into one mapped range).
- Expression evaluation inside the debugger shows generated identifiers only
  where the compiler introduced temporaries — author-declared state is always
  `this.<member>` as written.
- `@code` completion inside the debugger is plain JavaScript semantics (no
  binding of markup-level identifiers; the compiler bakes bare identifiers,
  so `currentCount` in markup reads `this.currentCount` at break time).