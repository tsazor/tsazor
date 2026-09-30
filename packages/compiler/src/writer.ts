import type { SourceMapEntry } from "./source-map.js";

/**
 * A source anchor inside one emitted text: the generated character at
 * `offset` (0-based, relative to the text passed to `CodeWriter.line`) maps to
 * the .tsazor position `srcLine` (0-based) / `srcCol` (0-based). Consumers
 * continue a mapping linearly to the right until the next anchor, so an anchor
 * is needed wherever generated and source text stop running in parallel.
 */
export interface WriterAnchor {
  offset: number;
  srcLine: number;
  srcCol: number;
}

/**
 * Line-aware code writer: the single place generated text and its mapping
 * entries are recorded. Text may contain embedded newlines (multi-line
 * expressions, verbatim @code); the writer splits it into lines and resolves
 * every anchor offset to its real generated line/column, so no later mapping
 * drifts (review C10).
 *
 * Entry conventions are those of SourceMapEntry: `genLine` 1-based, `genCol`
 * 0-based, `srcLine` 0-based, `srcCol` 0-based. Entries keep registration
 * order (the LSP's stable sort relies on it: a statement anchor registered
 * before a token anchor at the same column lets the token win).
 */
export class CodeWriter {
  private readonly lines: string[] = [];
  private entries: SourceMapEntry[] = [];

  /** Number of complete lines written so far (= 1-based line of the last one). */
  get lineCount(): number {
    return this.lines.length;
  }

  /** Appends `text` as one or more complete lines, recording its anchors. */
  line(text: string, anchors: readonly WriterAnchor[] = []): void {
    const firstLine = this.lines.length + 1;
    const parts = text.split("\n");
    for (const part of parts) this.lines.push(part);
    if (anchors.length === 0) return;
    // Start offset of every emitted line within `text`.
    const starts: number[] = [];
    let offset = 0;
    for (const part of parts) {
      starts.push(offset);
      offset += part.length + 1;
    }
    for (const anchor of anchors) {
      let index = 0;
      while (index + 1 < starts.length && starts[index + 1]! <= anchor.offset) index++;
      const entry = {
        genLine: firstLine + index,
        genCol: anchor.offset - starts[index]!,
        srcLine: anchor.srcLine,
        srcCol: anchor.srcCol,
      };
      // Two producers may anchor the same spot (e.g. a line's first content
      // that is also a token) — keep one.
      const last = this.entries[this.entries.length - 1];
      if (
        last !== undefined && last.genLine === entry.genLine && last.genCol === entry.genCol &&
        last.srcLine === entry.srcLine && last.srcCol === entry.srcCol
      ) continue;
      this.entries.push(entry);
    }
  }

  /**
   * Inserts lines before the 0-based line index `at` (e.g. a header whose
   * content is only known after the body was emitted). Entries on the
   * shifted lines move with them.
   */
  insertLines(at: number, texts: readonly string[]): void {
    const inserted = texts.flatMap((text) => text.split("\n"));
    this.lines.splice(at, 0, ...inserted);
    this.entries = this.entries.map((entry) =>
      entry.genLine > at ? { ...entry, genLine: entry.genLine + inserted.length } : entry,
    );
  }

  /** The mapping entries recorded so far, in registration order. */
  get mappings(): SourceMapEntry[] {
    return this.entries;
  }

  /** The generated code (newline-terminated). */
  toString(): string {
    return this.lines.join("\n") + "\n";
  }
}

/** Source position (1-based line, 0-based column — the AST convention) reached
 *  after reading `text` from `start`. */
export function advancePos(start: { line: number; column: number }, text: string): { line: number; column: number } {
  const lastNewline = text.lastIndexOf("\n");
  if (lastNewline < 0) return { line: start.line, column: start.column + text.length };
  let newlines = 0;
  for (let k = 0; k < text.length; k++) if (text[k] === "\n") newlines++;
  return { line: start.line + newlines, column: text.length - lastNewline - 1 };
}
