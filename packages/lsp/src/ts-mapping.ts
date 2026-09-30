import type { SourceMapEntry } from "@tsazor/compiler";

/**
 * Position translation between a .tsazor file and its generated shadow module
 * (compile()'s raw per-statement `mappings`), for the LSP type layer.
 *
 * Conventions (source of truth: packages/compiler/src/{codegen,source-map}.ts):
 * entries carry `genLine` 1-based, `genCol` = 0-based column of the statement's
 * first content character, and `srcLine` 0-based with `srcCol` 0-based. This
 * class works in 0-based LSP positions on both sides. Deliberately no
 * trace-mapping here (its APIs take 1-based lines on top of an encoded map):
 * two sorted arrays keep the mapping exact, convention-proof and
 * dependency-free.
 */

export interface MappedSourcePos {
  line: number;
  character: number;
}

export interface MappedSourceSpan {
  start: MappedSourcePos;
  end: MappedSourcePos;
}

export class TsazorGenMap {
  private readonly byGen: SourceMapEntry[];
  private readonly bySrc: SourceMapEntry[];

  constructor(entries: readonly SourceMapEntry[]) {
    // Stable sort keeps registration order (statement entry before its token
    // entries at the same column — the later, token-precise one wins lookups).
    this.byGen = [...entries].sort(
      (a, b) => a.genLine - b.genLine || a.genCol - b.genCol,
    );
    this.bySrc = [...entries]
      .filter((e) => e.srcLine >= 0)
      .sort((a, b) => a.srcLine - b.srcLine || a.srcCol - b.srcCol);
  }

  /** Generated position → .tsazor position (0-based), or null when the
   *  generated line has no mapping of its own (synthetic header/plumbing). */
  genToSrc(line0: number, character0: number): MappedSourcePos | null {
    const entry = this.findGen(line0, character0);
    return entry ? { line: entry.srcLine, character: entry.srcCol + (character0 - entry.genCol) } : null;
  }

  /** Generated token range → .tsazor range (0-based, half-open). */
  genToSpan(line0: number, start0: number, end0: number): MappedSourceSpan | null {
    const entry = this.findGen(line0, start0);
    if (!entry) return null;
    return {
      start: { line: entry.srcLine, character: entry.srcCol + (start0 - entry.genCol) },
      end: { line: entry.srcLine, character: entry.srcCol + (end0 - entry.genCol) },
    };
  }

  /** .tsazor position → generated position (0-based), or null beyond any
   *  mapped region. Column offsets stay accurate inside verbatim @code lines
   *  and, thanks to the compiler's token-precise entries, inside expressions. */
  srcToGen(line0: number, character0: number): { line: number; column: number } | null {
    const entry = this.findSrc(line0, character0);
    if (!entry) return null;
    return { line: entry.genLine - 1, column: entry.genCol + (character0 - entry.srcCol) };
  }

  /** Last entry on the given 0-based generated line at-or-left of the column. */
  private findGen(line0: number, character0: number): SourceMapEntry | null {
    const genLine = line0 + 1;
    let best: SourceMapEntry | null = null;
    for (const entry of this.byGen) {
      if (entry.genLine < genLine) continue;
      if (entry.genLine > genLine) break;
      if (entry.genCol <= character0) best = entry;
      else break;
    }
    return best;
  }

  /** Last entry on the given 0-based source line at-or-left of the column. */
  private findSrc(line0: number, character0: number): SourceMapEntry | null {
    let best: SourceMapEntry | null = null;
    for (const entry of this.bySrc) {
      if (entry.srcLine < line0) continue;
      if (entry.srcLine > line0) break;
      if (entry.srcCol <= character0) best = entry;
      else break;
    }
    return best;
  }
}