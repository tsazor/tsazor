# Design draft — Static markup blocks (F1a)

Status: **implemented 2026-10-04** — D-S1 to D-S5 as recommended (§7); results in §8. See
[design-svelte-features.md](design-svelte-features.md) F1a. F1b (update hints, hoisting) is a
separate step and builds on this one.

## 1. Goal

Razor collapses static HTML into `AddMarkupContent` frames. Tsazor emits every static element,
attribute and text node as its own frame. Closing the gap is Blazor parity in the frame stream
and should make static-heavy components cheaper to build, diff and insert.

**Non-goals:** no change to what a user writes, and no observable DOM change. The DOM a
component produces must stay byte-identical (apart from the boundary comments Tsazor already
emits for components). Update hints and hoisting are F1b.

## 2. What Razor does — verified

Compiled with the .NET 10 Razor compiler (SDK 10.0.401, `EmitCompilerGeneratedFiles`). The
input, one line per case, and what came out:

| Source | Razor's frames |
|---|---|
| `<div class="a"><p>Static <b>bold</b></p><span aria-hidden="true">x</span></div>` | one `AddMarkupContent`, the whole subtree as one string, plus the trailing `"\n"` |
| `<p>@count</p>` | element frames (dynamic content) |
| `<div class="b"><span>@count</span></div>` | element frames all the way down (a dynamic descendant) |
| two adjacent static elements | **two** markup frames — siblings are not merged |
| `<p style="color: red">…</p>` | markup (style attributes included) |
| `<select><option value="1">…</option><option selected>…</option></select>` | **element frames** — select and option are excluded |
| `<input value="x" />`, `<textarea>text</textarea>` | markup |
| `<button @onclick="Inc">` | element frames (a directive attribute) |
| `user@@example.com &amp; more` | markup `user@example.com &amp; more` — `@@` unescaped, entities raw |
| `<svg><circle … /></svg>` | markup, self-closing written out: `<circle …></circle>` |
| `<!-- comment -->` | dropped |
| static `<td>` inside a dynamic `<tr>` in `@foreach` | one markup frame per iteration |

Whitespace between siblings becomes markup too (`AddMarkupContent(n, "\n")`), or is appended to
the preceding block.

## 3. What Tsazor does today

- Every node is a frame: `<div class="a"><p>Hi <b>x</b></p></div>` is 7 frames; text is split
  at `@@` and entities (`user`, `@`, `example.com &` are three text frames). HTML comments are
  dropped; whitespace-only text between elements is dropped (a separate, existing difference).
- Markup frames exist for `MarkupString`. The renderer parses them with `innerHTML` on every
  insertion (`dom-renderer.ts` `parseMarkup`, through the `tsazor` Trusted Types policy since
  E1) and wraps the parsed nodes in two boundary comments (`bl-tsazor:markup`), so a block of
  any shape can be removed or replaced later.
- The diff compares markup frames by string; a change emits `UpdateMarkup`.

Taken as is, F1a would be a regression: the bench's rows have a static
`<span aria-hidden="true">x</span>` in each of 10,000 rows — 10,000 `innerHTML` parses and
20,000 extra comment nodes.

## 4. Proposal

### 4.1 Compiler: which subtrees become a block

A **static block** is an element whose whole subtree is static. It becomes one
`addMarkupContent` frame. As in Razor, every maximal static element is its own block, and
siblings are not merged.

An element is **not** static (it and its ancestors keep element frames) when it or a
descendant has:

- any `@` expression in an attribute value or in content, including mixed values;
- a directive attribute: `@onclick` and every event, `@bind…`, `@ref`, `@key`, `@attributes`,
  `@attach` and every other `@`-prefixed attribute;
- a component tag (anything that resolves to a component, including built-ins);
- `<select>` or `<option>` (Razor's exclusion: the renderer's deferred select value);
- **a `style` attribute (Tsazor's addition, §4.5);**
- `<script>`, and `<text>`/Razor transitions in content.

Text-only siblings (`Hello`) stay text frames: a text node is already one frame.

### 4.2 Compiler: the markup string

- Element and attribute names as written (lower case HTML; SVG camelCase kept).
- Attribute values HTML-escaped (`&` → `&amp;`, `"` → `&quot;`); a minimized attribute is
  written bare (`disabled`).
- Text as written: entities stay raw (the HTML parser decodes them, so the DOM text equals what
  the text frames produce today), `@@` becomes `@`.
- The scoped-CSS attribute (`b-xxxxxxxx`) is written into every element of the string, as the
  element frames get it today.
- Void elements without a closing tag; a self-closing non-void element (`<circle />`,
  `<div />`) is written out (`<circle></circle>`), as Razor does.
- HTML comments dropped, as today.

### 4.3 Runtime: parse once, clone per insertion

- A **template cache** keyed by the markup string (and the parse context: HTML or SVG). The
  first insertion parses the string once into a `<template>` (through the `tsazor` Trusted
  Types policy); every insertion after that is `content.cloneNode(true)`. That turns the
  bench's 10,000 parses into one parse and 10,000 clones — the template-cloning technique
  Svelte and Solid use.
- **No boundary comments for single-root blocks.** A static block is one element by
  construction (§4.1), so the renderer tracks it like an element frame's node: no
  `bl-tsazor:markup` markers, and the DOM is identical to today's output. The cache records
  whether the parsed fragment has exactly one node; `MarkupString` content with any other shape
  keeps the markers as now.
- `UpdateMarkup` (only on hot reload for a static block) replaces the node, or the range.

### 4.4 Diff

Unchanged: a static block's string is a compile-time constant, so the old and new frames
compare equal in one string comparison. Today the same subtree costs one comparison per
element, attribute and text frame.

### 4.5 Strict CSP: why `style` attributes stay out

Measured in Edge under `style-src 'self'` with Trusted Types: parsing
`<p style="…">` into a `<template>` already reports a `style-src-attr` violation, and parsing
it with `innerHTML` in the document drops the style. (A clone of the parsed template did get
the style — an inconsistency in Chromium that the design must not rely on, and the report
would fire on every page.) `createTsazorApp({ strictCsp: true })` writes style attributes
through the CSSOM instead, which needs an element frame. The compiler doesn't know whether
the app sets `strictCsp`, so elements with a `style` attribute are never part of a block. The
frame stream differs from Razor's there; the DOM doesn't.

### 4.6 What stays the same

Event delegation, `@ref`, `@key` and components are untouched (they are excluded). The source
map maps a block to its first element's start. Hot reload replaces a changed block.

## 5. Gates

1. **DOM equality over the corpus.** Compile every component of the conformance suite, the
   tutorial's lessons and the apps twice — with and without static blocks — render both in
   happy-dom and require identical DOM. This is the parity gate; any difference fails.
2. **Frame tests** for §4.1/§4.2: which shapes become a block, and the exact string (escaping,
   `@@`, entities, SVG, scope attribute, void elements).
3. **Runtime tests**: the cache parses once, a single-root block has no markers, hot reload
   replaces it, `MarkupString` keeps its markers.
4. **Strict CSP**: the demo's CSP check (`verify-csp.mjs`) stays green.
5. **Benchmarks** (`apps/bench`): create/append/update/swap/remove must not get slower, and a
   new static-heavy case (a list of 1,000 cards with static chrome) shows the gain. The numbers
   go into the bench README.

## 6. Work

1. Compiler: the static analysis (bottom-up over the AST, with the exclusions), the string
   writer, a compiler option `staticMarkup` (default on; `false` for debugging and as an
   escape hatch for one release).
2. Runtime: the template cache, the single-root fast path, `UpdateMarkup` for it.
3. The gates of §5; the language reference documents the frame shape and the deviations.

## 7. Decisions (confirmed 2026-10-04, all as recommended)

- **D-S1 — one block per static element, siblings not merged** (as Razor). *Recommended.*
  Merging siblings would give fewer frames but multi-node blocks, which need the boundary
  comments.
- **D-S2 — whitespace between elements stays out of the block.** Razor appends `"\n"` to the
  block; Tsazor drops whitespace-only text today, and keeping it out keeps every block
  single-rooted and marker-free. *Recommended.* (Whether Tsazor should keep inter-element
  whitespace at all is a separate parity question, not part of F1a.)
- **D-S3 — elements with a `style` attribute are never static** (§4.5). *Recommended.*
  Alternative: include them unless a compiler option says the app runs under a strict CSP —
  one more option for a small gain.
- **D-S4 — parse once, clone per insertion**, for compiler blocks and `MarkupString` alike.
  *Recommended.* Without it F1a is slower than today in loops.
- **D-S5 — `staticMarkup: false` as an escape hatch for one release**, then removed.
  *Recommended.* Removed before 1.0 (2026-10-14, the API review's T5): the Vite plugin's `optimize: false` turns
  blocks off with the other optimizations.

## 8. Results (2026-10-04)

- **DOM equality** (`apps/tutorial/test/static-markup-equality.test.ts`): every lesson's start and
  solution — 189 projects with 601 blocks — render the same DOM, body and head, with and without
  blocks. It found one bug on the way: a static `<td>` block inside a dynamic `<tr>` lost its
  tags in happy-dom, whose parser lacks the template's table modes. Table parts are now parsed
  inside their table structure (`TABLE_WRAPPERS` in `dom-renderer.ts`).
- **Beyond the design:** form elements are excluded entirely (`input`, `textarea`, `select`,
  `option`) and so are `value`/`checked`/`selected` attributes, because the renderer applies
  them as properties (Razor puts `input`/`textarea` into markup). Inline `on…` attributes stay
  out too.
- **Strict CSP:** the demo's check (`verify-csp.mjs`) stays green with blocks.
- **Bench** (`apps/bench`, Edge headless, two alternating runs per variant, medians of 5): the rows
  scenario is unchanged within noise (create 10k 289/284 → 281/286 ms; select 24/26 → 19/19 ms;
  heap 15.9 → 15.3 MB). The static-heavy `/cards` page (3,000 cards, static chrome, a dynamic
  price; `measure/static-markup.mjs`, medians of 7): show 23.3/25.9 → 14.1/14.1 ms, render again
  4.5/4.3 → 1.6/1.9 ms, hide unchanged (32.5/33.3 → 32.0/30.5 ms).
