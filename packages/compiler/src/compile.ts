import type { DocumentNode } from "./ast.js";
import { DiagnosticBag } from "./diagnostics.js";
import { generateCode, type CodegenOptions, type CodegenResult, type MapEntry, type TextBindRequest, type TypedTagInferenceRequest, type UninferredTypeArguments } from "./codegen.js";
import { parseDocument } from "./parser.js";
import { buildSourceMap } from "./source-map.js";
import type { ExpressionValue } from "./expression-values.js";
import type { ImportSuggestion } from "./import-suggestions.js";

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
  /** B46: the element value binds that convert by the bound value's type (typed-shadow builds only). */
  textBinds?: readonly TextBindRequest[];
  /** The generic tags with open type arguments (typed-shadow builds only). */
  uninferredTypeArguments?: readonly UninferredTypeArguments[];
  /** 2.4: plain-text values read as expressions (typed-shadow builds only). */
  expressionValues?: readonly ExpressionValue[];
  /** F29: the `@import` each unbound name in `@code` would need (typed-shadow builds only). */
  importSuggestions?: readonly ImportSuggestion[];
}

/** Compiles one .tsazor source file into a TS module (+ sourcemap, + diagnostics). */
export function compile(source: string, options: CompileOptions): CompileResult {
  const diagnostics = new DiagnosticBag();
  const document: DocumentNode = parseDocument(source, diagnostics);
  const { code, metadata, mappings, typedInference, textBinds, uninferredTypeArguments, expressionValues, importSuggestions } = generateCode(document, options, diagnostics);
  const result: CompileResult = {
    code,
    diagnostics,
    metadata,
    mappings,
    ...(typedInference !== undefined ? { typedInference } : {}),
    ...(textBinds !== undefined ? { textBinds } : {}),
    ...(uninferredTypeArguments !== undefined ? { uninferredTypeArguments } : {}),
    ...(expressionValues !== undefined ? { expressionValues } : {}),
    ...(importSuggestions !== undefined ? { importSuggestions } : {}),
  };
  if (options.generateSourceMap !== false) {
    const sourceFile = options.fileName ?? "component.tsazor";
    result.map = buildSourceMap(mappings, sourceFile, `${options.className}.ts`, source);
  }
  return result;
}