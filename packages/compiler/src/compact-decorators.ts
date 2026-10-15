/**
 * Compact field decorators: `@Parameter() title = ""` without the decorator lowering. No engine runs standard
 * decorators yet, so esbuild lowers them, and that costs a few hundred bytes per class and per field (the decorator
 * arrays, `__runInitializers` around each initializer, `__decorateElement` per field, the metadata calls). Tsazor's own
 * field decorators only record the field in the class's decorator metadata, so they can as well run right after the
 * class: the class keeps plain fields, and one `decorateFields(Class, { title: [Parameter()] })` call follows it
 * (`@tsazor/runtime`, the ABI). The metadata is the same; a class with no decorator left needs none of esbuild's helpers.
 *
 * Only what is certain is compacted: a named class at the top level whose every decorator is a call of one of the
 * runtime's registering field decorators (imported from `@tsazor/runtime`) on a public instance field. A class with
 * any other decorator — a class decorator, `@Bindable()` on an accessor, a decorator of the app's own — stays as it
 * is. Every edit keeps the positions: a decorator becomes spaces, the call goes after the class's closing brace on
 * the same line, the import at the end of the module (imports are hoisted). A source map of the input stays right.
 */
import ts from "typescript";

/** The runtime's field decorators that only record the field (no initializer, no `addInitializer`). */
const REGISTERING_DECORATORS: ReadonlySet<string> = new Set([
  "Parameter",
  "CascadingParameter",
  "SupplyParameterFromQuery",
  "Required",
  "MinLength",
  "MaxLength",
  "StringLength",
  "Range",
  "EmailAddress",
  "RegularExpression",
  "Compare",
]);

const RUNTIME = "@tsazor/runtime";
const HELPER = "__tsazor_decorateFields";

/** The module with its compactable classes' field decorators applied by `decorateFields` (unchanged if none). */
export function compactFieldDecorators(code: string, fileName = "module.ts"): string {
  if (!code.includes(RUNTIME) || !/@[A-Za-z_$][\w$]*\s*\(/.test(code)) return code;
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const registering = registeringImports(source);
  if (registering.size === 0) return code;

  const blanks: { start: number; end: number }[] = [];
  const calls: { at: number; text: string }[] = [];
  for (const statement of source.statements) {
    if (!ts.isClassDeclaration(statement) || statement.name === undefined) continue;
    const fields = compactableFields(statement, registering, source);
    if (fields === undefined || fields.length === 0) continue;
    for (const field of fields) for (const decorator of field.decorators) blanks.push({ start: decorator.node.getStart(source), end: decorator.node.end });
    const entries = fields.map((field) => `${field.name}: [${field.decorators.map((decorator) => decorator.call).join(", ")}]`);
    calls.push({ at: statement.end, text: ` ${HELPER}(${statement.name.text}, { ${entries.join(", ")} });` });
  }
  if (calls.length === 0) return code;

  const edits = [...blanks.map((blank) => ({ at: blank.start, end: blank.end, text: code.slice(blank.start, blank.end).replace(/[^\n]/g, " ") })), ...calls.map((call) => ({ at: call.at, end: call.at, text: call.text }))].sort((a, b) => a.at - b.at);
  let out = "";
  let last = 0;
  for (const edit of edits) {
    out += code.slice(last, edit.at) + edit.text;
    last = edit.end;
  }
  out += code.slice(last);
  return `${out}${out.endsWith("\n") ? "" : "\n"}import { decorateFields as ${HELPER} } from "${RUNTIME}";\n`;
}

/** The local names of the registering decorators the module imports from the runtime. */
function registeringImports(source: ts.SourceFile): Set<string> {
  const locals = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== RUNTIME) continue;
    const clause = statement.importClause;
    if (clause === undefined || clause.isTypeOnly || clause.namedBindings === undefined || !ts.isNamedImports(clause.namedBindings)) continue;
    for (const element of clause.namedBindings.elements) {
      if (element.isTypeOnly) continue;
      if (REGISTERING_DECORATORS.has((element.propertyName ?? element.name).text)) locals.add(element.name.text);
    }
  }
  return locals;
}

interface CompactField {
  readonly name: string;
  /** Each decorator and its call on one line, as the field lists them. */
  readonly decorators: readonly { readonly node: ts.Decorator; readonly call: string }[];
}

/** The class's decorated fields, if every decorator in the class can be compacted; undefined if one can't. */
function compactableFields(cls: ts.ClassDeclaration, registering: ReadonlySet<string>, source: ts.SourceFile): CompactField[] | undefined {
  if ((ts.getDecorators(cls) ?? []).length > 0 || (ts.getModifiers(cls) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword)) return undefined;
  const fields: CompactField[] = [];
  for (const member of cls.members) {
    const decorators = ts.canHaveDecorators(member) ? (ts.getDecorators(member) ?? []) : [];
    if (decorators.length === 0) continue;
    if (!ts.isPropertyDeclaration(member) || !ts.isIdentifier(member.name) || member.name.text === "__proto__") return undefined;
    const modifiers = ts.getModifiers(member) ?? [];
    if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword || modifier.kind === ts.SyntaxKind.AccessorKeyword || modifier.kind === ts.SyntaxKind.AbstractKeyword || modifier.kind === ts.SyntaxKind.DeclareKeyword)) return undefined;
    const calls: { node: ts.Decorator; call: string }[] = [];
    for (const decorator of decorators) {
      const call = decorator.expression;
      if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || !registering.has(call.expression.text)) return undefined;
      const text = oneLine(call, source);
      if (text === undefined) return undefined;
      calls.push({ node: decorator, call: text });
    }
    fields.push({ name: member.name.text, decorators: calls });
  }
  return fields;
}

/** The expression's text on one line; undefined if joining its lines could change it (a comment, a template). */
function oneLine(expression: ts.Expression, source: ts.SourceFile): string | undefined {
  const text = expression.getText(source);
  if (!text.includes("\n")) return text;
  if (/\/\/|\/\*|`/.test(text)) return undefined;
  return text.replace(/\s*\n\s*/g, " ");
}
