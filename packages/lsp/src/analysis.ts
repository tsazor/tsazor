import {
  compile,
  parseDocument,
  DiagnosticBag,
  type DocumentNode,
  type MarkupNode,
  type TzrDiagnostic,
  type DirectiveNode,
  type ElementNode,
  type IfNode,
  type SwitchNode,
  type ForNode,
  type TextTagNode,
} from "@tasor/compiler";
import { collectImports, createFileContext, type FileContext } from "@tasor/workspace";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Analysis of one .tazor file: compiler diagnostics, the AST and the
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
  diagnostics: readonly TzrDiagnostic[];
  /** @inject names declared in the component (expression completions). */
  injects: ReadonlyArray<{ type: string; name: string }>;
}

/** Parses the AST and compiles once, sharing the workspace resolution with the build. */
export async function analyzeSource(filePath: string, source: string, projectRoot: string): Promise<AnalyzedFile> {
  const absolute = path.resolve(filePath);
  const fileDir = path.dirname(absolute);
  const chain = await collectImports(fileDir, projectRoot);
  const context = createFileContext(absolute, chain);

  let diagnostics: readonly TzrDiagnostic[] = [];
  let injects: ReadonlyArray<{ type: string; name: string }> = [];
  let document: DocumentNode;
  try {
    document = parseDocument(source, new DiagnosticBag());
    const compiled = compile(source, {
      className: context.className,
      fileName: absolute,
      resolveComponent: context.resolveComponent,
      resolveType: context.resolveType,
      generateSourceMap: false,
    });
    diagnostics = compiled.diagnostics.all;
    injects = compiled.metadata.injects;
  } catch (error) {
    // The compiler throws for codegen-level failures; surface the message.
    document = { directives: [], body: [], codeBlocks: [] };
    diagnostics = [{
      code: "TZRE000",
      message: error instanceof Error ? error.message : String(error),
      severity: "error",
      pos: { line: 1, column: 0 },
    }];
  }
  return { filePath: absolute, fileDir, className: context.className, source, document, context, diagnostics, injects };
}

/* Node lookup --------------------------------------------------------------- */

/** Deepest AST node whose span contains the LSP position (0-based). */
export function nodeAt(document: DocumentNode, line: number, character: number): MarkupNode | DirectiveNode | null {
  let best: MarkupNode | DirectiveNode | null = null;
  const visit = (node: MarkupNode | DirectiveNode): void => {
    if (!contains(node, line, character)) return;
    best = node;
    if (node.kind === "element" || node.kind === "textTag") {
      for (const child of (node as ElementNode | TextTagNode).children) visit(child);
    } else if (node.kind === "if") {
      for (const branch of (node as IfNode).branches) {
        for (const child of branch.children) visit(child);
      }
    } else if (node.kind === "for") {
      for (const child of (node as ForNode).children) visit(child);
    } else if (node.kind === "switch") {
      for (const caseNode of (node as SwitchNode).cases) {
        for (const child of caseNode.children) visit(child);
      }
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
  using: "`@using` — imports a module for markup and @code resolution.",
  inherits: "`@inherits` — changes the base class of the generated component.",
  typeparam: "`@typeparam` — declares a generic type parameter.",
};

/** Hover for the position, or null. Prefers component tags and directives. */
export function hoverAt(analyzed: AnalyzedFile, line: number, character: number): HoverInfo | null {
  const node = nodeAt(analyzed.document, line, character);
  if (!node) return null;

  if (node.kind === "element" && (node as ElementNode).isComponent) {
    const element = node as ElementNode;
    const resolved = analyzed.context.resolveComponent(element.tagName, analyzed.context.chain.usings);
    const lines = [`**\`<${element.tagName}>\`** — Tasor component`];
    if (resolved) {
      lines.push(
        resolved.exportName
          ? `Source: \`${resolved.specifier}\` (exports \`${resolved.exportName}\`)`
          : `Source: \`${resolved.specifier}\``,
      );
    } else {
      lines.push("_Not resolvable in this workspace (compiles as element, TZR005)._");
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
  for (const extension of [".tazor", ".ts", ""]) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate)) return { file: candidate };
  }
  return null;
}