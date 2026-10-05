# Roadmap — Fixing the review findings

Basis: [review-2026-09-30.md](review-2026-09-30.md). IDs (C…, R…, T…, I…) refer to it.

**Ordering principle:** Order by technical dependencies, not by effort.
A step only comes once what it builds on is correct — otherwise it gets built
twice. Quick wins are therefore not pulled forward, but done where they arise in the new
code anyway (many disappear on their own through the rework).

## State before Phase 2 (2026-09-30)

**Done:** Phase 0, Track A (A1–A6), Track B (B1–B7), plus follow-ups: SVG namespace,
`captureUnmatchedValues` per parameter set, event-handler render after the synchronous part
(`HandleEventAsync`), booleans/`bigint` as text, `<input type=time|datetime-local>` seconds.
All on `roadmap/phase-0`, not pushed, `main` unchanged.

**Gates on the overall state (after A6):** 773/773 tests (conformance suite: all compiler findings except
C12/C13 and all runtime findings green), LSP smokes, Pizza 20/20, Gallery, Sleipnir, Demo
(components 31, scoped 10, code-behind 5, debugging 14, counter-state 8).

**FluentCMS probe:** 13 → 145 (A2) → 178 (A5) → since A6 **160/217** clean or **178/217 after the codemod forms** (TZS021: 35 × `foreach … in`, 1 × `[CascadingTypeParameter]`); real errors: 1 file. Rest:
`@context` ×18 and 36 unresolved tags (slots — Phase 2.3; `DynamicComponent`,
`HeadContent`, `InputFile`, `ErrorBoundary`, `DataAnnotationsValidator` — Phase 3), 12 × C#
`$"…"` as an unquoted attribute value (no TS counterpart).

**Benchmark A/B** (quiet machine, alternating 2 × 10 runs each, `0abdc98` → now): ready
66–75 → 73–78 ms (no outliers; the ~940 ms values of the agent runs were machine load),
append1k 118 → 74, upd10th 110 → 62, swap 191 → 142, select 66 → 17, remove 343 → 305 ms,
heap 16.5 → 15.7 MB. **Bundle 14.1 → 22.7 KB gz (+61 %)**, after A6b (standard decorators + `sideEffects` in the runtime package) **20.4 KB gz** — check further before Phase 5
(candidates: router/navigation rewrite, DOM journal, error/batch code, generated helpers).

**Deliberate deviations from Blazor** (documented, tested): render queue parent-first
(Blazor: FIFO); `onAfterRender` children first, once per batch (Blazor: render order);
DOM application per pass + journal rollback (Blazor: per batch); without `<base>` the base is the
origin root; `regex(...)` constraints always anchored; `Date` counts as mutable (B6).

**Collected open items** (not blocking for Phase 2, assignment in parentheses):
- ~~`ValueExpression` only if the target component declares it; remove the `/^on/i` EventCallback heuristic
  (2.2 / sync point B8).~~ — **done (2.2)**.
- `@inherits` base members with DOM global names (`length`, `top`) stay global (2.1/2.4).
- ~~`@bind-value` (lowercase) on *elements* is emitted as a component bind; `@bind` to a
  `@foreach` variable only fails at runtime (C#: CS1656)~~ — **done (A7)**.
- ~~Syntax errors in markup expressions without their own TZS diagnostic~~ — **done (A7, TZS024)**;
  `var` in statement runs stays `var` — since A6a with warning TZS022 (TS semantics), since A7 with
  fix `let`.
- Code-behind/`_Imports` changes do not invalidate dependent modules (4.1).
- ~~`NavLink` compares base-relative instead of absolute URIs~~ — **done (A7)**.
- EditForm `OnInvalidSubmit` / awaited `OnValidSubmit` (3.5).

**State A7 (follow-ups before Phase 2, branch `roadmap/a7-followups`):**
- *Diagnostic ranges:* every `TszDiagnostic` has `endPos` (exclusive) next to `pos` (start, meaning
  "beginning" unchanged) — `@foreach (…)` header, directive, attribute (folded `@bind` modifiers with
  their own range), tag name, error token, opener of unclosed blocks. The only position change:
  TZS021 for `@foreach` now starts at the `@` (previously at the header code). Mechanical fixes as
  `fix: { title, edits: [{ pos, endPos, text }] }`: TZS021 (`foreach … in`, `where T : X`,
  a single literal `[Authorize]`/`[Route]`/`[AllowAnonymous]`), TZS022 (`var` ⇒ `let`). The LSP
  publishes the ranges and offers the fixes as quick-fix code actions.
- *`@bind-<attr>` on elements* binds the attribute (Razor), component `@bind-Value` unchanged.
- *`@bind` to a loop variable* (`for…of`/`for…in`, also `let`), `const` local,
  `function`/`class`/`enum` or import ⇒ TZS008 at compile time.
- *TZS024* for syntax errors in markup expressions (first TS parser error, on its token);
  invalid `@for` counter header ⇒ TZS015. `transformTsazor` lets the TZS diagnostics win over the
  esbuild follow-up error.
- *NavLink* following Blazor .NET 8 (`ShouldMatch` over absolute URIs). Consequence: a `Prefix` link to
  the base is active everywhere — home links in Demo, Sleipnir and the Gallery sidebar use
  `NavLinkMatch.All` (like the Blazor templates; `SidebarNav` links have an optional `match`).
  Incidentally: `href=""` was an empty expression (`undefined`), now the empty string.
- *FluentCMS probe:* 160 → **149/217** clean, 178 → **164/217** after codemod forms, files with
  real errors 1 → 25 — TZS024 ×34 makes previously silent C# leftovers visible (esbuild would have
  failed on them): `(MarkupString)x` casts ×9, `$"…"` in `@(…)`/attributes ×10, anonymous objects
  `new { id = … }` ×10, `is (not) null` ×2, `out var` ×1, `File.Exists($"…")` ×1, `default` ×1 —
  candidates for the codemod (2.5) or Phase 3 built-ins (`MarkupString`).

## Dependency graph

```
Phase 0  Foundation (build, ESM, conformance tests)
   │
   ├──────────────────────────────┐
   ▼                              ▼
Track A: Compiler               Track B: Runtime
A1 Writer + source maps         B1 Diff as a pure edit list
A2 Code-first parser            B2 Render queue + batches
A3 Import model                 B3 DOM applier with logical ranges
A4 TS-AST rewriting             B4 Lifecycle semantics
A5 Directive/bind semantics     B5 Cascading subscriptions
   │                            B6 Change detection
   ▼                            B7 Router/navigation (independent)
Phase 2  Type metadata              │
2.1 Parameter metadata              │
2.2 Metadata-driven codegen ────────┤  (sync: explicit EventCallback → B8)
2.3 Templated components            │
2.4 Typed shadows + tsazor check    │
2.5 LSP project-wide                │
   │                                │
   └──────────────┬─────────────────┘
                  ▼
Phase 3  Parity: built-ins & forms (needs A+B+2)
                  ▼
Phase 4  Dev server (HMR/invalidation) · Fluent overhaul
                  ▼
Phase 5  Packaging for external users · .NET bridge package
```

Track A and Track B **can be worked on in parallel**: the only interface is the
`RenderTreeBuilder` API, which stays stable. Synchronization points are marked explicitly.

---

## Phase 0 — Foundation

Without reliable tests, the reworks in A and B cannot be safeguarded.

**State: Phase 0 complete** (branch `roadmap/phase-0`).

- 0.1/0.2: Also fixed along the way: `runtime`'s `.tsbuildinfo` lay outside `dist`
  (a clean build produced an empty `dist`); Pizza E2E (a click missed the button because of a layout shift
  from live validation since `fa680e2`; poller request storm, see review C12 addendum; the OSM
  tile check waited a fixed 1 s) and Sleipnir E2E (read placeholders before the data) — all
  passed already before Phase 0.
- 0.3/0.4: `packages/conformance` — 113 tests (17 green as regression protection, 96 `it.fails`,
  each verified to fail for the stated reason). Runs against the package sources
  in the root `pnpm test`. Compiler tests check rendered DOM + diagnostics through the real
  plugin pipeline (`transformTsazor`, extracted from the plugin), never generated code.
  Correction to the review: generic `@inherits` works in the real pipeline.
- 0.5: `node scripts/probe-razor-corpus.mjs` (needs `compiler/dist`; corpus cache in
  `.probe/`, gitignored). **Baseline FluentCMS@c63d49c: 13/217 clean**, 171 without errors
  (of which 155 with detected silent errors), 46 with errors, 36 with unresolved tags.
  **History:** after A1+B1 unchanged 13 · after A2+B2 **145/217** clean (182 without errors, 19 with
  silent errors — `@context` ×18, modifier value ×1; 35 with errors — mainly TZS008 `@bind` `!.` ×139 → A5)
  · after A3 unchanged 145/217 (the probe compiles without workspace resolution)
  · after A4 unchanged 145/217 (remaining findings: `@bind` `!.`, `@context`/slots → A5/Phase 2)
  · after A5 **178/217** clean (216 without errors; 1 file with errors — TZS009 ×12, C# `$"…"` as an
  unquoted attribute value; silent findings only `@context` ×18; unresolved tags ×36 → Phase 2)
  · after A6a **160/217** clean, **178/217 after codemod forms** (C# forms TZS021 are
  counted separately: 33 files — `@foreach (var … in …)` ×35, `@attribute [CascadingTypeParameter]`
  ×1; real errors unchanged 1 file; TZS022 `var` ×4).

| Step | Content | Why here |
|---|---|---|
| 0.1 | Repair `pnpm install` / `node_modules`; declare `packages/vscode` workspace deps (`@tsazor/lsp`, `@tsazor/workspace`) so a clean `pnpm -r build` passes | Everything else needs green gates |
| 0.2 | Make the ESM output loadable in Node: `module: NodeNext` + `.js` extensions (or bundling per package); missing deps (`@jridgewell/gen-mapping` in compiler) | `tsazor check` CLI (2.4), test scripts and `@tsazor/testing` run in Node — relevant well before publishing |
| 0.3 | **Compiler golden tests:** all repros from §1 of the review as snapshot tests (input → expected output or diagnostic), initially marked `it.fails` | Target picture of rework A; every fix flips a test from "fails" to green |
| 0.4 | **Runtime conformance suite:** pin down Blazor semantics — lifecycle order, loading render on async `onInitialized`, `OnAfterRender` after the batch, `@key` recreation, duplicate-key error, disposal of nested components, moves, `ShouldRender` on the first render, parent-first. Repros R1–R15, as `it.fails` | Target picture of Track B; without it "Blazor 1:1" cannot be verified |
| 0.5 | **FluentCMS probe as a measurement script** in the repo (`scripts/probe-razor-corpus.mjs`): clones upstream, compiles all `.razor`, counts diagnostics and silent errors. Upstream is not checked in | Progress metric across all phases |

**Gate:** build green, all existing tests green, new suites run (expected red).

---

## Track A — Compiler

The LSP shadow modules are `compile()` output + source map (`lsp/src/shadow-module.ts`).
Every improvement here therefore automatically improves diagnostics in the editor too — and
conversely Phase 2 makes no sense without a correct compiler and correct source maps.

### A1 — Line-aware code writer and source maps

A writer that counts embedded line breaks and maps per token; fill
`sourcesContent`; correct tab columns. Fixes C10 and the column errors.

*Why first:* The smallest, isolated step; all later steps emit through the
writer, and wrong maps would distort all later debugging (also in the LSP).
**State: A1 implemented** (merged into `roadmap/phase-0`). `CodeWriter` (writer.ts) is the only
place that writes generated code + mappings; anchors are resolved across embedded line breaks.
Token-accurate mappings on continuation lines too, exact `@code` columns (tabs are
preserved), `sourcesContent` all the way through the plugin chain. Also fixed along the way: `@(x)` one column
too early, `on*` values on components offset by the wrapper length. Conformance: all 4
source map tests green. **Open for A2:** multi-line control headers (`@if (a &&
 b)`) have
no source position in the AST — their continuation lines stay unmapped.

### A2 — Code-first parser

Adopt the Razor model: in code contexts (`@{}`, control bodies, `@code`) TS is
scanned (`ts.createScanner`), switching to markup on `<tag` in statement position, `@:`,
`<text>`. This produces/settles:

- C1, C2, C3 (statements in bodies, markup in `@{}`, brace pre-scan goes away),
- C7 (`while`/`do`/`try`/`using`/`lock`/`await` without special nodes), C11 (fallthrough), C20 (`@:` transitions),
- C8 (`@* *@`), C9 (email rule: alphanumerics before `@` ⇒ literal),
- C14 (unquoted attributes), void close tags, `<DIV>`, `a < b`, `{` in ChildContent,
- **Directive table** with three classes: *supported* / *Blazor-only, ignored with info*
  (`@namespace`, `@rendermode`, `@preservewhitespace`, `@implements`) / *unknown ⇒ error*.
  Directives only at document level; `@page`/`@code` inside elements ⇒ error; multiple `@page` ⇒
  all as routes (Blazor semantics) instead of "last one wins" (C19).
- Parse `@typeparam T where T : …` and generic `@inherits Base<T>` cleanly (C19).

*Why before A3/A4:* The rewriting needs real statement nodes with scopes; today's
parser delivers code only as text spans.

**Gate:** golden tests for C1–C3, C7–C9, C11, C14, C19, C20 green; sequence number tests
still green (invariant: compile-time, bound to source position).

**State: A2 implemented** (branch `roadmap/a2-parser`). Code contexts (`@{ }`, control bodies)
are scanned with `ts.createScanner` (`code-scanner.ts`); brace pre-scan and
markup parsing of bodies are gone. New AST nodes: `statement` (TS statement run with
`declares`), `block`, `while` (incl. `do … while`), `try`; `@{ }` carries `children`;
headers have source positions (`conditionStart`/`codeStart`), continuation lines of multi-line
headers are mapped. Locals from `@{ }`/bodies/loops/`catch` go into the existing
local tracking (no `this.X`). Directive table: Blazor-only (`@namespace`,
`@rendermode`, `@preservewhitespace`, `@implements`) ignored (TZS014 warning only for
`@rendermode`/`@preservewhitespace`); an unknown `@word` stays an implicit expression
(resolution in A4); directives outside the document level ⇒ TZS013; multiple `@page` ⇒
`metadata.routeTemplates` + one route each in the manifest. `@using (…)`/`@lock`/`@await` ⇒ TZS012;
bare text in code contexts ⇒ TZS015 (TS syntax error or C# rule CS0201).
Conformance: C1–C3, C7–C9, C11, C14, C19 (Blazor-only directives), C20, void close tag,
`a < b`, `{` in ChildContent, single-line `@foreach`, `@foreach` header variants green; incidentally
C6 "generic type arguments". FluentCMS probe: clean 13 → 145, files with errors 46 → 35.
**Open for A4:** `bakeMemberRefs` still bakes regex flags, template spans, type positions
and function parameters in statements (C4–C6); `const { a, b }` collides with the builder
parameter `b` (codegen hygiene: `__builder` like Razor). Loop `var` stays `var`.
*(Done in A4.)*

### A3 — Import model (decision + implementation)

Today the plugin guesses imports via a PascalCase regex (I1–I4). But the rewriting in A4 needs
an **unambiguous answer to "Is `foo` a member or a free name?"**. With explicit
imports the rule becomes trivial and solvable without a type checker:

> Local ⇒ stays · imported ⇒ stays · JS/DOM global (from `lib.d.ts`) ⇒ stays · otherwise ⇒ `this.X`

Implementation:
- Syntax for explicit imports in `.tsazor` (e.g. `@import { Status } from "./utils"` as a
  Razor-like directive, also inheritable in `_Imports.tsazor`). **Decision needed** (see below).
- Component tags stay resolved via `@using` folders/packages — but strictly:
  default vs. named export from the **actual** export of the target file (syntactic
  TS parse), not from the file name (I3); a bare package `@using` only resolves names that the
  package really exports (export list from its d.ts/manifest), ambiguity
  between sources ⇒ error (I4).
- The `knownGlobals`/`RUNTIME_TYPES` pre-scan goes away (I1); runtime types are imported
  explicitly via `_Imports` (the template ships the standard set).
- Missing `@using` folders ⇒ warning.

*Why before A4:* A4 implements exactly this rule. *Why not later:* A4 without A3 would mean
rebuilding the heuristic a second time.

**State: A3 implemented** (branch `roadmap/a3-imports`). `@import <TS import clause>` as a
directive (all forms incl. `type`, namespace, side effect, multi-line; syntactic
TS parse, TZS016), inherited in `_Imports.tsazor`, relative specifiers rewritten per file;
the file shadows the chain. Imported bindings are free names in the rewriter
(`knownGlobals` goes away; `@inject` fields of the same name stay members) and can serve directly as
a tag. The `knownGlobals` pre-scan (I1) and `collectCodeImports` (I3) are removed; default vs.
named for `@inject`/`@inherits` from the actual export of the target file. Tags: enclosing
folders win, otherwise all `@using` sources together (folders, runtime built-ins, bare packages
via the syntactically read export list of their entry module) — ambiguity ⇒ TZS017,
missing folder/package ⇒ TZS018 (warning). One resolution (`resolutionOptions`) for plugin,
library builds and LSP (shadow, diagnostics, hover, completions incl. `@import` names).
Migration: standard runtime set in every `_Imports.tsazor` (apps + `components`/`fluent`),
explicit `@import`s for app types/helpers; `PizzaComponentBase` and the defensive
`export default X` removed. Probe unchanged 145/217 (measures markup only).
**Open for A4:** members from `@code` named like an import (`@Parameter() Status` +
`@import { Status }`) stay free instead of `this.X` — needs the member list from the
class body. *(Done in A4.)*

### A4 — Rewriting over the TS AST with scope analysis

Replace `bakeMemberRefs`: parse expressions and statements with `ts.createSourceFile`,
resolve bindings (parameters, destructuring, block scopes, labels, default params, `catch`),
handle type positions, property keys, template spans and regex literals correctly,
shorthand `{ name }` ⇒ `{ name: this.name }`. Fixes C4, C5, C6, `new this.Foo()`.

In the same go:
- emit loop variables as `let` (deferred closure bug),
- `@foreach` header variants (`Person p in …`, `var (k, v) in …`) (review §1, medium/low),
- method groups with a receiver: `@onclick="item.toggle"` ⇒ bound call on `item` (C18),
- `class="a @(x ? "b" : null)"` ⇒ `null` as empty (Blazor semantics).

Members come from the `@code` class body and the code-behind (syntactically). For members
from base classes (`@inherits`) the A3 rule applies: not imported, not local, not global
⇒ member — no checker is needed for that.

**Gate:** all golden tests from §1 green except C12/C13 (need Phase 2); Pizza E2E,
demo regression, scoped/code-behind checks green; Pizza base-class workaround
(port-findings C) removable.

**State A4 implemented** (branch `roadmap/a4-rewrite`). `bakeMemberRefs` is replaced by
`rewrite.ts`: markup expressions, attribute values, control headers (`@for` as a whole
`for` statement), `case` labels and statement runs are parsed with `ts.createSourceFile`
(syntactically); a scope chain resolves parameters (default values in the outer scope),
destructuring, block scopes, `var` hoisting, `catch`, loops, `function`/`class`/`enum`
and labels. Property names, keys, declarations and type positions stay untouched,
shorthand is expanded, template spans are rewritten. Free names: declared member
(`@code` body, code-behind class — plugin/LSP pass its source through — and
`@inject`) ⇒ `this.X` (static: `Class.X`), otherwise import/global ⇒ stays, otherwise `this.X`.
The global set is generated from TypeScript's `lib.es*`/`lib.dom*.d.ts`
(`packages/compiler/scripts/gen-globals.mjs`, without `@deprecated` ones like `name`/`status`/`event`;
a test checks that it is up to date). Member references in local `function`s/object methods
go through the captured component (`const __tsazor_this = this`). Hygiene: builder parameter
`__builder`, runtime APIs of the generated code as `__tsazor_*` aliases, bind handler parameters
`__event`/`__value`; sequence numbers unchanged. `@for` `var` ⇒ `let`; method groups with a
receiver (`item.toggle`, also in `On*` component attributes) ⇒ bound to `item` (C18,
receiver evaluated once at render time); mixed attribute values render `null` as empty.
Conformance: C4 ×2, C5 ×9, C6 ×2, mixed attributes, loop capture green; "JS globals" and
C18 compile correctly but stay `it.fails`, because the runtime renders `true`/`false` as empty
(Blazor: `True`/`False`) — string variants are green. Regression over all 109 `.tsazor` in the
repo: after subtracting the hygiene renames, identical code except for 3 mixed attributes
(`?? ""`). Probe unchanged 145/217.
**Open:** boolean rendering in the runtime (see above, Track B); `var` in statement runs stays
`var` (JS semantics; only header `var` becomes `let`); members of `@inherits` base classes that are named like
a non-deprecated DOM global (`length`, `parent`, `top`, `origin`, …) stay
global — declared members are not affected; code-behind changes do not invalidate the
`.tsazor` module (Phase 4.1).

### A5 — Directive and bind semantics

Builds on the new AST, now small in each case:
- `@attribute [...]` ⇒ real decorators (C19), align the docs,
- a hand-written `buildRenderTree` in `@code` ⇒ error instead of silent overwriting (C21),
- check the `@bind` target via the AST instead of a regex: `Model!.Title`, `a?.b` (error), index accesses (C17),
- `@bind-Value:after/:get/:set` on components (C16),
- event modifiers with a value: `@onclick:preventDefault="cond"` ⇒ dynamic flag, modifier
  without a handler allowed (C15). **Needs a small runtime part** (flag frame in the DomRenderer) —
  independent of B, can be built against today's runtime.

**Measurement point:** run the FluentCMS probe again (expectation: almost all markup errors gone,
only slots/templates remaining).

**State: A5 implemented** (branch `roadmap/a5-bind`). **Bind targets (C17):** `checkBindTarget`
(rewrite.ts) checks on the TS AST — identifiers, member/element accesses, `!`, parentheses,
type assertions; `?.` anywhere in the path ⇒ TZS008 ("not assignable"), non-l-values likewise; the
assignment is exactly the (rewritten) expression, `ValueExpression` the last member name.
**Bind modifiers (C16):** `@bind-X:get/:set/:after/:event` on components; `:after`/`:set`
are awaited (Blazor's `InvokeAsynchronousDelegate`), `:event` on components names the
change callback parameter (Blazor does not reject it there — checked against `ComponentBindLoweringPass`),
`:format` is ignored there (warning); the .NET 7 combination rules RZ10004/RZ10015–RZ10019
apply to elements and components, attribute order does not matter. `ValueExpression` now also from
`:get` (Blazor). **Event modifiers (C15):** dedicated AST node `eventModifier` ⇒
`addAttribute(seq, "__internal_preventDefault_onclick", <bool>)` like Blazor, `true` without a value;
allowed without a handler; on components a normal attribute (splatted via `@attributes` —
FluentCMS `Button`). Runtime (only `dom-attributes.ts`): the attributes set flags of the
listener record (`modifierFlags`, journaled), a flag without a handler keeps its own
listener, the listener only goes when neither handler nor flag remains; `EventHandlerFlags` from
`addEventHandler` stays (OR-ed). **`@attribute` (C19):** TS form `@attribute @dec(…)` ⇒
a real class decorator (mapped); `[Authorize]` = `@authorize`, `Roles`/`Policy` ⇒
`metadata.authorizeData` ⇒ `routeAuthorize`/route manifest `authorize: { roles, policy }`
(`AuthorizationRequirements`/`AuthorizeRouteView` can do both), `[AllowAnonymous]` cancels it,
combinations that cannot be mapped ⇒ TZS019; other C# attributes ⇒ TZS014. **C21:**
`buildRenderTree` in `@code` or code-behind ⇒ TZS020 — even without markup (Razor generates
`BuildRenderTree` for every `.razor`, CS0111). Conformance: C15 ×2, C16, C17, C19 `@attribute`,
C21 green + 12 new cases; tests 604 → 665. Pizza, Gallery, Sleipnir and Demo E2E green. Regression over all 116 `.tsazor` in the repo: output
byte-identical (no repo code uses the changed forms). Probe: clean 145 → 178, files with
errors 35 → 1 (TZS008 ×139 and TZS001 ×1 gone, silent finding "modifier value" gone).
**Open:** `@bind-value` on *elements* (`<input @bind-value="x">`, Blazor: element bind on
`value`) is still emitted as a component bind; binding directly to a `@foreach` variable (`@bind="item"`,
C#: CS1656) only fails at runtime (assignment to `const`) instead of at compile time; `[Authorize]` combinations with multiple role lists/policies would need
a list of requirements in the runtime; `[Route]` is no `@page` replacement (TZS014).

---

## Track B — Runtime

The goal is Blazor's structure: **renderer with queue → diff per component → RenderBatch →
DOM applier at the end of the batch.** Today diff and DOM patch are one pass over frame indices;
R1–R4 follow from that. The steps build strictly on one another.

### B1 — Diff as a pure edit list

Port `RenderTreeDiffBuilder` faithfully: ordered two-pointer walk over sequence numbers,
key dictionary only on a key mismatch, duplicate key ⇒ error, key miss ⇒ remove + insert
(not a sequence fallback). Output: edit list + list of newly instantiated/to-be-disposed
components. **No DOM access** in the diff.

Fixes R1, R2, the O(n) moves per insert and the focus losses; frame children are computed
once instead of three times.

*Why first:* All further steps consume this edit list. The disposal list is the
prerequisite for R3.

**State: B1 implemented** (merged into `roadmap/phase-0`). `computeDiff` (diff.ts) delivers Blazor's
edit types + `components`/`disposedComponents`; the DomRenderer applies them. Conformance:
R1, R2, R3 (all three), insert cost, focus green; plus R4 markup (inserts no longer move anything,
permutations move component/markup ranges as a unit). The R4 component
test still fails, now on R5 (`shouldRender=false` prevents the first render).
Deviations: edits reference frame indices of the new tree instead of copied
reference frames (B2 must settle this for multiple renders per batch); the attribute diff switches
to the name join on any sequence/name mismatch; `matchChildren` goes away.

### B2 — Render queue with batches

Turn the existing, unused `Dispatcher` into a real queue: parent-first order,
renders during a flush land in the same batch, **end of batch as a defined point**,
errors isolated per component (no abort of the batch, handed to an
error handler hook — basis for ErrorBoundary in Phase 3). Remove the `activeRenderer` global
(track per renderer).

*Why after B1:* A batch collects edit lists of several components — those only exist from B1 on.

**State: B2 implemented** (branch `roadmap/b2-queue`). `RenderQueue` (render-queue.ts, heap
by tree depth) per renderer, batches via the `Dispatcher`; a batch runs until the queue
is empty (renders from render/lifecycle/new children in the same batch). For this, a
synchronous lifecycle now requests its render synchronously (previously always after an `await`);
async hooks unchanged (R6 stays B4). End of batch: `renderer.onBatchCompleted(listener)`
with `renderedComponents` (one entry per pass). Error hook: `renderer.errorHandler`
(`{ error, component, phase }`), central via `handleComponentError` — since 3.1 that is where
the ErrorBoundary search along the parent chain sits. A pass that fails in render/diff/DOM
is discarded (builder and slot map of the live tree stay, newly instantiated
children are disposed; DOM edits already applied are not rolled back).
`activeRenderer` removed; `isRenderingInProgress` mirrors the batch. Frame references:
edits are still applied immediately per pass, therefore safe with multiple passes per
batch — **B3** (applier at the end of the batch) must copy the referenced frames into the batch
(Blazor's reference frames) or hold the builders until the end of the batch. Conformance: R9
"parents before children" and "exception in one component" green; `setup.ts`
(`queueMicrotask` wrapper) goes away, the harness collects errors via the error hook.
Deviations: Blazor's `ComponentRenderQueue` is FIFO (there a child that became dirty before the parent
renders twice) — parent-first is intended here; batches start via a
microtask instead of synchronously outside a batch; render loop protection (100 passes per
component and batch). Open for **B4**: `onAfterRender` still runs directly after the pass
(R7) — belongs at `onBatchCompleted`.

### B3 — DOM applier with logical ranges

The applier applies a whole batch. Components and markup blocks are **logical ranges**
(start/end) that are moved as a unit and disposed recursively on removal.
Fixes R3, R4.

Get it right in the applier at the same time (R10):
- `checked`/`value`/`selected` as properties; set `<select value>` after the options,
- remove the listener on `null`; handler map by event name,
- do not assign getter-only properties (attribute fallback),
- clear `value` on removal.

**State: B3 implemented** (branch `roadmap/b3-applier`). `LogicalRange` (logical-range.ts):
start/end comment, insert/move/remove as a unit, enumeration of the logical
children, nesting; `LogicalChildren` is the cursor per level (element or range) including
`permute` (Blazor's `permuteLogicalChildren`). Components (`ComponentState.range`) and
markup blocks are ranges; disposal still comes from the diff's disposal list, after the
commit. **Batch application — decided: per pass** (like B2). Blazor applies the batch in
one piece because every application crosses the WASM→JS boundary; here the applier is a direct
call, the batch runs synchronously (no paint, no observer between passes), an
end-of-batch applier would only bring frame copies or longer-held builders. Instead
application is **transactional**: `DomJournal` records every mutation of previously existing
DOM (positions, attributes, properties, listeners, select value), a failing pass is
rolled back in reverse before the error is passed on — the DOM matches the
live tree again (B2 point "partially applied edits" done). Limits: side effects outside
the tree (ref captures already run, custom element callbacks, focus lost
through moving, caret after a value reset) remain. R10 (dom-attributes.ts): `value`
(input/textarea/select), `checked` (input), `selected` (option) as a property, for
`checked`/`selected` additionally the attribute as the default; removing `value` clears it (checkbox/
radio fall back to "on"); `<select value>` remembers the target value and sets it after
construction, and again on new/changed options (also from child components); `true` ⇒ attribute
`""`, `false`/`null`/`undefined` ⇒ removed; handler map per event name with a stable listener
(a callback change only swaps the handler), a non-handler value or removal releases the listener.
Conformance: R10 group (5) green. Deviations: primitives go as attributes like in Blazor
(previously as a property if `name in element` — broke `hidden=""`, `width="100%"`, `form`/`list`);
objects go to a *writable* property (custom elements), otherwise as an attribute — Blazor only knows
strings; the select target value is kept for the lifetime of the element (Blazor
forgets it after the first match). State per element (handler, select target value) lives as a
symbol property on the element as in Blazor (happy-dom hands out `<select>` as a proxy).
Open: SVG namespace (`createElement` instead of `createElementNS`), `<input type=time>` trim.
The R4 test "component without re-render keeps its content" still depends on R5 (**B4**).

**From B3 (new, not in the review):** ~~SVG elements are created without the SVG namespace~~ — *fixed:* `createElementNS` for `<svg>` and children (except inside `<foreignObject>`), markup in SVG is parsed as SVG; affected the Sleipnir sparkline and Fluent `Icon` (invisible in the browser). Open:
Blazor's seconds trimming for `<input type=time>` is missing. Small, independent — do before Phase 3.

### B4 — Lifecycle semantics on a batch basis

Now that there is an end of batch:
- async `onInitialized`/`onParametersSet`: render while the task is running, and after completion (R6),
- `onAfterRender(firstRender)` after the whole batch, children before the parent callback (R7),
- first render ignores `ShouldRender` (R5),
- disposal parent-first, call `disposeAsync` (R13),
- unknown parameters ⇒ error like Blazor (T3), in dev with a clear message.
  **Caution:** apps may currently use mistyped parameters unnoticed — check
  with the A5 probe/Gallery first.

Afterwards correct `architecture.md` and `port-findings.md` #3.

**State: B4 implemented** (branch `roadmap/b4-lifecycle`). `ComponentBase.setParametersAsync` follows
Blazor: set parameters, then `RunInitAndSetParametersAsync`/`CallOnParametersSetAsync`. Sync
hooks still render exactly once in the parent's batch; if a hook returns a promise,
the state after its synchronous part is rendered immediately and again after completion (after async
`onInitialized` only after `onParametersSet`) (R6). `onAfterRender(firstRender)` runs at the end of the batch
(before the `onBatchCompleted` listeners) for every component with a committed pass, once per
batch, children before parents (deepest first, otherwise render order); async is tracked and
does not re-render (R7). `shouldRender` is asked in `stateHasChanged` as in Blazor, the
first render always happens; HMR bypasses it (R5). Disposal parent-first (breadth-first like
Blazor's disposal queue), `disposeAsync` instead of (not in addition to) `dispose`, tracked (R13).
Undeclared parameters throw Blazor's message ("Object of type 'X' does not have a property
matching the name 'Y'", variant for properties without `@Parameter`), phase `lifecycle` (T3). All
errors (sync/rejection) go to the error hook, `waitUntilIdle` covers lifecycle, after-render
and `disposeAsync`. **Audit T3** (tests of all packages + E2E Pizza/Gallery/Sleipnir/Demo with
a temporary message instead of an error, plus a static comparison of all component tags in 116
`.tsazor` files incl. bench): no app call site affected; found only (1) the compiler
emits `ValueExpression` on every component `@bind-Value` — Razor only if the
component declares the parameter; until 2.2 the runtime discards an undeclared
`ValueExpression` —, (2) the Fluent layout test gave `Spacer` ChildContent (test corrected).
Pizza: the `stateHasChanged()` workarounds after awaits in `Index`, `MyOrders`,
`ConfigurePizzaDialog` removed (the originals call none there); `OrderDetails` (fire-and-forget
poller) keeps its call. Conformance: R5, R6 ×2, R7, R13 ×2, T3 and R4 "component without re-render"
green. Deviations: an `async` hook without a real `await` renders once more (promise state
cannot be checked synchronously); `onAfterRender` children first and once per batch (Blazor: per
render entry in render order, i.e. parent first). ~~Open: event handlers only render after completion; an explicitly passed `captureUnmatchedValues` parameter is ignored.~~ *Both followed up:* event handlers render like `HandleEventAsync` after the synchronous part and after completion; `captureUnmatchedValues` is rebuilt per parameter set (explicit + unbound ⇒ Blazor error). For **B5/B6**:
children are re-parameterized on every parent render (each time `onParametersSet` + render,
provided `shouldRender`); cascades still depend on this (R12 stays red).

### B5 — Cascading subscriptions

`CascadingValue` notifies subscribers directly (not via parameter re-sets); support `Name`
(R11, R12).

*Why before B6:* Today cascades only work because every parent render re-parameterizes all children.
That goes away with B6.

**State: B5 implemented** (branch `roadmap/b5-b6`). Matching like Blazor's `CanSupplyValue`
(`canSupplyValue` in renderer/cascading-value.ts): if neither parameter nor supplier has a
name ⇒ by type (a parameter without a type token takes the nearest unnamed supplier), otherwise only
by name, case-insensitive; a named supplier no longer serves a by-type request (it already didn't
before). `CascadingValue` delivers `Name` as `cascadeName` (R11) and has `IsFixed` as a parameter
(changing it after the first set throws as in Blazor). By type checks the supplier's static
`cascadeType` (Blazor's `TValue`; EditForm: `EditContext`, auth suppliers:
`AuthenticationState` — the two auth suppliers are now unnamed for this, as in Blazor), without
it the runtime value (`instanceof`); if that is still `null`/`undefined`, the supplier counts as
"pending": subscribed, the search continues outward. **Subscriptions** (Blazor's
`CascadingParameterState`/`Subscribe`): the renderer resolves cascades fresh on every parameter set
and keeps the non-fixed suppliers per consumer (`ComponentState.cascadingSuppliers`), the subscribers per
supplier (`subscribers`), plus the consumer's last direct parameter snapshot
(`directParameters`, Blazor's `_latestDirectParametersSnapshot`). Before every
render pass of a supplier it compares `cascadeValue` with the value of the previous pass
(`mayHaveChanged`, Blazor's `ChangeDetection`, components/change-detection.ts); on a possible
change all subscribers get the snapshot + fresh cascades set directly (`onParametersSet`
+ render) — independent of intermediate components (R12). Dispose unsubscribes. Deviation: Blazor's
`CascadingValue` notifies from `SetParametersAsync`; here the supplier's render pass
triggers it — equivalent for `CascadingValue` (renders on every set), and handwritten
suppliers (Tabs, Accordion, FluentProvider, Auth, EditForm, …) need no notify call of their own,
just a re-render on value change. Object values (also `this`) always count as changed, as in
Blazor. Conformance: R11, R12 green.

### B6 — Parameter change detection

Blazor's `MayHaveChanged`: unchanged primitives/immutables ⇒ no `setParameters`.
Cache `findParameterMetadata` per class. (R8, performance)

*Why only here:* R8 currently masks R4 and R12. Built in earlier, moves and
cascades would visibly break.

**State: B6 implemented** (branch `roadmap/b5-b6`). `updateChildren` only sets parameters on a retained child
if one of them may have changed — port of `ParameterView.DefinitelyEquals`
(`parametersDefinitelyEqual`, renderer.ts): same attribute names in the same order
(reordering counts as a change, as in Blazor), no value `mayHaveChanged`, same
component type (HMR). Cascades come via the B5 subscription, not via the parent render.
**Equality rules** (`mayHaveChanged`, components/change-detection.ts): known to be immutable and
compared via `Object.is` are string, number, boolean, bigint, symbol (TS enums are
number/string); `null`/`undefined` are only equal to themselves; `EventCallback` equal for
the same receiver + delegate (Blazor counts `EventCallback` among the immutable types since .NET 7;
a callback passed on and newly bound per render compares the inner one). Everything else —
objects, arrays, functions (i.e. every `ChildContent`/`RenderFragment`), **Date** — counts as
possibly changed. Deviations: `Date` is a mutable reference in JS (Blazor's
`DateTime` a value type) and therefore does not count as immutable; `0`/`-0` count as different
(`Object.is`); an arrow function is new per render, so an `@onclick="() => …"` EventCallback is
always changed — C# compares delegates by target + method, there a lambda capturing only `this`
is equal. A raw function on an `on*` parameter counts as unchanged for the same reference
(it is bound to an `EventCallback` with the same parent). **Metadata cache:**
`getParameterInfo` builds once per class all parameters incl. inherited ones, the case-folded
name table, the capture property and the cascading list; every decorator registration
invalidates (version counter). `attributeValueEquals` (dead code) removed. **Masked bugs:**
none found in apps/packages — all tests + E2E green; only three runtime tests were adjusted,
which pinned the old behavior (render-queue ×2 "until B6", the lifecycle after-render test
gets a changing parameter). Conformance: R8 green; the runtime suite is green except for
items owned elsewhere (`/^on/i` → B8, EditForm submit ×2 → 3.5, router ×6 → B7).

**Gate for B1–B6:** conformance suite (0.4) fully green; Pizza/Sleipnir E2E green;
benchmark (`apps/bench`) not worse.

### B7 — Router and navigation (independent, any time after Phase 0)

Route precedence like Blazor (literal before parameter before catch-all, constraints increase
specificity); group constraint regexes; convert `bool` case-insensitively and correctly;
optional parameters `{id:int?}`; `double`/`decimal`/`float`/`datetime`; `long` as `bigint`
or a string with validation; do not re-encode catch-all; make the navigation lock effective;
`<base href>`; `app.dispose()` cleans up DOM and listeners (R14, R15). Fix the auth race in
`AuthenticationStateProvider`.

**State: B7 implemented** (branch `roadmap/b7-router`). `RouteTable` (route-data.ts) sorts by
Blazor's `RouteComparison` (per segment from the left: literal < parameter with constraint < parameter <
catch-all with constraint < catch-all, on a tie fewer segments first; stable, otherwise
manifest order) and on construction (router `onParametersSet`) throws Blazor's "The following
routes are ambiguous" if two routes of equal precedence cover the same URLs (same
literals, same constraints — .NET 8 rule; parameter name irrelevant). Template parser with Blazor's
errors (empty segments, braces, catch-all not last, required after optional, duplicate names,
optional catch-all, unknown constraint). Constraints anchored/grouped (`^(?:…)$`):
`int` (32 bit), `long` (**`bigint`**, 64-bit range), `bool` (case-insensitive), `double`/`float`/
`decimal` (number), `datetime` (Date, ISO), `guid` (D/N/B/P, string), `alpha`, `alphaNumeric`,
`regex(...)`; optional `{x?}`/`{x:int?}` ⇒ `null`; catch-all `{*p}`/`{**p}` **decoded** (like
Blazor: segments are decoded before matching, except `%2F` as of .NET 8), empty ⇒ `null`,
constraint per segment; parameters of other `@page` templates of the same page ⇒ `null`
(`UnusedRouteParameterNames`). Manifest format (vite-plugin) unchanged.
`NavigationManager`: `registerLocationChangingHandler` (+ `setNavigationLock`/`releaseNavigationLock`
as wrappers, new component `NavigationLock` with `onBeforeInternalNavigation`/
`confirmExternalNavigation`). `navigateTo` asks the handlers first (also for `forceLoad`/external,
like Blazor WASM), cancellation via `preventNavigation()`, a throwing handler or a newer navigation
(`signal` aborted); link clicks (only within the base URI space, `isNavigationIntercepted`)
go through the same handlers; `popstate` with handlers: undo the move via `history.go(-delta)`
(`_index` in `history.state`), ask, re-apply if allowed — a
cancelled back keeps the old URL (entry without `_index`: old URL via `replaceState`).
Without handlers everything stays synchronous. `baseUri` from `<base href>`, `toAbsoluteUri`/
`toBaseRelativePath` (throws outside the base) like Blazor, `navigateTo(uri, forceLoad, replace)` and
`NavigationOptions` (`replaceHistoryEntry`, `historyEntryState`). `app.dispose()`: dispose the tree,
remove the DOM range, dispose its own NavigationManager (click + popstate), remove the HMR bridge.
Auth: `watchAuthenticationState` tags the initial `getState()` with the provider's
notification version; a late result after a notification (or after
unsubscribe) is discarded. Conformance: R14 ×5, R15 green, new: ambiguity, `long` > 2^53,
`regex(a|b)`, lock against link click and popstate, `<base href>`, `app.dispose()`, auth race.
Deviations: without a `<base>` element the base is the origin root (Blazor: directory of the
document URL; Vite apps usually have no `<base>`); `regex(...)` is anchored (ASP.NET leaves
that to the pattern); `decimal` as number; `guid` stays a string; `datetime` ISO only; a NavigationManager
passed in from outside is not disposed by `app.dispose()`; `baseRelativePath` does not throw
outside the base (origin-relative path).

---

### A6 — TS cleanup (before Phase 2)

Per [design-principles.md](design-principles.md): code is clean TypeScript. C# forms accepted silently
until now become diagnostics with the TS counterpart (the quick fix comes with 2.5):
- `@foreach (var x in xs)` / `(string s in xs)` / `(var (k, v) in xs)` ⇒ error, TS form
  `@foreach (const x of xs)` (in TS `for…in` means key iteration),
- `var` in `@for` headers no longer silently becomes `let` — emit as written + warning,
- `@switch` section without `break` ⇒ TS fallthrough + warning (instead of an implicit `break`),
- `@attribute [C# attribute]` ⇒ error with a hint; canonical `@authorize`/`@authorize({ roles, policy })`
  and `@attribute @decorator(…)`,
- `@typeparam T where T : …` ⇒ error with a hint to `extends`,
- **Standard decorators** (TC39) instead of `experimentalDecorators`/`useDefineForClassFields: false`
  for `@Parameter`, `@CascadingParameter` etc. — before 2.1, because 2.1 reads the parameter metadata
  anew anyway.

Migration of the repo apps/libraries in the same step; the FluentCMS probe then measures what a
codemod has to take over.

**State: A6a implemented** (merged).
New codes: **TZS021** (error) C# form with a mechanical TS counterpart, the message names the
TS form; **TZS022** (warning) `var` in render code; **TZS023** (warning) falling-through
`@switch` section. Rules: `@foreach` headers are TS (`const`/`let`, destructuring; `for…in`
iterates keys as in TS); `var x in xs`, `string s in xs`, `var (k, v) in xs` ⇒ TZS021
(`'@foreach (const x of xs)' — in TypeScript, for…in iterates keys`), compiled as
this TS form for error recovery; counter headers under `@foreach` ⇒ TZS015. `var` is emitted as written
(no more `var`→`let` in `@for`), stays function-scoped (local also after the
loop) ⇒ TZS022. `@switch`: sections share the case block (no more generated
`case X: { … }` block — it would have changed TS scoping), no implicit `break`, TZS023 like
`noFallthroughCasesInSwitch` (stacked empty labels and the last section silent; a jump at the end
of a block or in all if/else branches counts). `@attribute [X]` ⇒ TZS021 with the TS form
(`[Authorize(Roles = "A, B")]` ⇒ `@authorize({ roles: ["A", "B"] })`, `[AllowAnonymous]` ⇒
remove, `[Route]` ⇒ `@page`, otherwise decorator/remove); `@authorize({ roles, policy })` as a
TS object literal (TS parser, literals only, multi-line allowed; otherwise TZS019), manifest form as in
A5. `@authorize` is **not** inherited via `_Imports` (TZS014 warning there) ⇒ no opt-out
needed. `@typeparam T where T : X` ⇒ TZS021 (`'@typeparam T extends X'`). Migrated: 9
`@foreach` headers in Pizza and Bench; repo build without warnings. Probe: new category "C# forms
(codemod-fixable)" (see 0.5). Gates: 752/752 tests, LSP smokes, Pizza, Gallery, Sleipnir,
Demo (components 31, scoped, code-behind, debugging, counter-state) green.
**Open for the codemod (2.5):** `foreach … in` ⇒ `const … of` (35× in FluentCMS),
`[Authorize(…)]` ⇒ `@authorize({…})`, remove `[AllowAnonymous]`/`[CascadingTypeParameter]`/
`[StreamRendering]`, `where` ⇒ `extends`, `var` ⇒ `let`/`const` (4×); the messages
provide the target texts. ~~A quick-fix range is still missing~~ — since A7 all diagnostics carry
a range, the mechanical forms a `fix` (replacement range + text; LSP code action).

**State A6b (standard decorators, done):** `@Parameter`/`@CascadingParameter` are
TC39 field decorators (also `accessor`/setters), metadata per class in
`Class[Symbol.metadata]` (private key, own map per class, reading via the
class chain, the B6 cache stays; `defineParameter` for decorator-free components).
`Symbol.metadata` polyfill in the leaf module `parameter-metadata.ts` (ESM order before any
decorated class). `experimentalDecorators`/`useDefineForClassFields: false` removed from all
tsconfigs, esbuild/Vitest configs, build scripts and the LSP; esbuild lowers
decorators (`supported: { decorators: false }`), the Vite plugin also for the app's `.ts` files.
`[[Define]]` fields: the runtime was already compiled this way (tsc, ES2022); what is new is the generated
code — no field of the generated class shadows code-behind members (only `@inject`/`@code`),
HMR removes fields that became accessors. Bundle (bench): standard lowering costs
+3.6 KB gz, `"sideEffects"` in the runtime package (only the polyfill module) lets unused
built-ins drop ⇒ net **22.7 → 20.4 KB gz**. For 2.1: the runtime metadata can be read per class
and correctly across inheritance; 2.1 supplies types/categories statically from the AST.

---

## Phase 2 — Parameter type metadata and type checking

**Prerequisite:** Track A finished (metadata is obtained from the new AST; shadows are
compiler output with correct maps). Track B does not need to be finished yet here.

### 2.1 — Parameter metadata per component

From the TS AST of each component (incl. code-behind): parameter name, declared type,
category (`string` / other value / `EventCallback` / `RenderFragment` /
`RenderFragment<T>`), `@typeparam`s, cascading parameters. Syntactically sufficient for
codegen; the plugin resolver supplies them for target components (analogous to `resolveComponent`).
Prebuilt packages (`components`, `fluent`) supply them as a manifest.

**State: 2.1 implemented** (branch `roadmap/p2-1-metadata`; model in
[architecture.md](architecture.md#parameter-metadata-21)). Extractor + resolution in
`@tsazor/compiler` (`metadata.ts`, syntactic, host-based), file system host,
cache and manifests in `@tsazor/workspace` (`metadata.ts`). Categories `string` /
`value` / `EventCallback` / `EventCallback<T>` / `RenderFragment` /
`RenderFragment<T>` / `captureUnmatchedValues` from the annotation (unions, `?:`,
renamed and namespace runtime imports, local and relatively imported aliases,
function type `(x: T) => RenderFragment`), type as source text + bindings of the
type names (`references`, for 2.4), `@typeparam`s/class type parameters,
cascading options, JSDoc. Inheritance via `@inherits`/`extends`/code-behind across
files and into the runtime manifest, type arguments substituted (`InputBase<string>`).
`FileContext.resolveComponentMetadata(tag, usings, imports)` →
`CompileOptions.resolveComponentMetadata` (codegen does not read it yet —
all 117 repo `.tsazor` byte-identical before/after incl. source maps, likewise
`components`/`fluent` dist). Manifests `dist/tsazor-components.json` (`package.json`
`tsazor.components`) from the builds of runtime, components, fluent; runtime manifest
embedded in the workspace, `RUNTIME_COMPONENTS` derived from it,
`RUNTIME_COMPONENT_PARAMS` removed; sync tests against sources and `getParameterInfo`.
Cache per file (mtime+size) with dependency edges (code-behind, `_Imports`,
base files, manifests) and `dependentsOf`/`invalidate` for 4.1. LSP:
attribute completion from the metadata (incl. inherited parameters, without cascading,
`@bind-X` only with an `XChanged` EventCallback). Gates: 842/842 tests, LSP smokes,
Pizza, Gallery, Sleipnir, Demo (components 31, scoped 10, code-behind 5,
debugging 14, counter-state 8) green.
**Open for 2.2/2.3/2.4:** switch codegen to `category` (C12, sync B8,
unknown parameters ⇒ error; `uncertain` there as a warning instead of an error);
slot detection via `RenderFragment`/`RenderFragment<T>` parameters and
`typeParameters` for `TItem` (2.3); `references` + `file` for type imports in the shadow
(2.4 — package-relative `file` paths point into `src/`, which the packages ship);
types from third-party packages without a manifest stay `uncertain`; a newly created
`_Imports.tsazor` does not invalidate the cache by itself (4.1).

### 2.2 — Metadata-driven codegen

- Static attribute values on non-string parameters are expressions (`Count="5"` ⇒ `5`,
  `OnClick="Handle"` ⇒ method group) (C12),
- `EventCallback` parameters are created explicitly by the compiler ⇒
  **sync point B8:** remove the runtime heuristic `/^on/i` (renderer.ts:14, 108), the wrong
  receiver goes away,
- unknown parameters ⇒ compile error (static counterpart to T3).

**State: 2.2 implemented** (branch `roadmap/p2-2-codegen`; rules in
[language-reference.md](language-reference.md#component-attributes-by-parameter-type)).
Component attributes by the `category` of the target parameter: `string` as before; other
values and `RenderFragment` as a TS expression even without `@` (`Count="5"` ⇒ `5`, `Items="people"`
⇒ `this.people`, `Interval="@4000"` ⇒ `4000`, valueless ⇒ `true`); `EventCallback(<T>)` ⇒
`EventCallback.bind(this, …)` with A4 receiver semantics, a passed `EventCallback` goes
through unchanged (`EventCallback.bind` returns it, like `EventCallbackFactory.Create`).
Canonical member names in the generated code. TZS025 (unknown parameter, error, "Did you
mean" fix) with complete metadata without a capture parameter, also for `@bind-X`/`XChanged`,
`@onclick` and event modifiers on components; TZS026 (warning) for `uncertain` parameters
(with a reason), missing metadata and incomplete base class chains — there the
previous lowering stays. `<Target>Expression` only if declared (not at all without metadata); the
runtime's discarding of an undeclared `ValueExpression` (B4) is removed.
**Sync point B8:** the `/^on/i` conversion in `setComponentParameters` and the special rule in
`parametersDefinitelyEqual` removed; a function is an ordinary value. Audit with a
temporary runtime message (all tests + E2E of all apps): only handbuilt
render trees in tests affected (components ×7, fluent ×2, runtime `parameters`) — switched to explicit
`EventCallback.bind`/`unbound`; no app call sites. Regression run (110
repo `.tsazor` old/new): silent string bugs fixed (`size="20"`, `rows="3"`,
`colSpan="4"`, `zoom="13"`, `ItemSize="32"`, `Overscan="5"`, `striped`/`hover`/`dismissible`/
`disabled="true"` etc. arrived as strings); one call site corrected (Gallery
`<BreadcrumbItem childContent="Home" />` ⇒ element content). Gates: 944/944 tests, LSP smokes,
Pizza, Gallery, Sleipnir, Demo (31/10/5/14/8) green; FluentCMS probe unchanged 149/164 (the
probe has no metadata). **Addendum (decided 2026-10-01, branch `roadmap/p2-3-templates`):**
method groups on function parameters (metadata flag `delegate`: category `value` with a
function type) are bound like C# delegates — `Filter="isVisible"` (declared method or
inherited member) and `Filter="svc.isVisible"`; lambdas, calls and fields stay TS. The helper
is now the runtime export `bindMethod` with a cache per (receiver, method) instead of one function per
module; change detection unchanged (delegates count as possibly changed, as in Blazor),
an `EventCallback` over `item.toggle` therefore compares equal. Regression run: 110 repo files
without a diff. **Open:** type checking of the expressions against the parameter type (2.4);
slots/`RenderFragment<T>` content (2.3).

### 2.3 — Templated components

Named slots (`<RowTemplate>`), `RenderFragment<T>` with `@context` and `Context="x"`,
`TItem` specification/inference, distinguish slot vs. component by the metadata (C13).
Afterwards: `App.tsazor` templates (`<Found Context="routeData">`, `NotAuthorized`) in the
fluentcms port and the gallery Table without handwritten `RenderTreeBuilder` code.

*Why here and not in Phase 3:* Without 2.1 it cannot be told whether `<Found>` is a slot or
a component; and 2.4 is supposed to check slots typed already.

**State: 2.3 implemented** (branch `roadmap/p2-3-templates`; rules in
[language-reference.md](language-reference.md#templated-components-named-slots-and-template-contexts-23)).
The parent decides slot vs. component based on its parameter metadata (C13): a
direct child that names a `RenderFragment`/`RenderFragment<T>` parameter is a
child-content element — even if a component of the same name exists (like Razor, where
child-content tag helpers bind before components); without parent metadata everything stays
2.2 behavior. It is emitted under the canonical parameter name;
`RenderFragment<T>` as `(context) => (__builder) => {…}` with the context as a body local
(default `context`; `Context="x"` on the component names the context of all its
templates, `Context="y"` on the slot overrides it for that slot; literal, TS identifier,
typed `any` — typed contexts 2.4). The element content of a component without
child-content elements stays its `ChildContent` — a `RenderFragment<T>` ChildContent
(generic, via `@typeparam`) becomes a template even without a `<ChildContent>` element;
whitespace between slots is not content. Type-argument attributes of the `@typeparam`s
(`TItem="Person"`) are template syntax (not a runtime attribute, the value must parse as a
TS type). Diagnostics: TZS027 (unrecognized child content), TZS028 (invalid
child-content element — duplicate, also set via attribute, unknown slot attribute,
non-literal `Context`, non-fragment parameter as an element), TZS029
(context name conflict of nested templates); TZS025 now also for unknown slots
(with a rename fix incl. the end tag) and element content on components without
`ChildContent`; TZS024/TZS009 for invalid/empty type-argument values. App conversion: no more
handwritten render trees — `<Router><Found Context="routeData">` in the four
apps (bench, demo, gallery, sleipnir), Pizza LoginDisplay/MainLayout, Demo
AuthDemo/VirtualizeDemo/ComponentsDemo (dialog footer), Gallery table/dashboard/
orders pages and dialog footers. Gates: 990/990 tests, LSP smokes (completion + ts),
Pizza 20/20, Gallery, Sleipnir, Demo (components 31, scoped 10, code-behind 5,
debugging 14, counter-state 8) green; FluentCMS probe unchanged 149/164 — the 18
remaining silent `@context` findings are in files whose slots are unresolved
built-ins of Phase 3. **Open:** `TItem` inference (attributes only explicit;
inference from the type parameter use is done by 2.4 via types), typed contexts (2.4),
LSP completion/hover for slots (2.5).

### 2.4 — Typed shadows and `tsazor check`

- The shadow emits prop checks per component tag (e.g. `satisfies Partial<ParamsOf<T>>`),
  slot context types, `@ref` types (fixes the TS2740 false positive) (T2),
- shadows for **all** project files, not only open ones (T4),
- CLI `tsazor check` (exit code ≠ 0 on errors) + optional Vite hook (T1),
- real `.d.ts` per component with typed parameters; ambient types for `*.tsazor` /
  `virtual:tsazor-routes` as `@tsazor/vite-plugin/client` (replaces the four copied
  `types.d.ts`),
- add `tsazor check` to the gates of all apps. **Measurement point:** the two
  `RedirectToLogin` bugs must be reported.

**State: 2.4 implemented** (branch `roadmap/p2-4-typed-checks`; details in
[design-2.4-typed-checks.md](design-2.4-typed-checks.md), rules in
[language-reference.md](language-reference.md#typed-shadows-and-tsazor-check-24)).
The compiler accepts `typedShadow: true` and then emits into each shadow, per
component tag, a `satisfies` check object with its own parameters — category
`value`/`string` typed, `mixedValue`/EventCallback/RenderFragment deliberately untyped
(like Razor, where attribute values run through the renderer as strings). Slot contexts come
from the `RenderFragment<T>` `typeArgument` (`context: Person` instead of `any`); the runtime placeholder
of the untyped delegate (`typeArgument === "unknown"`, e.g. Virtualize `itemTemplate`)
leaves `any` in place — intent, not a gap. `@ref`: elements cast via
`HTML/SVGElementTagNameMap` (TS2740 false positive gone), component `@ref` via
`ComponentReferenceCapture`; runtime child refs now go through hygienic `alias()` names,
import types through the `rebaseTypeImport` hook (`shadowTypeImports` header). `TItem` inference
runs through the type layer: `typedInference` requests (per tag position), unify exactly or
via `TItem[]` (4-pass, `buildEntry` loop instead of 2). Shadows additionally export the
component class by name (`export { X }`), so that rewrite-B named imports resolve against
the shadows. The TypeService automatically ensures shadows for imported third-party package .tsazor
(cascade, cycle-guarded) — Gallery error TS2307 gone.

Check: `checkProject` (two-pass — pass 1 compiler diagnostics + shadow build of **all** files
[T4], pass 2 TS diagnostics over the complete graph) in `@tsazor/lsp`, CLI package
`@tsazor/cli` (`tsazor check [root]`, exit 1 on errors), optional Vite hook
`check: true` (at the end of the build, errors break the build). A real `dist/<Name>.d.ts` per
component is built by `componentTypeDeclarations` from the package manifest (own parameters with
doc comment, generic `@inherits` as a class generic, runtime refs via
`@tsazor/runtime` import); the `build-entry` scripts of fluent/components write that instead
of the permissive `export const X: any` index. Ambient types for `*.tsazor` and
`virtual:tsazor-routes` live in `@tsazor/vite-plugin/client` — the copied
`types.d.ts` are deleted (blazing-pizza now has a tsconfig at all). Every app has a
`check` script and `tsazor check &&` before the build.

Measurement point met: the two-bugs acceptance fixture (`packages/lsp/test/check.test.ts`) pins
that `this.nav` against the injected `Nav` is reported as TS2551/TS2339 on the source line
("Did you mean 'Nav'?") and a `buildRenderTree` in `@code` as TZS020 — the
corrected port (as committed) checks clean. `tsazor check` against the user's untracked
`apps/fluentcms-admin` (read-only, nothing changed): `RedirectToLogin.tsazor`
0 findings; another 3 findings concern real in-progress scaffolding (missing
`MainLayout.tsazor`, `@using ./fields`/`./ui` without directories). Gates: 1018/1018 tests
(72 files), LSP smokes pass, Pizza/Gallery/Sleipnir/Demo E2E
(components 31, scoped 10, code-behind 5, debugging 14, counter-state 8) green; all four
apps `tsazor check: 0 error(s)`. FluentCMS probe unchanged 149/164. **Open:** LSP
project-wide (2.5) — multi-root/tsconfig selection uses the service built here.

### 2.5 — LSP project-wide

Multi-root and the right tsconfig per app (instead of `workspaceFolders[0]`),
`didChangeWatchedFiles`, re-check of dependent documents, correct diagnostic ranges,
completion from the metadata (2.1) instead of the v1 regex.

**Codemod `.razor` → `.tsazor`** (new, principle 4): mechanical translation of the C# leftovers —
`foreach … in`, `$"…"` ⇒ template literal, `[Attribute]` ⇒ `@authorize`/decorator, `where` ⇒
`extends`, PascalCase API calls ⇒ camelCase, DataAnnotations ⇒ validation model (3.6). The same
rules as LSP quick fixes. Metric: manual work after the codemod on the FluentCMS probe.
Rules in [language-reference.md](language-reference.md#codemod-razor--tsazor-25), details in
[language-server.md](language-server.md).

**State: 2.5 implemented** (branch `roadmap/p2-5-lsp`):

- *LSP project-wide:* multi-root — one `ProjectRegistry` over **all** workspace folders;
  every file is assigned to the project of the nearest `tsconfig.json` above it (without a tsconfig
  it inherits the folder root instead of blanket `workspaceFolders[0]`). Project keys are
  `root|config`, file keys posix-shaped + lowercased — Windows-safe. `didChangeWatchedFiles`
  is registered dynamically after initialized (`**/*.tsazor`, `**/tsconfig.json`): new/changed
  `.tsazor` refresh the disk shadow and re-check the dependent documents (dependents from the
  2.4 graph registry), deleted ones leave the shadow graph; a tsconfig change rebuilds the
  owning project and re-publishes all open documents. After every edit the
  dependents of the open file are re-published with the cache dropped — the dependents' component metadata
  also depends on the change.
- *Slots in the LSP (followed up from 2.3/2.4):* classification in `slots.ts` — ancestor chain,
  fragment parameters only on the **direct** parent, context walk inside→out (own
  `Context=` name before the slot's before "context"). Completion: slot tags from the
  parent's fragment parameters (a component of the same name is shadowed — as the
  TZS025 rename fix requires; no slots in slot bodies, nestings there are TZS027),
  a `Context` candidate on generic slots and components with a generic `ChildContent`,
  the context variable in the slot body and in loose content (type display `slot context · <typeArgument>`),
  hover on slot tags (`named slot of`, parameter/category/context line).
- *Codemod:* the core `codemodSource` in `@tsazor/compiler` (tested there) — fix to a fixed point via
  the A7 `fix` payloads (`@foreach … in`, `[Attribute]` map, `where ⇒ extends`, `var ⇒ let`,
  TZS024 interpolated strings ⇒ template literal) plus PascalCase API forms in markup
  (`.ToString()/.Length/.ToLower()/.ToUpper()`; `.Count` stays deliberately — `size` vs `length`
  is not mechanical). Pass rule: fixes and API forms are computed per pass on the **same** text
  and applied together — a fix wins overlaps, the API form follows in the next
  pass (regression test). CLI `tsazor codemod <path> [--write]` (dry run by default, `X.tsazor`
  next to `X.razor`, per-file report with fixes/API forms/remaining codes). DataAnnotations
  have no fix payload (A6: omitting them is the TS solution — rest ⇒ 3.6); ternaries written without parentheses
  in interpolation holes stay truncated (C# parity, documented).
- *Metric (FluentCMS probe, `codemod --write` on a local copy of FluentCMS@c63d49c —
  upstream stays unchecked-in):* baseline unchanged **149/217** clean (not regressed).
  After the codemod: **166/217** clean (+17), **196/217** without compile errors (previously 164),
  files with real errors **53 → 21**, 0 crashes; 51 fix payloads + 5 API forms across
  217 files in under a second. Remaining: TZS024 ×23 (not mechanical:
  `(MarkupString)` casts, `new { … }`, `out var`, `is (not) null`), TZS005 ×57 in 36 files
  (slots, Phase 3 built-ins), 1 × `[CascadingTypeParameter]` (no fix per the A6 decision — remove
  by hand); silent findings 5 → 10 files (the 18 `@context` findings remain; files that
  only compile after the codemod reveal their silent ones — explainable, not new).
- Gates: build, **1055/1055** tests (75 files), LSP smokes (completion + TS engine), Pizza,
  Gallery, Sleipnir and Demo E2E (components 31, scoped, code-behind, debugging, counter-state)
  green; `tsazor check` on all four apps without findings.
- **VSIX 0.5.0 packed and installed** (2026-10-01): version bump, `vsce@3.1.0 package
  --no-dependencies` (109 files, 2.29 MB), `code --install-extension` — `code --list-extensions`
  verifies `tsazor.tsazor-vscode@0.5.0`; the VS Code reload is to be triggered by the user. It thus runs
  on the Phase 2 state (2.5 incl. LSP project-wide, slot completion/hover, codemod).
- **VSIX 0.6.0 packed and installed** (2026-10-01, after Phase 5): runs on the
  overall Phase 2–5 state (3.x built-ins/forms, 4.x HMR/Fluent, 5.x packaging/dotnet);
  same procedure.

---

## Phase 3 — Parity: built-ins and forms

**Prerequisite:** B2 (error isolation), B3/B4 (disposal, lifecycle), 2.3 (slots).

**State (2026-10-01):** 3.1–3.5 implemented — `ErrorBoundary`/`ErrorBoundaryBase` in the runtime,
renderer routing via the parent chain (Blazor's `HandleExceptionViaErrorBoundary`), forced
empty render passes, MaximumErrorCount/Recover, dispose and batch errors stay fatal;
`DynamicComponent` with `Type`/`Parameters`, Blazor's unknown-parameter error and reference capture;
`MarkupString` as a markup frame (the compiler recognizes `new MarkupString(...)`/`… as MarkupString`);
sections (`SectionRegistry` per renderer, `SectionContent`/`SectionOutlet`) with HeadOutlet as
a second app root in `<head>`, `PageTitle` as the title section, `FocusOnNavigate`.
EditForm with Blazor's `OnSubmit`/`OnValidSubmit`/`OnInvalidSubmit` (`EventCallback<EditContext>`,
submit await in the tracked handler), `EditContext` parameter and fixed cascade, a model change
rebuilds the form subtree (region per context identity);
`<NotAuthorized>` of `AuthorizeView`/`AuthorizeRouteView` receives the
`AuthenticationState`.
Slot syntax (`<ErrorContent Context="error">`) from 2.3 works against the built-in metadata.
3.7 implemented — `InputFile` (Blazor's frame order incl. reference capture between the
attributes, native `File` instead of `IBrowserFile`), `SupplyParameterFromQuery` (Blazor's
QueryParameterValueSupplier parity; `type` option instead of type-less TS detection, `multiple` instead of
array detection) and `@bind:format` (BindConverter subset, invariant culture; plain-text values
are string literals, `:culture` TZS008, string/component binds warning).
3.8 implemented — DI lifetimes (singleton/scoped/transient with Blazor's AddScoped semantics),
`createScope()` service scopes (singletons at the root), dispose in reverse
creation order without `registerValue` constants, and cycle detection with .NET's exact
message.

| Step | Content | Depends on | State |
|---|---|---|---|
| 3.1 | `ErrorBoundary` (`ChildContent`, `ErrorContent` with context, `Recover()`) | B2 error hook, 2.3 | implemented |
| 3.2 | `DynamicComponent` (`Type`, `Parameters`) | 2.1 (parameter validation at runtime) | implemented |
| 3.3 | `MarkupString`: the compiler recognizes the type in `addContent` ⇒ markup frame | A4, 2.1 | implemented |
| 3.4 | `HeadContent`/`HeadOutlet`, `FocusOnNavigate`, sections (`SectionContent`/`SectionOutlet`), `PageTitle` as a section | B3 (logical ranges outside the root) | implemented |
| 3.5 | EditForm: `OnSubmit`/`OnInvalidSubmit`, await and track `onValidSubmit` | B4 | implemented |
| 3.6 | Decide and implement the validation model: decorator-based (`@Required()`, `@MaxLength()`) as the DataAnnotations counterpart **or** keep the function map plus an adapter | 2.1 (decorator metadata); decision before 5.2 | implemented |
| 3.7 | `InputFile`, `SupplyParameterFromQuery`, `@bind:format` (date/number, culture) | B7 (query), A5 | implemented |
| 3.8 | DI: scoped lifetime, cycle detection | — | implemented |

**Measurement point:** FluentCMS probe + first ported FluentCMS admin pages (CRUD plugins use
PluginForm, slots and `@bind` at scale).

*Metric (probe, FluentCMS@c63d49c, 217 files; after 3.7/3.8 — 2026-10-01):* the
Phase 2 baseline holds unchanged (149/217 clean, 164/217 after the codemod). This time the
probe counts the built-ins from the generated runtime manifest instead of a handwritten list:
**157/217** clean (+8), **182/217** after the codemod (+16), files with unresolved tags
36 → 17, TZS005 57 → 31 — `DataAnnotationsValidator` ×9, `InputFile` ×3, `DynamicComponent` ×7
and `HeadContent` ×4 are thereby resolved. Free of compiler errors stays at 164/217; what remains is
TZS024 ×35 (`(MarkupString)` casts …), the named slots as TZS005 (<ChildContent>,
<ActionsFragment>, <Found>, <Head>, <Body>, <SubtitleFragment>) and the known silent
`@context` findings. The first ported FluentCMS admin page is still open (the user keeps
his local `apps/fluentcms-admin` work outside this measurement).

### 3.1 — ErrorBoundary

**State: implemented** (2026-10-01, branch `roadmap/p3-builtins`). New
`packages/runtime/src/components/error-boundary.ts`: `ErrorBoundaryBase` (port of Blazor's
`ErrorBoundaryBase.cs`) with `childContent`, `errorContent: (error: unknown) => RenderFragment`
(Blazor: `RenderFragment<Exception>` — TS deviation `unknown`), `maximumErrorCount` (default
100), `recover()` (only in the error state, counter reset like Blazor's `Recover`) and the
logging hook `onError` (default `console.error`); `ErrorBoundary` as a tag component.
`IErrorBoundary` is the marker protocol (`isErrorBoundary === true`,
`isIErrorBoundary(component)`) — allowed on any component, like Blazor's interface `IErrorBoundary`.

Routing in `renderer.ts` (`handleComponentError` → `routeToErrorBoundary`): all phases except
`dispose` and `batch` (Blazor: only there) and only with an identifiable component; the parent
chain including the source itself — its own ErrorContent throws ⇒ the boundary catches again, and the
error counter limits the loop. Before `handleException` the renderer renders the boundary's next
pass as an empty tree (`state.forcedRenderFragment` — port of Blazor's
`AddToRenderQueue(boundary, empty)`; diff/dispose tears down the failed subtree, even
if a subclass renders without a difference), then its own output (ErrorContent) again.
Above `maximumErrorCount`: fatal to `renderer.errorHandler` (Blazor rethrows;
`ExceptionDispatchInfo` n/a). Conformance: 16 runtime/markup tests in
`packages/conformance/test/runtime/error-boundary.test.ts` (nearest wins, Recover, count reset,
default UI, sync/async event, lifecycle, after-render errors, subtree unmount, dispose fatal,
loop guard).

### 3.2 — DynamicComponent

**State: implemented** (2026-10-01). New `packages/runtime/src/components/dynamic-component.ts`
(port of Blazor's `DynamicComponent.cs`): `type` (component class or
`ComponentDefinition` — Blazor `Type`), `parameters` as a dictionary
(Blazor `IDictionary<string, object>`; deliberately NO `captureUnmatchedValues`, as Blazor
comments), `instance` via component reference capture (Blazor `Instance`). Diff parity:
the `defineComponent` cache keeps the definition identical across renders — the same type updates
the child instance, a type change replaces it (dispose + new), a dictionary change reaches the child
via re-setting parameters. Only `Type`/`Parameters` (case-insensitive) are accepted —
any other markup parameter throws Blazor's
`"DynamicComponent does not accept a parameter with the name 'X'. To pass parameters …"` in
`applyParameterValues` (before the assignment); a missing type throws Blazor's
`"…requires a non-null value for the parameter Type."` (after the assignment — an invalid
extra parameter is reported first). In markup (2.1 metadata) the compiler already catches the
unknown parameter as TZS025. Conformance: 10 runtime/markup tests in
`packages/conformance/test/runtime/dynamic-component.test.ts`.

### 3.3 — MarkupString

**State: implemented** (2026-10-01). Runtime: `packages/runtime/src/components/markup-string.ts`
(Blazor's `MarkupString` struct as a class, `value` + `toString`); `addContent` unwraps
`MarkupString` instances into markup frames (Blazor's `AddContent(MarkupString)` → unescaped;
the diff compares `markupContent`). Compiler (`codegen.ts`): markup expressions
`new MarkupString(inner)` and `inner as MarkupString` — the counterpart to C#'s `(MarkupString)s` —
are recognized via `markupStringContent()` (TS parser instead of a regex: strings/template literals
in `inner` are safe) and emitted **directly** as `addMarkupContent(seq, inner)` — no
instance object, the value is the baked expression. Recognition only if the name is bound via
`@import` to `@tsazor/runtime` (new: `runtimeBoundNames` in `collectImports`
tracks the module specifier per name; renames like `MarkupString as Raw` count, a
local type of the same name never does). Normal `@` expressions stay escaped. Conformance: 10 tests
in `packages/conformance/test/runtime/markup-string.test.ts` (raw/escaped, cast form, diff
of a dynamic field, alias, shadowing, slot context, runtime unwrapping incl.
ChildContent).

### 3.4 — Sections, HeadOutlet, FocusOnNavigate

**State: implemented** (2026-10-01). New files: `packages/runtime/src/sections/`
(`section-registry.ts`, `section-content.ts`, `section-outlet.ts`),
`packages/runtime/src/head/` (`head-content.ts`, `head-outlet.ts`),
`packages/runtime/src/routing/focus-on-navigate.ts`, `packages/runtime/src/navigation/dom-wrapper.ts`.

- **SectionRegistry** (port of Blazor's `SectionRegistry.cs`): provider list per identifier
  (`SectionName` string or `SectionId` object; both set or neither throws Blazor's
  error messages), "last added wins", default content stays in front and loses, removing the
  last provider falls back to the previous one (incl. default content), removing a
  non-last one does not notify, exactly **one** subscriber (`SectionOutlet`) per
  identifier — a second one throws Blazor's error. Deviation: Blazor's
  render mode mismatch detection is dropped (Tsazor has no render modes).
- **Registry wiring** as in Blazor via the RenderHandle: `renderer.sectionRegistry`
  (one instance per renderer), `renderHandle.sectionRegistry` on every ComponentState —
  no global variable.
- **SectionOutlet**: renders the content via a dedicated component
  (`SectionOutletContentRenderer`), **keyed per content fragment** (`b.setKey(fragment)` —
  Blazor's `SetKey(RenderFragment)`, port: `componentKey`/`setKey` now take arbitrary
  objects as keys). Changing content ⇒ new renderer instance (cascades/errors are
  re-evaluated), same content ⇒ instances stay.
- **SectionContent** as the provider; `isDefaultContent` is a parameter here instead of Blazor's
  internal property — as a documented deviation, because Tsazor has no `IComponent.Attach`;
  HeadOutlet sets it programmatically (markup usage is not intended).
- **HeadOutlet** (port of `HeadOutlet.cs`): renders the title and head sections; as a second
  root it is mounted by `createTsazorApp` into `document.head` (Blazor
  WebAssembly host parity) and disposed first by `app.dispose()`. Blazor's JS
  `PageTitle.getAndRemoveExistingTitle` is ported as `getAndRemoveExistingTitle()`: the
  first static (prerender) `<title>` is captured and removed on the first after-render;
  Tsazor's own title elements (preceding range marker comment) stay untouched
  (deviation: Blazor checks the logical element map entry, Tsazor the marker comment text).
- **PageTitle** rebuilt on sections: instead of writing `document.title` directly it renders
  a `SectionContent` under `HeadOutlet.TitleSectionId`; removal falls back to the static
  default title.
- **FocusOnNavigate** (port of `FocusOnNavigate.cs` + `DomWrapper.focusBySelector`): on a
  page change (compared via `routeData.route.type`, sentinel class like Blazor's
  `NonMatchingPageType`) focuses after the render; without `tabindex`, `tabIndex = -1` is
  set, `focus({ preventScroll: true })`. Renders nothing (deviation documented: Blazor's
  non-interactive path renders a custom element for the JS bridge — Tsazor is always
  interactive). Error texts like Blazor.

Conformance: 22 tests — 14 in `packages/conformance/test/runtime/sections.test.ts`
(last wins, fallback, default content, non-last notify silence, keyed renderer subtree,
subscriber errors, identifier errors, unsubscribe on disposal, markup), 4 in
`packages/conformance/test/runtime/head.test.ts` (HeadContent in the head, PageTitle +
default title capture/fallback, createTsazorApp head root with dispose), 4 in
`packages/conformance/test/runtime/focus-on-navigate.test.ts`.

### 3.5 — EditForm

**State: implemented** (2026-10-01). `packages/runtime/src/forms/edit-form.ts` rewritten after Blazor's
`EditForm.cs`; `authorize-view.ts`/`authorize-route-view.ts`:
`notAuthorized` is `RenderFragment<AuthenticationState>`.

- **Parameters:** `Model` or `EditContext` (both at once or neither throws Blazor's
  OnParametersSet error messages verbatim); `onSubmit` replaces validation
  (combining it with `OnValidSubmit`/`OnInvalidSubmit` throws Blazor's message), otherwise
  the `EditContext` validates and it goes to `onValidSubmit`/`onInvalidSubmit`. All three callbacks are
  `EventCallback<EditContext>`; ChildContent is `(context: EditContext) => RenderFragment`
  (Tsazor's spelling of Blazor's `RenderFragment<EditContext>`) — the markup slot context
  `@context` is the EditContext (2.4 mechanics against the framework metadata).
- **Await tracking:** `handleSubmit` awaits the callback inside the tracked
  `onsubmit` event handler, so `waitUntilIdle` covers an async `OnValidSubmit`/`OnSubmit`
  (Blazor: `HandleSubmitAsync` in the delegate).
- **Fixed cascade + region trick:** as in Blazor — `IsFixed=true`; the whole form subtree lies
  in a region whose sequence is the context identity (Blazor's
  `OpenRegion(_editContext.GetHashCode())`; port: a `WeakMap<EditContext, number>` counter, since
  GetHashCode cannot be ported). A newly created context (new `Model`, new
  `EditContext` parameter) replaces the region completely — input state is reset.
- **NotAuthorized** (Blazor `RenderFragment<AuthenticationState>`) receives the
  `AuthenticationState` as the slot context; markup slots do not change.
- Deviations documented: `ClientValidationData` (SSR mapping) dropped; the
  validation model is decided by 3.6 — decorators plus `DataAnnotationsValidator`
  (see there), the `Validators` map stays as an adapter.

Conformance: 7 tests in `packages/conformance/test/runtime/forms.test.ts` (valid/invalid
routing, OnSubmit without validation, async await before renderer idle, three Blazor error messages,
cascade of the EditContext into the slot context, region rebuild on model change).

### 3.6 — Validation model (decorators + DataAnnotationsValidator)

**State: implemented** (2026-10-01).

- **Decision:** the previous recommendation "decorators — enables 5.2 (schema ⇒
  validators)" is implemented. Validation rules are TC39 field decorators on the model
  — counterparts to the DataAnnotations attributes with Blazor's exact error texts:
  `packages/runtime/src/forms/validation-attributes.ts` exports `Required`
  (`{ allowEmptyStrings }`), `MinLength`, `MaxLength`, `StringLength(max,
  { minimumLength })`, `Range(min, max)`, `EmailAddress`, `RegularExpression(pattern)`,
  `Compare(otherField)` and the readers `validationRulesOf(modelType)`/`rulesForField`.
  The decorators record rule lists in `Symbol.metadata` (the same mechanism as
  `@Parameter`), read per field in declaration order (TC39 calls bottom-up —
  the read access reverses the order); legacy signatures (`experimentalDecorators`,
  static/private) throw the established error message or close to TZS021.
- **`DataAnnotationsValidator`** (`packages/runtime/src/forms/data-annotations-validator.ts`,
  port of Blazor's `DataAnnotationsValidator.cs`) activates the rules on the cascaded
  `EditContext` (Blazor's `EditContext.EnableDataAnnotationsValidation` in
  `edit-context.ts`, `enableDataAnnotationsValidation(context)` with its own
  `ValidationMessageStore`); without a cascade it throws Blazor's error message, as does a dynamic
  context change in `onParametersSet`. New as a built-in tag (manifest regenerated).
- **EditContext is Blazor's architecture**: `FieldState` per field (isModified) + multiple
  `ValidationMessageStore` providers whose messages are read aggregated per field;
  events `onFieldChanged` (a field change revalidates exactly that field),
  `onValidationRequested` (validate() → all fields), `onValidationStateChanged` (inputs
  re-render). The old function map (`validators` on EditForm) stays as an adapter — it
  writes into the built-in store of the `setValidator` registration, its messages coexist
  per field with the decorator messages. The legacy surface (`subscribe`, `markAsUnmodified`,
  `isValid(field?)`, `getInvalidFields`) was kept, all 7 forms tests green.
- Deviations documented (language-reference.md): no `[Display]` port (field name as the
  display name), no `AddAsyncValidator`/SSR mapping, the attribute set is the subset above
  (.NET texts verified from Strings.resx), `String/Range` only judge matching types
  instead of throwing.

Conformance: 9 tests in `packages/conformance/test/runtime/data-annotations.test.ts`
(exact texts of all rules, valid model, field-change revalidation, Required semantics
(whitespace/allowEmptyStrings/non-string), declaration order, EditForm submit
(OnInvalidSubmit + ValidationMessage), recovery after a failing submit, missing
cascade throws Blazor's message, adapter coexistence).

### 3.7 — InputFile, SupplyParameterFromQuery, @bind:format

**State: implemented** (2026-10-01).

- **`InputFile`** (`packages/runtime/src/components/input-file.ts`, port of Blazor's
  `InputFile.cs`): `<InputFile OnChange="@handle" multiple accept="…">` — `multiple`/`accept`
  pass through as element attributes, `OnChange` is `EventCallback<InputFileChangeEventArgs>`
  (`GetMultipleFiles(max)` with Blazor's default limit of 10, `FileCount`, `File`). Files are
  native `File` objects instead of `IBrowserFile` (deviation: `name`/`size`/`type` match,
  `OpenReadStream`/`ReadBuffer` do not exist — `file.text()`/`arrayBuffer()`). The
  implementation revealed a real diff bug: Blazor's InputFile renders
  `multipleAttributes, type="file", ReferenceCapture, OnChange` — the reference capture belongs
  in the element's attribute range, but previously it broke the attribute run and shadowed
  the following `onchange` handler. Fix in both paths (`render-tree/diff.ts`
  `attributesEndIndexExclusive` + slow path, `dom-renderer.ts` `insertFrame` preamble): attribute/event-handler
  frames **and** ElementReferenceCapture count toward the element's own attribute range;
  the capture action only fires on fresh element insertion (never again via the diff), which matches
  Blazor. Pinned in `packages/conformance/test/runtime/input-file.test.ts` (5 tests, also
  across re-renders).
- **`SupplyParameterFromQuery`**
  (`packages/runtime/src/routing/supply-parameter-from-query.ts`): decorator form
  `@SupplyParameterFromQuery({ type?, multiple? })` with `@Parameter` required (Blazor's message
  if both are missing). Blazor reads the target type from the parameter type — TS does not know the
  runtime type, hence `{ type: "int" | "long" | "bool" | … }` (the same conversions
  as the route constraints; default `string`) and
  `{ multiple: true }` instead of Blazor's array detection (deviation; semantically like Blazor's
  array parameter behavior: one converted value per repetition of the key, all other
  parameters take `values[0]`). Remaining parity verified: key = field name, case-insensitive,
  absent ⇒ `null` (`default(T)`), a failed parse throws Blazor's exact text
  ("Cannot parse the value 'X' as type 'T' for 'Y.'"), an unsupported type
  "Querystring values cannot be parsed as type 'X'.", route values beat query values for
  the same field. RouteView (`route-view.ts`) reads the query parameters from the
  `NavigationManager` on parameter set (now via `tryGet`, so RouteView's own message applies when
  the service is missing) and subscribes to navigation changes — parameters are supplied anew on every
  navigation. Conformance: `packages/conformance/test/runtime/supply-parameter-from-query.test.ts`
  (10 tests, incl. `long` > 2^53 exact, route over query, navigation re-supply in the real app).
- **`@bind:format`** (compiler `ast.ts`/`parser.ts`/`codegen.ts`, runtime
  `forms/bind-format.ts`): Blazor's BindConverter subset as dedicated `formatValue`/`parseValue`
  — numbers `F<n>`, `N<n>` (grouping), digit masks (`0.00`, `#,##0.0`); date tokens
  `yyyy/yy/MM/dd/HH/mm/ss/M/d/H/m/s` plus literals; parsing via a format regex (overflow ⇒ `null` ⇒
  the model value stays, like Blazor's NaN guard; empty text never parses as 0). Razor semantics of the
  values: `@bind:format="0.00"` is a string literal (new `formatLiteral` flag,
  codegen quotes it), `@bind:format="@fmt"` an expression. Invariant culture per A5/B7:
  `@bind:culture` error TZS008; `:format` on string/component binds is warning TZS008
  (Blazor's BindConverter only applies formats to types that have one) and the native round trip
  stays. Not implemented: integer zero padding (`D5` padding) — documented
  deviation. Conformance: `packages/conformance/test/runtime/bind-format.test.ts` (14 tests)
  plus 4 compiler tests in `packages/compiler/test/codegen.test.ts`.
- **Demo/E2E** (`apps/demo`): four new pages — `/validation` (EditForm +
  DataAnnotationsValidator with a profile model), `/format` (`0.00` and `yyyy-MM-dd` binds +
  `formatValue` in markup), `/upload` (InputFile with `multiple`), `/query`
  (SupplyParameterFromQuery int/bool/multiple, case-insensitive key via link). E2E
  `apps/demo/scripts/verify-3-7.mjs` (16 checks incl. exact .NET texts "The name field is
  required.", format round trip 1234.50 → 99.5 → "99.50", setInputFiles list, query supply and
  uppercase key) — green against the newly built demo.

### 3.8 — DI: scoped lifetime, cycle detection

**State: implemented** (2026-10-01). `packages/runtime/src/di/service-collection.ts`:

- **Lifetimes** (Blazor's ServiceLifetime): `register(token, factory, { lifetime:
  "singleton" | "scoped" | "transient" })`; the old `{ singleton?: boolean }` option stays
  (true ⇒ singleton — the previous default, false ⇒ transient), `{ lifetime }` is the
  explicit form and adds "scoped". `registerValue` marks constant registrations
  (`constant`), `registerType` passes the options through the factory.
- **Scopes** (Blazor's `CreateScope`): `ServiceProvider.createScope()` derives a
  service scope that shares the registrations but caches its scoped services itself;
  singletons fall through to the (transitive) root — one instance app-wide, even if a scope
  requests it first. Transients are created per resolution against the requesting provider
  (the factory sees the scope, not the root).
- **Dispose** (Blazor's engine): an instance is tracked exactly where it is cached;
  `dispose()` releases them in reverse creation order (instance `dispose()` if
  present) — a scope only its scoped or directly resolved transients, the root also
  its singletons. `registerValue` constants are excluded (deviation from .NET — the
  owner disposes, otherwise the app would e.g. release its NavigationManager twice);
  `get` on a disposed provider throws .NET's "Cannot access a disposed object.".
- **Cycle detection** (.NET's `CircularDependencyException`): a guard set over the
  synchronous resolution chain; re-entering the same token throws .NET's exact message —
  `A circular dependency was detected for the service of type 'X'.` (self-reference,
  two-service cycle, also across scopes).
- Other behavior unchanged: "Service not registered: X" on `get`, `undefined` on
  `tryGet`; renderer/app keep using the same surface (no call site changed).

Conformance: 9 tests in `packages/runtime/test/di.test.ts` (lifetimes across scopes, old
option forms, two-service cycle with the exact message, self-reference through a scope,
dispose order, constant exception with idempotent dispose, singleton ownership
root vs. scope).

---

## Phase 4 — Dev server and component library

### 4.1 — HMR and invalidation

`handleHotUpdate`/`addWatchFile`: dependency graph from the import model (A3) — new
component ⇒ re-transform files with a previously unresolved tag; `_Imports.tsazor`
change ⇒ all files below it; add/remove sidecar `.tsazor.css`/`.tsazor.ts`;
new/removed `@page` ⇒ route manifest. Normalize Windows path comparison case-insensitively;
limit the route scan to `src`. Tests for invalidation and Windows paths.

*Why only here:* The graph depends entirely on the import model (A3) and the metadata (2.1);
built earlier, it would have to be rewritten.

**State: 4.1 implemented (2026-10-01).** `hotUpdate` (Vite ≥ 6) plus
`handleHotUpdate` compatibility in `packages/vite-plugin`; the actual
planning lives in `invalidate.ts` (`planInvalidation`) — pure import edges from
A3, `_Imports.tsazor` inheritance, previously unresolved tags (TZS005 from the
2.1 metadata), sidecar edges (`.tsazor.css`/`.tsazor.ts` added/removed), and
`@page`/`@layout` changes ⇒ route manifest
(`virtual:tsazor-routes` ⇒ chain update up to `index.html`).
Path comparison normalized case-insensitively (Windows), route scan limited
to `src`. A clear full-reload policy: route manifest changes and removed
CSS sidecars reload completely — @page/@layout are routing, not a hot path.
Proven live via `apps/demo/scripts/verify-hmr.mjs` (19/19 scenarios
a)–g)); plus 49 plugin tests incl. Windows path cases (see
[architecture.md](architecture.md), section HMR).

### 4.2 — Fluent overhaul

After 2.3 (slots) and 2.4 (types), because the API changes anyway:
- ~~Parameters in PascalCase~~ — *decided: no* (camelCase members, markup maps case-insensitively; [design-principles.md](design-principles.md)),
- enum-like parameters as union types, consistent vocabulary,
- `@attributes` pass-through everywhere, render `aria-*` (Button),
- automatically unique IDs for label/message association, `role="alert"` only on submit errors,
- follow up with templated components (DataGrid, Table with `RenderFragment<T>`).

**State: 4.2 implemented (2026-10-01).** API break as planned, in the same commit
all four apps followed up (only the Gallery uses `@tsazor/fluent`):
- Vocabulary as unions in all components (`appearance`, `size`, `variant`,
  `severity`, `align`, spacing `"xs"…"xl"`, …) — the legacy names of `Alert`
  (primary/secondary/error/caution) were dropped without replacement; `Icon.name` stays
  `string` (open set, dynamic use, documented).
- `additionalAttributes` (`@attributes`) everywhere — inputs inherit it via
  `InputBase`; a shared merge helper (`withAttributes`: `class` appends,
  the rest overrides) keeps the components' behavior identical.
- A11y: Button renders `aria-label`/`aria-describedby`, Pagination gets
  `ariaLabel`; every input generates a unique ID if none is given
  (`fui-input-3` …) and wires `label[for]` + `aria-describedby` with it;
  `role="alert"` only appears with a submit attempt (`markSubmitAttempt` via
  the EditContext) — documented deviation: the `--invalid` classes
  stay live per edit.
- DataGrid new (`DataGridColumn<TRow>` in `src/datagrid-columns.ts`, columns
  build header + body, `format`/`align`/`cellContent` template, own CSS);
  Table `rowContent` stays `(row) => RenderFragment` per the 2.4 standard; a
  Gallery page (`/datagrid`) shows it, the E2E verify checks it live.
- Bug fixes found along the way: `componentTypeDeclaration` in `packages/workspace`
  produced d.ts without type imports (`collectReferences` was never called —
  dead since 2.4); the fluent build collides on Windows with helpers of the same name
  (`datagrid.ts` overwrote `DataGrid.js`) — helpers renamed.

---

## Phase 5 — External use and .NET bridge

### 5.1 — Packaging

**State: implemented** (2026-10-01, branch `roadmap/p5-packaging`).

- **`exports`/`types`/`license` in all packages.** Every package (`runtime` through `fluent`,
  new `dotnet`) has a complete `exports` mapping (`types` + `default`), `license: MIT`
  and a cleanly scoped `files` (only `dist` + README); the vite-plugin build bundles its
  dependencies, there are no runtime deps anymore. `pnpm-lock.yaml` and `pnpm-workspace.yaml`
  accordingly.
- **Tarball smoke gate** (`scripts/tarball-smoke.mjs`, CI gate): packs every shipping package
  (`pnpm pack`), installs the tarballs into a scratch project with **its own node_modules**
  (no workspace linking — exactly the external resolution) and runs the gates per combination:
  `vite build` over a minimal .tsazor project, a Vitest render test via
  `@tsazor/testing`, `tsazor check` via the installed CLI bin — plus, since 5.2, the three
  `@tsazor/dotnet` steps (both entry points imported, CLI generation from the tarball,
  tsc type check of the generated output). Two bugs found this way (wrongly shipped
  entries) are fixed in the gate commit.
- **Getting started checked against reality**: the npm consumer section matches the
  smoke steps; the test snippet needs `renderer.waitUntilIdle()` before the assertion
  (its absence was a documentation lie — order as in the actually running gate).

### 5.2 — `@tsazor/dotnet` (working title)

**State: implemented** (2026-10-01, branch `roadmap/p5-packaging`). New CLI `tsazor-dotnet`
(`--version`/`--help`, exit 0/1/2 like `tsazor`).

- **OpenAPI ⇒ typed TS client** (`packages/dotnet`): `tsazor-dotnet generate
  <openapi.json|https://…> --out <dir>` writes `models.ts` (DTO **classes** with
  3.6 decorators, so EditContext/DataAnnotationsValidator find the rules) and
  `<name>Client.ts` (`extends OpenApiClient`, `this.call(...)`). Path parameters are
  interpolated as an `encodeURIComponent` template, query parameters as an `XQuery` type alias
  (needed for the `Record<...>` target), the first 2xx JSON schema is the result type,
  204/no schema ⇒ `HttpResult<void>`. Entry points: `.` is the browser-safe part (client,
  HttpResult, auth — no Node modules), `@tsazor/dotnet/generator` the Node part (read OpenAPI,
  generate, CLI).
- **Nullability** by the four rules (required/optional · nullable/non-nullable):
  `T` with the .NET default, `T | null = null`, `?: T`, `?: T | null`. Documented subset:
  `integer`/`int64`/`float` ⇒ `number` (the same precision limit as `openapi-typescript`),
  `Range` only with both bounds, inline objects without `$ref` ⇒ `Record<string, unknown>` with a
  generator warning, `@Required()` only on strings and object references, local `$ref`s +
  `allOf` flattening, JSON (no YAML).
- **ProblemDetails/envelope as a value**: `HttpResult<T>` is the union
  `{ ok: true, body: T, headers, response } | { ok: false, status, body, problem:
  ProblemDetails | null, validationErrors?, headers, response }`. The hook: `TsazorHttp.send()`
  does **not** throw on `!ok` — `sendForResult` reads the body, recognizes RFC 9457 ProblemDetails
  (incl. `ValidationProblemDetails.errors`, normalized to `Record<string, string[]>`) and
  unwraps the FluentCMS envelope (`super(http, { envelope: { data, errors } })`; a
  non-empty envelope error turns a 2xx into `ok:false` with a synthetic
  ProblemDetails). In addition, the new `TsazorHttpError` (from
  `getJson`/`postJson`/…) carries status, statusText, the read body and the response.
- **Schema ⇒ DataAnnotations**: `minLength`/`maxLength`/`minimum`/`maximum`/`format: email`/
  `pattern` become `@MinLength`/`@MaxLength`/`@StringLength(max, { minimumLength })`/
  `@Range`/`@EmailAddress`/`@RegularExpression` on the generated field — EditContext +
  `DataAnnotationsValidator` validate the DTOs right away.
- **Auth integration** on the runtime `AuthenticationStateProvider`:
  `CookieAuthenticationStateProvider` (session endpoint `/auth/user`, any error ⇒ ANONYMOUS),
  `JwtAuthenticationStateProvider` (local Base64URL payload decoding with
  Microsoft claim URIs, `setToken`/`logout` notify; no signature check — the
  backend does that), `attachJwtAuth` sets the `Authorization: Bearer` interceptor.
- **Testing without a .NET backend**: a checked-in OpenAPI probe (ASP.NET corpus style), a small
  `node:http` server for ProblemDetails/envelope flows, handbuilt JWTs, a stub fetch for
  cookie auth — and a real `tsc` run of the generated output against the package types.
- **Migration**: **Pizza** switches to the bridge (checked-in contract `src/api/openapi.json`,
  generated `PizzaApiClient`, `HttpResult` in Index/ConfigurePizzaDialog/Checkout/MyOrders/
  OrderDetails, AuthProvider.register/login via the bridge), Pizza E2E 20/20 green.
  **Sleipnir not migrated** — it speaks neither REST nor ProblemDetails: its
  `sleipnir-client` is a batch/WebSocket/SSE protocol with its own contract; a bridge
  via OpenAPI would be a facade on the wrong protocol, not a migration. **FluentCMS**
  (envelope reference) does not yet exist as a port in the repo (the user's port
  `apps/fluentcms-admin` is a local undertaking) — the envelope path is covered by the checked-in
  probe (`--envelope data,errors`).

---

## Decisions that must be made before the respective step

| When | Question | Recommendation |
|---|---|---|
| before A3 | Syntax for explicit imports in `.tsazor` | **Decided (2026-09-30):** `@import { X } from "./y"` as a directive (Razor style, inheritable via `_Imports.tsazor`) |
| before B4 | Unknown parameters: error like Blazor or only a warning? | **Decided (2026-09-30):** error like Blazor (at runtime from B4; statically in addition from 2.2) |
| before 3.6 | Validation: decorators (close to DataAnnotations) or a function map? | **Decided (2026-10-01): decorators** — TC39 field decorators as the DataAnnotations counterpart with .NET error texts, `DataAnnotationsValidator` as a built-in; the `validators` map stays as an adapter (enables 5.2: schema ⇒ validators) |
| before 4.2 | Switch Fluent to PascalCase? | **Decided (2026-10-01): no** — members stay camelCase, PascalCase markup maps case-insensitively (design principles) |

## Ongoing in every phase

- Change the docs in the same commit as the behavior (review §7: documentation drift).
- Gates: package tests, golden/conformance suite, Pizza E2E, Sleipnir E2E, demo regression,
  FluentCMS probe (log the metric).
- The fluentcms-admin port runs along as validation; it will only be ported significantly further
  from the end of Phase 2 (slots + type check), because code ported earlier would contain workarounds that
  would have to be removed again afterwards.
