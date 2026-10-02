import ts from "typescript";

/**
 * `@Bindable()` (Tsazor extension) in `@code` text, read syntactically: the
 * members it decorates (for TZS030, the synthesized `declare` members and
 * free-name resolution) and the explicit Value/ValueChanged pairs the LSP
 * offers to convert.
 */

const PREFIX = "class __tsazor_members {\n";

function parseBody(body: string): { file: ts.SourceFile; cls: ts.ClassDeclaration | undefined } {
  const file = ts.createSourceFile("members.ts", `${PREFIX}${body}\n}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return { file, cls: file.statements.find(ts.isClassDeclaration) };
}

/** The decorator call named `name` (`@name(…)`, also `@ns.name(…)`), if any. */
function decoratorCall(member: ts.ClassElement, name: string): ts.CallExpression | undefined {
  if (!ts.canHaveDecorators(member)) return undefined;
  for (const decorator of ts.getDecorators(member) ?? []) {
    const call = decorator.expression;
    if (!ts.isCallExpression(call)) continue;
    const callee = call.expression;
    const text = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
    if (text === name) return call;
  }
  return undefined;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);
}

function memberName(member: ts.ClassElement): string | undefined {
  return member.name && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) ? member.name.text : undefined;
}

export interface BindableMember {
  name: string;
  /** Offset (in the body text) of the member name. */
  nameOffset: number;
  /** An auto-accessor (`accessor value`) — the only member form `@Bindable()` works on. */
  accessor: boolean;
  /** The type annotation as written. */
  type?: string;
  /** No annotation: the literal initializer's type. */
  inferredType?: "string" | "number" | "boolean" | "bigint";
  /** Name of the change callback parameter. */
  changed: string;
  /** `{ expression: true }`: name of the expression parameter. */
  expression?: string;
}

/** Every member `@Bindable()` decorates in `@code` text (a class body). */
export function bindableMembers(body: string): BindableMember[] {
  if (!body.includes("Bindable")) return [];
  const { file, cls } = parseBody(body);
  if (!cls) return [];
  return bindableMembersOf(cls, file, PREFIX.length);
}

/** The `@Bindable()` members of a class declaration (offsets relative to `base`). */
export function bindableMembersOf(cls: ts.ClassLikeDeclaration, file: ts.SourceFile, base = 0): BindableMember[] {
  const result: BindableMember[] = [];
  for (const member of cls.members) {
    const call = decoratorCall(member, "Bindable");
    const name = memberName(member);
    if (!call || name === undefined || !member.name) continue;
    const options = call.arguments[0];
    let changed = `${name}Changed`;
    let expression: string | undefined;
    if (options && ts.isObjectLiteralExpression(options)) {
      for (const property of options.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
        if (property.name.text === "changed" && ts.isStringLiteralLike(property.initializer)) changed = property.initializer.text;
        if (property.name.text === "expression" && property.initializer.kind === ts.SyntaxKind.TrueKeyword) expression = `${name}Expression`;
      }
    }
    const entry: BindableMember = {
      name,
      nameOffset: member.name.getStart(file) - base,
      accessor: ts.isPropertyDeclaration(member) && hasModifier(member, ts.SyntaxKind.AccessorKeyword),
      changed,
    };
    if (expression !== undefined) entry.expression = expression;
    if (ts.isPropertyDeclaration(member)) {
      if (member.type) entry.type = member.type.getText(file);
      else if (member.initializer) {
        const inferred = literalType(member.initializer);
        if (inferred) entry.inferredType = inferred;
      }
    }
    result.push(entry);
  }
  return result;
}

function literalType(initializer: ts.Expression): BindableMember["inferredType"] {
  let expression = initializer;
  while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
  if (ts.isStringLiteralLike(expression) || ts.isTemplateExpression(expression)) return "string";
  if (ts.isNumericLiteral(expression) || (ts.isPrefixUnaryExpression(expression) && ts.isNumericLiteral(expression.operand))) return "number";
  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) return "boolean";
  if (ts.isBigIntLiteral(expression)) return "bigint";
  return undefined;
}

/** Names `@Bindable()` adds to a class (the change callback, the expression name). */
export function synthesizedNames(member: BindableMember): string[] {
  return member.expression !== undefined ? [member.changed, member.expression] : [member.changed];
}

/* Explicit pairs (LSP refactor "convert to @Bindable") ------------------------ */

export interface BindablePair {
  /** The value parameter's name. */
  name: string;
  /** Offsets (in the body) of the value member: from its first decorator to its end. */
  value: { start: number; end: number };
  /** Offsets of the change callback member, including its line break when it stands on its own line. */
  changed: { start: number; end: number };
  /** The replacement of the value member: `@Bindable() accessor value…`. */
  replacement: string;
}

/**
 * The `@Parameter() x` + `@Parameter() xChanged?: EventCallback<T>` pairs in
 * `@code` text: the explicit form `@Bindable()` desugars to. Only plain
 * fields with exactly the `@Parameter()` decorator (no options) qualify; the
 * value field keeps its modifiers, type and initializer.
 */
export function bindablePairs(body: string): BindablePair[] {
  if (!body.includes("Changed")) return [];
  const { file, cls } = parseBody(body);
  if (!cls) return [];
  const fields = new Map<string, ts.PropertyDeclaration>();
  for (const member of cls.members) {
    if (!ts.isPropertyDeclaration(member) || hasModifier(member, ts.SyntaxKind.StaticKeyword) || hasModifier(member, ts.SyntaxKind.AccessorKeyword)) continue;
    const name = memberName(member);
    const decorators = ts.getDecorators(member) ?? [];
    const call = decoratorCall(member, "Parameter");
    if (name === undefined || decorators.length !== 1 || !call || call.arguments.length > 0) continue;
    fields.set(name, member);
  }
  const pairs: BindablePair[] = [];
  const text = file.text;
  for (const [name, value] of fields) {
    const changed = fields.get(`${name}Changed`);
    if (!changed || !isEventCallbackOf(changed)) continue;
    const decorator = ts.getDecorators(value)![0]!;
    const start = decorator.getStart(file);
    const modifiers = (ts.getModifiers(value) ?? []).map((modifier) => modifier.getText(file));
    // An auto-accessor cannot be optional (`?`) or definite (`!`): `value?: T` becomes `value: T | undefined`.
    let declaration = value.name.getText(file);
    if (value.type) {
      const type = value.type.getText(file);
      declaration += `: ${value.questionToken && !value.initializer && !/\bundefined\b/.test(type) ? `${type} | undefined` : type}`;
    }
    if (value.initializer) declaration += ` = ${value.initializer.getText(file)}`;
    const replacement = ["@Bindable()", ...modifiers, "accessor", `${declaration};`].join(" ");
    let changedStart = ts.getDecorators(changed)![0]!.getStart(file);
    let changedEnd = changed.getEnd();
    // Take the whole line when the member stands on its own line.
    const lineStart = text.lastIndexOf("\n", changedStart - 1) + 1;
    if (text.slice(lineStart, changedStart).trim() === "") {
      const newline = text.indexOf("\n", changedEnd);
      if (newline >= 0 && text.slice(changedEnd, newline).trim() === "") {
        changedStart = lineStart;
        changedEnd = newline + 1;
      }
    }
    pairs.push({
      name,
      value: { start: start - PREFIX.length, end: value.getEnd() - PREFIX.length },
      changed: { start: changedStart - PREFIX.length, end: changedEnd - PREFIX.length },
      replacement,
    });
  }
  return pairs;
}

/** `xChanged?: EventCallback<T>` (or `EventCallback<T> | undefined`, `!:`). */
function isEventCallbackOf(member: ts.PropertyDeclaration): boolean {
  let type = member.type;
  if (type && ts.isUnionTypeNode(type)) {
    const members = type.types.filter((t) => t.kind !== ts.SyntaxKind.UndefinedKeyword && !(ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword));
    type = members.length === 1 ? members[0] : undefined;
  }
  return type !== undefined && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && type.typeName.text === "EventCallback" && (type.typeArguments?.length ?? 0) === 1 && member.initializer === undefined;
}
