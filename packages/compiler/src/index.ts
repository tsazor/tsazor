export { compile, type CompileOptions, type CompileResult } from "./compile.js";
export { parseDocument } from "./parser.js";
export { generateCode, type CodegenOptions, type CodegenResult, type ResolvedComponent, type ResolvedType, type MapEntry } from "./codegen.js";
export {
  DiagnosticBag,
  type TszDiagnostic,
  type SourcePos,
  type SourceRange,
  type TextEdit,
  type DiagnosticFix,
  type DiagnosticCode,
} from "./diagnostics.js";
export { buildSourceMap, type SourceMapEntry } from "./source-map.js";
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