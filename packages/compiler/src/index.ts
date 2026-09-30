export { compile, type CompileOptions, type CompileResult } from "./compile";
export { parseDocument } from "./parser";
export { generateCode, type CodegenOptions, type CodegenResult, type ResolvedComponent, type ResolvedType, type MapEntry } from "./codegen";
export { DiagnosticBag, type TszDiagnostic, type SourcePos, type DiagnosticCode } from "./diagnostics";
export { buildSourceMap, type SourceMapEntry } from "./source-map";
export { TSScanner } from "./scanner";
export type * from "./ast";