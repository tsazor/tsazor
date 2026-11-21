import {
  advancePos,
  bindableMembers,
  bindablePairs,
  CHECK_CODES,
  childNodes,
  compile,
  maskedCode,
  type CodeBlockNode,
  parseDocument,
  DiagnosticBag,
  type DocumentNode,
  type MarkupNode,
  type TszDiagnostic,
  type SourceRange,
  type DirectiveNode,
  type ElementNode,
  type ImportInfo,
} from "@tsazor/compiler";
import { collectImports, createFileContext, resolutionOptions, type FileContext } from "@tsazor/workspace";
import { chainAt, contextNameOf, enclosingElementOf, slotParameterOf } from "./slots.js";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Analysis of one .tsazor file: compiler diagnostics, the AST and the
 * workspace resolution context — the pure core the server delegates to
 * (unit-testable without VS Code).
 */

export interface AnalyzedFile {
  filePath: string;
  fileDir: string;
  className: string;
  /** The raw source the document was parsed from (completion classification). */
  source: string;
  document: DocumentNode;
  context: FileContext;
  diagnostics: readonly TszDiagnostic[];
  /** @inject names declared in the component (expression completions). */
  injects: ReadonlyArray<{ type: string; name: string }>;
  /** Local names bound by the file's own and inherited @imports (expression completions). */
  imports: ReadonlyArray<{ name: string; specifier: string }>;
  /** The file's own @using values and parsed @imports (tag metadata lookup). */
  usings: readonly string[];
  ownImports: readonly ImportInfo[];
}

/** Parses the AST and compiles once, sharing the workspace resolution with the build. */
export async function analyzeSource(filePath: string, source: string, projectRoot: string): Promise<AnalyzedFile> {
  const absolute = path.resolve(filePath);
  const fileDir = path.dirname(absolute);
  const chain = await collectImports(fileDir, projectRoot);
  const context = createFileContext(absolute, chain);

  let diagnostics: readonly TszDiagnostic[] = [];
  let injects: ReadonlyArray<{ type: string; name: string }> = [];
  let imports: Array<{ name: string; specifier: string }> = [];
  let usings: string[] = [];
  let ownImports: ImportInfo[] = [];
  let document: DocumentNode;
  try {
    document = parseDocument(source, new DiagnosticBag());
    const compiled = compile(source, { ...resolutionOptions(context), generateSourceMap: false });
    diagnostics = compiled.diagnostics.all;
    injects = compiled.metadata.injects;
    usings = compiled.metadata.usings;
    ownImports = compiled.metadata.imports;
    // Own @imports shadow inherited ones (the compiler's merge rule).
    const seen = new Set<string>();
    for (const info of [...compiled.metadata.imports, ...context.inheritedImports]) {
      for (const binding of info.bindings) {
        if (seen.has(binding.local)) continue;
        seen.add(binding.local);
        imports.push({ name: binding.local, specifier: info.specifier });
      }
    }
  } catch (error) {
    // The compiler throws for codegen-level failures; surface the message.
    document = { directives: [], body: [], codeBlocks: [] };
    diagnostics = [{
      code: CHECK_CODES.compilerFailure,
      message: error instanceof Error ? error.message : String(error),
      severity: "error",
      pos: { line: 1, column: 0 },
      endPos: { line: 1, column: 0 },
    }];
  }
  return { filePath: absolute, fileDir, className: context.className, source, document, context, diagnostics, injects, imports, usings, ownImports };
}

/* Diagnostics → LSP ----------------------------------------------------------- */

export interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

/**
 * The LSP range (0-based lines) of a compiler range — the construct the
 * diagnostic covers. An empty range widens to one character so editors
 * still underline it.
 */
export function lspRange(range: SourceRange): LspRange {
  const start = { line: range.pos.line - 1, character: range.pos.column };
  const end = { line: range.endPos.line - 1, character: range.endPos.column };
  if (end.line < start.line || (end.line === start.line && end.character <= start.character)) {
    return { start, end: { line: start.line, character: start.character + 1 } };
  }
  return { start, end };
}

export interface QuickFix {
  title: string;
  diagnostic: TszDiagnostic;
  edits: Array<{ range: LspRange; newText: string }>;
}

/** The mechanical fixes (TZS021, TZS022) of the diagnostics touching the LSP range. */
export function quickFixesAt(file: AnalyzedFile, range: LspRange): QuickFix[] {
  const before = (a: { line: number; character: number }, b: { line: number; character: number }): boolean =>
    a.line < b.line || (a.line === b.line && a.character < b.character);
  const fixes: QuickFix[] = [];
  for (const diagnostic of file.diagnostics) {
    if (!diagnostic.fix) continue;
    const at = lspRange(diagnostic);
    if (before(at.end, range.start) || before(range.end, at.start)) continue;
    fixes.push({
      title: diagnostic.fix.title,
      diagnostic,
      // Edits keep their exact (possibly empty) ranges.
      edits: diagnostic.fix.edits.map((edit) => ({
        range: {
          start: { line: edit.pos.line - 1, character: edit.pos.column },
          end: { line: edit.endPos.line - 1, character: edit.endPos.column },
        },
        newText: edit.text,
      })),
    });
  }
  return fixes;
}

/* @Bindable (Tsazor extension) ----------------------------------------------- */

export interface Refactor {
  title: string;
  edits: Array<{ range: LspRange; newText: string }>;
}

/** The `@code` blocks of the file (class members) with their source start. */
function memberBlocks(file: AnalyzedFile): Array<{ code: string; start: { line: number; column: number } }> {
  return file.document.body
    .filter((node): node is CodeBlockNode => node.kind === "codeBlock" && node.member === true && node.codeStart !== undefined)
    .map((node) => ({ code: maskedCode(node), start: node.codeStart! }));
}

/** LSP position (0-based line) of an offset inside a code block. */
function blockPosition(block: { code: string; start: { line: number; column: number } }, offset: number): { line: number; character: number } {
  const pos = advancePos(block.start, block.code.slice(0, offset));
  return { line: pos.line - 1, character: pos.column };
}

function touches(range: LspRange, start: { line: number; character: number }, end: { line: number; character: number }): boolean {
  const before = (a: { line: number; character: number }, b: { line: number; character: number }): boolean =>
    a.line < b.line || (a.line === b.line && a.character < b.character);
  return !before(end, range.start) && !before(range.end, start);
}

/**
 * Refactor "convert Value/ValueChanged pair to @Bindable": for an explicit
 * pair `@Parameter() x` + `@Parameter() xChanged?: EventCallback<T>` that the
 * range touches, rewrites `x` as `@Bindable() accessor x` and removes
 * `xChanged` (`@Bindable()` synthesizes it, typed). Code that invokes the
 * callback explicitly keeps working.
 */
export function bindableRefactorsAt(file: AnalyzedFile, range: LspRange): Refactor[] {
  const refactors: Refactor[] = [];
  for (const block of memberBlocks(file)) {
    for (const pair of bindablePairs(block.code)) {
      const valueStart = blockPosition(block, pair.value.start);
      const valueEnd = blockPosition(block, pair.value.end);
      const changedStart = blockPosition(block, pair.changed.start);
      const changedEnd = blockPosition(block, pair.changed.end);
      if (!touches(range, valueStart, valueEnd) && !touches(range, changedStart, changedEnd)) continue;
      refactors.push({
        title: `Convert '${pair.name}'/'${pair.name}Changed' to @Bindable()`,
        edits: [
          { range: { start: valueStart, end: valueEnd }, newText: pair.replacement },
          { range: { start: changedStart, end: changedEnd }, newText: "" },
        ],
      });
    }
  }
  return refactors;
}

/** Hover on a `@Bindable()` member: the Blazor pair it stands for. */
export function bindableHoverAt(file: AnalyzedFile, line: number, character: number): HoverInfo | null {
  for (const block of memberBlocks(file)) {
    for (const member of bindableMembers(block.code)) {
      const start = blockPosition(block, member.nameOffset);
      const end = blockPosition(block, member.nameOffset + member.name.length);
      if (!touches({ start: { line, character }, end: { line, character } }, start, end)) continue;
      const type = member.type ?? member.inferredType ?? "unknown";
      const lines = [
        `**\`@Bindable()\`** — two-way parameter (Tsazor extension). \`@bind-${member.name}\` binds it; it stands for:`,
        "```ts",
        `@Parameter() ${member.name}: ${type};`,
        `@Parameter() ${member.changed}?: EventCallback<${type}>;`,
        ...(member.expression !== undefined ? [`@Parameter() ${member.expression}?: string;`] : []),
        "```",
        `Assigning \`this.${member.name}\` sets the value and invokes \`${member.changed}\` (not for an equal value); parameter values from the parent never invoke it.`,
      ];
      if (!member.accessor) lines.push("", "_Needs `accessor` (TZS030)._");
      return { markdown: lines.join("\n") };
    }
  }
  return null;
}

/* Node lookup --------------------------------------------------------------- */

/** Deepest AST node whose span contains the LSP position (0-based). */
export function nodeAt(document: DocumentNode, line: number, character: number): MarkupNode | DirectiveNode | null {
  let best: MarkupNode | DirectiveNode | null = null;
  const visit = (node: MarkupNode | DirectiveNode): void => {
    if (!contains(node, line, character)) return;
    best = node;
    if (node.kind !== "directive") {
      for (const child of childNodes(node)) visit(child);
    }
  };
  for (const node of document.body) visit(node);
  for (const directive of document.directives) {
    if (contains(directive, line, character)) return directive;
  }
  return best;
}

function contains(node: { pos: { line: number; column: number }; endPos: { line: number; column: number } }, line: number, character: number): boolean {
  const startLine = node.pos.line - 1; // compiler lines are 1-based
  const endLine = node.endPos.line - 1;
  if (line < startLine || line > endLine) return false;
  if (line === startLine && character < node.pos.column) return false;
  if (line === endLine && character >= node.endPos.column) return false;
  return true;
}

/* Hover --------------------------------------------------------------------- */

export interface HoverInfo {
  markdown: string;
}

const DIRECTIVE_DOCS: Record<string, string> = {
  page: "`@page` — declares the route template of this component (generates `routeTemplate`).",
  layout: "`@layout` — layout component wrapping this page.",
  inject: "`@inject` — resolves a DI service and binds it to a field.",
  using: "`@using` — makes a component folder or package visible for tag and @inject resolution.",
  import: "`@import` — a TypeScript import for markup and @code (inherited from _Imports.tsazor).",
  inherits: "`@inherits` — changes the base class of the generated component.",
  typeparam: "`@typeparam` — declares a generic type parameter.",
};

/** F2: hover and completion text of `@attach`. */
export const ATTACH_DOC =
  "`@attach` — runs a function (`Attachment<E>`) with the element once it is in the DOM, after the render like `onAfterRender`. A returned function is the cleanup: called when the element is removed, the component is disposed or the value changes (a new function identity re-attaches — keep factories in a field or memoize them).";

/** F4/F5: hover and completion texts of the motion directives. */
export const MOTION_DOCS: Readonly<Record<"transition" | "in" | "out" | "animate", string>> = {
  transition:
    "`@transition` — plays a transition (`Transition<E>`, e.g. `fade` from `@tsazor/runtime/transition`) when the element enters and when it leaves; a leaving element stays in the DOM until its outro ends. Reversible: removed during its intro, it plays back from where it is. Local: only when this component's render adds or removes the element — `@transition:global` also when the component itself appears or disappears.",
  in: "`@in` — plays a transition (`Transition<E>`) when the element enters the DOM (not on the component's first render; `@in:global` also then). Parameters by a call: `@in=\"fly({ y: 200 })\"`.",
  out: "`@out` — plays a transition (`Transition<E>`) when the element leaves the DOM; the element stays until the outro ends. Local by default; `@out:global` also when the component itself is removed.",
  animate:
    "`@animate` — animates a keyed loop row (`Animate<E>`, e.g. `flip` from `@tsazor/runtime/animate`) when the list changes and the row moves. Only on an element directly inside `@foreach` that has `@key`.",
};

/**
 * F2: hover on the name of an `@attach` / `@attach:name` attribute (its
 * value is TypeScript and gets the TS layer's hover), or null. F4/F5: the
 * same for `@transition`, `@in`, `@out` (with `:global`) and `@animate`.
 */
export function directiveAttributeHoverAt(analyzed: AnalyzedFile, line: number, character: number): HoverInfo | null {
  const node = nodeAt(analyzed.document, line, character);
  if (node === null || node.kind !== "element") return null;
  for (const attr of (node as ElementNode).attributes) {
    if ((attr.kind === "motion" || attr.kind === "motionGlobal") && attr.pos.line - 1 === line) {
      const label = attr.kind === "motion" ? `@${attr.directive}` : `@${attr.directive}:global`;
      if (character < attr.pos.column || character >= attr.pos.column + label.length) continue;
      const global = attr.kind === "motionGlobal" ? "\n\n`:global` — the transition also plays when the component itself appears or disappears (except on the app's first render)." : "";
      return { markdown: `${MOTION_DOCS[attr.directive]}${global}` };
    }
    if (attr.kind !== "attach" || attr.pos.line - 1 !== line) continue;
    const label = attr.attachName === "" ? "@attach" : `@attach:${attr.attachName}`;
    if (character < attr.pos.column || character >= attr.pos.column + label.length) continue;
    const named = attr.attachName === "" ? "" : `\n\n\`${label}\` is one of several attachments of this element, told apart by its name.`;
    return { markdown: `${ATTACH_DOC}${named}` };
  }
  return null;
}

/** Hover for the position, or null. Prefers component tags and directives. */
export function hoverAt(analyzed: AnalyzedFile, line: number, character: number): HoverInfo | null {
  const node = nodeAt(analyzed.document, line, character);
  if (!node) return null;
  const attach = directiveAttributeHoverAt(analyzed, line, character);
  if (attach !== null) return attach;

  if (node.kind === "element" && (node as ElementNode).isComponent) {
    const element = node as ElementNode;
    // A slot tag names a fragment parameter of the enclosing component — its
    // hover speaks of the slot, not of a component of the same name (2.5).
    const chain = chainAt(analyzed, line, character);
    const slot = slotParameterOf(analyzed, chain, element);
    const parent = enclosingElementOf(chain, element);
    if (parent !== null && slot !== null) {
      const slotLines = [`**\`<${element.tagName}>\`** — named slot of \`<${parent.tagName}>\``, `Parameter: \`${slot.name}\` · ${slot.category}`];
      if (slot.category === "RenderFragment<T>") {
        slotLines.push(`Context: \`${contextNameOf(element) ?? contextNameOf(parent) ?? "context"}\` · ${slot.typeArgument ?? "unknown"}`);
      }
      return { markdown: slotLines.join("\n") };
    }
    const imported = analyzed.imports.find((entry) => entry.name === element.tagName);
    const resolved = imported ? null : analyzed.context.resolveComponent(element.tagName, analyzed.context.chain.usings);
    const lines = [`**\`<${element.tagName}>\`** — Tsazor component`];
    if (imported) {
      lines.push(`Source: \`${imported.specifier}\` (@import)`);
    } else if (resolved?.ambiguous) {
      lines.push(`_Ambiguous (TZS017): ${resolved.ambiguous.map((source) => `\`${source}\``).join(", ")}._`);
    } else if (resolved) {
      lines.push(
        resolved.exportName
          ? `Source: \`${resolved.specifier}\` (exports \`${resolved.exportName}\`)`
          : `Source: \`${resolved.specifier}\``,
      );
    } else {
      lines.push("_Not resolvable in this workspace (compiles as element, TZS005)._");
    }
    return { markdown: lines.join("\n") };
  }

  if (node.kind === "directive") {
    const directive = node as DirectiveNode;
    const doc = DIRECTIVE_DOCS[directive.name];
    if (!doc) return null;
    const lines = [doc];
    if (directive.name === "inject") {
      const resolved = analyzed.context.resolveType(injectTypeName(directive.value), analyzed.context.chain.usings);
      if (resolved) {
        lines.push(
          resolved.exportName
            ? `Type: \`${resolved.exportName}\` from \`${resolved.specifier}\``
            : `Type: \`${resolved.specifier}\``,
        );
      }
    }
    if (directive.value) {
      lines.push("```razor\n" + `@${directive.name} ${directive.value}` + "\n```");
    }
    return { markdown: lines.join("\n") };
  }
  return null;
}

/** First token of an @inject value (the service type name). */
export function injectTypeName(value: string): string {
  return value.trim().split(/\s+/)[0] ?? "";
}

/* Definition ---------------------------------------------------------------- */

export interface DefinitionTarget {
  /** Absolute path of the defining file. */
  file: string;
}

/** Go-to-definition for the position, or null. */
export function definitionAt(analyzed: AnalyzedFile, line: number, character: number): DefinitionTarget | null {
  const node = nodeAt(analyzed.document, line, character);
  if (!node) return null;

  if (node.kind === "element" && (node as ElementNode).isComponent) {
    const imported = analyzed.imports.find((entry) => entry.name === (node as ElementNode).tagName);
    if (imported) return toFile(analyzed.fileDir, imported.specifier);
    const resolved = analyzed.context.resolveComponent((node as ElementNode).tagName, analyzed.context.chain.usings);
    if (!resolved || resolved.exportName) return null; // built-ins live in the runtime package
    return toFile(analyzed.fileDir, resolved.specifier);
  }

  if (node.kind === "directive" && (node as DirectiveNode).name === "inject") {
    const resolved = analyzed.context.resolveType(injectTypeName((node as DirectiveNode).value), analyzed.context.chain.usings);
    if (!resolved || resolved.exportName) return null;
    return toFile(analyzed.fileDir, resolved.specifier);
  }
  return null;
}

function toFile(fileDir: string, specifier: string): DefinitionTarget | null {
  const value = specifier.replace(/^['"]|['"]$/g, "");
  if (!value.startsWith(".") && !path.isAbsolute(value)) return null;
  const base = path.isAbsolute(value) ? value : path.resolve(fileDir, value);
  for (const extension of [".tsazor", ".ts", ""]) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate)) return { file: candidate };
  }
  return null;
}