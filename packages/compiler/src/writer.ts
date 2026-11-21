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
    appendEntries(this.entries, firstLine, parts, anchors);
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

  /**
   * Inserts texts with their anchors before the 0-based line index `at` (H2:
   * values evaluated ahead of a row whose body was emitted first). Entries
   * on the shifted lines move with them; the inserted entries are placed
   * before those, in line order.
   */
  insertAnchoredLines(at: number, items: ReadonlyArray<{ text: string; anchors: readonly WriterAnchor[] }>): void {
    const lines: string[] = [];
    const inserted: SourceMapEntry[] = [];
    for (const item of items) {
      const parts = item.text.split("\n");
      appendEntries(inserted, at + lines.length + 1, parts, item.anchors);
      lines.push(...parts);
    }
    this.lines.splice(at, 0, ...lines);
    let index = this.entries.length;
    this.entries = this.entries.map((entry, i) => {
      if (entry.genLine <= at) return entry;
      if (i < index) index = i;
      return { ...entry, genLine: entry.genLine + lines.length };
    });
    this.entries.splice(index, 0, ...inserted);
  }

  /**
   * Inserts `text` into the written 1-based `line` at `column` (H4: a
   * fragment's cache slot, known only once its body was emitted). Entries
   * on that line at or right of `column` move with the text.
   */
  insertText(line: number, column: number, text: string): void {
    const current = this.lines[line - 1]!;
    this.lines[line - 1] = current.slice(0, column) + text + current.slice(column);
    this.entries = this.entries.map((entry) =>
      entry.genLine === line && entry.genCol >= column ? { ...entry, genCol: entry.genCol + text.length } : entry,
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

/**
 * Records the anchors of a text whose lines (`parts`) start at the 1-based
 * `firstLine`: each anchor offset resolves to its real line and column.
 */
function appendEntries(entries: SourceMapEntry[], firstLine: number, parts: readonly string[], anchors: readonly WriterAnchor[]): void {
  if (anchors.length === 0) return;
  // Start offset of every line within the text.
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
    const last = entries[entries.length - 1];
    if (
      last !== undefined && last.genLine === entry.genLine && last.genCol === entry.genCol &&
      last.srcLine === entry.srcLine && last.srcCol === entry.srcCol
    ) continue;
    entries.push(entry);
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
