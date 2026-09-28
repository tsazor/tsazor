import type { DocumentNode } from "./ast";
import { DiagnosticBag } from "./diagnostics";
import { generateCode, type CodegenOptions, type CodegenResult } from "./codegen";
import { parseDocument } from "./parser";
import { buildSourceMap } from "./source-map";

export interface CompileOptions extends CodegenOptions {
  /** Disable sourcemap generation. */
  generateSourceMap?: boolean;
}

export interface CompileResult {
  code: string;
  map?: string;
  diagnostics: DiagnosticBag;
  metadata: CodegenResult["metadata"];
}

/** Compiles one .tazor source file into a TS module (+ sourcemap, + diagnostics). */
export function compile(source: string, options: CompileOptions): CompileResult {
  const diagnostics = new DiagnosticBag();
  const document: DocumentNode = parseDocument(source, diagnostics);
  const { code, metadata, mappings } = generateCode(document, options, diagnostics);
  const result: CompileResult = { code, diagnostics, metadata };
  if (options.generateSourceMap !== false) {
    const sourceFile = options.fileName ?? "component.tazor";
    result.map = buildSourceMap(mappings, sourceFile, `${options.className}.ts`);
  }
  return result;
}