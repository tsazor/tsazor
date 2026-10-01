import ts from "typescript";
import { CodeScanner } from "./code-scanner.js";

/**
 * Member rewriting over the TS AST (roadmap A4). C# lets markup and code
 * contexts reference component members bare; TS needs `this.X`. Every markup
 * expression, attribute value, control header and code-context statement run
 * is parsed with `ts.createSourceFile` (syntax only, no checker) and each
 * identifier *reference* is resolved through a real scope chain:
 *
 *   local (parameters, destructuring, block scopes, catch, loop variables,
 *   function/class/enum declarations) ⇒ unchanged · otherwise the caller
 *   decides (member ⇒ `this.X`, import/global ⇒ unchanged, else `this.X`).
 *
 * Property names, object-literal keys, labels, declarations and every type
 * position are never references. Shorthand properties expand
 * (`{ name }` ⇒ `{ name: this.name }`). Strings, template text, regex and
 * numeric literals are tokens of their own and cannot be touched.
 */

export type SnippetKind =
  /** A single expression (`@x`, `@(x)`, attribute values, conditions). */
  | "expression"
  /** A run of statements in a code context (`@{ }`, control bodies). */
  | "statements"
  /** The header of a `@for (…)`/`@foreach (…)` (C-style, `for…of`, `for…in`),
   *  emitted as written — `var` keeps its TS (function-scoped) meaning. */
  | "forHeader";

export interface NameResolver {
  /** A local of the enclosing render code (loop variables, earlier statement runs, catch parameters). */
  isOuterLocal(name: string): boolean;
  /**
   * The prefix for a name no scope binds (`"this."`), or null to leave it
   * free (import, global). `thisRebound`: the reference sits inside a
   * non-arrow function or class body, where `this` is not the component.
   */
  prefixFor(name: string, thisRebound: boolean): string | null;
}

/** A token of the rewritten text: generated offset → offset in the input code. */
export interface RewriteToken {
  outOffset: number;
  srcOffset: number;
}

export interface MethodGroup {
  /** The rewritten receiver expression (`item` of `item.toggle`). */
  receiver: string;
  /** Whether the receiver can be evaluated twice without side effects. */
  simpleReceiver: boolean;
  /** Offset of the receiver in the rewritten text. */
  receiverOffset: number;
  /** Offsets of the member name in the rewritten text. */
  nameOffset: number;
  nameEnd: number;
}

export interface RewriteResult {
  text: string;
  /** Entries for every word token and every token that starts a line. */
  tokens: RewriteToken[];
  /** forHeader: names the header's own declarations bind for the body. */
  declares: string[];
  /** Offsets (in the input code) of every `var` keyword of a declaration (TZS022). */
  varKeywords: number[];
  /** expression: a member access `recv.name` (a method group with receiver, C18). */
  methodGroup?: MethodGroup;
  /** The TS parser's syntax errors, located in the input code (A7: TZS024/TZS015). */
  syntaxErrors: SnippetSyntaxError[];
}

/** A syntax error of a snippet: `offset`/`length` within the input code (length ≥ 1 unless the code is empty). */
export interface SnippetSyntaxError {
  offset: number;
  length: number;
  message: string;
}

interface Edit {
  pos: number;
  /** Characters of the input replaced at pos (0 = insertion). */
  remove: number;
  insert: string;
}

/** Names the language itself provides; never member references. */
const INTRINSICS = new Set(["undefined", "globalThis", "arguments"]);

class Scope {
  readonly names = new Set<string>();
  constructor(
    readonly parent: Scope | undefined,
    /** Inside a non-arrow function / class member: `this` is not the component. */
    readonly thisRebound: boolean,
  ) {}

  has(name: string): boolean {
    for (let scope: Scope | undefined = this; scope; scope = scope.parent) {
      if (scope.names.has(name)) return true;
    }
    return false;
  }
}

const WRAP: Record<SnippetKind, [string, string]> = {
  expression: ["(", "\n);"],
  statements: ["", ""],
  forHeader: ["for (", "\n) {}"],
};

/** Rewrites the member references of one snippet (see module comment). */
export function rewriteSnippet(code: string, kind: SnippetKind, resolver: NameResolver): RewriteResult {
  const [prefix, suffix] = WRAP[kind];
  const base = prefix.length;
  const file = ts.createSourceFile("snippet.ts", prefix + code + suffix, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits: Edit[] = [];
  const declares: string[] = [];
  const varKeywords: number[] = [];

  const offsetOf = (node: ts.Node): number => node.getStart(file) - base;
  const inCode = (offset: number): boolean => offset >= 0 && offset < code.length;

  const reference = (id: ts.Identifier, scope: Scope): void => {
    const name = id.text;
    if (scope.has(name) || INTRINSICS.has(name) || resolver.isOuterLocal(name)) return;
    const replacement = resolver.prefixFor(name, scope.thisRebound);
    if (replacement === null) return;
    const at = offsetOf(id);
    if (!inCode(at)) return;
    const shorthand = ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id;
    edits.push({ pos: at, remove: 0, insert: shorthand ? `${name}: ${replacement}` : replacement });
  };

  const visit = (node: ts.Node, scope: Scope): void => {
    if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.BlockScoped) === 0) {
      const at = node.getStart(file) - base;
      if (inCode(at) && code.startsWith("var", at)) varKeywords.push(at);
    }
    if (ts.isIdentifier(node)) {
      if (isReference(node)) reference(node, scope);
      return;
    }
    if (ts.isExpressionWithTypeArguments(node)) {
      // `class A extends B<T>` / instantiation `f<T>`: the expression is a value.
      const clause = node.parent;
      if (ts.isHeritageClause(clause) && clause.token === ts.SyntaxKind.ImplementsKeyword) return;
      visit(node.expression, scope);
      return;
    }
    if (isTypeOnly(node)) return;

    if (ts.isSourceFile(node)) {
      // The snippet's top level runs in the enclosing render scope.
      const root = new Scope(scope, scope.thisRebound);
      declareBlock(node.statements, root);
      for (const name of hoistedVars(node)) root.names.add(name);
      node.statements.forEach((statement) => visit(statement, root));
      return;
    }
    if (ts.isBlock(node) || ts.isCaseBlock(node)) {
      const block = new Scope(scope, scope.thisRebound);
      if (ts.isCaseBlock(node)) {
        for (const clause of node.clauses) declareBlock(clause.statements, block);
      } else {
        declareBlock(node.statements, block);
      }
      ts.forEachChild(node, (child) => visit(child, block));
      return;
    }
    if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      const loop = new Scope(scope, scope.thisRebound);
      const init = node.initializer;
      if (init && ts.isVariableDeclarationList(init)) {
        const isVar = (init.flags & ts.NodeFlags.BlockScoped) === 0;
        // The @for header's own declarations: loop variables of the body.
        const own = kind === "forHeader" && node === file.statements[0];
        if (!isVar || own) for (const declaration of init.declarations) addBindingNames(declaration.name, loop.names);
        if (own) for (const declaration of init.declarations) addBindingNames(declaration.name, declares);
      }
      ts.forEachChild(node, (child) => visit(child, loop));
      return;
    }
    if (ts.isCatchClause(node)) {
      const clause = new Scope(scope, scope.thisRebound);
      if (node.variableDeclaration) addBindingNames(node.variableDeclaration.name, clause.names);
      ts.forEachChild(node, (child) => visit(child, clause));
      return;
    }
    if (ts.isFunctionLike(node) && "body" in node) {
      visitFunction(node as ts.SignatureDeclaration & { body?: ts.Node }, scope);
      return;
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const classScope = new Scope(scope, scope.thisRebound);
      if (ts.isClassExpression(node) && node.name) classScope.names.add(node.name.text);
      node.modifiers?.forEach((modifier) => visit(modifier, scope));
      node.heritageClauses?.forEach((clause) => visit(clause, classScope));
      for (const member of node.members) {
        // Computed keys evaluate in the outer `this`; bodies and initializers
        // run with the instance (or class) as `this`.
        if (ts.isFunctionLike(member)) {
          visitFunction(member, classScope);
          continue;
        }
        if (member.name && ts.isComputedPropertyName(member.name)) visit(member.name, classScope);
        const memberScope = new Scope(classScope, true);
        ts.forEachChild(member, (child) => {
          if (child !== member.name) visit(child, memberScope);
        });
      }
      return;
    }
    if (ts.isEnumDeclaration(node)) {
      // Enum members see each other bare.
      const enumScope = new Scope(scope, scope.thisRebound);
      for (const member of node.members) if (ts.isIdentifier(member.name)) enumScope.names.add(member.name.text);
      for (const member of node.members) if (member.initializer) visit(member.initializer, enumScope);
      return;
    }
    ts.forEachChild(node, (child) => visit(child, scope));
  };

  const visitFunction = (node: ts.SignatureDeclaration & { body?: ts.Node }, scope: Scope): void => {
    const arrow = ts.isArrowFunction(node);
    const fn = new Scope(scope, arrow ? scope.thisRebound : true);
    if (!arrow) fn.names.add("arguments");
    if (ts.isFunctionExpression(node) && node.name) fn.names.add(node.name.text);
    for (const parameter of node.parameters) addBindingNames(parameter.name, fn.names);
    if (node.body && ts.isBlock(node.body)) for (const name of hoistedVars(node.body)) fn.names.add(name);
    // A method's name is a property key; decorators and computed keys belong outside.
    ts.forEachChild(node, (child) => {
      if (child === node.name && !ts.isComputedPropertyName(child)) return;
      if (child === node.name || ts.isDecorator(child)) visit(child, scope);
      else visit(child, fn);
    });
  };

  visit(file, new Scope(undefined, false));

  const result = applyEdits(code, edits);
  const rewrite: RewriteResult = {
    text: result.text,
    tokens: wordTokens(code, result.mapOut),
    declares,
    varKeywords,
    syntaxErrors: syntaxErrorsOf(file, base, code.length),
  };
  if (kind === "expression") {
    const group = methodGroupOf(file);
    if (group) {
      const start = group.expression.getStart(file) - base;
      const end = group.expression.end - base;
      // Range starts keep an insertion at the start (`this.item` is the receiver).
      const receiverOffset = result.mapOut(start, false);
      rewrite.methodGroup = {
        receiver: result.text.slice(receiverOffset, result.mapOut(end, false)),
        simpleReceiver: isSimpleReceiver(group.expression),
        receiverOffset,
        nameOffset: result.mapOut(group.name.getStart(file) - base),
        nameEnd: result.mapOut(group.name.end - base, false),
      };
    }
  }
  return rewrite;
}

/**
 * The parse diagnostics of a wrapped snippet, moved into the input code: an
 * error in the wrapper (`')' expected` after the code) lands on the code's
 * last character, an empty one widens to one character.
 */
function syntaxErrorsOf(file: ts.SourceFile, base: number, length: number): SnippetSyntaxError[] {
  const diagnostics = (file as unknown as { parseDiagnostics?: readonly ts.DiagnosticWithLocation[] }).parseDiagnostics ?? [];
  return diagnostics.map((d) => {
    let start = Math.min(Math.max(d.start - base, 0), length);
    let end = Math.min(Math.max(d.start - base + d.length, start), length);
    if (end === start) {
      end = Math.min(start + 1, length);
      start = Math.max(0, end - 1);
    }
    return { offset: start, length: end - start, message: ts.flattenDiagnosticMessageText(d.messageText, " ") };
  });
}

/**
 * The first syntax error of a TypeScript type (a type argument attribute,
 * `TItem="Person"`), located in `text`; null when it parses as one type.
 */
export function typeSyntaxError(text: string): SnippetSyntaxError | null {
  const prefix = "type __tsazor_T = ";
  const file = ts.createSourceFile("type.ts", `${prefix}${text}\n;`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const errors = syntaxErrorsOf(file, prefix.length, text.length);
  if (errors[0]) return errors[0];
  if (file.statements.length !== 1) return { offset: 0, length: Math.max(text.length, 1), message: "Expected a single type." };
  return null;
}

/* Loop headers ---------------------------------------------------------------- */

/**
 * The loop form of a `@for`/`@foreach` header, parsed as TS
 * (`for (<code>) {}`): counting `for`, `for…of` or `for…in`; null when the
 * header is not valid TypeScript.
 */
export function forHeaderKind(code: string): "for" | "forOf" | "forIn" | null {
  const file = ts.createSourceFile("header.ts", `for (${code}\n) {}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const statement = file.statements[0];
  const syntaxErrors = (file as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics ?? [];
  if (file.statements.length !== 1 || !statement || syntaxErrors.length > 0) return null;
  if (ts.isForOfStatement(statement)) return "forOf";
  if (ts.isForInStatement(statement)) return "forIn";
  return ts.isForStatement(statement) ? "for" : null;
}

/* Bind targets --------------------------------------------------------------- */

export type BindTarget =
  /** `field`: the last member name of the path (EditContext field key), if it has one;
   *  `identifier`: the target is this bare name (`x`, `(x)`, `x!`), not a member path. */
  | { ok: true; field?: string; identifier?: string }
  /** `syntax`: the code is not valid TS at all (reported as a syntax error, TZS024). */
  | { ok: false; reason: string; syntax?: boolean };

/**
 * Checks that a `@bind` expression is an assignment target, syntactically —
 * what C# requires of `@bind="x"` (an lvalue) and TS of `x = __value`:
 * identifiers, member and element access (`a.b`, `a[i].name`, `map[key]`),
 * non-null assertions (`Model!.Title`), parentheses and type assertions
 * around them. Optional chaining is never assignable (TS2779).
 */
export function checkBindTarget(code: string): BindTarget {
  const file = ts.createSourceFile("bind.ts", `(${code}\n);`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const statement = file.statements[0];
  const syntaxErrors = (file as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics ?? [];
  if (file.statements.length !== 1 || !statement || !ts.isExpressionStatement(statement) || syntaxErrors.length > 0) {
    return { ok: false, reason: "is not a single expression", ...(syntaxErrors.length > 0 ? { syntax: true } : {}) };
  }
  let target = statement.expression;
  // The wrapping parentheses of the snippet itself.
  if (ts.isParenthesizedExpression(target)) target = target.expression;
  const unwrap = (node: ts.Expression): ts.Expression => {
    while (
      ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)
    ) {
      node = node.expression;
    }
    return node;
  };
  const outer = unwrap(target);
  for (let node: ts.Expression = outer; ;) {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      if (node.questionDotToken) return { ok: false, reason: "uses optional chaining ('?.'), which cannot be assigned to" };
      node = unwrap(node.expression);
      continue;
    }
    if (ts.isCallExpression(node) && node.questionDotToken) {
      return { ok: false, reason: "uses optional chaining ('?.'), which cannot be assigned to" };
    }
    break;
  }
  if (ts.isIdentifier(outer)) return { ok: true, field: outer.text, identifier: outer.text };
  if (ts.isPropertyAccessExpression(outer)) return { ok: true, field: outer.name.text };
  if (ts.isElementAccessExpression(outer)) {
    const argument = outer.argumentExpression;
    return { ok: true, field: ts.isStringLiteralLike(argument) ? argument.text : undefined };
  }
  return { ok: false, reason: "is not assignable (expected a field, property or element access)" };
}

/* Member collection ---------------------------------------------------------- */

export interface ClassMembers {
  /** Instance members (fields, methods, accessors, parameter properties). */
  instance: Set<string>;
  /** Static members (referenced through the class, not `this`). */
  statics: Set<string>;
  /** The instance members declared as methods (a method group passed to a delegate parameter is bound). */
  methods: Set<string>;
}

export function emptyMembers(): ClassMembers {
  return { instance: new Set(), statics: new Set(), methods: new Set() };
}

/** Members declared by `@code` text (a class body), collected syntactically. */
export function collectBodyMembers(body: string, into: ClassMembers): void {
  const file = ts.createSourceFile("members.ts", `class __tsazor_members {\n${body}\n}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const cls = file.statements.find(ts.isClassDeclaration);
  if (cls) addClassMembers(cls, into);
}

/** Offset (within `body`) of the name of the first member called `name` declared by `@code` text. */
export function bodyMemberOffset(body: string, name: string): number | undefined {
  const prefix = "class __tsazor_members {\n";
  const file = ts.createSourceFile("members.ts", `${prefix}${body}\n}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const cls = file.statements.find(ts.isClassDeclaration);
  const member = cls?.members.find((m) => m.name !== undefined && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) && m.name.text === name);
  return member?.name === undefined ? undefined : member.name.getStart(file) - prefix.length;
}

/** Members of the default-exported class of a module (the code-behind `X.tsazor.ts`). */
export function collectDefaultClassMembers(source: string, into: ClassMembers): void {
  const file = ts.createSourceFile("code-behind.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false);
  let target: ts.ClassDeclaration | undefined = file.statements.find(
    (s): s is ts.ClassDeclaration => ts.isClassDeclaration(s) && hasModifier(s, ts.SyntaxKind.DefaultKeyword),
  );
  const assignment = file.statements.find(ts.isExportAssignment);
  if (!target && assignment && ts.isIdentifier(assignment.expression)) {
    const name = assignment.expression.text;
    target = file.statements.find((s): s is ts.ClassDeclaration => ts.isClassDeclaration(s) && s.name?.text === name);
  }
  if (target) addClassMembers(target, into);
}

function addClassMembers(cls: ts.ClassLikeDeclaration, into: ClassMembers): void {
  for (const member of cls.members) {
    if (ts.isConstructorDeclaration(member)) {
      for (const parameter of member.parameters) {
        if (ts.isParameterPropertyDeclaration(parameter, member) && ts.isIdentifier(parameter.name)) {
          into.instance.add(parameter.name.text);
        }
      }
      continue;
    }
    if (!member.name || !(ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))) continue;
    const isStatic = ts.canHaveModifiers(member) && (ts.getModifiers(member)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ?? false);
    (isStatic ? into.statics : into.instance).add(member.name.text);
    if (!isStatic && ts.isMethodDeclaration(member)) into.methods.add(member.name.text);
  }
}

/** `recv.name` as the whole expression (not `this.x`/`super.x`, not `a?.b`). */
function methodGroupOf(file: ts.SourceFile): ts.PropertyAccessExpression | undefined {
  const statement = file.statements[0];
  if (file.statements.length !== 1 || !statement || !ts.isExpressionStatement(statement)) return undefined;
  let expression: ts.Expression = statement.expression;
  while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
  if (!ts.isPropertyAccessExpression(expression) || expression.questionDotToken || !ts.isIdentifier(expression.name)) return undefined;
  const receiver = expression.expression.kind;
  if (receiver === ts.SyntaxKind.ThisKeyword || receiver === ts.SyntaxKind.SuperKeyword) return undefined;
  return expression;
}

/** A receiver without calls or side effects (identifiers, member/index chains, `!`). */
function isSimpleReceiver(node: ts.Expression): boolean {
  if (ts.isIdentifier(node) || node.kind === ts.SyntaxKind.ThisKeyword) return true;
  if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) return isSimpleReceiver(node.expression);
  if (ts.isPropertyAccessExpression(node)) return isSimpleReceiver(node.expression);
  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    return isSimpleReceiver(node.expression) &&
      (ts.isIdentifier(argument) || ts.isStringLiteral(argument) || ts.isNumericLiteral(argument));
  }
  return false;
}

/** Whether an identifier is a value reference (not a key, declaration, label or type). */
function isReference(id: ts.Identifier): boolean {
  const parent = id.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent)) return parent.name !== id;
  if (ts.isQualifiedName(parent) || ts.isMetaProperty(parent)) return false;
  if (ts.isBindingElement(parent)) return parent.name !== id && parent.propertyName !== id;
  if (ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) return parent.label !== id;
  if (
    ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent) ||
    ts.isMethodDeclaration(parent) || ts.isMethodSignature(parent) || ts.isGetAccessor(parent) ||
    ts.isSetAccessor(parent) || ts.isEnumMember(parent) || ts.isVariableDeclaration(parent) ||
    ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) ||
    ts.isClassDeclaration(parent) || ts.isClassExpression(parent) || ts.isEnumDeclaration(parent) ||
    ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent) || ts.isTypeParameterDeclaration(parent) ||
    ts.isModuleDeclaration(parent)
  ) {
    return parent.name !== id;
  }
  return !(
    ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isNamespaceImport(parent) ||
    ts.isImportClause(parent) || ts.isNamespaceExport(parent) || ts.isImportEqualsDeclaration(parent)
  );
}

/** Type positions and type-only declarations: never rewritten. */
function isTypeOnly(node: ts.Node): boolean {
  return ts.isTypeNode(node) || ts.isTypeParameterDeclaration(node) || ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) || ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ||
    ts.isModuleDeclaration(node) ||
    (ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword) ?? false));
}

/** Block-scoped declarations of a statement list: let/const, function, class, enum. */
function declareBlock(statements: readonly ts.Statement[], scope: Scope): void {
  for (const statement of statements) {
    if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.BlockScoped) !== 0) {
      for (const declaration of statement.declarationList.declarations) addBindingNames(declaration.name, scope.names);
    } else if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      scope.names.add(statement.name.text);
    }
  }
}

/** `var` names hoisted to the function (or snippet) scope — nested functions excluded. */
function hoistedVars(root: ts.Node): string[] {
  const names: string[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
    if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.BlockScoped) === 0) {
      for (const declaration of node.declarations) addBindingNames(declaration.name, names);
    }
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(root, walk);
  return names;
}

function addBindingNames(name: ts.BindingName, into: Set<string> | string[]): void {
  if (ts.isIdentifier(name)) {
    if (Array.isArray(into)) into.push(name.text);
    else into.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) addBindingNames(element.name, into);
  }
}

/** Applies sorted edits; mapOut(offset) = the offset's position in the output
 *  (an insertion AT offset lands before it unless `afterInserts` is false). */
function applyEdits(code: string, edits: Edit[]): { text: string; mapOut: (offset: number, afterInserts?: boolean) => number } {
  edits.sort((a, b) => a.pos - b.pos);
  let text = "";
  let at = 0;
  for (const edit of edits) {
    text += code.slice(at, edit.pos) + edit.insert;
    at = edit.pos + edit.remove;
  }
  text += code.slice(at);
  const mapOut = (offset: number, afterInserts = true): number => {
    let delta = 0;
    for (const edit of edits) {
      if (edit.pos > offset || (edit.pos === offset && !afterInserts && edit.remove === 0)) break;
      if (edit.remove > 0 && offset < edit.pos + edit.remove) return edit.pos + delta;
      delta += edit.insert.length - edit.remove;
    }
    return offset + delta;
  };
  return { text, mapOut };
}

/** Mapping tokens: every identifier/keyword and every first token of a line. */
function wordTokens(code: string, mapOut: (offset: number) => number): RewriteToken[] {
  const tokens: RewriteToken[] = [];
  const scanner = new CodeScanner(code);
  scanner.reset(0);
  for (;;) {
    const token = scanner.next();
    if (token.kind === ts.SyntaxKind.EndOfFileToken) break;
    const word = token.kind === ts.SyntaxKind.Identifier || token.kind === ts.SyntaxKind.PrivateIdentifier ||
      (token.kind >= ts.SyntaxKind.FirstKeyword && token.kind <= ts.SyntaxKind.LastKeyword);
    if (word || token.newlineBefore) tokens.push({ outOffset: mapOut(token.start), srcOffset: token.start });
  }
  return tokens;
}
