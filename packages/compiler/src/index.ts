export { compile, type CompileOptions, type CompileResult } from "./compile.js";
export { codemodSource, applyTextEdits, blankCodeBlocks, apiFormEdits, type CodemodResult } from "./codemod.js";
export { parseDocument } from "./parser.js";
export { generateCode, type CodegenOptions, type CodegenResult, type ResolvedComponent, type ResolvedType, type MapEntry, type TypedTagInferenceRequest, type UninferredTypeArguments } from "./codegen.js";
export {
  DiagnosticBag,
  type TszDiagnostic,
  type SourcePos,
  type SourceRange,
  type TextEdit,
  type DiagnosticFix,
  type DiagnosticCode,
  DIAGNOSTIC_MESSAGES,
} from "./diagnostics.js";
export { DIAGNOSTIC_CATALOG, RETIRED_DIAGNOSTIC_CODES, type DiagnosticInfo } from "./diagnostic-catalog.js";
export { buildSourceMap, type SourceMapEntry } from "./source-map.js";
export { explainExpressionValue, type ExpressionValue } from "./expression-values.js";
export { unresolvedName, type ImportSuggestion } from "./import-suggestions.js";
export { explainTypeScriptError } from "./ts-hints.js";
export { RESERVED_MEMBERS, OVERRIDABLE_MEMBERS } from "./reserved-members.js";
export { inheritedAuthorizationOf, type AuthorizeRequirement, type InheritedAuthorization } from "./attributes.js";
export { parseImportDirective, importStatements, scanModuleExports, type ImportInfo, type ImportBinding, type ParsedImport, type ModuleExports } from "./imports.js";
export {
  extractModuleMetadata,
  extractTsazorMetadata,
  resolveComponentMetadata,
  categorizeType,
  referencesOf,
  RUNTIME_MODULE,
  type ParameterCategory,
  type ComponentParameter,
  type ComponentMethod,
  type ComponentMetadata,
  type ComponentManifest,
  type TypeReference,
  type TypeParameterInfo,
  type ModuleMetadata,
  type ModuleBinding,
  type ClassRecord,
  type OwnParameter,
  type MetadataHost,
  type ExtractOptions,
  type ExtractTsazorOptions,
} from "./metadata.js";
export { TSScanner } from "./scanner.js";
export type * from "./ast.js";
export { childNodes } from "./ast.js";
export { scopeSelector } from "./scoped-css.js";
export { bindableMembers, bindablePairs, type BindableMember, type BindablePair } from "./bindable.js";
export { advancePos } from "./writer.js";
export { inferTypeArgument } from "./typed-inference.js";
