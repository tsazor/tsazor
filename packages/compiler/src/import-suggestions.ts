/**
 * F29: the `@import` a name in `@code` lacks. Markup finds a component by its tag (enclosing folders,
 * `@using`), but TypeScript code takes a type from an import, as anywhere in TypeScript; a Blazor habit
 * (`private FilesTable? table` for an `@ref`) meets TS2304 there. The typed shadow records, for each
 * name the member code uses that no import binds but the file's resolution finds, the directive that
 * binds it, so tooling can name it in the TS2304 message and insert it as a quick fix.
 */
import * as ts from "typescript";

/** The directive that would bind a name `@code` uses. */
export interface ImportSuggestion {
  /** The unbound name (`FilesTable`). */
  readonly name: string;
  /** The directive line (`@import FilesTable from "../Base/FilesTable.tsazor"`); `@import type` when only types use it. */
  readonly directive: string;
  /** The 0-based source line to insert it before: after the file's last leading directive. */
  readonly insertLine: number;
}

/**
 * The PascalCase names member code uses as a type, or as the root of `new X()`, `X.y`, `X()`,
 * `instanceof X` or a heritage clause: `"value"` when any use needs the value, `"type"` otherwise.
 */
export function namesUsedInMembers(code: string): Map<string, "type" | "value"> {
  const source = ts.createSourceFile("members.tsazor.ts", `class __tsazor_members {\n${code}\n}`, ts.ScriptTarget.Latest, true);
  const names = new Map<string, "type" | "value">();
  const usage = (node: ts.Identifier): "type" | "value" | undefined => {
    const parent = node.parent;
    if (ts.isTypeReferenceNode(parent)) return "type";
    if (ts.isQualifiedName(parent)) return parent.left === node ? "type" : undefined;
    if (ts.isExpressionWithTypeArguments(parent)) return "value";
    if (ts.isPropertyAccessExpression(parent) || ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
      return parent.expression === node ? "value" : undefined;
    }
    return ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword && parent.right === node ? "value" : undefined;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && /^[A-Z]/.test(node.text)) {
      const use = usage(node);
      if (use !== undefined && names.get(node.text) !== "value") names.set(node.text, use);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

/** The `@import` directive text for a resolved name. */
export function importDirective(name: string, resolved: { specifier: string; exportName?: string }, use: "type" | "value"): string {
  const keyword = use === "type" ? "@import type" : "@import";
  if (resolved.exportName === undefined) return `${keyword} ${name} from "${resolved.specifier}"`;
  const binding = resolved.exportName === name ? name : `${resolved.exportName} as ${name}`;
  return `${keyword} { ${binding} } from "${resolved.specifier}"`;
}

/** The name TS2304 ("Cannot find name 'X'.") reports, if the message is one. */
export function unresolvedName(message: string): string | undefined {
  return /^Cannot find name '([^']+)'/.exec(message)?.[1];
}
