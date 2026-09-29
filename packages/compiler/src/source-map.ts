import { GenMapping, addMapping, toEncodedMap } from "@jridgewell/gen-mapping";

export interface SourceMapEntry {
  genLine: number; // 1-based
  genCol: number;
  srcLine: number; // 0-based (sourcemap convention)
  srcCol: number;
}

/**
 * Builds a standard v3 sourcemap from per-statement mappings (codegen emits
 * one entry per builder call; @code lines map to their original lines).
 */
export function buildSourceMap(entries: SourceMapEntry[], sourceFile: string, generatedFile: string): string {
  const map = new GenMapping({ file: generatedFile });
  for (const entry of entries) {
    // Conventions (verified empirically against @jridgewell/gen-mapping and
    // trace-mapping 0.3.x): addMapping expects 1-based lines on BOTH axes and
    // encodes them into the v3 map's 0-based format; trace-mapping's
    // originalPositionFor/generatedPositionFor also take 1-based lines.
    // SourceMapEntry.genLine is 1-based — as-is; srcLine is 0-based → +1.
    addMapping(map, {
      generated: { line: entry.genLine, column: entry.genCol },
      original: { line: entry.srcLine + 1, column: entry.srcCol },
      source: sourceFile,
    });
  }
  const encoded = toEncodedMap(map) as unknown as {
    sources: Array<string | null>;
    mappings: string;
    file?: string;
    names?: string[];
  };
  return JSON.stringify({
    version: 3,
    file: generatedFile,
    sources: encoded.sources.length > 0 ? encoded.sources : [sourceFile],
    sourcesContent: null,
    names: encoded.names ?? [],
    mappings: encoded.mappings,
  });
}