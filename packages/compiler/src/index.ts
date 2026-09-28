export { compile, type CompileOptions, type CompileResult } from "./compile";
export { parseDocument } from "./parser";
export { generateCode, type CodegenOptions, type CodegenResult, type ResolvedComponent, type ResolvedType } from "./codegen";
export { DiagnosticBag, type TzrDiagnostic, type SourcePos, type DiagnosticCode } from "./diagnostics";
export { buildSourceMap } from "./source-map";
export { TSScanner } from "./scanner";
export type * from "./ast";