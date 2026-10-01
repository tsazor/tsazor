import type { DiagnosticFix, SourcePos, TextEdit } from "./diagnostics.js";
import { advancePos } from "./writer.js";

/**
 * C# interpolated strings in markup expressions (`$"…"`, `$@"…"`, plain
 * verbatim `@"…"`) are not TypeScript (TZS024). The mechanical rewrite is a
 * template literal: holes become `${…}` (the nested `@` of a Razor implicit
 * expression is dropped), `{{`/`}}` become braces, the C# layout of a hole
 * (`{x,2:C}`) is dropped with the expression kept. The same fix powers the
 * LSP quick-fixes and the `.razor` → `.tsazor` codemod.
 */

/** One interpolated (or verbatim) string occurrence in a snippet. */
export interface InterpolatedString {
  /** Offset of the prefix (`$`, `@`, `$@`, `@$`) in the snippet code. */
  readonly start: number;
  /** Offset one past the closing quote. */
  readonly end: number;
  /** The TS template literal replacement (backticks, `${…}` holes). */
  readonly template: string;
}

/** Index after the closing quote of the literal starting at `at`. Regular
 *  strings skip `\\` escapes, verbatim ones (`@"…"`, when `verbatim`) double
 *  quotes; a backtick-scanned region nests `${…}` holes. */
function skipQuoted(code: string, at: number, verbatim: boolean): number {
  const quote = code[at]!;
  for (let i = at + 1; i < code.length; i++) {
    if (quote === "`") {
      if (code[i] === "\\") i++;
      else if (code[i] === "`") return i + 1;
      continue;
    }
    if (verbatim) {
      if (code[i] === "\\") continue;
      if (code[i] === quote) {
        if (code[i + 1] === quote) i++;
        else return i + 1;
      }
      continue;
    }
    if (code[i] === "\\") i++;
    else if (code[i] === quote) return i + 1;
  }
  return code.length;
}

/** Scans `code` (a C#-bearing snippet) for interpolated/verbatim strings; TS
 *  literals already in the snippet are skipped (their text cannot start one). */
export function findInterpolatedStrings(code: string): InterpolatedString[] {
  const out: InterpolatedString[] = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipQuoted(code, i, false);
      continue;
    }
    const prefix = (ch === "$" && (code[i + 1] === '"' || code[i + 1] === "@")) || (ch === "@" && code[i + 1] === '"');
    if (prefix) {
      const occurrence = parseInterpolatedString(code, i);
      if (occurrence !== null) {
        out.push(occurrence);
        i = occurrence.end;
        continue;
      }
    }
    i++;
  }
  return out;
}

/**
 * Parses one occurrence starting at `start` (`$"…"`, `$@"…"`, `@$"…"` or
 * `@"…"`), or null when it never closes — the syntax error stays, without a fix.
 */
function parseInterpolatedString(code: string, start: number): InterpolatedString | null {
  let i = start;
  let interpolated = false;
  let verbatim = false;
  while (code[i] === "$" || code[i] === "@") {
    interpolated = interpolated || code[i] === "$";
    verbatim = verbatim || code[i] === "@";
    i++;
  }
  if (code[i] !== '"') return null;
  i++;
  let template = "`";
  for (;;) {
    if (i >= code.length) return null;
    const ch = code[i]!;
    if (ch === '"') {
      if (verbatim && code[i + 1] === '"') {
        template += literal(template, '"');
        i += 2;
        continue;
      }
      break;
    }
    if (ch === "\\") {
      const next = code[i + 1];
      if (next === undefined) return null;
      // `\"`/`\'` render as the bare quote; the common escapes pass through
      // (in a verbatim string the backslash is literal text, `\\`).
      template += next === '"' || next === "'" ? next : verbatim ? `\\\\${next}` : ch + next;
      i += 2;
      continue;
    }
    if (ch === "{" && interpolated) {
      if (code[i + 1] === "{") {
        template += literal(template, "{");
        i += 2;
        continue;
      }
      const hole = parseHole(code, i);
      if (hole === null) return null;
      template += `\${${hole.expr}}`;
      i = hole.end;
      continue;
    }
    if (ch === "}" && interpolated && code[i + 1] === "}") {
      template += "}";
      i += 2;
      continue;
    }
    template += literal(template, ch);
    i++;
  }
  return { start, end: i + 1, template: `${template}\`` };
}

/**
 * One hole `{…}` of an interpolated string: the expression text (nested
 * occurrences already transformed), ending before the matching `}`. A `,` or
 * `:` at the hole's top level starts the C# alignment/format layout, which is
 * skipped (still string- and nesting-aware, so its `}` is found).
 */
function parseHole(code: string, open: number): { end: number; expr: string } | null {
  let i = open + 1;
  let depth = 0;
  let expr = "";
  let layout = false;
  for (;;) {
    if (i >= code.length) return null;
    const ch = code[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      const end = skipQuoted(code, i, code[i - 1] === "@");
      if (!layout) expr += code.slice(i, end); // the literal stays in the expression
      i = end;
      continue;
    }
    if (ch === "$" && (code[i + 1] === '"' || code[i + 1] === "@")) {
      const nested = parseInterpolatedString(code, i);
      if (nested === null) return null;
      if (!layout) expr += nested.template;
      i = nested.end;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "}") {
      if (depth === 0) return { end: i + 1, expr: holeExpression(expr) };
      depth--;
    }
    if (!layout && depth === 0 && (ch === "," || ch === ":")) {
      // `,` is always the alignment separator (an expression cannot contain a
      // top-level comma). A `:` is one only when the text until the hole's `}`
      // holds no other top-level `?`: a format never contains `?:`, so a
      // conditional expression keeps its colon.
      if (ch === ":" && layoutProbeFinds(code, i + 1, "?")) {
        expr += ch;
        i++;
        continue;
      }
      layout = true;
      i++;
      continue;
    }
    if (!layout) expr += ch;
    i++;
  }
}

/** The hole's expression as TypeScript: the Razor implicit expression `@x`
 *  loses its `@` (`@(...)` keeps the parens — TS parentheses are equivalent). */
function holeExpression(expr: string): string {
  const trimmed = expr.trim();
  if (trimmed.startsWith("@(")) return trimmed.slice(1);
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

/** Scans from `from` to the `}` closing the hole's current depth (string- and
 *  nesting-aware like parseHole) and reports whether `token` occurs at that
 *  depth. Used for the `?:` probe. */
function layoutProbeFinds(code: string, from: number, token: string): boolean {
  let i = from;
  let depth = 0;
  for (;;) {
    if (i >= code.length) return false;
    const ch = code[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipQuoted(code, i, code[i - 1] === "@");
      continue;
    }
    if (ch === "$" && (code[i + 1] === '"' || code[i + 1] === "@")) {
      const nested = parseInterpolatedString(code, i);
      if (nested === null) return false;
      i = nested.end;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}") {
      if (depth === 0) return false;
      depth--;
    } else if (ch === ")" || ch === "]") depth--;
    else if (ch === token && depth === 0) return true;
    i++;
  }
}

/** A literal-part character: backticks are escaped, and a `{` right after an
 *  emitted `$` becomes `\{`, so the pair cannot read as a hole start. */
function literal(template: string, ch: string): string {
  if (ch === "`") return "\\`";
  if (ch === "{" && template.endsWith("$")) return "\\{";
  return ch;
}

/** The C# form ⇒ template literal: a TZS024 fix over the snippet's positions. */
export function interpolatedStringFix(text: string, start: SourcePos): DiagnosticFix | undefined {
  const occurrences = findInterpolatedStrings(text);
  if (occurrences.length === 0) return undefined;
  const edits: TextEdit[] = occurrences.map((occurrence: InterpolatedString) => ({
    pos: advancePos(start, text.slice(0, occurrence.start)),
    endPos: advancePos(start, text.slice(0, occurrence.end)),
    text: occurrence.template,
  }));
  const first = text.slice(occurrences[0]!.start, occurrences[0]!.end);
  const preview = first.includes("\n") ? first.slice(0, first.indexOf("\n")) + "…" : first;
  return {
    title: preview.length > 48 ? `Use a template literal (${preview.slice(0, 48)}…)` : `Use a template literal (${preview})`,
    edits,
  };
}

/** The source text of the first interpolated/verbatim occurrence, with line
 *  breaks collapsed — the message's preview of what becomes a template literal. */
export function firstInterpolatedSpan(text: string): string | undefined {
  const occurrence = findInterpolatedStrings(text)[0];
  if (occurrence === undefined) return undefined;
  return text.slice(occurrence.start, occurrence.end).replace(/\s+/g, " ");
}