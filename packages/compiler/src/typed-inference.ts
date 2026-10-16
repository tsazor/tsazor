/**
 * The type argument of a generic tag, read from the type checker (2.4): one
 * inference request (`TItem` from `Items="this.people"`) answered against the
 * typed shadow module. Shared by the language server and the tutorial's
 * in-browser `tsazor check`, so both infer alike.
 */
import * as ts from "typescript";
import type { TypedTagInferenceRequest } from "./codegen.js";

/**
 * The type text of `request.typeParameter`, from the attribute value whose
 * generated code starts at `offset` in `sourceFile`: exactly (`Items: TItem`),
 * through the array element (`Items: TItem[]` ← `Person[]`), the awaited type
 * (`For: PromiseLike<T> | T` ← `Promise<User>`), a function's return type
 * (`Property: (item: TGridItem) => TProp` ← `(o) => o.customer`) or a type
 * argument of the same generic type (`ItemsProvider: GridItemsProvider<TGridItem>`
 * ← a `GridItemsProvider<Person>` field). Undefined when it can't be read (yet).
 */
export function inferTypeArgument(sourceFile: ts.SourceFile, checker: ts.TypeChecker, offset: number, request: TypedTagInferenceRequest): string | undefined {
  if (offset >= sourceFile.text.length) return undefined;
  // The outermost expression starting at the value's position is the
  // attribute value (`this.people` from the `this` token).
  let node: ts.Node = descendTo(sourceFile, offset);
  while (node.parent !== undefined && ts.isExpression(node.parent) && node.parent.getStart(sourceFile) === node.getStart(sourceFile)) {
    node = node.parent;
  }
  // A value without a token mapping at its start (a lambda: `(p) => …`)
  // lands on its statement: the value is the `addAttribute` call's third argument.
  node = attributeValueOf(node) ?? node;
  const type = checker.getTypeAtLocation(node);
  const declared = request.parameterType.trim();
  const text = (t: ts.Type): string => checker.typeToString(t, node, ts.TypeFormatFlags.NoTruncation);
  let argument: string | undefined;
  if (declared === request.typeParameter) {
    argument = text(type);
  } else if (checker.isArrayType(type)) {
    // `T[]` and `readonly T[]` (a component's API reads them both as the row list, X5).
    const itemOf = declared.split("|").map((part) => part.trim().replace(/^readonly\s+/, "").replace(/\[\]$/, "").replace(/\[\]$/, "").trim());
    if (itemOf.includes(request.typeParameter)) {
      const [item] = checker.getTypeArguments(type as ts.TypeReference) ?? [];
      if (item !== undefined) argument = text(item);
    }
  } else if (isAwaitableOf(declared, request.typeParameter)) {
    argument = text(checker.getAwaitedType(checker.getNonNullableType(type)) ?? type);
  } else if (returnsTypeParameter(declared, request.typeParameter)) {
    const [signature] = checker.getNonNullableType(type).getCallSignatures();
    const returned = signature !== undefined ? checker.getReturnTypeOfSignature(signature) : undefined;
    if (returned !== undefined && (returned.flags & ts.TypeFlags.Any) === 0) argument = text(returned);
  } else {
    const position = typeArgumentPosition(declared, request.typeParameter);
    const typeArguments = position !== undefined ? typeArgumentsOf(checker, checker.getNonNullableType(type), position.name) : undefined;
    const item = position !== undefined ? typeArguments?.[position.index] : undefined;
    if (item !== undefined && (item.flags & ts.TypeFlags.Any) === 0) argument = text(item);
  }
  return argument !== undefined && argument.trim().length > 0 ? argument : undefined;
}

/** A union of `T`, `Promise<T>`, `PromiseLike<T>`, `null`, `undefined` with a promise member. */
function isAwaitableOf(declared: string, typeParameter: string): boolean {
  const parts = declared.split("|").map((part) => part.replace(/\s+/g, ""));
  const promises = new Set([`Promise<${typeParameter}>`, `PromiseLike<${typeParameter}>`]);
  return parts.some((part) => promises.has(part)) && parts.every((part) => promises.has(part) || part === typeParameter || part === "null" || part === "undefined");
}

/** `(item: TGridItem) => TProp` for `TProp`: a function type returning exactly the type parameter. */
function returnsTypeParameter(declared: string, typeParameter: string): boolean {
  const node = declaredTypeNode(declared);
  return node !== undefined && ts.isFunctionTypeNode(node) && isTypeParameterReference(node.type, typeParameter);
}

/**
 * `GridItemsProvider<TGridItem>` for `TGridItem`: a generic type (an alias, an
 * interface or a class) that takes the type parameter itself as an argument, and where.
 */
function typeArgumentPosition(declared: string, typeParameter: string): { name: string; index: number } | undefined {
  let node = declaredTypeNode(declared);
  // An optional parameter's `X<T> | undefined`: the generic member.
  if (node !== undefined && ts.isUnionTypeNode(node)) {
    const members = node.types.filter((member) => !(ts.isLiteralTypeNode(member) && member.literal.kind === ts.SyntaxKind.NullKeyword) && member.kind !== ts.SyntaxKind.UndefinedKeyword);
    node = members.length === 1 ? members[0] : undefined;
  }
  if (node === undefined || !ts.isTypeReferenceNode(node) || node.typeArguments === undefined) return undefined;
  const index = node.typeArguments.findIndex((argument) => isTypeParameterReference(argument, typeParameter));
  if (index < 0) return undefined;
  return { name: ts.isIdentifier(node.typeName) ? node.typeName.text : node.typeName.right.text, index };
}

/** The type arguments `type` was instantiated with, when it is the generic type named `name` (by alias or by reference). */
function typeArgumentsOf(checker: ts.TypeChecker, type: ts.Type, name: string): readonly ts.Type[] | undefined {
  if (type.aliasSymbol?.name === name) return type.aliasTypeArguments;
  const isReference = (type.flags & ts.TypeFlags.Object) !== 0 && ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0;
  if (isReference && (type as ts.TypeReference).target.symbol?.name === name) return checker.getTypeArguments(type as ts.TypeReference);
  return undefined;
}

function isTypeParameterReference(node: ts.TypeNode, typeParameter: string): boolean {
  return ts.isTypeReferenceNode(node) && node.typeArguments === undefined && ts.isIdentifier(node.typeName) && node.typeName.text === typeParameter;
}

function declaredTypeNode(declared: string): ts.TypeNode | undefined {
  const statement = ts.createSourceFile("declared.ts", `type T = ${declared};`, ts.ScriptTarget.Latest).statements[0];
  return statement !== undefined && ts.isTypeAliasDeclaration(statement) ? statement.type : undefined;
}

/** The value of the `__builder.addAttribute(seq, name, value)` call around `node` — without the shadow's `(…) satisfies T` wrap. */
function attributeValueOf(node: ts.Node): ts.Node | undefined {
  let current: ts.Node | undefined = node;
  while (current !== undefined && !(ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression) && current.expression.name.text === "addAttribute")) {
    if (ts.isStatement(current) && !ts.isExpressionStatement(current)) return undefined;
    current = current.parent;
  }
  let value: ts.Node | undefined = current?.arguments[2];
  while (value !== undefined && (ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value))) value = value.expression;
  return value;
}

/** The deepest node covering `offset` (public-API stand-in for the internal getTokenAtPosition). */
function descendTo(sourceFile: ts.SourceFile, offset: number): ts.Node {
  let current: ts.Node = sourceFile;
  for (;;) {
    const next = current.getChildren(sourceFile).find((child) => child.getStart(sourceFile) <= offset && offset < child.getEnd());
    if (next === undefined) return current;
    current = next;
  }
}
