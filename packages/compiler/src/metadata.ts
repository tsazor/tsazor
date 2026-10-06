import ts from "typescript";
import type { CodeBlockNode } from "./ast.js";
import { DiagnosticBag } from "./diagnostics.js";
import { parseImportDirective, type ImportInfo } from "./imports.js";
import { parseDocument } from "./parser.js";

/**
 * Component parameter metadata (roadmap 2.1): a static, syntactic description
 * of every `@Parameter` / `@CascadingParameter` member of a component — the
 * statically known counterpart of the runtime's decorator metadata
 * (`getParameterInfo`). No type checker: categories are decided from the
 * type annotation as written, following imports only through the host.
 *
 * Two steps:
 *  1. extraction (`extractModuleMetadata`, `extractTsazorMetadata`): one file,
 *     pure, cacheable per file — classes, own parameters, import bindings,
 *     local type aliases;
 *  2. resolution (`resolveComponentMetadata`): flattens the base-class chain
 *     like the runtime does (base first, a derived re-declaration wins at the
 *     base's position), substitutes base type arguments and categorizes every
 *     type. Other files and package manifests come from a `MetadataHost`
 *     (the workspace implements it over the file system).
 */

export const RUNTIME_MODULE = "@tsazor/runtime";

/**
 * How a parameter is passed from markup — decided syntactically from its type:
 * - `string`: `string`, string literal / template literal types, or a union containing one,
 * - `EventCallback` / `EventCallback<T>`: the runtime's `EventCallback` (also inside a union),
 * - `RenderFragment`: the runtime's `RenderFragment`,
 * - `RenderFragment<T>`: a function type `(context: T) => RenderFragment` (Tsazor's
 *   spelling of Blazor's `RenderFragment<T>`) or a generic `RenderFragment<T>` reference,
 * - `captureUnmatchedValues`: `@Parameter({ captureUnmatchedValues: true })`,
 * - `value`: anything else (incl. delegates, which Blazor also passes as plain values;
 *   a function type sets `delegate`, so a method group passed to it is bound).
 */
export type ParameterCategory =
  | "string"
  | "value"
  | "EventCallback"
  | "EventCallback<T>"
  | "RenderFragment"
  | "RenderFragment<T>"
  | "captureUnmatchedValues";

/** Where a root identifier of a parameter's type text is bound (the type's import context). */
export interface TypeReference {
  name: string;
  /**
   * `runtime`: an export of `@tsazor/runtime` (`imported`); `import`: imported in `file`
   * from `specifier` (as written there); `local`: declared in `file`; `typeParameter`:
   * a type parameter of the declaring class; `global`: not bound (lib types, unknown names).
   */
  kind: "runtime" | "import" | "local" | "typeParameter" | "global";
  specifier?: string;
  /** Exported name (`default` for a default import, `*` for a namespace import). */
  imported?: string;
  file?: string;
}

export interface TypeParameterInfo {
  name: string;
  constraint?: string;
  default?: string;
}

/** One parameter of a resolved component (own or inherited). */
export interface ComponentParameter {
  name: string;
  category: ParameterCategory;
  /** `T` of `EventCallback<T>` / the context type of `RenderFragment<T>`, as source text. */
  typeArgument?: string;
  /** Declared type annotation as source text (base type arguments substituted). */
  type?: string;
  /** No annotation: the type of a literal initializer (`href = ""` ⇒ `string`). */
  inferredType?: "string" | "number" | "boolean" | "bigint";
  /** `name?:` or a type that includes `undefined`. */
  optional: boolean;
  hasInitializer: boolean;
  /** The initializer as written (`"primary"`, `false`, `[]`), when there is one. */
  default?: string;
  /** Member form the decorator sits on. */
  member: "field" | "accessor" | "setter";
  /** `@CascadingParameter`: its options (`type` as source text). Not settable from markup. */
  cascading?: { name?: string; type?: string };
  /** JSDoc of the member. */
  doc?: string;
  /** The category rests on a name that could not be followed (counts as `value`). */
  uncertain?: boolean;
  /**
   * A `value` parameter whose type is a function type (also through aliases,
   * or a union of function types with `null`/`undefined`) — Blazor's
   * delegate (`Func<…>`/`Action<…>`): a method group passed to it is bound
   * to its receiver.
   */
  delegate?: boolean;
  /** Bindings of the root identifiers in `type` (empty/absent: none). */
  references?: TypeReference[];
  /** Class that declares the parameter (the component itself or a base). */
  declaredBy: string;
  /**
   * `@Bindable()` (Tsazor extension) on this parameter: the names of the
   * parameters it synthesizes — the change callback and, with
   * `{ expression: true }`, `<name>Expression`.
   */
  bindable?: { changed: string; expression?: string };
  /** Synthesized by `@Bindable()` on the named parameter (not a declared member). */
  synthesizedBy?: string;
}

export interface ComponentMetadata {
  name: string;
  /** The component's doc comment: the class JSDoc, or a leading `@** … *@` in a .tsazor file. */
  doc?: string;
  /** Declaring file (absolute in the workspace, package-relative in manifests). */
  file?: string;
  /** The base-class chain reaches `ComponentBase`. */
  isComponent: boolean;
  abstract?: boolean;
  /** `@typeparam`s / class type parameters. */
  typeParameters: TypeParameterInfo[];
  /** Direct base class as written (`codeBehind` for a .tsazor's X.tsazor.ts class). */
  base?: { name: string; typeArguments?: string[]; resolved: boolean; codeBehind?: boolean };
  /** All parameters, inherited first (runtime order: a re-declaration keeps the base's slot). */
  parameters: ComponentParameter[];
  /** A base class could not be resolved: inherited parameters are missing. */
  incomplete?: boolean;
}

/** Generated per package (`dist/tsazor-components.json`, referenced from package.json `tsazor.components`). */
export interface ComponentManifest {
  tsazorComponentManifest: 1;
  package?: string;
  components: Record<string, ComponentMetadata>;
}

/* Extraction (one file) -------------------------------------------------------- */

export interface ModuleBinding {
  local: string;
  specifier: string;
  /** `default`, `*` (namespace) or the exported name. */
  imported: string;
}

/** A parameter as declared by one class (before resolution). */
export interface OwnParameter {
  name: string;
  member: "field" | "accessor" | "setter";
  type?: string;
  initializer?: string;
  /** Literal initializer type, when there is no annotation. */
  inferredType?: ComponentParameter["inferredType"];
  /** The initializer is not a literal (its type is unknown without a checker). */
  opaqueInitializer?: boolean;
  questionToken: boolean;
  captureUnmatchedValues?: boolean;
  cascading?: { name?: string; type?: string };
  doc?: string;
  /** `@Bindable()`: see ComponentParameter.bindable. */
  bindable?: { changed: string; expression?: string };
  /**
   * A parameter `@Bindable()` synthesizes for the parameter `of`: the change
   * callback (`EventCallback<value type>`) or the `string` expression name.
   */
  synthesized?: { of: string; role: "changed" | "expression" };
}

export interface ClassRecord {
  name: string;
  doc?: string;
  abstract: boolean;
  typeParameters: TypeParameterInfo[];
  /** `extends` clause; `codeBehind`: the default class of the sibling X.tsazor.ts. */
  base?: { name: string; typeArguments: string[]; codeBehind?: boolean };
  parameters: OwnParameter[];
}

/** Syntactic facts of one module (.ts or .tsazor) — what resolution needs, nothing else. */
export interface ModuleMetadata {
  file: string;
  kind: "ts" | "tsazor";
  /** A module of @tsazor/runtime's own sources: its relative imports are runtime names. */
  runtimeInternal?: boolean;
  imports: Map<string, ModuleBinding>;
  /** Local type aliases: name → body text + its type parameter names. */
  aliases: Map<string, { type: string; typeParameters: string[] }>;
  /** Other local type-level declarations (classes, interfaces, enums). */
  declarations: Set<string>;
  /** Exported name → local name (`default` → the default class). */
  exports: Map<string, string>;
  /** `export … from`: `names` exported → imported; absent for `export *`. */
  reexports: Array<{ specifier: string; names?: Map<string, string> }>;
  classes: ClassRecord[];
}

export interface ExtractOptions {
  runtimeInternal?: boolean;
}

/** Extracts the classes, parameters and bindings of a TS module (a code-behind or a plain component class). */
export function extractModuleMetadata(source: string, fileName: string, options: ExtractOptions = {}): ModuleMetadata {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const module = emptyModule(fileName, "ts", options.runtimeInternal);
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (!clause) continue;
      if (clause.name) module.imports.set(clause.name.text, { local: clause.name.text, specifier, imported: "default" });
      const named = clause.namedBindings;
      if (named && ts.isNamespaceImport(named)) {
        module.imports.set(named.name.text, { local: named.name.text, specifier, imported: "*" });
      } else if (named) {
        for (const element of named.elements) {
          module.imports.set(element.name.text, { local: element.name.text, specifier, imported: (element.propertyName ?? element.name).text });
        }
      }
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : undefined;
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        const names = new Map<string, string>();
        for (const element of clause.elements) names.set(element.name.text, (element.propertyName ?? element.name).text);
        if (specifier) module.reexports.push({ specifier, names });
        else for (const [exported, local] of names) module.exports.set(exported, local);
      } else if (!clause && specifier) {
        module.reexports.push({ specifier });
      }
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      if (ts.isIdentifier(statement.expression)) module.exports.set("default", statement.expression.text);
      continue;
    }
    const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
    if (ts.isTypeAliasDeclaration(statement)) {
      module.aliases.set(statement.name.text, {
        type: statement.type.getText(file),
        typeParameters: statement.typeParameters?.map((parameter) => parameter.name.text) ?? [],
      });
      if (exported) module.exports.set(statement.name.text, statement.name.text);
    } else if (ts.isInterfaceDeclaration(statement) || ts.isEnumDeclaration(statement)) {
      module.declarations.add(statement.name.text);
      if (exported) module.exports.set(statement.name.text, statement.name.text);
    } else if (ts.isClassDeclaration(statement)) {
      const name = statement.name?.text ?? "default";
      module.declarations.add(name);
      if (isDefault) module.exports.set("default", name);
      else if (exported) module.exports.set(name, name);
      module.classes.push(classRecord(statement, name, file, module));
    } else if (ts.isExpressionStatement(statement)) {
      defineParameterCall(statement.expression, file, module);
    }
  }
  return module;
}

export interface ExtractTsazorOptions extends ExtractOptions {
  /** Component class name (the file name). */
  className: string;
  /** `@import`s inherited from the _Imports chain (nearest first, already rebased). */
  inheritedImports?: readonly ImportInfo[];
  /** A sibling X.tsazor.ts exists: the generated class extends its default export. */
  codeBehind?: boolean;
  /** Resolves an `@inherits` root no `@import` binds (the workspace's resolveType). */
  resolveType?: (name: string, usings: string[]) => { specifier: string; exportName?: string } | null;
}

/**
 * Extracts a .tsazor component: the `@code` members of the generated class,
 * its `@typeparam`s and its base (code-behind class ⇒ `@inherits` ⇒
 * `ComponentBase`, the compiler's precedence). Names the compiler imports by
 * itself when no `@import` binds them (`Parameter`, `CascadingParameter`,
 * `EventCallback`, `RenderFragment`, `ComponentBase`) count as runtime names.
 */
export function extractTsazorMetadata(source: string, fileName: string, options: ExtractTsazorOptions): ModuleMetadata {
  const document = parseDocument(source, new DiagnosticBag());
  const module = emptyModule(fileName, "tsazor", options.runtimeInternal);
  const own: ImportInfo[] = [];
  const usings: string[] = [];
  let inherits: string | undefined;
  const typeParameterTexts: string[] = [];
  for (const directive of document.directives) {
    if (directive.name === "import") {
      const parsed = parseImportDirective(directive.value);
      if (parsed.ok) own.push(parsed.info);
    } else if (directive.name === "using") usings.push(directive.value.trim());
    else if (directive.name === "inherits") inherits = directive.value.trim();
    else if (directive.name === "typeparam") typeParameterTexts.push(directive.value.replace(/\s+where\s[\s\S]*$/, "").trim());
  }
  // The file shadows the chain (the compiler's merge rule).
  for (const info of [...own, ...(options.inheritedImports ?? [])]) {
    for (const binding of info.bindings) {
      if (!module.imports.has(binding.local)) module.imports.set(binding.local, { local: binding.local, specifier: info.specifier, imported: binding.imported });
    }
  }
  for (const name of COMPILER_RUNTIME_NAMES) {
    if (!module.imports.has(name)) module.imports.set(name, { local: name, specifier: RUNTIME_MODULE, imported: name });
  }

  const body = document.body
    .filter((node): node is CodeBlockNode => node.kind === "codeBlock" && node.member === true)
    .map((node) => node.code)
    .join("\n");
  const typeParameters = typeParameterTexts.length > 0 ? `<${typeParameterTexts.join(", ")}>` : "";
  const heritage = inherits ? ` extends ${inherits}` : "";
  const text = `class ${options.className}${typeParameters}${heritage} {\n${body}\n}`;
  const file = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const cls = file.statements.find(ts.isClassDeclaration);
  const record: ClassRecord = cls
    ? classRecord(cls, options.className, file, module)
    : { name: options.className, abstract: false, typeParameters: [], parameters: [] };
  const doc = leadingDocComment(source);
  if (doc) record.doc = doc;
  if (options.codeBehind) {
    record.base = { name: `${options.className}Base`, typeArguments: [], codeBehind: true };
  } else if (record.base) {
    const root = record.base.name.split(".")[0]!;
    if (!module.imports.has(root) && !COMPILER_RUNTIME_NAMES.includes(root)) {
      const resolved = options.resolveType?.(root, usings) ?? null;
      if (resolved) module.imports.set(root, { local: root, specifier: resolved.specifier, imported: resolved.exportName ?? "default" });
    }
  } else {
    record.base = { name: "ComponentBase", typeArguments: [] };
  }
  module.classes.push(record);
  module.declarations.add(options.className);
  module.exports.set("default", options.className);
  return module;
}

/** Runtime names the compiler imports itself when the file does not bind them. */
const COMPILER_RUNTIME_NAMES = ["ComponentBase", "Parameter", "CascadingParameter", "Bindable", "State", "EventCallback", "RenderFragment"];

function emptyModule(file: string, kind: ModuleMetadata["kind"], runtimeInternal: boolean | undefined): ModuleMetadata {
  const module: ModuleMetadata = {
    file,
    kind,
    imports: new Map(),
    aliases: new Map(),
    declarations: new Set(),
    exports: new Map(),
    reexports: [],
    classes: [],
  };
  if (runtimeInternal) module.runtimeInternal = true;
  return module;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);
}

/** True when `specifier` names the runtime as seen from `module`. */
function isRuntimeSpecifier(module: ModuleMetadata, specifier: string): boolean {
  return specifier === RUNTIME_MODULE || (module.runtimeInternal === true && specifier.startsWith("."));
}

/** The runtime export a (possibly qualified) name refers to in `module`, if any. */
function runtimeName(module: ModuleMetadata, expression: ts.Expression | ts.EntityName): string | undefined {
  if (ts.isIdentifier(expression)) {
    const binding = module.imports.get(expression.text);
    return binding && binding.imported !== "*" && isRuntimeSpecifier(module, binding.specifier) ? binding.imported : undefined;
  }
  const left = ts.isPropertyAccessExpression(expression) ? expression.expression : ts.isQualifiedName(expression) ? expression.left : undefined;
  const right = ts.isPropertyAccessExpression(expression) ? expression.name : ts.isQualifiedName(expression) ? expression.right : undefined;
  if (!left || !right || !ts.isIdentifier(left)) return undefined;
  const binding = module.imports.get(left.text);
  return binding?.imported === "*" && isRuntimeSpecifier(module, binding.specifier) ? right.text : undefined;
}

function classRecord(cls: ts.ClassDeclaration, name: string, file: ts.SourceFile, module: ModuleMetadata): ClassRecord {
  const record: ClassRecord = {
    name,
    abstract: hasModifier(cls, ts.SyntaxKind.AbstractKeyword),
    typeParameters: (cls.typeParameters ?? []).map((parameter) => typeParameterInfo(parameter, file)),
    parameters: [],
  };
  const doc = jsDocOf(cls);
  if (doc) record.doc = doc;
  const extendsClause = cls.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
  if (extendsClause) {
    record.base = {
      name: extendsClause.expression.getText(file),
      typeArguments: (extendsClause.typeArguments ?? []).map((argument) => argument.getText(file)),
    };
  }
  const getterTypes = new Map<string, string>();
  for (const member of cls.members) {
    if (ts.isGetAccessorDeclaration(member) && ts.isIdentifier(member.name) && member.type) getterTypes.set(member.name.text, member.type.getText(file));
  }
  for (const member of cls.members) {
    const isField = ts.isPropertyDeclaration(member);
    if (!isField && !ts.isSetAccessorDeclaration(member)) continue;
    if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) continue; // #private / computed: the runtime rejects them
    if (hasModifier(member, ts.SyntaxKind.StaticKeyword)) continue;
    const decorator = (ts.getDecorators(member) ?? []).map((d) => parameterDecorator(d, module)).find((d) => d !== undefined);
    if (!decorator) continue;
    const parameter: OwnParameter = {
      name: member.name.text,
      member: isField ? (hasModifier(member, ts.SyntaxKind.AccessorKeyword) ? "accessor" : "field") : "setter",
      questionToken: isField && member.questionToken !== undefined,
      ...decoratorOptions(decorator, file, member.name.text),
    };
    if (isField) {
      if (member.type) parameter.type = member.type.getText(file);
      if (member.initializer) describeInitializer(parameter, member.initializer, file);
    } else {
      const type = member.parameters[0]?.type?.getText(file) ?? getterTypes.get(member.name.text);
      if (type) parameter.type = type;
    }
    const doc = jsDocOf(member);
    if (doc) parameter.doc = doc;
    record.parameters.push(parameter);
    if (decorator.kind === "Bindable") record.parameters.push(...bindableParameters(parameter));
  }
  return record;
}

/**
 * The parameters `@Bindable()` synthesizes besides its own (Tsazor
 * extension): `@Bindable() accessor value: T` desugars to `@Parameter()
 * value: T` + `@Parameter() valueChanged?: EventCallback<T>` (+
 * `valueExpression?: string` with `{ expression: true }`).
 */
function bindableParameters(parameter: OwnParameter): OwnParameter[] {
  const bindable = parameter.bindable!;
  const valueType = bindableValueType(parameter);
  const synthesized: OwnParameter[] = [
    {
      name: bindable.changed,
      member: "field",
      questionToken: true,
      type: `EventCallback<${valueType}>`,
      synthesized: { of: parameter.name, role: "changed" },
      doc: `Change callback of the two-way parameter '${parameter.name}' (synthesized by @Bindable(); \`@bind-${parameter.name}\` sets it).`,
    },
  ];
  if (bindable.expression !== undefined) {
    synthesized.push({
      name: bindable.expression,
      member: "field",
      questionToken: true,
      type: "string",
      synthesized: { of: parameter.name, role: "expression" },
      doc: `Field name of the two-way parameter '${parameter.name}' for EditContext validation (synthesized by @Bindable({ expression: true })).`,
    });
  }
  return synthesized;
}

/** The value type of a `@Bindable()` parameter as type text (`unknown` when it cannot be read syntactically). */
export function bindableValueType(parameter: Pick<OwnParameter, "type" | "inferredType">): string {
  return parameter.type ?? parameter.inferredType ?? "unknown";
}

function typeParameterInfo(parameter: ts.TypeParameterDeclaration, file: ts.SourceFile): TypeParameterInfo {
  const info: TypeParameterInfo = { name: parameter.name.text };
  if (parameter.constraint) info.constraint = parameter.constraint.getText(file);
  if (parameter.default) info.default = parameter.default.getText(file);
  return info;
}

/** The `@Parameter(...)` / `@CascadingParameter(...)` call of a decorator, if it is one. */
function parameterDecorator(decorator: ts.Decorator, module: ModuleMetadata): { kind: string; call: ts.CallExpression } | undefined {
  const call = decorator.expression;
  if (!ts.isCallExpression(call)) return undefined; // the runtime decorators are factories
  const kind = runtimeName(module, call.expression);
  return kind === "Parameter" || kind === "CascadingParameter" || kind === "Bindable" ? { kind, call } : undefined;
}

function decoratorOptions(
  decorator: { kind: string; call: ts.CallExpression },
  file: ts.SourceFile,
  name: string,
): Pick<OwnParameter, "captureUnmatchedValues" | "cascading" | "bindable"> {
  const options = objectLiteralProperties(decorator.call.arguments[0], file);
  if (decorator.kind === "Bindable") {
    const changed = options.get("changed");
    const bindable: { changed: string; expression?: string } = {
      changed: changed && ts.isStringLiteralLike(changed) ? changed.text : `${name}Changed`,
    };
    if (options.get("expression")?.kind === ts.SyntaxKind.TrueKeyword) bindable.expression = `${name}Expression`;
    return { bindable };
  }
  if (decorator.kind === "CascadingParameter") {
    const cascading: { name?: string; type?: string } = {};
    const name = options.get("name");
    if (name && ts.isStringLiteralLike(name)) cascading.name = name.text;
    const type = options.get("type");
    if (type) cascading.type = type.getText(file);
    return { cascading };
  }
  const capture = options.get("captureUnmatchedValues");
  return capture?.kind === ts.SyntaxKind.TrueKeyword ? { captureUnmatchedValues: true } : {};
}

function objectLiteralProperties(node: ts.Node | undefined, _file: ts.SourceFile): Map<string, ts.Expression> {
  const properties = new Map<string, ts.Expression>();
  if (!node || !ts.isObjectLiteralExpression(node)) return properties;
  for (const property of node.properties) {
    if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
      properties.set(property.name.text, property.initializer);
    } else if (ts.isShorthandPropertyAssignment(property)) {
      properties.set(property.name.text, property.name);
    }
  }
  return properties;
}

function describeInitializer(parameter: OwnParameter, initializer: ts.Expression, file: ts.SourceFile): void {
  parameter.initializer = initializer.getText(file);
  if (parameter.type) return;
  let expression = initializer;
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) {
    if (!ts.isParenthesizedExpression(expression)) return; // `x as T`: the annotation is the cast — leave opaque
    expression = expression.expression;
  }
  if (ts.isStringLiteralLike(expression) || ts.isTemplateExpression(expression)) parameter.inferredType = "string";
  else if (ts.isNumericLiteral(expression) || (ts.isPrefixUnaryExpression(expression) && ts.isNumericLiteral(expression.operand))) parameter.inferredType = "number";
  else if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) parameter.inferredType = "boolean";
  else if (ts.isBigIntLiteral(expression)) parameter.inferredType = "bigint";
  else parameter.opaqueInitializer = true;
}

/**
 * A .tsazor file's doc comment: `@** … *@` before anything else — the
 * markup counterpart of a JSDoc block; a plain `@* … *@` stays an
 * implementation note.
 */
export function leadingDocComment(source: string): string | undefined {
  const match = /^\uFEFF?\s*@\*\*(?!@)([\s\S]*?)\*@/.exec(source);
  if (!match) return undefined;
  const text = match[1]!
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*?\s?/, "").trimEnd())
    .join("\n")
    .trim();
  return text || undefined;
}

function jsDocOf(node: ts.Node): string | undefined {
  const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
  const last = docs[docs.length - 1];
  if (!last) return undefined;
  // The raw comment text: JSDoc tag parsing would cut prose like "@bind-Value emits this".
  const text = last
    .getText()
    .replace(/^\/\*\*|\*\/$/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*?\s?/, "").trimEnd())
    .join("\n")
    .trim();
  return text || undefined;
}

/** `defineParameter(Class, "name", { … })` at module level (decorator-free components). */
function defineParameterCall(expression: ts.Expression, file: ts.SourceFile, module: ModuleMetadata): void {
  if (!ts.isCallExpression(expression) || runtimeName(module, expression.expression) !== "defineParameter") return;
  const [target, name, options] = expression.arguments;
  if (!target || !ts.isIdentifier(target) || !name || !ts.isStringLiteralLike(name)) return;
  const record = module.classes.find((cls) => cls.name === target.text);
  if (!record) return;
  const properties = objectLiteralProperties(options, file);
  const cascading = properties.get("cascading")?.kind === ts.SyntaxKind.TrueKeyword;
  const parameter: OwnParameter = { name: name.text, member: "field", questionToken: false };
  if (cascading) {
    parameter.cascading = {};
    const cascadingName = properties.get("cascadingName");
    if (cascadingName && ts.isStringLiteralLike(cascadingName)) parameter.cascading.name = cascadingName.text;
    const cascadingType = properties.get("cascadingType");
    if (cascadingType) parameter.cascading.type = cascadingType.getText(file);
  } else if (properties.get("captureUnmatchedValues")?.kind === ts.SyntaxKind.TrueKeyword) {
    parameter.captureUnmatchedValues = true;
  }
  // The member's declared type, when the class declares it.
  const cls = file.statements.find((s): s is ts.ClassDeclaration => ts.isClassDeclaration(s) && s.name?.text === target.text);
  const member = cls?.members.find((m): m is ts.PropertyDeclaration => ts.isPropertyDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === name.text);
  if (member?.type) parameter.type = member.type.getText(file);
  if (member?.questionToken) parameter.questionToken = true;
  if (member?.initializer) describeInitializer(parameter, member.initializer, file);
  const existing = record.parameters.findIndex((p) => p.name === parameter.name);
  if (existing >= 0) record.parameters[existing] = parameter;
  else record.parameters.push(parameter);
}

/* Resolution ------------------------------------------------------------------- */

/** What resolution needs from outside the file. */
export interface MetadataHost {
  /** Module metadata of what `specifier` (imported by `fromFile`) resolves to; undefined for bare/unknown. */
  resolveModule(specifier: string, fromFile: string): ModuleMetadata | undefined;
  /** Module metadata of a file by absolute path (local aliases, code-behind `X.tsazor.ts`). */
  moduleAt(file: string): ModuleMetadata | undefined;
  /** A component from a package manifest (`@tsazor/runtime` built-ins, bare packages). */
  packageComponent(specifier: string, exportName: string, fromFile: string): ComponentMetadata | undefined;
}

const MAX_DEPTH = 16;

/** Resolves one class of a module into its full component metadata (inheritance flattened). */
export function resolveComponentMetadata(module: ModuleMetadata, className: string | undefined, host: MetadataHost): ComponentMetadata | undefined {
  const local = className === undefined ? module.exports.get("default") : className;
  const record = module.classes.find((cls) => cls.name === local);
  return record ? resolveClass(module, record, host, new Set()) : undefined;
}

function resolveClass(module: ModuleMetadata, record: ClassRecord, host: MetadataHost, visiting: Set<string>): ComponentMetadata {
  const key = `${module.file}#${record.name}`;
  const result: ComponentMetadata = { name: record.name, file: module.file, isComponent: false, typeParameters: record.typeParameters, parameters: [] };
  if (record.doc) result.doc = record.doc;
  if (record.abstract) result.abstract = true;
  const parameters = new Map<string, ComponentParameter>();
  if (visiting.has(key) || visiting.size > MAX_DEPTH) {
    result.incomplete = true;
    return result;
  }
  visiting.add(key);

  const ownTypeParameters = new Set(record.typeParameters.map((p) => p.name));
  if (record.base) {
    const base = resolveBase(module, record, host, visiting);
    result.base = { name: record.base.name, resolved: base !== undefined };
    if (record.base.typeArguments.length > 0) result.base.typeArguments = record.base.typeArguments;
    if (record.base.codeBehind) result.base.codeBehind = true;
    if (base) {
      result.isComponent = base.isComponent;
      if (base.incomplete) result.incomplete = true;
      const args = record.base.typeArguments.map((text) => ({ text, references: referencesOf(text, module, ownTypeParameters) }));
      for (const parameter of base.parameters) {
        parameters.set(parameter.name, substituteParameter(parameter, base.typeParameters, args, host));
      }
    } else {
      result.incomplete = true;
    }
  } else if (record.name === "ComponentBase" && module.runtimeInternal) {
    result.isComponent = true; // the root of every component chain
  }
  for (const own of record.parameters) {
    parameters.set(own.name, resolveOwnParameter(own, record.name, module, ownTypeParameters, host));
  }
  result.parameters = [...parameters.values()];
  visiting.delete(key);
  return result;
}

function resolveBase(module: ModuleMetadata, record: ClassRecord, host: MetadataHost, visiting: Set<string>): ComponentMetadata | undefined {
  const base = record.base!;
  if (base.codeBehind) {
    const codeBehind = host.moduleAt(`${module.file}.ts`);
    const cls = codeBehind && classForExport(codeBehind, "default", host, new Set());
    return cls ? resolveClass(cls.module, cls.record, host, visiting) : undefined;
  }
  const [root, member, ...rest] = base.name.split(".");
  if (rest.length > 0 || !root) return undefined;
  if (member === undefined) {
    const localClass = module.classes.find((cls) => cls.name === root && cls !== record);
    if (localClass && !module.imports.has(root)) return resolveClass(module, localClass, host, visiting);
  }
  const binding = module.imports.get(root);
  if (!binding) return undefined;
  const imported = binding.imported === "*" ? member : member === undefined ? binding.imported : undefined;
  if (imported === undefined) return undefined;
  if (binding.specifier === RUNTIME_MODULE) return host.packageComponent(RUNTIME_MODULE, imported, module.file);
  const target = host.resolveModule(binding.specifier, module.file);
  if (target) {
    const cls = classForExport(target, imported, host, new Set());
    return cls ? resolveClass(cls.module, cls.record, host, visiting) : undefined;
  }
  if (!binding.specifier.startsWith(".")) return host.packageComponent(binding.specifier, imported, module.file);
  return undefined;
}

/** The class a module exports under `exported` (following re-exports). */
function classForExport(module: ModuleMetadata, exported: string, host: MetadataHost, seen: Set<string>): { module: ModuleMetadata; record: ClassRecord } | undefined {
  const declaration = declarationForExport(module, exported, host, seen);
  if (!declaration) return undefined;
  const record = declaration.module.classes.find((cls) => cls.name === declaration.local);
  return record ? { module: declaration.module, record } : undefined;
}

/** The module and local name an export of `module` is declared under. */
function declarationForExport(module: ModuleMetadata, exported: string, host: MetadataHost, seen: Set<string>): { module: ModuleMetadata; local: string } | undefined {
  if (seen.has(`${module.file}#${exported}`) || seen.size > MAX_DEPTH) return undefined;
  seen.add(`${module.file}#${exported}`);
  const local = module.exports.get(exported);
  if (local !== undefined) {
    // `export { X }` of an imported binding: follow the import.
    const binding = module.imports.get(local);
    if (binding && binding.imported !== "*" && !module.declarations.has(local) && !module.aliases.has(local)) {
      const target = host.resolveModule(binding.specifier, module.file);
      return target ? declarationForExport(target, binding.imported, host, seen) : undefined;
    }
    return { module, local };
  }
  for (const reexport of module.reexports) {
    const imported = reexport.names ? reexport.names.get(exported) : exported;
    if (imported === undefined) continue;
    const target = host.resolveModule(reexport.specifier, module.file);
    const found = target && declarationForExport(target, imported, host, seen);
    if (found) return found;
  }
  return undefined;
}

function resolveOwnParameter(own: OwnParameter, declaredBy: string, module: ModuleMetadata, typeParameters: ReadonlySet<string>, host: MetadataHost): ComponentParameter {
  const parameter: ComponentParameter = {
    name: own.name,
    category: "value",
    optional: own.questionToken,
    hasInitializer: own.initializer !== undefined,
    member: own.member,
    declaredBy,
  };
  if (own.initializer !== undefined) parameter.default = own.initializer;
  if (own.type !== undefined) {
    parameter.type = own.type;
    let references = referencesOf(own.type, module, typeParameters);
    if (own.synthesized?.role === "changed") {
      // The synthesized `EventCallback<T>` is the runtime's, whatever the module imports.
      references = [{ name: "EventCallback", kind: "runtime", imported: "EventCallback" }, ...references.filter((ref) => ref.name !== "EventCallback")];
    }
    if (references.length > 0) parameter.references = references;
  } else if (own.inferredType) {
    parameter.inferredType = own.inferredType;
  }
  if (own.cascading) parameter.cascading = own.cascading;
  if (own.doc) parameter.doc = own.doc;
  if (own.bindable) parameter.bindable = own.bindable;
  if (own.synthesized) parameter.synthesizedBy = own.synthesized.of;
  categorizeParameter(parameter, own, host);
  return parameter;
}

function categorizeParameter(parameter: ComponentParameter, own: Pick<OwnParameter, "captureUnmatchedValues" | "opaqueInitializer"> | undefined, host: MetadataHost): void {
  delete parameter.typeArgument;
  delete parameter.uncertain;
  delete parameter.delegate;
  if (parameter.type !== undefined) {
    const result = categorizeType(parameter.type, parameter.references ?? [], host);
    parameter.category = result.category;
    if (result.typeArgument !== undefined) parameter.typeArgument = result.typeArgument;
    if (result.uncertain) parameter.uncertain = true;
    if (result.delegate && result.category === "value") parameter.delegate = true;
    if (result.includesUndefined) parameter.optional = true;
  } else {
    parameter.category = parameter.inferredType === "string" ? "string" : "value";
    if (own?.opaqueInitializer) parameter.uncertain = true;
  }
  if (own?.captureUnmatchedValues || parameter.category === "captureUnmatchedValues") {
    parameter.category = "captureUnmatchedValues";
    delete parameter.typeArgument;
    delete parameter.uncertain;
    delete parameter.delegate;
  }
}

/** A base parameter seen through `extends Base<Args>`: the base's type parameters replaced by the arguments. */
function substituteParameter(
  parameter: ComponentParameter,
  typeParameters: readonly TypeParameterInfo[],
  args: ReadonlyArray<{ text: string; references: TypeReference[] }>,
  host: MetadataHost,
): ComponentParameter {
  const copy: ComponentParameter = { ...parameter };
  if (parameter.type === undefined || typeParameters.length === 0) return copy;
  const substitution = new Map<string, { text: string; references: TypeReference[] }>();
  typeParameters.forEach((typeParameter, index) => {
    const arg = args[index];
    if (arg) substitution.set(typeParameter.name, arg);
  });
  const used = (parameter.references ?? []).filter((ref) => ref.kind === "typeParameter" && substitution.has(ref.name));
  if (used.length === 0) return copy;
  copy.type = replaceIdentifiers(parameter.type, substitution);
  const references = (parameter.references ?? []).filter((ref) => !(ref.kind === "typeParameter" && substitution.has(ref.name)));
  for (const ref of used) {
    for (const argRef of substitution.get(ref.name)!.references) {
      if (!references.some((existing) => existing.name === argRef.name)) references.push(argRef);
    }
  }
  if (references.length > 0) copy.references = references;
  else delete copy.references;
  const wasCapture = parameter.category === "captureUnmatchedValues";
  categorizeParameter(copy, { captureUnmatchedValues: wasCapture }, host);
  return copy;
}

/**
 * Replaces identifier tokens (not property names after `.`) by replacement
 * texts — parenthesized where an operator binds tighter than a union would
 * (`T[]`, `T & X`, `keyof T`).
 */
export function replaceIdentifiers(text: string, substitution: ReadonlyMap<string, { text: string }>): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  let output = "";
  let last = 0;
  let previous = ts.SyntaxKind.Unknown;
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.Identifier && previous !== ts.SyntaxKind.DotToken) {
      const replacement = substitution.get(scanner.getTokenText());
      if (replacement) {
        const start = scanner.getTokenStart();
        const end = scanner.getTokenEnd();
        const simple = /^[\w$.]+(<.*>)?(\[\])*$/.test(replacement.text.trim());
        const tight =
          /^\s*[[&]/.test(text.slice(end)) ||
          /&\s*$/.test(text.slice(0, start)) ||
          previous === ts.SyntaxKind.KeyOfKeyword ||
          previous === ts.SyntaxKind.ReadonlyKeyword;
        output += text.slice(last, start) + (simple || !tight ? replacement.text : `(${replacement.text})`);
        last = end;
      }
    }
    previous = token;
  }
  return output + text.slice(last);
}

/** Root identifiers of a type text and their bindings in `module`. */
export function referencesOf(text: string, module: ModuleMetadata, typeParameters: ReadonlySet<string>): TypeReference[] {
  const node = parseType(text);
  if (!node) return [];
  const names: string[] = [];
  const declared = new Set<string>();
  const visit = (current: ts.Node): void => {
    if (ts.isTypeParameterDeclaration(current)) declared.add(current.name.text);
    if (ts.isInferTypeNode(current)) declared.add(current.typeParameter.name.text);
    let root: ts.Node | undefined;
    if (ts.isTypeReferenceNode(current)) root = current.typeName;
    else if (ts.isTypeQueryNode(current)) root = current.exprName;
    else if (ts.isExpressionWithTypeArguments(current)) root = current.expression;
    while (root && (ts.isQualifiedName(root) || ts.isPropertyAccessExpression(root))) root = ts.isQualifiedName(root) ? root.left : root.expression;
    if (root && ts.isIdentifier(root) && !names.includes(root.text)) names.push(root.text);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return names.filter((name) => !declared.has(name)).map((name) => bindingOf(name, module, typeParameters));
}

function bindingOf(name: string, module: ModuleMetadata, typeParameters: ReadonlySet<string>): TypeReference {
  if (typeParameters.has(name)) return { name, kind: "typeParameter" };
  const binding = module.imports.get(name);
  if (binding) {
    if (binding.imported !== "*" && isRuntimeSpecifier(module, binding.specifier)) return { name, kind: "runtime", imported: binding.imported };
    if (binding.imported === "*" && binding.specifier === RUNTIME_MODULE) return { name, kind: "runtime", imported: "*" };
    return { name, kind: "import", specifier: binding.specifier, imported: binding.imported, file: module.file };
  }
  if (module.aliases.has(name) || module.declarations.has(name)) return { name, kind: "local", file: module.file };
  return { name, kind: "global" };
}

const typeCache = new Map<string, ts.TypeNode | undefined>();

function parseType(text: string): ts.TypeNode | undefined {
  if (typeCache.has(text)) return typeCache.get(text);
  const file = ts.createSourceFile("type.ts", `type __tsazor_T = ${text};`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const statement = file.statements[0];
  const node = statement && ts.isTypeAliasDeclaration(statement) ? statement.type : undefined;
  if (typeCache.size > 2000) typeCache.clear();
  typeCache.set(text, node);
  return node;
}

interface Categorized {
  category: ParameterCategory;
  typeArgument?: string;
  uncertain?: boolean;
  /** The (union) type includes `undefined` (or `void`). */
  includesUndefined?: boolean;
  /** A function type (not a RenderFragment<T>): see ComponentParameter.delegate. */
  delegate?: boolean;
}

/** Categorizes a type text given the bindings of its root identifiers (see ParameterCategory). */
export function categorizeType(text: string, references: readonly TypeReference[], host: MetadataHost): Categorized {
  const node = parseType(text);
  if (!node) return { category: "value", uncertain: true };
  const scope = new Map(references.map((ref) => [ref.name, ref]));
  return categorizeNode(node, scope, host, 0);
}

function categorizeNode(node: ts.TypeNode, scope: ReadonlyMap<string, TypeReference>, host: MetadataHost, depth: number): Categorized {
  if (depth > MAX_DEPTH) return { category: "value", uncertain: true };
  if (ts.isParenthesizedTypeNode(node)) return categorizeNode(node.type, scope, host, depth + 1);
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    let includesUndefined = false;
    const members: Categorized[] = [];
    for (const member of node.types) {
      if (isNullish(member)) {
        if (member.kind === ts.SyntaxKind.UndefinedKeyword || member.kind === ts.SyntaxKind.VoidKeyword) includesUndefined = true;
        continue;
      }
      const categorized = categorizeNode(member, scope, host, depth + 1);
      if (categorized.includesUndefined) includesUndefined = true;
      members.push(categorized);
    }
    // Precedence: EventCallback, RenderFragment<T>, RenderFragment, string, value.
    const order: ParameterCategory[] = ["EventCallback<T>", "EventCallback", "RenderFragment<T>", "RenderFragment", "string"];
    const pick = order.map((category) => members.find((m) => m.category === category)).find((m) => m !== undefined);
    const result: Categorized = pick ? { ...pick } : { category: "value" };
    if (!pick && members.some((m) => m.uncertain)) result.uncertain = true;
    // A delegate only when every non-nullish member is one (`((x) => boolean) | undefined`).
    if (!pick && members.length > 0 && ts.isUnionTypeNode(node) && members.every((m) => m.delegate)) result.delegate = true;
    else delete result.delegate;
    if (includesUndefined && ts.isUnionTypeNode(node)) result.includesUndefined = true;
    else delete result.includesUndefined;
    return result;
  }
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
    case ts.SyntaxKind.TemplateLiteralType:
      return { category: "string" };
    case ts.SyntaxKind.UndefinedKeyword:
    case ts.SyntaxKind.VoidKeyword:
      return { category: "value", includesUndefined: true };
  }
  if (ts.isLiteralTypeNode(node)) return { category: ts.isStringLiteral(node.literal) ? "string" : "value" };
  if (ts.isFunctionTypeNode(node)) {
    const returns = categorizeNode(node.type, scope, host, depth + 1);
    const first = node.parameters[0];
    if (returns.category === "RenderFragment" && first) return { category: "RenderFragment<T>", typeArgument: first.type?.getText() ?? "unknown" };
    return { category: "value", delegate: true };
  }
  if (ts.isTypeReferenceNode(node)) {
    const typeArguments = node.typeArguments ?? [];
    let root: ts.EntityName = node.typeName;
    let member: string | undefined;
    if (ts.isQualifiedName(root)) {
      member = root.right.text;
      root = root.left;
      if (!ts.isIdentifier(root)) return { category: "value", uncertain: true };
    }
    const ref = scope.get(root.text) ?? { name: root.text, kind: "global" as const };
    const name = member ?? ref.imported;
    if (ref.kind === "runtime") {
      const exported = ref.imported === "*" ? member : member === undefined ? ref.imported : undefined;
      return runtimeCategory(exported, typeArguments);
    }
    if (ref.kind === "typeParameter" || ref.kind === "global") return { category: "value" };
    if (ref.kind === "local" && member === undefined && ref.file) {
      const module = host.moduleAt(ref.file);
      return module ? categorizeDeclared(module, root.text, typeArguments, scope, host, depth) : { category: "value", uncertain: true };
    }
    if (ref.kind === "import" && ref.specifier && ref.file && name !== undefined) {
      const exported = ref.imported === "*" ? member : member === undefined ? ref.imported : undefined;
      if (exported === undefined) return { category: "value", uncertain: true };
      const target = host.resolveModule(ref.specifier, ref.file);
      const declaration = target && declarationForExport(target, exported, host, new Set());
      if (!declaration) return { category: "value", uncertain: true };
      // A re-export of a runtime name (`export { EventCallback } from "@tsazor/runtime"`).
      return categorizeDeclared(declaration.module, declaration.local, typeArguments, scope, host, depth);
    }
    return { category: "value", uncertain: true };
  }
  return { category: "value" };
}

function runtimeCategory(exported: string | undefined, typeArguments: readonly ts.TypeNode[]): Categorized {
  if (exported === "EventCallback") return typeArguments[0] ? { category: "EventCallback<T>", typeArgument: typeArguments[0].getText() } : { category: "EventCallback" };
  if (exported === "RenderFragment") return typeArguments[0] ? { category: "RenderFragment<T>", typeArgument: typeArguments[0].getText() } : { category: "RenderFragment" };
  return { category: "value" };
}

/** A name declared (or imported) in `module`: an alias is categorized by its body, a class/interface/enum is a value. */
function categorizeDeclared(
  module: ModuleMetadata,
  local: string,
  typeArguments: readonly ts.TypeNode[],
  scope: ReadonlyMap<string, TypeReference>,
  host: MetadataHost,
  depth: number,
): Categorized {
  const binding = module.imports.get(local);
  if (binding && !module.aliases.has(local) && !module.declarations.has(local)) {
    // An import re-exported by name: categorize it as the importing module sees it.
    const ref = bindingOf(local, module, new Set());
    const node = parseType(local + (typeArguments.length > 0 ? `<${typeArguments.map((a) => a.getText()).join(", ")}>` : ""));
    const argScope = new Map(scope);
    argScope.set(local, ref);
    return node ? categorizeNode(node, argScope, host, depth + 1) : { category: "value", uncertain: true };
  }
  const alias = module.aliases.get(local);
  if (!alias) return { category: "value", uncertain: !module.declarations.has(local) };
  const aliasTypeParameters = new Set(alias.typeParameters);
  let text = alias.type;
  let references = referencesOf(text, module, aliasTypeParameters);
  if (alias.typeParameters.length > 0 && typeArguments.length > 0) {
    const substitution = new Map<string, { text: string }>();
    alias.typeParameters.forEach((name, index) => {
      const arg = typeArguments[index];
      if (arg) substitution.set(name, { text: arg.getText() });
    });
    text = replaceIdentifiers(text, substitution);
    references = references.filter((ref) => !(ref.kind === "typeParameter" && substitution.has(ref.name)));
    for (const arg of typeArguments) {
      for (const name of rootNames(arg)) {
        const ref = scope.get(name);
        if (ref && !references.some((existing) => existing.name === name)) references.push(ref);
      }
    }
  }
  const node = parseType(text);
  return node ? categorizeNode(node, new Map(references.map((ref) => [ref.name, ref])), host, depth + 1) : { category: "value", uncertain: true };
}

function rootNames(node: ts.Node): string[] {
  const names: string[] = [];
  const visit = (current: ts.Node): void => {
    let root: ts.Node | undefined = ts.isTypeReferenceNode(current) ? current.typeName : ts.isTypeQueryNode(current) ? current.exprName : undefined;
    while (root && ts.isQualifiedName(root)) root = root.left;
    if (root && ts.isIdentifier(root) && !names.includes(root.text)) names.push(root.text);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return names;
}

function isNullish(node: ts.TypeNode): boolean {
  if (node.kind === ts.SyntaxKind.UndefinedKeyword || node.kind === ts.SyntaxKind.VoidKeyword || node.kind === ts.SyntaxKind.NullKeyword) return true;
  return ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword;
}
