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
import { explainExpressionValue, explainTypeScriptError, unresolvedName, type ImportSuggestion, type UninferredTypeArguments } from "@tsazor/compiler";
import type { AnalyzedFile } from "./analysis.js";
import { nodeAt } from "./analysis.js";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
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
  /** Exclusive end of the failing token/expression in .tsazor coordinates. */
  endLine: number; // 0-based
  endCharacter: number;
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
 * "Declared but never used" (`noUnusedLocals`/`noUnusedParameters`): never an error of generated code (the runtime
 * import names what the body might use), and an _Imports.tsazor imports for the files below, never for itself.
 */
const UNUSED_CODES = new Set([6133, 6138, 6192, 6196, 6198, 6205]);

/** The specifier of a generated import line (a `.gen` shadow rewrite stripped), or undefined. */
function importLineSpecifier(line: string): string | undefined {
  return /^import\b[^"']*["']([^"']+)["'];?\s*$/.exec(line.trim())?.[1]?.replace(/\.gen$/, "");
}

/**
 * Type diagnostics of one shadow (syntactic + semantic) mapped back to .tsazor
 * coordinates. An error that doesn't map (generated plumbing: the class
 * declaration, a resolved component's import) is still an error: it is
 * reported once on the file's first line, quoting the generated line — so a
 * gap in the shadow or a component's class problem is never lost silently.
 * Inherited `@import`s are the exception: their errors belong to the
 * _Imports.tsazor that declares them, whose own shadow reports them. Capped at 200.
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
  const seen = new Set<string>();
  let unresolvedModule = false;
  const imports = entry.shadow.className === "_Imports";
  const diagnostics = [
    ...service.syntacticDiagnosticsOnShadow(entry),
    ...service.semanticDiagnosticsOnShadow(entry),
  ];
  for (const diag of diagnostics) {
    if (diag.start === undefined) continue;
    // Shadow-false positives (see docstring above) — match before mapping.
    if (diag.code === 2307 && isAssetModuleSpecifier(ts.flattenDiagnosticMessageText(diag.messageText, " "))) continue;
    if (diag.code === 2564 && parameterSpans.some((span) => diag.start! >= span.start && diag.start! < span.end)) continue;
    if (imports && UNUSED_CODES.has(diag.code)) continue;
    const length = diag.length ?? 1;
    const genPos = shadowOffsetToPos(entry.shadow.code, diag.start);
    const src = entry.shadow.map.genToSrc(genPos.line, genPos.column);
    if (!src) {
      if (diag.category !== ts.DiagnosticCategory.Error || UNUSED_CODES.has(diag.code)) continue;
      const genLine = entry.shadow.code.split("\n")[genPos.line]?.trim() ?? "";
      const specifier = importLineSpecifier(genLine);
      if (specifier !== undefined && entry.shadow.inheritedSpecifiers?.has(specifier)) continue;
      const message = ts.flattenDiagnosticMessageText(diag.messageText, " ");
      // A generated import that doesn't resolve (`@tsazor/runtime` not installed) leaves the class without its base:
      // what follows in generated code is that one cause again.
      if (unresolvedModule && diag.code !== 2307) continue;
      if (diag.code === 2307) unresolvedModule = true;
      if (seen.has(`${diag.code}:${message}`)) continue;
      seen.add(`${diag.code}:${message}`);
      const quoted = genLine.length > 100 ? `${genLine.slice(0, 100)}…` : genLine;
      const explained = explainTypeScriptError(diag.code, withModuleHint(diag.code, message, entry.shadow.realPath));
      results.push({ line: 0, character: 0, endLine: 0, endCharacter: 1, code: diag.code, message: `${explained} (In the code generated from this file: \`${quoted}\`.)` });
      if (results.length >= cap) break;
      continue;
    }
    // The failing token/expression's end maps like the start; when the end
    // does not map (plumbing after the token) or precedes the start, the
    // range stays one character wide so the editor still underlines it.
    const genEnd = shadowOffsetToPos(entry.shadow.code, diag.start + length);
    const srcEnd = entry.shadow.map.genToSrc(genEnd.line, genEnd.column);
    const endLine = srcEnd && (srcEnd.line > src.line || srcEnd.character > src.character) ? srcEnd.line : src.line;
    const endCharacter =
      srcEnd && (srcEnd.line > src.line || srcEnd.character > src.character) ? srcEnd.character + 1 : src.character + 1;
    // One source expression can be emitted more than once (a bind's value and its write-back): one error, once.
    const placed = `${src.line}:${src.character}:${diag.code}:${ts.flattenDiagnosticMessageText(diag.messageText, " ")}`;
    if (seen.has(placed)) continue;
    seen.add(placed);
    results.push({
      line: src.line,
      character: src.character,
      endLine,
      endCharacter,
      code: diag.code,
      // S4: a plain-language hint for the common errors, unless the value explanation already applies.
      message: withUninferredHint(
        diag.code,
        explainExpressionValue(
          diag.code,
          withModuleHint(diag.code, withImportHint(diag.code, ts.flattenDiagnosticMessageText(diag.messageText, " "), entry), entry.shadow.realPath),
          { line: src.line + 1, column: src.character },
          entry.shadow.expressionValues,
        ),
        { line: src.line + 1, column: src.character },
        entry,
      ),
    });
    if (results.length >= cap) break;
  }
  return results;
}
/**
 * Razor's RZ10001 as the hint: an error inside a generic tag whose type arguments stay open (a grid's columns typed
 * without the row type) names the cause and the fix, instead of S4's general hint. The innermost such tag wins.
 */
function withUninferredHint(code: number, message: string, at: { line: number; column: number }, entry: ShadowEntry): string {
  const before = (a: { line: number; column: number }, b: { line: number; column: number }): boolean =>
    a.line < b.line || (a.line === b.line && a.column <= b.column);
  const tag = (entry.shadow.uninferredTypeArguments ?? [])
    .filter((candidate) => before(candidate.start, at) && before(at, candidate.end))
    .reduce<UninferredTypeArguments | undefined>((inner, candidate) => (inner === undefined || before(inner.start, candidate.start) ? candidate : inner), undefined);
  if (tag === undefined) return explainTypeScriptError(code, message);
  const names = tag.typeParameters.map((name) => `'${name}'`).join(", ");
  const example = tag.typeParameters.map((name) => `${name}="…"`).join(" ");
  return `${message} Hint: the type arguments of <${tag.tagName}> (${names}) can't be inferred from the values given (Razor's RZ10001). Set them on the tag: <${tag.tagName} ${example}>.`;
}

/* ------------------------------------------------------------------ */
/* F29: the @import a name in @code lacks                              */
/* ------------------------------------------------------------------ */

/**
 * The suggestion for a TS2304 message — or a TS2339 on the component itself (G2: markup read an import left out as a
 * member, `Shade="Shade.Dark"` ⇒ "Property 'Shade' does not exist on type 'Page'") — when the name has one.
 */
function importSuggestionFor(entry: ShadowEntry, message: string, code = 2304): ImportSuggestion | undefined {
  const name = code === 2339 ? missingMemberOfComponent(message, entry.shadow.className) : unresolvedName(message);
  return name === undefined ? undefined : entry.shadow.importSuggestions?.find((suggestion) => suggestion.name === name);
}

/** The property TS2339 reports as missing on the component's own class, if the message is one. */
function missingMemberOfComponent(message: string, className: string): string | undefined {
  const match = /^Property '([^']+)' does not exist on type '([^'<]+)/.exec(message);
  return match !== null && match[2] === className ? match[1] : undefined;
}

/* ------------------------------------------------------------------ */
/* TS2307: where a specifier was looked for                            */
/* ------------------------------------------------------------------ */

const MODULE_EXTENSIONS = [".d.ts", ".ts", ".tsx", ".mts", ".js", ".mjs", ".tsazor", ".json"];

function isModuleAt(base: string): boolean {
  try {
    if (statSync(base).isFile()) return true;
  } catch {
    // Not a file as written: try the extensions.
  }
  return MODULE_EXTENSIONS.some((extension) => existsSync(base + extension) || existsSync(path.join(base, `index${extension}`)));
}

/** A module file in `dir` whose name is a near miss of `name` (case, a typo): its name, or undefined. */
function nearModule(dir: string, name: string): string | undefined {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return undefined;
  }
  const wanted = name.toLowerCase();
  const limit = Math.max(1, Math.floor(name.length / 3));
  let best: { name: string; distance: number } | undefined;
  for (const file of names) {
    const extension = MODULE_EXTENSIONS.find((candidate) => file.endsWith(candidate));
    if (extension === undefined || file.endsWith(".gen.ts")) continue;
    const stem = file.slice(0, -extension.length);
    const distance = editDistance(stem.toLowerCase(), wanted);
    if (distance <= limit && (best === undefined || distance < best.distance)) best = { name: extension === ".tsazor" ? file : stem, distance };
  }
  return best?.name;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length]!;
}

function specifierFrom(fromDir: string, target: string): string {
  const relative = path.relative(fromDir, target).replace(/\\/g, "/");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

/**
 * TS2307 in a .tsazor: the folder the specifier was resolved from — the file's own, as in any TypeScript module
 * (an _Imports.tsazor's for its own @imports) — and the specifier that finds the module when one does: the same
 * name a folder or two up (a page in Pages/ importing `./Store` meant `../Store`), or a near-miss name where it points.
 * A bare specifier is a package not installed where the file looks for packages.
 */
function withModuleHint(code: number, message: string, file: string): string {
  if (code !== 2307 || message.includes(" Hint: ")) return message;
  const specifier = /Cannot find module '([^']+)'/.exec(message)?.[1];
  if (specifier === undefined) return message;
  const dir = path.dirname(file);
  const folder = `${path.basename(path.dirname(dir))}/${path.basename(dir)}/`;
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!;
    return `${message} Hint: '${name}' is not installed where this file looks for packages (a node_modules folder above ${folder}): add it to the app's dependencies.`;
  }
  const target = path.resolve(dir, specifier);
  let found: string | undefined;
  const name = specifier.replace(/^(\.\.?\/)+/, "");
  for (let up = path.dirname(dir), level = 0; found === undefined && level < 3; up = path.dirname(up), level++) {
    if (isModuleAt(path.join(up, name))) found = specifierFrom(dir, path.join(up, name));
  }
  if (found === undefined) {
    const near = nearModule(path.dirname(target), path.basename(target));
    if (near !== undefined) found = specifierFrom(dir, path.join(path.dirname(target), near));
  }
  return `${message} Hint: a relative specifier resolves from the folder of the file it is written in (${folder}), as in any TypeScript module${found !== undefined ? ` — '${found}' finds it` : ""}.`;
}

/**
 * TS2304 for a name markup would find (a component through `@using` or its folder): the hint names the
 * exact `@import`. In TypeScript code a type comes from an import; a Blazor `@ref` field meets this.
 */
function withImportHint(code: number, message: string, entry: ShadowEntry): string {
  const suggestion = code === 2304 || code === 2339 ? importSuggestionFor(entry, message, code) : undefined;
  if (suggestion === undefined) return message;
  if (code === 2339) return `${message} Hint: \`${suggestion.name}\` is no member of the component — an import is missing, as in any TypeScript: \`${suggestion.directive}\` (quick fix).`;
  return `${message} Hint: markup finds \`${suggestion.name}\` by name, but in \`@code\` a type comes from an import, as in any TypeScript: \`${suggestion.directive}\` (quick fix).`;
}

/** F29: "Add `@import …`" for each TS2304 in the range whose name has a suggestion. */
export function tsImportFixes(
  service: TsazorTypeService,
  entry: ShadowEntry,
  range: { start: { line: number; character: number }; end: { line: number; character: number } },
): TsQuickFix[] {
  const fixes: TsQuickFix[] = [];
  const seen = new Set<string>();
  for (const diagnostic of service.semanticDiagnosticsOnShadow(entry)) {
    if ((diagnostic.code !== 2304 && diagnostic.code !== 2339) || diagnostic.start === undefined) continue;
    const suggestion = importSuggestionFor(entry, ts.flattenDiagnosticMessageText(diagnostic.messageText, " "), diagnostic.code);
    if (suggestion === undefined) continue;
    const gen = shadowOffsetToPos(entry.shadow.code, diagnostic.start);
    const start = entry.shadow.map.genToSrc(gen.line, gen.column);
    if (!start || start.line < range.start.line || start.line > range.end.line || seen.has(suggestion.name)) continue;
    seen.add(suggestion.name);
    const at = { line: suggestion.insertLine, character: 0 };
    fixes.push({
      title: `Add ${suggestion.directive}`,
      code: diagnostic.code,
      line: start.line,
      character: start.character,
      edits: [{ range: { start: at, end: at }, newText: `${suggestion.directive}\n` }],
    });
  }
  return fixes;
}

/* ------------------------------------------------------------------ */
/* S4: "infer parameter types from usage"                              */
/* ------------------------------------------------------------------ */

/** Implicit-any codes TypeScript's "infer from usage" fix handles for parameters and members. */
const IMPLICIT_ANY_CODES = [7006, 7031, 7019, 7008, 7005, 7034];

/** A TS code fix translated to .tsazor coordinates (0-based). */
export interface TsQuickFix {
  title: string;
  /** The diagnostic it fixes (its code and .tsazor start), to attach the action to. */
  code: number;
  line: number;
  character: number;
  edits: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }>;
}

/**
 * S4: for an implicit-any diagnostic (TS7006 & co.) in the given .tsazor
 * range, TypeScript's "Infer parameter types from usage" fix run on the
 * shadow — usages in the markup count, since the markup is code there. A
 * fix is offered only when every edit lands in the .tsazor file itself (a
 * position that maps back exactly, inside `@code`); fixes that would touch
 * the generated plumbing or other files are dropped.
 */
export function tsInferTypeFixes(
  service: TsazorTypeService,
  entry: ShadowEntry,
  range: { start: { line: number; character: number }; end: { line: number; character: number } },
): TsQuickFix[] {
  const map = entry.shadow.map;
  const code = entry.shadow.code;
  const toSrc = (offset: number): { line: number; character: number } | null => {
    const gen = shadowOffsetToPos(code, offset);
    const src = map.genToSrc(gen.line, gen.column);
    if (!src) return null;
    // Exact: the source position maps back to the same generated one (no plumbing in between).
    const back = map.srcToGen(src.line, src.character);
    return back && back.line === gen.line && back.column === gen.column ? src : null;
  };
  const fixes: TsQuickFix[] = [];
  for (const diagnostic of service.semanticDiagnosticsOnShadow(entry)) {
    if (diagnostic.start === undefined || !IMPLICIT_ANY_CODES.includes(diagnostic.code)) continue;
    const start = toSrc(diagnostic.start);
    // The fix belongs to the lines the editor asks about.
    if (!start || start.line < range.start.line || start.line > range.end.line) continue;
    for (const action of service.codeFixesOnShadow(entry, diagnostic.start, diagnostic.start + (diagnostic.length ?? 0), [diagnostic.code])) {
      if (action.fixName !== "inferFromUsage") continue;
      const edits: TsQuickFix["edits"] = [];
      let mappable = true;
      for (const change of action.changes) {
        if (path.resolve(change.fileName).toLowerCase() !== path.resolve(entry.shadow.virtualPath).toLowerCase()) {
          mappable = false;
          break;
        }
        for (const text of change.textChanges) {
          const from = toSrc(text.span.start);
          const to = text.span.length === 0 ? from : toSrc(text.span.start + text.span.length);
          if (!from || !to || from.line !== to.line) {
            mappable = false;
            break;
          }
          edits.push({ range: { start: from, end: to }, newText: text.newText });
        }
        if (!mappable) break;
      }
      if (mappable && edits.length > 0) fixes.push({ title: action.description, code: diagnostic.code, line: start.line, character: start.character, edits });
    }
  }
  return fixes;
}
