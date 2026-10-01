import { compile, type CompileOptions, type SourcePos, type TextEdit, type TszDiagnostic } from "./index.js";
import { advancePos } from "./writer.js";

/**
 * The `.razor` → `.tsazor` codemod (2.5): applies the compiler's mechanical
 * fix payloads (A7) to a fixpoint — TZS021 (C# `@foreach` header,
 * `@attribute [C#]`, typeparameter `where T : X`), TZS022 (`var`) and TZS024
 * (C# interpolated/verbatim strings) — and rewrites the PascalCase API forms
 * C# keeps (`.ToString()`, `.Length`, `.ToLower()`, `.ToUpper()`, outside
 * `@code`/`@functions`). That C# inside `@code` stays C# until Phase 3, and
 * whatever no fix covers (TZS005, DataAnnotations, `(MarkupString)`) stays
 * and is reported.
 */

export interface CodemodResult {
  /** The transformed source (== input when nothing was mechanical). */
  readonly text: string;
  /** Diagnostics whose fix was applied. */
  readonly applied: readonly TszDiagnostic[];
  /** The PascalCase API replacements (rule name and position) — not compiler
   *  diagnostics, reported separately. */
  readonly apiReplacements: readonly { name: string; pos: SourcePos }[];
  /** The diagnostics of the final compile (C# `@code` blanked, positions
   *  kept) — what a reviewer still sees. */
  readonly remaining: readonly TszDiagnostic[];
  /** Set when even the markup-only compile failed (file left unchanged). */
  readonly crash?: string;
  readonly passes: number;
}

const MAX_PASSES = 8;

/** Compile options of a codemod run: markup-level fixes only, so no
 *  component/type resolution influences the transforms (unresolved tags are
 *  reported in `remaining`, not rewritten). */
const CODEMOD_OPTIONS: Omit<CompileOptions, "fileName"> = {
  className: "__tsazor_codemod",
  generateSourceMap: false,
  resolveComponent: () => null,
  resolveType: () => null,
};

type CompileAttempt = { diagnostics: TszDiagnostic[]; crash?: string };

/** Compiles for one fix pass: C# in `@code`/`@functions` is not TypeScript
 *  and can drag the whole file down; a full-file crash retries with those
 *  blocks blanked (positions preserved — fixes still address the original). */
function compileForFixes(source: string, fileName: string): CompileAttempt {
  try {
    return { diagnostics: [...compile(source, { ...CODEMOD_OPTIONS, fileName }).diagnostics.all] };
  } catch {
    return compileBlanked(source, fileName);
  }
}

function compileBlanked(source: string, fileName: string): CompileAttempt {
  try {
    return { diagnostics: [...compile(blankCodeBlocks(source), { ...CODEMOD_OPTIONS, fileName }).diagnostics.all] };
  } catch (error) {
    return { diagnostics: [], crash: error instanceof Error ? error.message : String(error) };
  }
}

/** Rewrites `source` by applying fix payloads and the API forms until a pass
 *  changes nothing. Diagnostics without a fix stay and come back in
 *  `remaining`. */
export function codemodSource(source: string, fileName = "input.tsazor"): CodemodResult {
  let text = source;
  const applied: TszDiagnostic[] = [];
  const apiReplacements: { name: string; pos: SourcePos }[] = [];
  let lastPass = 0;
  for (let passes = 0; passes < MAX_PASSES; passes++) {
    lastPass = passes + 1;
    const { diagnostics, crash } = compileForFixes(text, fileName);
    if (crash !== undefined) {
      return { text: source, applied, apiReplacements, remaining: [], crash, passes: lastPass };
    }
    const fixable = diagnostics.filter((d) => d.fix !== undefined).sort(cmpDiagnosticPositions);
    const selected = nonOverlapping(fixable);
    const api = apiFormEdits(text);
    if (selected.length === 0 && api.length === 0) break;
    if (api.length > 0) {
      text = applyTextEdits(text, api.map((a) => a.edit));
      apiReplacements.push(...api.map((a) => ({ name: a.name, pos: a.edit.pos })));
    }
    if (selected.length > 0) {
      text = applyTextEdits(text, selected.flatMap((d) => d.fix!.edits));
      applied.push(...selected);
    }
  }
  return finish(text, fileName, applied, apiReplacements, lastPass);
}

function finish(text: string, fileName: string, applied: TszDiagnostic[], apiReplacements: { name: string; pos: SourcePos }[], passes: number): CodemodResult {
  const { diagnostics, crash } = compileBlanked(text, fileName);
  return {
    text,
    applied,
    apiReplacements,
    remaining: diagnostics,
    passes,
    ...(crash !== undefined ? { crash } : {}),
  };
}

/* C#-API forms ---------------------------------------------------------------- */

/** PascalCase members C# keeps (`.Count` maps to neither — a dictionary's is
 *  `.size`, a list's `.length`; that call is not mechanical). One {name, edit}
 *  per occurrence, outside `@code`/`@functions` blocks. */
export function apiFormEdits(source: string): { name: string; edit: TextEdit }[] {
  const rules: [RegExp, string, string][] = [
    [/\.ToString\(\)/g, ".toString()", "ToString"],
    [/\.Length(?![\w(])/g, ".length", "Length"],
    [/\.ToLower\(\)/g, ".toLowerCase()", "ToLower"],
    [/\.ToUpper\(\)/g, ".toUpperCase()", "ToUpper"],
  ];
  const edits: { name: string; edit: TextEdit }[] = [];
  for (const region of markupRegions(source)) {
    for (const [pattern, replacement, name] of rules) {
      for (const match of region.text.matchAll(pattern)) {
        const offset = region.start + match.index;
        edits.push({ name, edit: { ...rangeOf(source, offset, match[0].length), text: replacement } });
      }
    }
  }
  return edits;
}

/** The regions outside `@code`/`@functions` blocks, as character offsets —
 *  the C# bodies are not TS and are rewritten in Phase 3. */
function markupRegions(source: string): { start: number; end: number; text: string }[] {
  const regions: { start: number; end: number; text: string }[] = [];
  let last = 0;
  const re = /@(?:code|functions)\s*\{/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const end = closingBraceOf(source, match.index + match[0].length - 1);
    if (end < 0) break;
    regions.push({ start: last, end: match.index, text: source.slice(last, match.index) });
    last = end + 1;
  }
  regions.push({ start: last, end: source.length, text: source.slice(last) });
  return regions;
}

/** Index of the `}` closing the `{` at `open` (C# strings skipped), or -1. */
function closingBraceOf(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === '"' || ch === "'") {
      i = skipCsharpQuoted(source, i);
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index after the closing quote of the C# literal at `at` (verbatim `@"…"`
 *  with its `""` escapes; regular, `\"`). */
function skipCsharpQuoted(source: string, at: number): number {
  const quote = source[at]!;
  const verbatim = at > 0 && source[at - 1] === "@";
  for (let i = at + 1; i < source.length; i++) {
    if (verbatim) {
      if (source[i] === quote) {
        if (source[i + 1] === quote) i++;
        else return i + 1;
      }
      continue;
    }
    if (source[i] === "\\") i++;
    else if (source[i] === quote) return i + 1;
  }
  return source.length;
}

/** Blanks the C# of `@code`/`@functions` blocks (spaces, newlines kept), so a
 *  compile of the markup sees the original positions. */
export function blankCodeBlocks(source: string): string {
  const chars = source.split("");
  const re = /@(?:code|functions)\s*\{/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const end = closingBraceOf(source, match.index + match[0].length - 1);
    if (end < 0) break;
    for (let i = match.index; i <= end; i++) {
      if (chars[i] !== "\n") chars[i] = " ";
    }
  }
  return chars.join("");
}

/* Edits ------------------------------------------------------------------------ */

/** Applies source edits (1-based line, 0-based column), descending so the
 *  offsets stay valid. The codemod preselects non-overlapping diagnostics;
 *  applying one diagnostic's fixes as-is is the LSP contract. */
export function applyTextEdits(source: string, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => cmpPos(b.pos, a.pos));
  let text = source;
  for (const edit of sorted) {
    text = text.slice(0, offsetOf(text, edit.pos)) + edit.text + text.slice(offsetOf(text, edit.endPos));
  }
  return text;
}

const cmpPos = (a: SourcePos, b: SourcePos): number => a.line - b.line || a.column - b.column;

function offsetOf(source: string, pos: SourcePos): number {
  const lineStarts = lineStartsOf(source);
  const line = Math.min(Math.max(pos.line, 1), lineStarts.length);
  return lineStarts[line - 1]! + pos.column;
}

/** One edit per replaced range: `pos`/`endPos` from a character offset and length. */
function rangeOf(source: string, offset: number, length: number): { pos: SourcePos; endPos: SourcePos } {
  const lineStarts = lineStartsOf(source);
  let line = 0;
  while (line + 1 < lineStarts.length && lineStarts[line + 1]! <= offset) line++;
  const pos = { line: line + 1, column: offset - lineStarts[line]! };
  return { pos, endPos: advancePos(pos, "x".repeat(length)) };
}

function lineStartsOf(source: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

/** Keeps the first diagnostic of every position: fixes of one diagnostic
 *  belong together, fixes of different diagnostics are applied together only
 *  when their ranges stay apart. */
function nonOverlapping(fixable: TszDiagnostic[]): TszDiagnostic[] {
  const selected: TszDiagnostic[] = [];
  for (const diagnostic of fixable) {
    const edits = diagnostic.fix!.edits;
    const conflicts = [...selected].some((d) => d.fix!.edits.some((a) => edits.some((b) => rangesOverlap(a, b))));
    if (!conflicts) selected.push(diagnostic);
  }
  return selected;
}

function rangesOverlap(a: TextEdit, b: TextEdit): boolean {
  return cmpPos(a.pos, b.endPos) < 0 && cmpPos(b.pos, a.endPos) < 0;
}

function cmpDiagnosticPositions(a: TszDiagnostic, b: TszDiagnostic): number {
  return cmpPos(a.pos, b.pos) || cmpPos(a.endPos, b.endPos);
}