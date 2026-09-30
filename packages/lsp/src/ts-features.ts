/**
 * v2 feature layer: routes .tsazor positions between the v1 heuristic layer
 * (markup) and the TypeScript shadow layer (@code, @{…}, @-expressions) and
 * translates TS results back into .tsazor coordinates.
 *
 * Everything here is graceful: whenever the shadow module or the mapping has
 * nothing to offer for a position (returns `null` / `[]`), the server falls
 * back to the v1 heuristics — the TS layer can never make an existing feature
 * worse, it only covers @code and expressions, which v1 does not.
 */
import * as ts from "typescript";
import type { AnalyzedFile } from "./analysis.js";
import { nodeAt } from "./analysis.js";
import { readFileSync } from "node:fs";
import {
  shadowOffsetToPos,
  TsazorTypeService,
  type ShadowEntry,
} from "./ts-service.js";

/* ------------------------------------------------------------------ */
/* Context routing                                                     */
/* ------------------------------------------------------------------ */

export type CodeContext = "code" | "markup";

/**
 * "code" = the position sits inside @code/@{…} or behind an `@` in a markup
 * expression or attribute value — the TS layer owns it. "markup" = plain
 * text/tag/attribute-name context — v1 owns it.
 */
export function classifyCodeContext(analyzed: AnalyzedFile, line: number, character: number): CodeContext {
  if (line < 0) return "markup";
  const node = nodeAt(analyzed.document, line, character);
  if (node?.kind === "codeBlock" || node?.kind === "statement" || node?.kind === "expression") return "code";
  // Member completions fire one past an expression's end (`@ticker.` with the
  // cursor after the dot is end-exclusive in the AST): the boundary belongs to
  // the TS layer when the previous character sits inside an expression.
  const before = nodeAt(analyzed.document, line, character - 1);
  if (before?.kind === "expression") return "code";
  // `@`-expression typed inside an attribute value (v1's value state offers
  // nothing there): `Variant="@mo` — the raw slice decides.
  const cursor = offsetAt(analyzed.source, line, character);
  const lineStart = analyzed.source.lastIndexOf("\n", cursor - 1) + 1;
  const value = attributeValueTail(analyzed.source.slice(lineStart, cursor));
  if (value !== null && value.startsWith("@")) return "code";
  return "markup";
}

/** The unquoted attribute value being typed before the cursor, or null. */
function attributeValueTail(sliceBeforeCursor: string): string | null {
  const eq = sliceBeforeCursor.lastIndexOf("=");
  if (eq < 0) return null;
  const tail = sliceBeforeCursor.slice(eq + 1).trimStart();
  if (tail.startsWith('"') || tail.startsWith("'")) {
    const quote = tail[0]!;
    // The opening quote is still unclosed → the tail is the value so far.
    return tail.slice(1).includes(quote) ? null : tail.slice(1);
  }
  return tail === "" ? null : tail;
}

/** Text offset into the raw source. */
function offsetAt(source: string, line: number, character: number): number {
  let offset = 0;
  for (let l = 0; l < line; l++) {
    const nl = source.indexOf("\n", offset);
    if (nl < 0) return source.length;
    offset = nl + 1;
  }
  return offset + character;
}

/* ------------------------------------------------------------------ */
/* Completions                                                         */
/* ------------------------------------------------------------------ */

export interface TsCompletionCandidate {
  label: string;
  kind: "member";
  detail?: string;
  doc?: string;
  /** Plain (non-snippet) insertText from TS, e.g. `method(`. */
  insert?: string;
}

/**
 * TypeScript completions at a .tsazor position, or `null` when the position
 * maps nowhere in the shadow (→ v1 fallback).
 *
 * Mapping-first strategy: if the position maps into the shadow, the generated
 * text already contains the baked `this.` prefix and the full member chain, so
 * TS answers directly. Only the bare-prefix case right after `@` (nothing
 * generated yet) uses the variant-patch mechanism.
 */
export async function tsCompletions(
  service: TsazorTypeService,
  entry: ShadowEntry,
  analyzed: AnalyzedFile,
  line: number,
  character: number,
): Promise<TsCompletionCandidate[] | null> {
  // Defense-in-depth for direct callers: plain markup positions (tag names,
  // attribute names, plain text) never belong to the TS layer. An `@`-prefix
  // before the cursor (`@ticker.` / `@ti`) overrides it — the raw-text check
  // below is exact where the AST is end-exclusive against the cursor.
  const prefix = expressionPrefixBefore(analyzed.source, line, character);
  if (prefix?.atLineStart) {
    // A bare `@` or partial word at the start of a line is a directive
    // completion context — v1 offers directives and members together there.
    return null;
  }
  if (!prefix && classifyCodeContext(analyzed, line, character) !== "code") return null;
  if (prefix?.endsWithDot) {
    // Trailing-dot case (`@ticker.`): the parser ends the expression BEFORE
    // the dot (it becomes a separate text node), so srcToGen maps the cursor
    // into an unrelated text statement. Append a placeholder identifier so
    // the scanner keeps the whole chain in ONE implicit expression, then
    // query TS right behind the baked trailing dot — inside the placeholder
    // ident TS answers with the full member list.
    const variant = await service.buildVariant(entry, analyzed.source, {
      line,
      start: prefix.start,
      end: prefix.end,
      replacement: `${prefix.text}__tsazorQuery`,
      cursorAfter: `this.${prefix.text}`,
    });
    if (variant) {
      const info = service.completionsOnShadow(variant.entry, variant.cursor.line, variant.cursor.column);
      if (info) return completionCandidates(info);
    }
    return null;
  }
  const gen = entry.shadow.map.srcToGen(line, character);
  if (gen) {
    // The baked gen text already contains the `this.` prefix + member chain,
    // so TS answers directly.
    const info = service.completionsOnShadow(entry, gen.line, gen.column);
    if (info) return completionCandidates(info);
    if (!prefix) return null;
  }
  // Bare prefix right after `@` (`this.<prefix>` baked) with no mapped gen
  // text: query the variant shadow. Without a typed prefix there is nothing
  // to complete.
  if (!prefix) return null;
  const patch = { line, start: prefix.start, end: prefix.end, replacement: `this.${prefix.text}` };
  const variant = await service.buildVariant(entry, analyzed.source, patch);
  if (!variant) return null;
  const info = service.completionsOnShadow(variant.entry, variant.cursor.line, variant.cursor.column);
  return info ? completionCandidates(info) : null;
}

/**
 * The `@`-expression being typed directly before the cursor, or `null`.
 * Two cases: a chain ending in a trailing dot (`@ticker.` — the parser ends
 * the expression before such a dot, so it must be handled as a whole) and a
 * bare or partial word (`@`, `@ti`). `at` is the `@`'s column, `start`/`end`
 * span the typed text after it.
 */
export function expressionPrefixBefore(
  source: string,
  line: number,
  character: number,
): { at: number; start: number; end: number; text: string; endsWithDot: boolean; atLineStart: boolean } | null {
  const lineStart = offsetAt(source, line, 0);
  const cursorOffset = offsetAt(source, line, character);
  const before = source.slice(lineStart, cursorOffset);
  // Trailing dot: `@ticker.` / `@ticker.points.` — at least one identifier
  // required before every dot, including the trailing one.
  const dotMatch = /@([\w$]+(?:\.[\w$]+)*\.)$/.exec(before);
  if (dotMatch) {
    const at = lineStart + (dotMatch.index ?? 0);
    return {
      at,
      start: at + 1,
      end: cursorOffset,
      text: dotMatch[1] ?? "",
      endsWithDot: true,
      atLineStart: before.slice(0, dotMatch.index ?? 0).trim() === "",
    };
  }
  // Bare or partial word right after `@`: `@` / `@ti`.
  const wordMatch = /@([\w$]*)$/.exec(before);
  if (!wordMatch) return null;
  const at = lineStart + (wordMatch.index ?? 0);
  return {
    at,
    start: at + 1,
    end: cursorOffset,
    text: wordMatch[1] ?? "",
    endsWithDot: false,
    atLineStart: before.slice(0, wordMatch.index ?? 0).trim() === "",
  };
}

function completionCandidates(info: ts.CompletionInfo): TsCompletionCandidate[] {
  return info.entries
    .filter((entry) => entry.name)
    .map((entry) => ({
      label: entry.name!,
      kind: "member" as const,
      insert: entry.insertText ?? undefined,
    }));
}

/** Filled-in details for one completion item (resolveProvider round-trip). */
export function tsCompletionDetail(
  service: TsazorTypeService,
  entry: ShadowEntry,
  genLine: number,
  genCol: number,
  entryName: string,
  source?: string,
): { detail?: string; doc?: string } | null {
  const details = service.completionEntryDetail(entry, genLine, genCol, entryName, source);
  if (!details) return null;
  const documentation = typeof details.documentation === "string"
    ? details.documentation
    : (details.documentation ?? []).map((p) => p.text).join("");
  if (!details.displayParts.length && !documentation) return null;
  const cleanedDoc = sanitizeDoc(documentation);
  return {
    detail: details.displayParts.map((p) => p.text).join(""),
    doc: cleanedDoc || undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Hover                                                               */
/* ------------------------------------------------------------------ */

export interface TsHoverInfo {
  markdown: string;
}

/** QuickInfo at a .tsazor position, or null when unmapped (→ v1 fallback). */
export function tsHover(service: TsazorTypeService, entry: ShadowEntry, line: number, character: number): TsHoverInfo | null {
  const gen = entry.shadow.map.srcToGen(line, character);
  if (!gen) return null;
  const info = service.quickInfoOnShadow(entry, gen.line, gen.column);
  if (!info) return null;
  const display = prettifyHoverDisplay((info.displayParts ?? []).map((p) => p.text).join(""));
  const doc = typeof info.documentation === "string"
    ? info.documentation
    : (info.documentation ?? []).map((p) => p.text).join("");
  if (!display && !doc) return null;
  const cleaned = sanitizeDoc(doc);
  if ((display || doc) && !display && !cleaned) return null; // doc was lineage-only
  return { markdown: (display ? "```ts\n" + display + "\n```" : "") + (cleaned ? "\n\n" + cleaned : "") };
}

/**
 * Component tags resolve to an `__tsazor_comp_*` import alias in the generated
 * code, so TS quick info renders compiler plumbing —"(alias) class
 * __tsazor_comp_X" plus the `import …` context line. Rewrite it to the real
 * component name so the hover reads like the markup (`class ValidationMessage`).
 */
export function prettifyHoverDisplay(display: string): string {
  if (!display.includes("__tsazor_comp_")) return display;
  return display
    .replace(/^\(alias\) /, "")
    .replace(/\n\s*import [^\n]*$/, "") // TS's import-context line for the alias
    .replace(/__tsazor_comp_([A-Za-z0-9_]+)/g, (_match, name: string) => name);
}

/**
 * Runtime docstrings double as design notes ("Blazor's NavLink: …", "v1
 * deviation: …"), but editor surfaces (hover, completion details) must read
 * Tsazor-native. Sanitize to the component's own description: the "Blazor's X:"
 * heading is stripped to its description, lineage sentences referencing Blazor
 * and "v1 deviation" notes are dropped. The full notes stay in the source.
 */
export function sanitizeDoc(doc: string): string {
  const lines: string[] = [];
  for (const raw of doc.split("\n")) {
    const head = /^(\s*)(?:([-*])\s+)?(.*)$/.exec(raw);
    const indent = head?.[1] ?? "";
    const bullet = head?.[2];
    let body = head?.[3] ?? "";
    // "Blazor's InputText: single-line string input." → "single-line string input."
    body = body.replace(/^Blazor'?s\s+[A-Za-z0-9_.$]+(?:<[^>:]*>)?(?:\s+(?:analogue|equivalent))?:\s*/, "");
    // Sentence-level: drop lineage/deviation sentences, keep the rest of the line.
    body = body
      .split(/(?<=\.)\s+/)
      .filter((sentence) => sentence.trim() !== "" && !/\bBlazor\b|v1 deviation/.test(sentence))
      .join(" ");
    if (body.trim() === "") continue;
    lines.push(`${indent}${bullet ? bullet + " " : ""}${body}`.trimEnd());
  }
  while (lines.length > 0 && lines[0]!.trim() === "") lines.shift();
  while (lines.length > 0 && lines.at(-1)!.trim() === "") lines.pop();
  // Collapse runs of blank lines left by dropped ones.
  const collapsed = lines.filter((line, i) => i === 0 || line.trim() !== "" || lines[i - 1]!.trim() !== "");
  return collapsed.join("\n").trim();
}

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

export interface TsDefinitionTarget {
  file: string;
  line: number; // 0-based
  character: number;
  endLine: number;
  endCharacter: number;
}

/**
 * Go-to-definition for shadow-mapped positions:
 *   shadow target → mapped back onto the .tsazor source
 *   real .ts/.d.ts target → verbatim into that file
 * No mapped position / no targets → null (→ v1 fallback).
 */
export function tsDefinition(
  service: TsazorTypeService,
  entry: ShadowEntry,
  line: number,
  character: number,
): TsDefinitionTarget[] | null {
  const gen = entry.shadow.map.srcToGen(line, character);
  if (!gen) return null;
  const defs = service.definitionOnShadow(entry, gen.line, gen.column);
  const targets: TsDefinitionTarget[] = [];
  for (const def of defs) {
    const translated = translateTarget(service, entry, def.fileName, def.textSpan.start, def.textSpan.length);
    if (translated) targets.push(translated);
  }
  return targets.length > 0 ? targets : null;
}

/** One TS definition target: shadow targets map back, real files go verbatim. */
function translateTarget(
  service: TsazorTypeService,
  entry: ShadowEntry,
  fileName: string,
  genStart: number,
  genLength: number,
): TsDefinitionTarget | null {
  // Own or cross-shadow virtual module: map back onto the originating .tsazor.
  const targetEntry = service.entryOf(fileName);
  if (targetEntry) {
    const genPos = shadowOffsetToPos(targetEntry.shadow.code, genStart);
    const src = targetEntry.shadow.map.genToSrc(genPos.line, genPos.column);
    if (!src) return null;
    // End of the mapped token (or the plain end position for verbatim files).
    const endPos = shadowOffsetToPos(targetEntry.shadow.code, genStart + genLength);
    const srcEnd = targetEntry.shadow.map.genToSrc(endPos.line, endPos.column);
    return {
      file: targetEntry.shadow.realPath,
      line: src.line,
      character: src.character,
      endLine: srcEnd ? srcEnd.line : src.line,
      endCharacter: srcEnd ? srcEnd.character + 1 : src.character + 1,
    };
  }
  // Variant shadows map back through their origin entry.
  if (/\.variant\.ts$/.test(fileName)) return null;
  // A real file: 1:1 location from the text offset.
  let text: string;
  try {
    text = readFileSync(fileName, "utf8");
  } catch {
    return null;
  }
  const pos = shadowOffsetToPos(text, genStart);
  const endPos = shadowOffsetToPos(text, genStart + genLength);
  return { file: fileName, line: pos.line, character: pos.column, endLine: endPos.line, endCharacter: endPos.column };
}

/** True for shadow-internal definitions (used to prefer real targets, v2). */
export function targetIsShadowTarget(service: TsazorTypeService, fileName: string): boolean {
  return service.entryOf(fileName) !== undefined;
}

/* ------------------------------------------------------------------ */
/* Diagnostics                                                         */
/* ------------------------------------------------------------------ */

export interface TsDiagnostic {
  line: number; // 0-based
  character: number;
  code: number;
  message: string;
}

/** Static assets vite-style builds serve directly: no TS type declarations
 *  exist for them, so a plain `import "./x.css"` is TS2307 noise in the shadow. */
const ASSET_MODULE_SPECIFIER = /\.(?:css|scss|sass|less|html|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|eot|mp3|mp4)$/i;

/** True for a TS2307 message whose quoted specifier is a static asset. */
function isAssetModuleSpecifier(message: string): boolean {
  const quoted = /Cannot find module '([^']+)'/i.exec(message)?.[1];
  return quoted !== undefined && ASSET_MODULE_SPECIFIER.test(quoted);
}

/** Text spans of the `@Parameter`-decorated properties in the shadow source —
 *  used to drop TS2564 (strictPropertyInitialization), where the renderer's
 *  parameter assignment replaces the initializer (Blazor semantics). */
function parameterPropertySpans(code: string): Array<{ start: number; end: number }> {
  const sourceFile = ts.createSourceFile("__tsazor_shadow__.ts", code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const spans: Array<{ start: number; end: number }> = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyDeclaration(node) &&
      (ts.getDecorators(node) ?? []).some((decorator) =>
        decorator.expression.getText(sourceFile).startsWith("Parameter"),
      )
    ) {
      spans.push({ start: node.getStart(sourceFile), end: node.end });
      return; // nested properties do not exist
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return spans;
}

/**
 * Type diagnostics of one shadow (syntactic + semantic) mapped back to .tsazor
 * coordinates: diagnostics that do not map (synthetic regions, plumbing) are
 * dropped — that leaves only squiggles anchored on real source. Capped at 200.
 *
 * Syntactic diagnostics catch @code parse errors (e.g. `private pass word = "";`)
 * that otherwise only surface at build time (esbuild), not in the editor.
 *
 * Two shadow-false-positive classes are filtered:
 *  - TS2307 on static-asset specifiers (`.css`, images, fonts): vite serves
 *    them at runtime, but no type declaration exists in the shadow program.
 *  - TS2564 ("no initializer") on `@Parameter`-decorated properties: the
 *    renderer assigns parameters before first render (Blazor semantics), so
 *    the initializer never belongs in user code.
 */
export function tsDiagnostics(service: TsazorTypeService, entry: ShadowEntry, cap = 200): TsDiagnostic[] {
  const parameterSpans = parameterPropertySpans(entry.shadow.code);
  const results: TsDiagnostic[] = [];
  const diagnostics = [
    ...service.syntacticDiagnosticsOnShadow(entry),
    ...service.semanticDiagnosticsOnShadow(entry),
  ];
  for (const diag of diagnostics) {
    if (diag.start === undefined) continue;
    // Shadow-false positives (see docstring above) — match before mapping.
    if (diag.code === 2307 && isAssetModuleSpecifier(ts.flattenDiagnosticMessageText(diag.messageText, " "))) continue;
    if (diag.code === 2564 && parameterSpans.some((span) => diag.start! >= span.start && diag.start! < span.end)) continue;
    const genPos = shadowOffsetToPos(entry.shadow.code, diag.start);
    const src = entry.shadow.map.genToSrc(genPos.line, genPos.column);
    if (!src) continue;
    results.push({
      line: src.line,
      character: src.character,
      code: diag.code,
      message: ts.flattenDiagnosticMessageText(diag.messageText, " "),
    });
    if (results.length >= cap) break;
  }
  return results;
}