import type { DocumentNode } from "./ast.js";
import { DiagnosticBag } from "./diagnostics.js";
import { generateCode, type CodegenOptions, type CodegenResult, type MapEntry, type TypedTagInferenceRequest } from "./codegen.js";
import { parseDocument } from "./parser.js";
import { buildSourceMap } from "./source-map.js";

export interface CompileOptions extends CodegenOptions {
  /** Disable sourcemap generation. */
  generateSourceMap?: boolean;
}

export interface CompileResult {
  code: string;
  map?: string;
  /** Per-statement mapping entries behind `map` (raw, unencoded) — consumed by
   *  position-aware tooling (LSP) to build its own correctly-normalized maps. */
  mappings?: readonly MapEntry[];
  diagnostics: DiagnosticBag;
  metadata: CodegenResult["metadata"];
  /** 2.4: tag-level `TItem` inference requests (typed-shadow builds only). */
  typedInference?: readonly TypedTagInferenceRequest[];
}

/** Compiles one .tsazor source file into a TS module (+ sourcemap, + diagnostics). */
export function compile(source: string, options: CompileOptions): CompileResult {
  const diagnostics = new DiagnosticBag();
  const document: DocumentNode = parseDocument(source, diagnostics);
  const { code, metadata, mappings, typedInference } = generateCode(document, options, diagnostics);
  const result: CompileResult = {
    code,
    diagnostics,
    metadata,
    mappings,
    ...(typedInference !== undefined ? { typedInference } : {}),
  };
  if (options.generateSourceMap !== false) {
    const sourceFile = options.fileName ?? "component.tsazor";
    result.map = buildSourceMap(mappings, sourceFile, `${options.className}.ts`, source);
  }
  return result;
}