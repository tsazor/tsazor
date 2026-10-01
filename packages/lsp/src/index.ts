/**
 * Library surface of the LSP package: the type service, the check pipeline
 * (2.4) and TS-feature helpers. The language server itself is `./server`.
 * (`server.js` must not be imported from library contexts — importing it
 * boots the stdio connection.)
 */
export { TsazorTypeService, shadowOffsetToPos, findTsazorFiles, type ShadowEntry, type GenPosition, type SourcePatch } from "./ts-service.js";
export { checkProject, type CheckResult, type CheckDiagnostic } from "./check.js";
export { tsDiagnostics, type TsDiagnostic } from "./ts-features.js";
export { analyzeSource, lspRange, type AnalyzedFile } from "./analysis.js";