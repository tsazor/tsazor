/**
 * Completion for .tsazor files: classifies the cursor position from the raw
 * source (the AST has no per-attribute-name/value spans) and returns
 * candidates for four contexts:
 *
 *   <Gr                    → component tags (@using dirs, package exports, runtime built-ins)
 *   <Greeter …             → the resolved component's @Parameter() attributes,
 *                            plus directive attributes (@bind, @onclick, …)
 *   @                      → directives (top level) or expression members
 *   Count: @co             → members of @code state, the code-behind class, @inject fields
 *                            and @import names (own + inherited from _Imports.tsazor)
 *
 * Positions: LSP (0-based line/character) in, completions out. The compiler's
 * AST spans are 1-based/0-based-columns — nodeAt already handles the shift.
 */
import { parseDocument, DiagnosticBag, type CodeBlockNode, type ElementNode, type ExpressionNode } from "@tsazor/compiler";
import {
  RUNTIME_COMPONENT_PARAMS,
  RUNTIME_PACKAGE,
  RUNTIME_COMPONENTS,
  candidateDirs,
  isPathLikeUsing,
  packageExports,
} from "@tsazor/workspace";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AnalyzedFile } from "./analysis.js";
import { nodeAt } from "./analysis.js";

export type CompletionKind = "component" | "attribute" | "directive" | "member";

export interface CompletionCandidate {
  label: string;
  kind: CompletionKind;
  detail?: string;
  doc?: string;
  /** Snippet body for structured inserts (e.g. `@code { … }`); plain insert otherwise. */
  snippet?: string;
}

export function completeAt(analyzed: AnalyzedFile, line: number, character: number): CompletionCandidate[] {
  if (line < 0) return [];
  const { source } = analyzed;
  const cursor = offsetAt(source, line, character);
  const node = nodeAt(analyzed.document, line, character);
  const typed = source.slice(offsetOfLineStart(source, cursor), cursor);

  if (node?.kind === "codeBlock" || node?.kind === "statement") return [];
  if (node?.kind === "expression") {
    const expression = node as ExpressionNode;
    const start = offsetAt(source, expression.pos.line - 1, expression.pos.column);
    const prefix = source.slice(start, cursor).replace(/^@/, "");
    if (directiveShapedLine(typed)) {
      // Line so far is only "@word": could be a directive or an expression —
      // offer both (VS Code filters by the remaining prefix either way).
      return [...directiveCandidates(prefix), ...memberCandidates(analyzed, prefix)];
    }
    return memberCandidates(analyzed, prefix);
  }

  if (node?.kind === "directive") {
    return directiveCandidates(typed.match(/@([\w]*)$/)?.[1] ?? "");
  }

  if (node?.kind === "element") {
    const element = node as ElementNode;
    const region = classifyTagRegion(analyzed, element, cursor);
    if (region.state === "past") return plainFallback(analyzed, typed); // cursor in the element's content
    if (region.state === "value") return [];
    if (region.state === "tagName") {
      if (/^[A-Za-z]/.test(region.prefix) || region.prefix === "") return componentCandidates(analyzed, region.prefix);
      return [];
    }
    return attributeCandidates(analyzed, element, region.prefix);
  }

  return plainFallback(analyzed, typed);
}

/** Text-level fallback: a freshly typed `<tag` or `@…` outside any AST span. */
function plainFallback(analyzed: AnalyzedFile, typed: string): CompletionCandidate[] {
  const tagTyped = typed.match(/<(?:([A-Za-z][\w.\-]*))?$/);
  if (tagTyped !== null) return componentCandidates(analyzed, tagTyped[1] ?? "");
  const expressionTyped = typed.match(/@([\w$]*)$/);
  if (expressionTyped !== null) {
    const word = expressionTyped[1] ?? "";
    if (directiveShapedLine(typed)) {
      // "@word" as line-so-far at top level is directive-shaped; mid-line it's
      // an expression (Blazor: "@page" only at file level). Directive-shaped
      // lines can be both — offer both, VS Code filters by the prefix.
      return [...directiveCandidates(word), ...memberCandidates(analyzed, word)];
    }
    return memberCandidates(analyzed, word);
  }
  return [];
}

/* Element contexts ------------------------------------------------------------ */

type TagRegion = { state: "tagName" | "attrName" | "value" | "past"; prefix: string };

/**
 * Classifies the cursor position within an element's opening tag by scanning
 * the raw slice (AST attributes carry no name/value spans).
 */
function classifyTagRegion(analyzed: AnalyzedFile, element: ElementNode, cursor: number): TagRegion {
  const start = offsetAt(analyzed.source, element.pos.line - 1, element.pos.column);
  const slice = analyzed.source.slice(start, cursor);
  return classifySlice(slice);
}

/** Pure helper over the `<tag ...` slice up to (excluding) the cursor. */
export function classifySlice(slice: string): TagRegion {
  // 1. Tag name: the run after '<' ends at whitespace or the opening tag's '>'.
  let i = 1; // skip '<'
  while (i < slice.length && !/[\s>]/.test(slice[i]!)) i++;
  if (i >= slice.length) {
    return { state: "tagName", prefix: slice.slice(1) };
  }
  if (slice[i] === ">") return { state: "past", prefix: "" };

  // 2. Attribute region: one scan tracking quote state and the first
  // unquoted '>' (inside a quote it belongs to the value, not the tag end).
  const rest = slice.slice(i);
  let quote: string | null = null;
  for (const c of rest) {
    if (quote !== null) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      return { state: "past", prefix: "" };
    }
  }
  if (quote !== null) return { state: "value", prefix: "" }; // cursor inside a quoted value

  // 3. Trailing token: value in progress vs. attribute name in progress.
  if (/\s$/.test(rest) || rest.trim() === "") return { state: "attrName", prefix: "" };
  const token = rest.match(/([^\s]*)$/)?.[1] ?? "";
  if (/["']$/.test(token)) return { state: "value", prefix: "" }; // just after a closing quote
  if (token.includes("=")) return { state: "value", prefix: "" }; // unquoted value being typed
  return { state: "attrName", prefix: token };
}

/* Attribute candidates -------------------------------------------------------- */

const DIRECTIVE_ATTRS: ReadonlyArray<{ label: string; doc: string }> = [
  { label: "@bind", doc: "Two-way value binding (input.value ↔ member)." },
  { label: "@onclick", doc: "Click event handler." },
  { label: "@onchange", doc: "Change event handler." },
  { label: "@oninput", doc: "Input event handler." },
  { label: "@ref", doc: "Capture the element's DOM reference." },
  { label: "@key", doc: "Diff key for stable element identity." },
  { label: "@attributes", doc: "Attribute splat." },
];

const ELEMENT_ATTRS: ReadonlyArray<{ label: string; doc?: string }> = [
  { label: "class", doc: "CSS classes." },
  { label: "style", doc: "Inline styles." },
  { label: "id", doc: "Element id." },
  { label: "href", doc: "Link target." },
  { label: "type", doc: "Input/select/button type." },
  { label: "value", doc: "Value attribute." },
  { label: "data-testid", doc: "Test hook attribute." },
];

function attributeCandidates(analyzed: AnalyzedFile, element: ElementNode, prefix: string): CompletionCandidate[] {
  const items: CompletionCandidate[] = [];
  const push = (candidate: CompletionCandidate): void => {
    if (!items.some((i) => i.label === candidate.label)) items.push(candidate);
  };

  if (element.isComponent) {
    for (const param of parametersOfComponent(analyzed, element.tagName)) {
      push({ label: param.name, kind: "attribute", detail: element.tagName, doc: param.doc });
      push({
        label: `@bind-${param.name}`,
        kind: "attribute",
        detail: "two-way binding",
        doc: `Value + ${param.name}Changed pair (like Blazor's @bind-Value).`,
      });
    }
  }
  for (const attr of DIRECTIVE_ATTRS) push({ label: attr.label, kind: "attribute", detail: "directive attribute", doc: attr.doc });
  if (!element.isComponent) {
    for (const attr of ELEMENT_ATTRS) push({ label: attr.label, kind: "attribute", detail: "HTML attribute", doc: attr.doc });
  }

  const needle = prefix.toLowerCase();
  return items.filter((item) => item.label.toLowerCase().startsWith(needle));
}

/** Parameters of the component the tag resolves to (built-in table or .tsazor scan). */
function parametersOfComponent(
  analyzed: AnalyzedFile,
  tagName: string,
): ReadonlyArray<{ name: string; doc?: string }> {
  const file = analyzed.context.componentFile(tagName);
  const params = file ? parameterNamesOfTsazorFile(file) : [];
  if (params.length > 0) return params;
  return RUNTIME_COMPONENT_PARAMS[tagName] ?? [];
}

/** Regex extraction of @Parameter() names from a component's @code (v1 heuristic). */
export function parameterNamesOfTsazorFile(file: string): ReadonlyArray<{ name: string; doc?: string }> {
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const parsed = parseDocument(source, new DiagnosticBag());
  const text = parsed.body
    .filter((n): n is CodeBlockNode => n.kind === "codeBlock" && n.member === true)
    .map((n) => n.code)
    .join("\n");
  const names = new Map<string, { name: string; doc?: string }>();
  for (const match of text.matchAll(/@(?:Cascading)?Parameter\s*\([^)]*\)\s*([\w$]+)/g)) {
    if (!names.has(match[1]!)) names.set(match[1]!, { name: match[1]! });
  }
  return [...names.values()];
}

/* Component tag candidates ----------------------------------------------------- */

const PASCAL_TAG = /^[A-Z][A-Za-z0-9]*$/;

function componentCandidates(analyzed: AnalyzedFile, prefix: string): CompletionCandidate[] {
  const items: CompletionCandidate[] = [];
  const seen = new Set<string>([analyzed.className]); // no self-completion
  for (const dir of candidateDirs(analyzed.fileDir, analyzed.context.chain)) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue; // directory may not exist for bare or root usings
    }
    for (const entry of entries) {
      if (!entry.endsWith(".tsazor")) continue;
      const tag = entry.slice(0, -".tsazor".length);
      if (tag === "_Imports" || !PASCAL_TAG.test(tag) || !seen.add(tag)) continue;
      items.push({ label: tag, kind: "component", detail: path.basename(dir), doc: `<${tag}> — component in ${path.basename(dir)}` });
    }
  }
  // Bare-package @usings: exactly the names the package exports (same list the build resolves against).
  for (const using of analyzed.context.chain.usings) {
    if (isPathLikeUsing(using)) continue;
    const name = using.replace(/^['"]|['"]$/g, "");
    if (name === RUNTIME_PACKAGE) continue;
    for (const [tag, isValue] of packageExports(name, analyzed.fileDir) ?? []) {
      if (!isValue || !PASCAL_TAG.test(tag) || !seen.add(tag)) continue;
      items.push({ label: tag, kind: "component", detail: name, doc: `<${tag}> — exported by ${name}` });
    }
  }
  for (const tag of RUNTIME_COMPONENTS) {
    if (!seen.add(tag)) continue;
    const params = RUNTIME_COMPONENT_PARAMS[tag];
    const names = params && params.length > 0 ? `params: ${params.map((p) => p.name).join(", ")}` : undefined;
    items.push({ label: tag, kind: "component", detail: RUNTIME_PACKAGE, doc: `<${tag}> — ${names ?? "@tsazor/runtime"}` });
  }
  const needle = prefix.toLowerCase();
  return items.filter((item) => item.label.toLowerCase().startsWith(needle)).sort((a, b) => a.label.localeCompare(b.label));
}

/* Directive candidates ---------------------------------------------------------- */

const DIRECTIVES: ReadonlyArray<{ label: string; doc: string; snippet?: string }> = [
  { label: "page", doc: "`@page \"/route\"` — declares the route template.", snippet: 'page "/$0"' },
  { label: "layout", doc: "`@layout MainLayout` — layout component for this page.", snippet: "layout $0" },
  { label: "using", doc: "`@using ./Shared` — imports a module/directory for resolution.", snippet: "using $0" },
  { label: "inject", doc: "`@inject ServiceType Name` — resolves a DI service into a field.", snippet: "inject $0" },
  { label: "inherits", doc: "`@inherits LayoutComponentBase` — base class of the generated component.", snippet: "inherits $0" },
  { label: "typeparam", doc: "`@typeparam T` — generic type parameter.", snippet: "typeparam $0" },
  { label: "authorize", doc: "Bare `@authorize` — route requires authentication." },
  { label: "attribute", doc: "`@attribute [attr]` — appends an attribute to the class declaration." },
  { label: "code", doc: "`@code { … }` — component state and methods.", snippet: "code {\n\t$0\n}" },
  { label: "functions", doc: "Alias of @code.", snippet: "functions {\n\t$0\n}" },
  { label: "if", doc: "Conditional markup block.", snippet: "if ($0) {\n}" },
  { label: "else", doc: "Conditional branch." },
  { label: "for", doc: "`for` loop over markup.", snippet: "for (const $1 of $2) {\n\t$0\n}" },
  { label: "foreach", doc: "`foreach` loop over markup.", snippet: "foreach (const $1 of $2) {\n\t$0\n}" },
  { label: "switch", doc: "`switch` over markup.", snippet: "switch ($0) {\n}" },
];

function directiveCandidates(prefix: string): CompletionCandidate[] {
  const needle = prefix.toLowerCase();
  return DIRECTIVES.filter((d) => d.label.startsWith(needle)).map((d) => ({
    label: d.label,
    kind: "directive" as const,
    detail: "directive",
    doc: d.doc,
    snippet: d.snippet,
  }));
}

/** True when the line so far is just whitespace + "@word" (directives, not an expression). */
export function directiveShapedLine(typed: string): boolean {
  return /^\s*@\w*$/.test(typed);
}

/* Member candidates (expressions) ------------------------------------------------ */

/** Member heuristic line patterns, tried in order (first match wins). */
const MEMBER_PATTERNS: ReadonlyArray<{ pattern: RegExp; detail: string }> = [
  { pattern: /^\s*(?:private\s+|protected\s+|public\s+)?get\s+([A-Za-z_$][\w$]*)/, detail: "getter" },
  { pattern: /^\s*@Parameter\s*\([^)]*\)\s+([A-Za-z_$][\w$]*)/, detail: "parameter" },
  { pattern: /^\s*(?:private\s+|protected\s+|public\s+|static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\(/, detail: "method" },
  { pattern: /^\s*(?:private\s+|protected\s+|public\s+)?(?:readonly\s+)?(?:const\s+|let\s+)?([A-Za-z_$][\w$]*)\s*(?:\?|:(?!=)|(?:=(?![>=])))/, detail: "field" },
];

export function memberNamesOf(source: string, origin: string): CompletionCandidate[] {
  const items = new Map<string, CompletionCandidate>();
  for (const line of source.split(/\r?\n/)) {
    for (const { pattern, detail } of MEMBER_PATTERNS) {
      const match = line.match(pattern);
      if (!match) continue;
      const name = match[1]!;
      if (RESERVED.has(name) || !/^[A-Za-z_$][\w$]*$/.test(name)) break; // matched but filtered (e.g. "if (")
      if (!items.has(name)) items.set(name, { label: name, kind: "member", detail: `${origin} (${detail})` });
      break;
    }
  }
  return [...items.values()];
}

function memberCandidates(analyzed: AnalyzedFile, prefix: string): CompletionCandidate[] {
  const members = new Map<string, CompletionCandidate>();
  const sources: Array<[string, string]> = [
    ...memberCodeSources(analyzed).map((code, i) => [`@code #${i + 1}`, code] as [string, string]),
  ];
  const sidecar = codeBehindSource(analyzed);
  if (sidecar !== null) sources.push(["code-behind", sidecar]);

  for (const [origin, source] of sources) {
    for (const member of memberNamesOf(source, origin)) {
      if (!members.has(member.label)) members.set(member.label, member);
    }
  }
  for (const inject of analyzed.injects) {
    if (!members.has(inject.name)) members.set(inject.name, { label: inject.name, kind: "member", detail: `@inject ${inject.type}` });
  }
  for (const imported of analyzed.imports) {
    if (!members.has(imported.name)) {
      members.set(imported.name, { label: imported.name, kind: "member", detail: `@import from "${imported.specifier}"` });
    }
  }

  const needle = prefix.toLowerCase();
  return [...members.values()].filter((m) => m.label.toLowerCase().startsWith(needle)).sort((a, b) => a.label.localeCompare(b.label));
}

function memberCodeSources(analyzed: AnalyzedFile): string[] {
  return analyzed.document.body
    .filter((n): n is CodeBlockNode => n.kind === "codeBlock" && n.member === true)
    .map((n) => n.code);
}

/** The sibling X.tsazor.ts code-behind source, if present. */
function codeBehindSource(analyzed: AnalyzedFile): string | null {
  try {
    return readFileSync(`${analyzed.filePath}.ts`, "utf8");
  } catch {
    return null;
  }
}

const RESERVED = new Set([
  "return", "if", "else", "for", "foreach", "while", "switch", "case", "default", "break", "continue",
  "const", "let", "var", "function", "class", "new", "typeof", "instanceof", "await", "async", "try",
  "catch", "finally", "throw", "export", "import", "this", "super", "void", "get", "set", "readonly",
  "private", "protected", "public", "static", "abstract", "override", "declare", "true", "false",
  "undefined", "null",
]);

/* Offsets -------------------------------------------------------------------- */

function offsetAt(source: string, line: number, character: number): number {
  const starts = lineStarts(source);
  if (line >= starts.length) return source.length;
  const next = starts[line + 1];
  const lineLength = (next ?? source.length) - starts[line]!;
  return starts[line]! + Math.min(character, lineLength);
}

function offsetOfLineStart(source: string, offset: number): number {
  return source.lastIndexOf("\n", Math.max(offset - 1, 0)) + 1;
}

function lineStarts(source: string): readonly number[] {
  const starts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}