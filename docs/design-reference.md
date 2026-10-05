# Design: the reference in the tutorial app (R4)

Status: **approved** (2026-10-05), with D-R1 changed: `docs/language-reference.md` stays
one document and is shown as one page (not split). Roadmap step 3b, part of R4.

The tutorial teaches; the reference answers "what exactly does X do, which
parameters does Y take". It lives in the tutorial app (one site, one deploy,
one search) under `/reference`, next to the start page and the index.

## Sources (what exists today)

| Source | Content | State |
| --- | --- | --- |
| `docs/language-reference.md` | directives, routes, `@bind`, DI, components, typed checks, diagnostics | ~1000 lines, one file, hand-written |
| `dist/tsazor-components.json` (runtime, components, fluent) | components with parameters, types, categories, doc comments | 92 components, 389 parameters, 82 % documented (components: 59 %) |
| runtime `src/**/*.ts` | exported classes/functions with JSDoc | ~750 doc comments; the API snapshot (`api/*.api.d.ts`) strips them |
| compiler diagnostics (TZS0xx) | codes, messages | table in the language reference |

## Structure

```text
/reference                          overview: the four sections, search hint
/reference/language                 docs/language-reference.md, one page
/reference/components/<package>/<Name>   generated from the manifests
/reference/api/<package>/<symbol>   generated from the source .d.ts with JSDoc
/reference/diagnostics              generated: every TZS code
```

**1. Language**: `docs/language-reference.md`, rendered at build time as one
page with the same Markdown pipeline as the lessons, a table of contents from its
`##`/`###` headings and stable heading anchors (so reference entries, lessons
and error messages can link to a section). The file stays the single source.

**2. Components** (generated): per package an overview table (name, one-line
doc), per component a page — parameters (name, type, required/optional,
default, doc), type parameters, cascading parameters, `ChildContent`/named
fragments, the "Blazor name" where it maps 1:1. For components and fluent a
link to the gallery demo.

**3. API** (generated): runtime, testing, dotnet — the public exports
(classes, functions, types) with signature and JSDoc, members grouped
(methods, properties). Compiler/vite-plugin/cli only as their option types
(`TsazorPluginOptions`, CLI commands), not their internals.

**4. Diagnostics** (generated): every `TZSxxx` code with severity, message
and the fix — the place error messages can link to.

## Decisions (approved 2026-10-05)

- **D-R1 — Single source for the language reference.** **Decided:**
  `docs/language-reference.md` stays one document, shown as one page; no split.
- **D-R2 — API extraction.** Use the TypeScript compiler API at build time on
  each package's `src/index.ts` (exports + JSDoc), not the snapshot (no docs)
  and not TypeDoc (another dependency, its own HTML). **Proposal: own
  extractor in `apps/tutorial/build/`, ~300 lines, output JSON like the
  manifests.**
- **D-R3 — Doc coverage as a gate.** A test fails when a public component
  parameter or API export has no doc comment. Today that means writing ~70
  missing parameter docs (mostly `@tsazor/components`) first. **Proposal:
  yes, gate from the start; fill the gaps as part of this work.**
- **D-R4 — Cross-links.** Front-matter `keywords` already name APIs. A
  keyword that matches a reference entry (`NavLink`, `@bind:after`,
  `TsazorHttp`) links lesson ↔ reference both ways: the reference page lists
  "Learn it in: …", the index entry gets a reference link, lesson text
  `inline code` matching a reference name becomes a link. **Proposal: all
  three; a test checks every link target exists.**
- **D-R5 — Search.** The index search extends to reference entries (one
  search box, results grouped "Lessons" / "Reference"). No full-text search
  in 1.0. **Proposal: yes.**

## Order

1. Route skeleton, overview page, SiteBar link "Reference".
2. Components (generated) — quickest win, manifests exist; doc gaps filled.
3. Diagnostics (generated).
4. Language page (the docs file, one page with a table of contents).
5. API extractor + pages.
6. Cross-links and the shared search; gates (coverage, link targets);
   verify/verify:pages steps.

Each step is committed on its own.

**Done (2026-10-05)**, all six steps:

- Overview, the components of runtime, components and fluent from the manifests, the language
  page (`docs/language-reference.md` as one page), the diagnostics page from the compiler's
  `DIAGNOSTIC_CATALOG`, the API pages of runtime, testing, dotnet and vite-plugin from the
  built declarations (`apps/tutorial/build/api.ts`).
- Cross-links (`apps/tutorial/build/reference-links.ts`): the first code span of a lesson text
  that names a reference entry links to it; component and API pages list "Learn it in" from the
  lessons' keywords; index entries link to their reference entry; the index search also finds
  reference entries. Library components (Badge, Card …) are search entries only — lessons write
  their own components with those names.
- Gates: `test/reference.test.ts` (every component, parameter, export and member documented;
  anchors), `test/links.test.ts` (every generated link resolves), the catalog test in the
  compiler; verify and verify:pages cover the pages.
- Prerequisites that came with it: component `doc` (`@** … *@`) and parameter `default` in the
  manifests, Blazor's scrolling on navigation (fragments), the documented public API.
