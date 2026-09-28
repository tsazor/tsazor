import { addMapping, GenMapping, toEncodedMap } from "@jridgewell/gen-mapping";
import { eachMapping, originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import path from "node:path";

/**
 * Chains two sourcemaps: `outer` maps generated JS → intermediate TS, and
 * `inner` maps the intermediate TS → the original .tazor. The result maps
 * generated JS → .tazor directly.
 */
export function chainSourceMaps(tazorMap: string, esbuildMap: string, tazorPath: string, generatedFile: string): string {
  const inner = new TraceMap(tazorMap);
  const outer = new TraceMap(esbuildMap);
  const gen = new GenMapping({ file: generatedFile });

  eachMapping(outer, (mapping) => {
    if (mapping.source === null || mapping.originalLine === null || mapping.originalColumn === null) return;
    const original = originalPositionFor(inner, { line: mapping.originalLine, column: mapping.originalColumn });
    if (original.line === null || original.column === null) return;
    addMapping(gen, {
      generated: { line: mapping.generatedLine, column: mapping.generatedColumn },
      original: { line: original.line, column: original.column },
      source: tazorPath,
    });
  });

  const encoded = toEncodedMap(gen) as unknown as {
    sources: Array<string | null>;
    mappings: string;
    names?: string[];
  };
  const sources = (encoded.sources.length > 0 ? encoded.sources : [tazorPath]).map((source) =>
    path.relative(path.dirname(tazorPath), path.resolve(source ?? tazorPath)).replace(/\\/g, "/"),
  );
  return JSON.stringify({
    version: 3,
    file: generatedFile,
    sources,
    sourcesContent: null,
    names: encoded.names ?? [],
    mappings: encoded.mappings,
  });
}