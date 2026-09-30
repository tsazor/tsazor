export { compile, type CompileOptions, type CompileResult } from "./compile.js";
export { parseDocument } from "./parser.js";
export { generateCode, type CodegenOptions, type CodegenResult, type ResolvedComponent, type ResolvedType, type MapEntry } from "./codegen.js";
export { DiagnosticBag, type TszDiagnostic, type SourcePos, type DiagnosticCode } from "./diagnostics.js";
export { buildSourceMap, type SourceMapEntry } from "./source-map.js";
export { parseImportDirective, importStatements, scanModuleExports, type ImportInfo, type ImportBinding, type ParsedImport, type ModuleExports } from "./imports.js";
export { TSScanner } from "./scanner.js";
export type * from "./ast.js";
export { childNodes } from "./ast.js";