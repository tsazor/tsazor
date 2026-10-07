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
 * (`For: PromiseLike<T> | T` ← `Promise<User>`) or a function's return type
 * (`Property: (item: TGridItem) => TProp` ← `(o) => o.customer`). Undefined
 * when it can't be read (yet).
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
  } else if (declared.endsWith("[]") && declared.slice(0, -2).trim() === request.typeParameter && checker.isArrayType(type)) {
    const [item] = checker.getTypeArguments(type as ts.TypeReference);
    if (item !== undefined) argument = text(item);
  } else if (isAwaitableOf(declared, request.typeParameter)) {
    argument = text(checker.getAwaitedType(checker.getNonNullableType(type)) ?? type);
  } else if (returnsTypeParameter(declared, request.typeParameter)) {
    const [signature] = checker.getNonNullableType(type).getCallSignatures();
    const returned = signature !== undefined ? checker.getReturnTypeOfSignature(signature) : undefined;
    if (returned !== undefined && (returned.flags & ts.TypeFlags.Any) === 0) argument = text(returned);
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
  const statement = ts.createSourceFile("declared.ts", `type T = ${declared};`, ts.ScriptTarget.Latest).statements[0];
  const node = statement !== undefined && ts.isTypeAliasDeclaration(statement) ? statement.type : undefined;
  return node !== undefined && ts.isFunctionTypeNode(node) && ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName) && node.type.typeName.text === typeParameter;
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
