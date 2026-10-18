import type { SourcePos } from "./diagnostics.js";

/**
 * Mini-scanner over TS-like text spans. Razor never fully parses C#; the
 * equivalent job here is skipping strings, template literals, comments and
 * regex literals so that `{}`, `()` and `[]` balance correctly.
 */

const isIdStart = (ch: string): boolean => /[A-Za-z_$]/.test(ch);
const isIdPart = (ch: string): boolean => /[A-Za-z0-9_$]/.test(ch);

export class TSScanner {
  constructor(
    private readonly source: string,
    /** Maps an absolute index to a SourcePos (used for diagnostics). */
    private readonly locate: (index: number) => SourcePos,
  ) {}

  /** Scans a balanced region from `index` (on the open char) and returns the index after the close.
   *  `allowRegex` should be false when the region may contain plain markup text (a `/` there is not a regex). */
  scanBalanced(index: number, open: string, close: string, allowRegex = true): number {
    let depth = 0;
    let i = index;
    while (i < this.source.length) {
      const ch = this.source[i]!;
      if (ch === open) {
        depth++;
        i++;
      } else if (ch === close) {
        depth--;
        i++;
        if (depth === 0) return i;
      } else if (ch === '"' || ch === "'") {
        i = this.skipString(i, ch);
      } else if (ch === "`") {
        i = this.skipTemplate(i);
      } else if (ch === "/" && this.source[i + 1] === "/") {
        i = this.skipLineComment(i);
      } else if (ch === "/" && this.source[i + 1] === "*") {
        i = this.skipBlockComment(i);
      } else if (allowRegex && ch === "/" && this.regexAllowedBefore(i)) {
        i = this.skipRegex(i);
      } else {
        i++;
      }
    }
    return -1; // unbalanced
  }

  /** Scans an implicit expression: identifier plus .-chains, calls and indexers. */
  scanImplicitExpression(index: number): number {
    let i = index;
    if (!isIdPart(this.source[i] ?? "")) return index;
    i++;
    while (i < this.source.length && isIdPart(this.source[i]!)) i++;
    for (;;) {
      const ch = this.source[i];
      const next = this.source[i + 1];
      if (ch === "." && isIdStart(next ?? "")) {
        i += 2;
        i = this.eatIdentifier(i);
      } else if (ch === "?" && next === ".") {
        // Optional chaining `?.`: member access, `?.(` call or `?.[` indexer.
        // A bare `??` (nullish coalescing) must still terminate (Blazor parity).
        const after = this.source[i + 2];
        if (after === "(") {
          const nextIdx = this.scanBalanced(i + 2, "(", ")");
          if (nextIdx < 0) return i;
          i = nextIdx;
        } else if (after === "[") {
          const nextIdx = this.scanBalanced(i + 2, "[", "]");
          if (nextIdx < 0) return i;
          i = nextIdx;
        } else if (isIdStart(after ?? "")) {
          i += 3;
          i = this.eatIdentifier(i);
        } else {
          break;
        }
      } else if (ch === "!" && (next === "." || next === "[" || next === "(" || next === "?")) {
        // Postfix non-null assertion when an access continues: `a!.b`, `a![0]`,
        // `a!(x)`, `a?.b`. A lone `!` without continuation stays markup text
        // (Razor parity: `@flag!` renders `flag` + `!`).
        i++;
      } else if (ch === "(") {
        const next = this.scanBalanced(i, "(", ")");
        if (next < 0) return i;
        i = next;
      } else if (ch === "[") {
        const next = this.scanBalanced(i, "[", "]");
        if (next < 0) return i;
        i = next;
      } else {
        break;
      }
    }
    return i;
  }

  private eatIdentifier(i: number): number {
    while (i < this.source.length && isIdPart(this.source[i]!)) i++;
    return i;
  }

  private skipString(index: number, quote: string): number {
    return this.skipStringFor(index, quote);
  }

  /** Public: skips a quoted string starting at `index` (on the quote char). */
  skipStringFor(index: number, quote: string): number {
    let i = index + 1;
    while (i < this.source.length) {
      const ch = this.source[i]!;
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) return i + 1;
      if (ch === "\n") return i + 1; // unterminated single-line string: bail
      i++;
    }
    return i;
  }

  /** The end of the template literal whose backtick is at `index` (after its closing backtick), or -1 when it never closes. */
  scanTemplateLiteral(index: number): number {
    const end = this.skipTemplate(index);
    return end > index + 1 && this.source[end - 1] === "`" ? end : -1;
  }

  private skipTemplate(index: number): number {
    let i = index + 1;
    while (i < this.source.length) {
      const ch = this.source[i]!;
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "`") return i + 1;
      if (ch === "$" && this.source[i + 1] === "{") {
        // Nested interpolation: balance its braces (strings inside included).
        i += 2;
        let depth = 1;
        while (i < this.source.length && depth > 0) {
          const c = this.source[i]!;
          if (c === '"' || c === "'") {
            i = this.skipString(i, c);
            continue;
          }
          if (c === "`") {
            i = this.skipTemplate(i);
            continue;
          }
          if (c === "{") depth++;
          else if (c === "}") depth--;
          i++;
        }
        continue;
      }
      if (ch === "\n") {
        i++;
        continue; // template literals span lines
      }
      i++;
    }
    return i;
  }

  private skipLineComment(index: number): number {
    const nl = this.source.indexOf("\n", index);
    return nl < 0 ? this.source.length : nl + 1;
  }

  private skipBlockComment(index: number): number {
    const end = this.source.indexOf("*/", index + 2);
    return end < 0 ? this.source.length : end + 2;
  }

  private skipRegex(index: number): number {
    let i = index + 1;
    let inClass = false;
    while (i < this.source.length) {
      const ch = this.source[i]!;
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "[") inClass = true;
      else if (ch === "]") inClass = false;
      else if (ch === "/" && !inClass) {
        i++;
        while (i < this.source.length && /[a-z]/.test(this.source[i]!)) i++; // flags
        return i;
      }
      if (ch === "\n") return i + 1; // regexes never span lines; bail
      i++;
    }
    return i;
  }

  /** Heuristic: a `/` starts a regex unless the previous token suggests division. */
  private regexAllowedBefore(index: number): boolean {
    let i = index - 1;
    while (i >= 0 && /\s/.test(this.source[i]!)) i--;
    if (i < 0) return true;
    const prev = this.source[i]!;
    // An identifier or literal right before `/` means division.
    if (isIdPart(prev) || prev === ")" || prev === "]" || prev === '"' || prev === "'") return false;
    return true;
  }

  /** Line/column (1-based line) for an absolute index. */
  posAt(index: number): SourcePos {
    return this.locate(index);
  }
}

/** Scans a balanced `{ … }` region; returns the index after the closing brace. */
export function scanBalanced(source: string, index: number, open: string, close: string): number {
  return new TSScanner(source, () => ({ line: 0, column: 0 })).scanBalanced(index, open, close);
}