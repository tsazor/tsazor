import { addMapping, GenMapping, toEncodedMap } from "@jridgewell/gen-mapping";
import { eachMapping, originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import path from "node:path";

/**
 * Chains two sourcemaps: `outer` maps generated JS → intermediate TS, and
 * `inner` maps the intermediate TS → the original .tsazor. The result maps
 * generated JS → .tsazor directly.
 */
export function chainSourceMaps(tsazorMap: string, esbuildMap: string, tsazorPath: string, generatedFile: string): string {
  const inner = new TraceMap(tsazorMap);
  const outer = new TraceMap(esbuildMap);
  const gen = new GenMapping({ file: generatedFile });

  eachMapping(outer, (mapping) => {
    if (mapping.source === null || mapping.originalLine === null || mapping.originalColumn === null) return;
    const original = originalPositionFor(inner, { line: mapping.originalLine, column: mapping.originalColumn });
    if (original.line === null || original.column === null) return;
    addMapping(gen, {
      generated: { line: mapping.generatedLine, column: mapping.generatedColumn },
      original: { line: original.line, column: original.column },
      source: tsazorPath,
    });
  });

  const encoded = toEncodedMap(gen) as unknown as {
    sources: Array<string | null>;
    mappings: string;
    names?: string[];
  };
  const sources = (encoded.sources.length > 0 ? encoded.sources : [tsazorPath]).map((source) =>
    path.relative(path.dirname(tsazorPath), path.resolve(source ?? tsazorPath)).replace(/\\/g, "/"),
  );
  return JSON.stringify({
    version: 3,
    file: generatedFile,
    sources,
    // The .tsazor text travels with the compiler's map (single source).
    sourcesContent: inner.sourcesContent?.[0] != null ? [inner.sourcesContent[0]] : null,
    names: encoded.names ?? [],
    mappings: encoded.mappings,
  });
}