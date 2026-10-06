import ts from "typescript";
import type {
  AttributeNode,
  CatchClause,
  CodeBlockNode,
  ConditionalBranch,
  DirectiveNode,
  DocumentNode,
  ElementNode,
  ExpressionNode,
  IfNode,
  MarkupNode,
  SwitchCase,
  SwitchNode,
  ForNode,
  SourceSpan,
  TryNode,
  WhileNode,
} from "./ast.js";
import { analyzeStatements, CodeScanner, type CodeToken } from "./code-scanner.js";
import { DiagnosticBag, type SourcePos, type SourceRange } from "./diagnostics.js";
import { TSScanner } from "./scanner.js";

/**
 * Directive table. `supported` directives are handled by codegen; `ignored`
 * ones are Blazor-only and have no Tsazor meaning (codegen may warn). All are
 * only valid at document level. Any other `@word` is an implicit expression
 * (Razor semantics) — whether it resolves is decided later.
 */
const DIRECTIVES: Record<string, "supported" | "ignored"> = {
  page: "supported",
  layout: "supported",
  using: "supported",
  import: "supported",
  inject: "supported",
  inherits: "supported",
  attribute: "supported",
  typeparam: "supported",
  authorize: "supported",
  namespace: "ignored",
  rendermode: "ignored",
  preservewhitespace: "ignored",
  implements: "ignored",
};

/** Control statements parsed into their own nodes (in markup after `@`, in code bare). */
const CONTROL_KEYWORDS = new Set(["if", "for", "foreach", "while", "do", "switch", "try"]);

/** Continuation keywords that are only valid after their control statement. */
const DANGLING_KEYWORDS = new Set(["else", "case", "default", "catch", "finally"]);

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const isIdPart = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
const isIdStart = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z_$]/.test(ch);
const isAlnum = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z0-9]/.test(ch);
const isTagStart = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z]/.test(ch);

export function parseDocument(source: string, diagnostics: DiagnosticBag): DocumentNode {
  return new Parser(source, diagnostics).parseDocument();
}

interface ParseStop {
  /** Element/`<text>` content: `}` is literal text, `</` returns to the caller. */
  closeTag?: string | null;
  /** `@:` line: markup up to and including the line break. */
  newline?: boolean;
}

/** How a code-context statement list ended. */
type CodeEnd = "close" | "eof" | "case";

/** Where a code-context statement list lives. `single` = braceless control body. */
type CodeMode = "block" | "switch" | "single";

/** One interpolated slice of an attribute value (`static text`, or `@(...)`
 *  / bare `@x` code), with the absolute index of its first character — for
 *  token-precise source maps in the LSP. */
interface ValuePart {
  text?: string;
  code?: string;
  start?: number;
}

/** A parsed control header `(…)`: trimmed code, its first character and the
 *  position after the closing parenthesis. */
interface Header {
  code: string;
  start?: SourcePos;
  end?: SourcePos;
}

/**
 * Razor-model parser. Markup contexts (the document, element content, `@:`
 * lines, `<text>`) are scanned character-wise; code contexts (`@{ }`,
 * control-block bodies) are code-first: TypeScript scanned with the TS lexer,
 * switching to markup at a tag in statement position, `@:` and `<text>`.
 * `@code` blocks and `(…)` headers are balanced with the TS lexer as well.
 */
class Parser {
  private readonly locator: (index: number) => SourcePos;
  private readonly ts: TSScanner;
  private readonly code: CodeScanner;
  private i = 0;
  /** Accumulated text between transitions. */
  private textStart = -1;
  private textParts: string[] = [];
  /** Open elements and code bodies around the current position; directives
   *  are only valid at document level (0). */
  private nesting = 0;

  constructor(
    private readonly source: string,
    private readonly diagnostics: DiagnosticBag,
  ) {
    const lineStarts: number[] = [0];
    for (let k = 0; k < source.length; k++) {
      if (source[k] === "\n") lineStarts.push(k + 1);
    }
    this.locator = (index) => {
      let lo = 0;
      let hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid]! <= index) lo = mid;
        else hi = mid - 1;
      }
      const start = lineStarts[lo]!;
      return { line: lo + 1, column: index - start };
    };
    this.ts = new TSScanner(source, this.locator);
    this.code = new CodeScanner(source);
  }

  /** The source range [from, to) of a diagnostic. */
  private range(from: number, to: number): SourceRange {
    return { pos: this.locator(from), endPos: this.locator(Math.max(from, to)) };
  }

  /** From an already located start to the absolute index `to`. */
  private rangeFrom(pos: SourcePos, to: number): SourceRange {
    return { pos, endPos: this.locator(to) };
  }

  /** `to`, moved left over trailing whitespace down to `from` (a directive line without its `\r`). */
  private trimmedEnd(from: number, to: number): number {
    let end = to;
    while (end > from && /\s/.test(this.source[end - 1]!)) end--;
    return end;
  }

  parseDocument(): DocumentNode {
    const body: MarkupNode[] = [];
    this.parseNodes(body, {});
    const directives = body.filter((n): n is DirectiveNode => n.kind === "directive");
    const markup = body.filter((n) => n.kind !== "directive");
    return { directives, body: markup, codeBlocks: [] };
  }

  /* ------------------------------------------------------------------ */
  /* Markup context                                                      */
  /* ------------------------------------------------------------------ */

  /** Parses markup nodes until EOF, the caller's closing tag or (for `@:`) the line end. */
  private parseNodes(out: MarkupNode[], stop: ParseStop): void {
    const src = this.source;
    const documentLevel = stop.closeTag === undefined && !stop.newline;
    this.textStart = -1;
    while (this.i < src.length) {
      const ch = src[this.i]!;

      if (stop.newline && ch === "\n") {
        // The line break belongs to the `@:` line's text (Razor).
        this.accumulate(ch);
        this.flush(out);
        return;
      }

      if (ch === "}" && documentLevel) {
        this.flush(out);
        this.diagnostics.error("TZS003", this.range(this.i, this.i + 1), "Unexpected '}' in markup.");
        this.i++;
        continue;
      }
      // Inside element content and `@:` lines braces are literal text
      // (Razor: inline CSS/JSON in markup is fine).

      if (ch === "<") {
        const next = src[this.i + 1];
        if (next === "/") {
          if (stop.closeTag !== undefined && stop.closeTag !== null) {
            this.flush(out);
            return; // caller matches the closing tag
          }
          this.flush(out);
          this.strayCloseTag();
          continue;
        }
        if (src.startsWith("<!--", this.i)) {
          this.flush(out);
          const end = src.indexOf("-->", this.i + 4);
          this.i = end < 0 ? src.length : end + 3;
          continue;
        }
        if (next === "!") {
          // `<!DOCTYPE …>` and other declarations carry no render content.
          this.flush(out);
          const end = src.indexOf(">", this.i);
          this.i = end < 0 ? src.length : end + 1;
          continue;
        }
        if (isTagStart(next)) {
          this.flush(out);
          this.parseNode(out);
          continue;
        }
        // `a < b`: a `<` that starts no tag is text.
      }

      if (ch === "@") {
        if (src[this.i + 1] === "*") {
          // Razor comment: dropped without splitting the surrounding text.
          this.skipRazorComment();
          continue;
        }
        // Email rule (Razor): `@` right after an alphanumeric text character
        // is literal — `info@example.com`.
        const emailLike = this.textStart >= 0 && isAlnum(src[this.i - 1]) && isIdPart(src[this.i + 1]);
        if (!emailLike) {
          this.flush(out);
          this.parseTransition(out, false);
          continue;
        }
      }

      this.accumulate(ch);
      this.i++;
    }
    this.flush(out);
  }

  private accumulate(ch: string): void {
    if (this.textStart < 0) this.textStart = this.i;
    this.textParts.push(ch);
  }

  private flush(out: MarkupNode[]): void {
    if (this.textStart < 0 || this.textParts.length === 0) return;
    const content = this.textParts.join("");
    out.push({ kind: "text", content, pos: this.locator(this.textStart), endPos: this.locator(this.i) });
    this.textStart = -1;
    this.textParts = [];
  }

  /** A closing tag nothing opened (at document level, in code or on an `@:` line). */
  private strayCloseTag(): void {
    const pos = this.locator(this.i);
    const end = this.source.indexOf(">", this.i);
    const tag = this.source.slice(this.i, end < 0 ? this.source.length : end + 1);
    this.diagnostics.error("TZS002", this.rangeFrom(pos, this.i + tag.length), `Unexpected closing tag '${tag}'.`);
    this.i = end < 0 ? this.source.length : end + 1;
  }

  private skipRazorComment(): void {
    const end = this.source.indexOf("*@", this.i + 2);
    if (end < 0) {
      this.diagnostics.error("TZS006", this.range(this.i, this.i + 2), "Razor comment '@*' never closes.");
      this.i = this.source.length;
      return;
    }
    this.i = end + 2;
  }

  /* ------------------------------------------------------------------ */
  /* @-transitions                                                       */
  /* ------------------------------------------------------------------ */

  /** Handles the `@` at this.i, in markup (`inCode` false) or in statement
   *  position of a code context. */
  private parseTransition(out: MarkupNode[], inCode: boolean): void {
    const src = this.source;
    const pos = this.locator(this.i);
    const next = src[this.i + 1];

    if (next === "@") {
      this.pushText(out, "@", pos);
      this.i += 2;
      return;
    }

    if (next === ":") {
      // @:line — the rest of the line is markup (with @ transitions).
      this.i += 2;
      this.nesting++;
      this.parseNodes(out, { newline: true });
      this.nesting--;
      return;
    }

    if (next === "*") {
      this.skipRazorComment();
      return;
    }

    if (next === "(") {
      const end = this.code.scanBalanced(this.i + 1);
      if (end < 0) {
        this.diagnostics.error("TZS003", this.rangeFrom(pos, this.i + 2), "Parenthesized expression never closes.");
        this.i = src.length;
        return;
      }
      const node: ExpressionNode = {
        kind: "expression",
        code: src.slice(this.i + 2, end - 1),
        pos,
        endPos: this.locator(end),
      };
      out.push(node);
      this.i = end;
      return;
    }

    if (next === "{") {
      this.parseInlineBlock(out, pos, inCode);
      return;
    }

    // Identifier transitions.
    if (!isIdStart(next)) {
      this.diagnostics.error("TZS004", this.rangeFrom(pos, Math.min(this.i + 2, src.length)), "Unexpected character after '@'.");
      this.pushText(out, "@", pos);
      this.i++;
      return;
    }
    const idStart = this.i + 1;
    let idEnd = idStart;
    while (isIdPart(src[idEnd])) idEnd++;
    const word = src.slice(idStart, idEnd);

    if (word === "code" || word === "functions") {
      this.parseMemberBlock(out, pos, idEnd, word);
      return;
    }

    if (CONTROL_KEYWORDS.has(word)) {
      this.i = idEnd;
      this.parseControlStatement(word, pos, out, inCode);
      if (!inCode) this.skipOwnLine();
      return;
    }

    if (DANGLING_KEYWORDS.has(word)) {
      if (inCode) {
        // `@case`/`@else` in code: the `@` is redundant (lenient); the
        // statement loop takes the bare keyword.
        this.i++;
        return;
      }
      this.diagnostics.error("TZS001", this.rangeFrom(pos, idEnd), `'@${word}' outside of its control context.`);
      this.i = idEnd;
      return;
    }

    if ((word === "using" || word === "lock") && this.nextNonSpace(idEnd) === "(") {
      this.i = idEnd;
      this.parseUnsupportedStatement(word, pos);
      if (!inCode) this.skipOwnLine();
      return;
    }

    if (word === "await") {
      let end = idEnd;
      while (src[end] === " " || src[end] === "\t") end++;
      this.i = Math.max(this.ts.scanImplicitExpression(end), idEnd);
      this.diagnostics.error(
        "TZS012",
        this.rangeFrom(pos, this.i),
        "'@await' in markup is not supported: buildRenderTree is synchronous. Await in a lifecycle method (e.g. onInitializedAsync) and render the stored result.",
      );
      return;
    }

    if (DIRECTIVES[word] !== undefined) {
      if (this.nesting > 0) {
        this.i = this.lineEnd(idEnd);
        this.diagnostics.error("TZS013", this.rangeFrom(pos, this.trimmedEnd(idEnd, this.i)), `'@${word}' is a directive and is only allowed at document level.`);
        return;
      }
      this.parseDirective(word, idEnd, pos, out);
      this.skipOwnLine();
      return;
    }

    this.parseImplicitExpression(idStart, idEnd, pos, out);
  }

  private parseImplicitExpression(idStart: number, idEnd: number, pos: SourcePos, out: MarkupNode[]): void {
    const end = this.ts.scanImplicitExpression(idStart);
    if (end <= idStart) {
      this.diagnostics.error("TZS004", this.rangeFrom(pos, idEnd), "Empty implicit expression.");
      this.i = idEnd;
      return;
    }
    out.push({ kind: "expression", code: this.source.slice(idStart, end), pos, endPos: this.locator(end) });
    this.i = end;
  }

  /** `@code { … }` / `@functions { … }`: verbatim class members. */
  private parseMemberBlock(out: MarkupNode[], pos: SourcePos, from: number, word: string): void {
    const src = this.source;
    const brace = this.findChar(from, "{");
    if (brace >= src.length) {
      this.diagnostics.error("TZS006", this.rangeFrom(pos, from), "@code block missing '{'.");
      this.i = src.length;
      return;
    }
    const close = this.code.scanBalanced(brace);
    if (close < 0) {
      this.diagnostics.error("TZS006", this.rangeFrom(pos, brace + 1), "Code block never closes.");
      this.i = src.length;
      return;
    }
    const node: CodeBlockNode = {
      kind: "codeBlock",
      code: src.slice(brace + 1, close - 1),
      pos,
      endPos: this.locator(close),
      codeStart: this.locator(brace + 1),
      member: true,
    };
    if (this.nesting > 0) {
      this.diagnostics.error("TZS013", this.rangeFrom(pos, close), `'@${word}' blocks are only allowed at document level.`);
    } else {
      out.push(node);
    }
    this.i = close;
    this.skipOwnLine();
  }

  /** `@{ … }`: a code-first block without a scope of its own. */
  private parseInlineBlock(out: MarkupNode[], pos: SourcePos, inCode: boolean): void {
    const brace = this.i + 1;
    this.i = brace + 1;
    const children: MarkupNode[] = [];
    this.nesting++;
    const end = this.parseCodeStatements(children, "block", this.rangeFrom(pos, brace + 1));
    this.nesting--;
    out.push({
      kind: "codeBlock",
      code: this.source.slice(brace + 1, end === "close" ? this.i - 1 : this.i),
      children,
      pos,
      endPos: this.locator(this.i),
      codeStart: this.locator(brace + 1),
    });
    if (!inCode) this.skipOwnLine();
  }

  /* ------------------------------------------------------------------ */
  /* Code context                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Parses a code-first statement list: TypeScript statements, control
   * statements, markup in statement position (`<tag`, `<text>`, `@:`) and
   * `@` expressions. Consumes the closing `}` in "block"/"switch" mode;
   * returns "case" (label unconsumed) when a switch label starts. `opener`
   * is the construct an unclosed list is reported on (`{`, `@{`, the header).
   */
  private parseCodeStatements(out: MarkupNode[], mode: CodeMode, opener?: SourceRange): CodeEnd {
    const src = this.source;
    for (;;) {
      this.skipCodeTrivia();
      if (this.i >= src.length) {
        const at = opener ?? this.range(this.i, this.i);
        if (mode !== "single") {
          this.diagnostics.error("TZS006", at, "Code block never closes.");
        } else {
          this.diagnostics.error("TZS006", at, "Expected a statement after the control header.");
        }
        return "eof";
      }
      const ch = src[this.i]!;
      const before = this.i;

      if (ch === "}") {
        if (mode === "single") {
          this.diagnostics.error("TZS006", this.range(this.i, this.i + 1), "Expected a statement after the control header.");
          return "close";
        }
        this.i++;
        return "close";
      }

      if (ch === "<" && src.startsWith("<!--", this.i)) {
        const end = src.indexOf("-->", this.i + 4);
        this.i = end < 0 ? src.length : end + 3;
        continue;
      }
      if (ch === "<" && src[this.i + 1] === "/") {
        this.strayCloseTag();
        continue;
      }
      if (ch === "<" && isTagStart(src[this.i + 1])) {
        this.parseNode(out);
      } else if (ch === "@") {
        this.parseTransition(out, true);
        if (this.i === before + 1 && DANGLING_KEYWORDS.has(this.sliceWord(this.i))) continue; // lenient `@case`
      } else if (ch === "{") {
        const pos = this.locator(this.i);
        this.i++;
        const children: MarkupNode[] = [];
        this.nesting++;
        this.parseCodeStatements(children, "block", this.rangeFrom(pos, this.i));
        this.nesting--;
        out.push({ kind: "block", children, pos, endPos: this.locator(this.i) });
      } else if (isIdStart(ch) && this.parseCodeKeyword(out, mode)) {
        if (this.pendingCase) {
          this.pendingCase = false;
          return "case";
        }
      } else {
        this.parseStatementRun(out, mode);
      }
      if (mode === "single") return "close";
    }
  }

  /** Set by parseCodeKeyword when a switch label starts. */
  private pendingCase = false;

  /** Handles a keyword in statement position; false = not a keyword statement. */
  private parseCodeKeyword(out: MarkupNode[], mode: CodeMode): boolean {
    const word = this.sliceWord(this.i);
    const pos = this.locator(this.i);
    const after = this.i + word.length;
    if (CONTROL_KEYWORDS.has(word)) {
      this.i = after;
      this.parseControlStatement(word, pos, out, true);
      return true;
    }
    if (word === "case" || (word === "default" && this.nextNonSpace(after) === ":")) {
      if (mode === "switch") {
        this.pendingCase = true;
        return true;
      }
      this.diagnostics.error("TZS001", this.rangeFrom(pos, after), `'${word}' label outside of a switch.`);
      this.i = after;
      return true;
    }
    if ((word === "using" || word === "lock") && this.nextNonSpace(after) === "(") {
      this.i = after;
      this.parseUnsupportedStatement(word, pos);
      return true;
    }
    if (word === "else" || word === "catch" || word === "finally") {
      this.diagnostics.error("TZS001", this.rangeFrom(pos, after), `'${word}' without a matching '${word === "else" ? "if" : "try"}'.`);
      this.i = after;
      return true;
    }
    return false;
  }

  /** A run of plain TS statements up to the next boundary (markup, control
   *  statement, block or the closing brace). */
  private parseStatementRun(out: MarkupNode[], mode: CodeMode): void {
    const src = this.source;
    const start = this.i;
    const end = this.code.scanStatements(start, (token) => this.isStatementBoundary(token), mode === "single");
    if (end <= start) {
      this.diagnostics.error("TZS003", this.range(start, start + 1), `Unexpected '${src[start]}' in code.`);
      this.i = start + 1;
      return;
    }
    const code = src.slice(start, end);
    const info = analyzeStatements(code);
    const first = info.errors[0];
    if (first) {
      this.diagnostics.error(
        "TZS015",
        this.range(start + first.offset, start + first.offset + first.length),
        `${first.message} (markup inside code must start with a tag, '@:' or '<text>').`,
      );
    }
    out.push({ kind: "statement", code, declares: info.declares, readonly: info.readonly, pos: this.locator(start), endPos: this.locator(end) });
    this.i = end;
  }

  /** Whether a token at statement start ends the current statement run. */
  private isStatementBoundary(token: CodeToken): boolean {
    const kind = token.kind;
    if (kind === ts.SyntaxKind.AtToken || kind === ts.SyntaxKind.OpenBraceToken) return true;
    if (kind === ts.SyntaxKind.LessThanToken) {
      const next = this.source[token.end];
      return isTagStart(next) || next === "/" || next === "!";
    }
    const text = this.source.slice(token.start, token.end);
    if (!/^[A-Za-z_$]/.test(text)) return false;
    if (CONTROL_KEYWORDS.has(text) || text === "case" || text === "else" || text === "catch" || text === "finally") return true;
    if (text === "default") return this.nextNonSpace(token.end) === ":";
    if (text === "using" || text === "lock") return this.nextNonSpace(token.end) === "(";
    return false;
  }

  /** Skips whitespace, `//` and `/* *\/` comments and Razor comments in code. */
  private skipCodeTrivia(): void {
    const src = this.source;
    while (this.i < src.length) {
      const ch = src[this.i]!;
      if (/\s/.test(ch)) {
        this.i++;
      } else if (ch === "/" && src[this.i + 1] === "/") {
        this.i = this.lineEnd(this.i);
      } else if (ch === "/" && src[this.i + 1] === "*") {
        const end = src.indexOf("*/", this.i + 2);
        this.i = end < 0 ? src.length : end + 2;
      } else if (ch === "@" && src[this.i + 1] === "*") {
        this.skipRazorComment();
      } else {
        return;
      }
    }
  }

  /** Gap between the parts of a control statement (`} else {`). */
  private skipGap(inCode: boolean): void {
    if (inCode) this.skipCodeTrivia();
    else this.skipWhitespace();
  }

  /* ------------------------------------------------------------------ */
  /* Directives                                                          */
  /* ------------------------------------------------------------------ */

  private parseDirective(word: string, afterWord: number, pos: SourcePos, out: MarkupNode[]): void {
    if (word === "import") {
      const end = this.importDirectiveEnd(afterWord);
      const slice = this.source.slice(afterWord, end);
      const lead = slice.length - slice.trimStart().length;
      out.push({
        kind: "directive",
        name: word,
        value: slice.trim(),
        valueStart: this.locator(afterWord + lead),
        pos,
        endPos: this.locator(end),
      });
      this.i = end;
      return;
    }
    // `@authorize({ … })` may span lines: its value runs to the closing parenthesis.
    const end = word === "authorize" ? this.parenDirectiveEnd(afterWord) : this.lineEnd(afterWord);
    const slice = this.source.slice(afterWord, end);
    const raw = slice.trim();
    const valueStart = this.locator(afterWord + slice.length - slice.trimStart().length);
    out.push({ kind: "directive", name: word, value: raw, valueStart, pos, endPos: this.locator(end) });
    this.i = end;
  }

  /**
   * End of an `@import` value. TS import-declaration syntax may span lines
   * (`@import {⏎ A,⏎ B⏎} from "./x"`), so the value runs to the module
   * specifier string, plus an optional `with { … }` clause and `;`. A line
   * break outside braces ends the value — codegen reports invalid forms.
   */
  private importDirectiveEnd(from: number): number {
    const SK = ts.SyntaxKind;
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, this.source);
    scanner.resetTokenState(from);
    let depth = 0;
    let end = this.lineEnd(from);
    let afterSpecifier = false;
    for (;;) {
      const kind = scanner.scan();
      if (kind === SK.EndOfFileToken) return end;
      if (kind === SK.WhitespaceTrivia || kind === SK.SingleLineCommentTrivia || kind === SK.MultiLineCommentTrivia) continue;
      if (kind === SK.NewLineTrivia) {
        if (depth === 0) return end;
        continue;
      }
      if (afterSpecifier && depth === 0 && kind !== SK.WithKeyword && kind !== SK.AssertKeyword && kind !== SK.SemicolonToken) {
        // Only an import-attributes clause or `;` may follow; anything else on
        // the line stays in the value so codegen reports it.
        return Math.max(end, this.lineEnd(scanner.getTokenStart()));
      }
      if (kind === SK.OpenBraceToken) {
        depth++;
      } else if (kind === SK.CloseBraceToken) {
        depth = Math.max(0, depth - 1);
      } else if (kind === SK.StringLiteral && depth === 0 && !afterSpecifier) {
        afterSpecifier = true;
      }
      end = Math.max(end, scanner.getTokenEnd());
    }
  }

  /**
   * End of a directive value that may be a parenthesized TS argument
   * (`@authorize({⏎ roles: […]⏎})`): the line, extended to the parenthesis
   * closing one that opens it. Unbalanced ⇒ the line (codegen reports it).
   */
  private parenDirectiveEnd(from: number): number {
    const SK = ts.SyntaxKind;
    const lineEnd = this.lineEnd(from);
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, this.source);
    scanner.resetTokenState(from);
    if (scanner.scan() !== SK.OpenParenToken || scanner.getTokenStart() >= lineEnd) return lineEnd;
    let depth = 1;
    for (;;) {
      const kind = scanner.scan();
      if (kind === SK.EndOfFileToken) return lineEnd;
      if (kind === SK.OpenParenToken) depth++;
      else if (kind === SK.CloseParenToken && --depth === 0) return Math.max(lineEnd, scanner.getTokenEnd());
    }
  }

  private lineEnd(from: number): number {
    const nl = this.source.indexOf("\n", from);
    return nl < 0 ? this.source.length : nl;
  }

  /* ------------------------------------------------------------------ */
  /* Control structures                                                  */
  /* ------------------------------------------------------------------ */

  /** Parses a control statement; this.i is right after its keyword. */
  private parseControlStatement(word: string, pos: SourcePos, out: MarkupNode[], inCode: boolean): void {
    const keyword = this.rangeFrom(pos, this.i);
    switch (word) {
      case "if":
        out.push(this.parseIf(pos, inCode));
        return;
      case "for":
      case "foreach": {
        const header = this.parseHeader(pos, word);
        const children = this.parseBody(pos);
        const node: ForNode = {
          kind: "for", code: header.code, codeStart: header.start, headerEnd: header.end, isForEach: word === "foreach", children, pos, endPos: this.locator(this.i),
        };
        out.push(node);
        return;
      }
      case "while": {
        const header = this.parseHeader(pos, word);
        const children = this.parseBody(pos);
        out.push({
          kind: "while", condition: header.code, conditionStart: header.start, isDoWhile: false, children, pos, endPos: this.locator(this.i),
        } satisfies WhileNode);
        return;
      }
      case "do": {
        const children = this.parseBody(pos);
        this.skipGap(inCode);
        let header: Header = { code: "" };
        if (this.sliceWord(this.i) === "while") {
          this.i += "while".length;
          header = this.parseHeader(pos, "while");
          let k = this.i;
          while (this.source[k] === " " || this.source[k] === "\t") k++;
          if (this.source[k] === ";") this.i = k + 1;
        } else {
          this.diagnostics.error("TZS003", keyword, "'do' block requires a trailing 'while (…)'.");
        }
        out.push({
          kind: "while", condition: header.code, conditionStart: header.start, isDoWhile: true, children, pos, endPos: this.locator(this.i),
        } satisfies WhileNode);
        return;
      }
      case "switch":
        this.parseSwitch(pos, out, inCode);
        return;
      case "try":
        out.push(this.parseTry(pos, keyword, inCode));
        return;
    }
  }

  private parseIf(pos: SourcePos, inCode: boolean): IfNode {
    const header = this.parseHeader(pos, "if");
    const branches: ConditionalBranch[] = [{ condition: header.code, conditionStart: header.start, children: this.parseBody(pos) }];
    for (;;) {
      const save = this.i;
      // Razor: `else` follows the block without an @ transition.
      this.skipGap(inCode);
      if (this.sliceWord(this.i) !== "else") {
        // In markup the whitespace stays consumed (it only separates blocks).
        if (inCode) this.i = save;
        break;
      }
      const elsePos = this.locator(this.i);
      this.i += "else".length;
      this.skipGap(inCode);
      if (this.sliceWord(this.i) === "if") {
        this.i += 2;
        const elseIf = this.parseHeader(elsePos, "else if");
        const children = this.parseBody(elsePos);
        branches.push({ condition: elseIf.code, conditionStart: elseIf.start, children, span: { pos: elsePos, endPos: this.locator(this.i) } });
        continue;
      }
      const children = this.parseBody(elsePos);
      branches.push({ condition: null, children, span: { pos: elsePos, endPos: this.locator(this.i) } });
      if (!inCode) this.skipWhitespace();
      break;
    }
    return { kind: "if", branches, pos, endPos: this.locator(this.i) };
  }

  private parseTry(pos: SourcePos, keyword: SourceRange, inCode: boolean): TryNode {
    const node: TryNode = { kind: "try", children: [], pos, endPos: pos };
    this.skipGap(inCode);
    if (this.source[this.i] !== "{") {
      this.diagnostics.error("TZS006", keyword, "'try' requires a '{' block.");
    }
    node.children = this.parseBody(pos);
    let save = this.i;
    this.skipGap(inCode);
    if (this.sliceWord(this.i) === "catch") {
      const catchPos = this.locator(this.i);
      this.i += "catch".length;
      this.skipGap(inCode);
      let param: string | null = null;
      let paramName: string | null = null;
      if (this.source[this.i] === "(") {
        param = this.parseHeader(catchPos, "catch").code;
        // C# `catch (Exception e)` binds `e`; TS `catch (e)` / `catch (e: unknown)`.
        const typed = /^[A-Za-z_$][\w$.]*\s+([A-Za-z_$][\w$]*)$/.exec(param);
        if (typed) param = typed[1]!;
        paramName = /^[A-Za-z_$][\w$]*/.exec(param)?.[0] ?? null;
      }
      const children = this.parseBody(catchPos);
      const clause: CatchClause = { param, paramName, children, span: { pos: catchPos, endPos: this.locator(this.i) } };
      node.catchClause = clause;
      save = this.i;
      this.skipGap(inCode);
    }
    if (this.sliceWord(this.i) === "finally") {
      const finallyPos = this.locator(this.i);
      this.i += "finally".length;
      node.finallyChildren = this.parseBody(finallyPos);
    } else {
      if (inCode) this.i = save;
      if (!node.catchClause) this.diagnostics.error("TZS003", keyword, "'try' requires a 'catch' or 'finally' block.");
    }
    node.endPos = this.locator(this.i);
    return node;
  }

  private parseSwitch(pos: SourcePos, out: MarkupNode[], inCode: boolean): void {
    const header = this.parseHeader(pos, "switch");
    const headerRange = this.rangeFrom(pos, this.i);
    this.skipGap(inCode);
    if (this.source[this.i] !== "{") {
      this.diagnostics.error("TZS006", headerRange, "@switch requires a '{' block.");
      this.i = this.source.length;
      return;
    }
    const brace = this.range(this.i, this.i + 1);
    this.i++;
    const cases: SwitchCase[] = [];
    const preamble: MarkupNode[] = [];
    this.nesting++;
    for (;;) {
      const target = cases.length > 0 ? cases[cases.length - 1]!.children : preamble;
      if (this.parseCodeStatements(target, "switch", brace) !== "case") break;
      cases.push(this.parseCaseLabel());
    }
    this.nesting--;
    if (preamble.length > 0) {
      const range = { pos: preamble[0]!.pos, endPos: preamble[preamble.length - 1]!.endPos };
      this.diagnostics.error("TZS001", range, "Statements in a switch must follow a 'case' or 'default' label.");
    }
    out.push({ kind: "switch", code: header.code, codeStart: header.start, cases, pos, endPos: this.locator(this.i) } satisfies SwitchNode);
  }

  /** `case <expr>:` or `default:` at this.i. */
  private parseCaseLabel(): SwitchCase {
    const src = this.source;
    const labelStart = this.i;
    const labelPos = this.locator(labelStart);
    if (this.sliceWord(this.i) === "default") {
      this.i += "default".length;
      this.skipWhitespace();
      if (src[this.i] === ":") this.i++;
      return { code: null, children: [], span: { pos: labelPos, endPos: this.locator(this.i) } };
    }
    this.i += "case".length;
    this.skipWhitespace();
    const start = this.i;
    // The label ends at the first `:` outside brackets and ternaries.
    this.code.reset(start);
    let ternaries = 0;
    let colon: CodeToken | null = null;
    for (;;) {
      const depth = this.code.depth;
      const token = this.code.next();
      if (token.kind === ts.SyntaxKind.EndOfFileToken) break;
      if (depth !== 0) continue;
      if (token.kind === ts.SyntaxKind.QuestionToken) ternaries++;
      else if (token.kind === ts.SyntaxKind.ColonToken) {
        if (ternaries === 0) {
          colon = token;
          break;
        }
        ternaries--;
      }
    }
    if (!colon) {
      this.diagnostics.error("TZS003", this.range(labelStart, labelStart + "case".length), "'case' label without ':'.");
      this.i = src.length;
      return { code: src.slice(start).trim(), children: [], span: { pos: labelPos, endPos: this.locator(this.i) } };
    }
    const code = src.slice(start, colon.start).trim();
    this.i = colon.end;
    return { code, codeStart: this.locator(start), children: [], span: { pos: labelPos, endPos: this.locator(this.i) } };
  }

  /** C# statements without a TS equivalent: reported, header and body skipped. */
  private parseUnsupportedStatement(word: string, pos: SourcePos): void {
    const message = word === "using"
      ? "The C# 'using (…) { }' statement has no TypeScript equivalent — use try/finally or a 'using' declaration."
      : "The C# 'lock (…) { }' statement has no TypeScript equivalent (JavaScript is single-threaded).";
    const keywordEnd = this.i;
    this.parseHeader(pos, word);
    this.diagnostics.error("TZS012", this.rangeFrom(pos, this.i < this.source.length ? this.i : keywordEnd), message);
    this.parseBody(pos);
  }

  /* ------------------------------------------------------------------ */
  /* Markup nodes                                                        */
  /* ------------------------------------------------------------------ */

  private parseNode(out: MarkupNode[]): void {
    const src = this.source;
    const pos = this.locator(this.i);
    this.i++; // '<'

    if (src.startsWith("text>", this.i)) {
      this.i += 5;
      const startTag = this.rangeFrom(pos, this.i);
      const children: MarkupNode[] = [];
      this.nesting++;
      this.parseNodes(children, { closeTag: "text" });
      this.nesting--;
      this.expectCloseTag("text", startTag);
      out.push({ kind: "textTag", children, pos, endPos: this.locator(this.i) });
      return;
    }

    const nameStart = this.i;
    while (this.i < src.length && /[A-Za-z0-9_.-]/.test(src[this.i]!)) this.i++;
    const tagName = src.slice(nameStart, this.i);
    if (!tagName) {
      this.diagnostics.error("TZS002", this.rangeFrom(pos, this.i), "Expected a tag name after '<'.");
      this.i++;
      return;
    }
    // `<tagName`: unclosed-tag diagnostics cover the start tag's name.
    const startTag = this.rangeFrom(pos, this.i);

    const isComponent = /^[A-Z]/.test(tagName) || tagName.includes(".");
    const attributes = this.parseTagAttributes(startTag, tagName);

    let selfClosing = false;
    let isVoid = false;
    if (src[this.i] === "/" && src[this.i + 1] === ">") {
      selfClosing = true;
      this.i += 2;
    } else if (src[this.i] === ">") {
      this.i++;
      if (!isComponent && VOID_ELEMENTS.has(tagName.toLowerCase())) {
        selfClosing = true;
        isVoid = true;
      }
    } else {
      this.diagnostics.error("TZS002", startTag, `Unclosed start tag '<${tagName}'.`);
      this.i = src.length;
    }
    // A void element may still be closed explicitly (`<input></input>`).
    if (isVoid) this.skipVoidCloseTag(tagName);

    const node: ElementNode = {
      kind: "element",
      tagName,
      isComponent,
      selfClosing,
      attributes,
      children: [],
      pos,
      endPos: this.locator(this.i),
    };

    if (!selfClosing) {
      const stopTag = isComponent ? tagName : tagName.toLowerCase();
      const children: MarkupNode[] = [];
      // Element and component content alike: braces are literal text.
      this.nesting++;
      this.parseNodes(children, { closeTag: stopTag });
      this.nesting--;
      this.expectCloseTag(stopTag, startTag);
      node.children = children;
    }
    node.endPos = this.locator(this.i);
    out.push(node);
  }

  private skipVoidCloseTag(tagName: string): void {
    const match = /^\s*<\/([A-Za-z0-9_.-]+)\s*>/.exec(this.source.slice(this.i, this.i + tagName.length + 64));
    if (match && match[1]!.toLowerCase() === tagName.toLowerCase()) this.i += match[0].length;
  }

  /** Consumes `</tagName>`; a missing one is reported on the start tag. */
  private expectCloseTag(tagName: string, startTag: SourceRange): void {
    const src = this.source;
    const save = this.i;
    this.skipWhitespace();
    if (src.startsWith("</", this.i)) {
      const after = this.i + 2;
      let end = after;
      while (end < src.length && /[A-Za-z0-9_.-]/.test(src[end]!)) end++;
      const closeName = src.slice(after, end);
      if (closeName.toLowerCase() === tagName.toLowerCase()) {
        const closeStart = this.i;
        this.i = end;
        while (end < src.length && src[end] !== ">") end++;
        if (src[end] === ">") this.i = end + 1;
        else this.diagnostics.error("TZS002", this.range(closeStart, after + closeName.length), `Missing '>' on closing tag of <${tagName}>.`);
        return;
      }
    }
    this.i = save;
    this.diagnostics.error("TZS002", startTag, `Missing closing tag </${tagName}>.`);
  }

  private parseTagAttributes(startTag: SourceRange, tagName: string): AttributeNode[] {
    const src = this.source;
    const attributes: AttributeNode[] = [];
    for (;;) {
      this.skipWhitespace();
      const ch = src[this.i];
      if (ch === undefined) {
        this.diagnostics.error("TZS002", startTag, `Start tag <${tagName} is never closed.`);
        return attributes;
      }
      if (ch === ">" || (ch === "/" && src[this.i + 1] === ">")) return attributes;
      if (ch === "@" && src[this.i + 1] === "*") {
        this.skipRazorComment();
        continue;
      }
      const attr = this.parseAttribute();
      if (!attr) continue;
      // Event modifiers are attributes of their own (Blazor), also without a
      // handler; each at most once per event.
      if (attr.kind === "eventModifier") {
        const duplicate = attributes.some((a) =>
          a.kind === "eventModifier" && a.modifier === attr.modifier && a.name.toLowerCase() === attr.name.toLowerCase());
        if (duplicate) {
          this.diagnostics.error("TZS008", attr, `Duplicate modifier '@${attr.name}:${attr.modifier}'.`);
          continue;
        }
      }
      // F2: each attachment name at most once per element.
      if (attr.kind === "attach" && attributes.some((a) => a.kind === "attach" && a.attachName === attr.attachName)) {
        const label = attr.attachName === "" ? "@attach" : `@attach:${attr.attachName}`;
        this.diagnostics.error("TZS008", attr, `Duplicate attachment '${label}' — use '@attach:<name>' for several attachments on one element.`);
        continue;
      }
      // Fold @bind modifiers (@bind:event, @bind:format, @bind:get, …) into the
      // preceding bind attribute; @bind-Target modifiers fold onto that target.
      // A modifier with no host is kept as a latent host: Blazor allows
      // @bind:get="x" @bind:set="y" without a base @bind.
      if (attr.kind === "bind" && attr.expression === undefined) {
        const modifier = (["event", "format", "culture", "get", "set", "after"] as const).find((k) => attr[k] !== undefined);
        const host = [...attributes].reverse().find((a) => {
          if (a.kind !== "bind") return false;
          return (a as Extract<AttributeNode, { kind: "bind" }>).bindTarget === attr.bindTarget;
        }) as (Extract<AttributeNode, { kind: "bind" }> & Record<string, unknown>) | undefined;
        if (host && modifier && host[modifier] !== undefined) {
          const label = attr.bindTarget !== undefined ? `@bind-${attr.bindTarget}:${modifier}` : `@bind:${modifier}`;
          this.diagnostics.error("TZS008", attr, `Duplicate bind modifier '${label}'.`);
          continue;
        }
        if (host && modifier) {
          host[modifier] = attr[modifier];
          if (attr.formatLiteral) host.formatLiteral = true;
          host.modifierSpans = { ...host.modifierSpans, ...attr.modifierSpans };
          host.codeStarts = { ...host.codeStarts, ...attr.codeStarts };
          continue;
        }
        // No host (or unknown modifier): keep the node; codegen reports a
        // precise error if it never becomes a usable bind.
        attributes.push(attr);
        continue;
      }
      // A base bind after its modifiers (`@bind:after="f" @bind="x"`) joins
      // their latent host — attribute order does not matter in Razor.
      if (attr.kind === "bind") {
        const latent = attributes.find((a) => a.kind === "bind" && a.expression === undefined && a.bindTarget === attr.bindTarget);
        if (latent && latent.kind === "bind") {
          // The joined bind reports on the base attribute; the modifiers keep their own spans.
          latent.expression = attr.expression;
          latent.codeStarts = { ...latent.codeStarts, ...attr.codeStarts };
          latent.pos = attr.pos;
          latent.endPos = attr.endPos;
          continue;
        }
      }
      attributes.push(attr);
    }
  }

  private parseAttribute(): AttributeNode | null {
    const src = this.source;
    const pos = this.locator(this.i);
    const nameStart = this.i;
    while (this.i < src.length && /[A-Za-z0-9_@:.-]/.test(src[this.i]!)) this.i++;
    const name = src.slice(nameStart, this.i);
    if (!name) {
      this.diagnostics.error("TZS009", this.range(this.i, this.i + 1), "Invalid attribute name.");
      this.i++;
      return null;
    }

    const hasValue = src[this.i] === "=";
    if (name.startsWith("@")) {
      // Directive attributes handle their own '=' and valueless forms.
      return this.parseDirectiveAttribute(name, pos);
    }
    if (!hasValue) {
      return { kind: "static", name, value: "", minimized: true, pos, endPos: this.locator(this.i) };
    }
    this.i++; // '='

    const valueAt = this.i;
    const value = this.parseAttributeValue();
    if (value === null) return null;

    const codePos = (start: number | undefined): SourceSpan["pos"] | undefined =>
      start === undefined ? undefined : this.locator(start);

    if (value.kind === "parts") {
      // The value as written (quotes stripped): a TS expression where the
      // target is a non-string component parameter (2.2).
      const quoted = src[valueAt] === '"' || src[valueAt] === "'";
      const raw = {
        text: quoted ? src.slice(valueAt + 1, this.i - 1) : src.slice(valueAt, this.i),
        start: this.locator(quoted ? valueAt + 1 : valueAt),
      };
      const parts = value.parts.map((p) => (p.code !== undefined ? { code: p.code, codeStart: codePos(p.start) } : { text: p.text }));
      if (parts.length === 1 && parts[0]!.code !== undefined) {
        return { kind: "expression", name, code: parts[0]!.code!, codeStart: parts[0]!.codeStart, pos, endPos: this.locator(this.i) };
      }
      if (parts.length === 1 && parts[0]!.text !== undefined) {
        return { kind: "static", name, value: parts[0]!.text!, raw, pos, endPos: this.locator(this.i) };
      }
      return { kind: "mixedValue", name, parts, raw, pos, endPos: this.locator(this.i) };
    }
    // An empty quoted value (`href=""`) is the empty string, not an empty expression.
    if (value.code === "" && value.start === undefined) {
      return { kind: "static", name, value: "", pos, endPos: this.locator(this.i) };
    }
    return { kind: "expression", name, code: value.code, codeStart: codePos(value.start), pos, endPos: this.locator(this.i) };
  }

  private finishValuelessAttribute(name: string, pos: SourcePos): AttributeNode {
    if (name.startsWith("@")) {
      return this.parseDirectiveAttribute(name, pos);
    }
    return { kind: "static", name, value: "", pos, endPos: this.locator(this.i) };
  }

  /** Attributes starting with @: key, ref, event handlers, splat, bind (M5).
   *  Handles the optional '=' and valueless forms itself. */
  private parseDirectiveAttribute(name: string, pos: SourcePos): AttributeNode {
    const src = this.source;
    const body = name.slice(1);

    if (body === "key" || body === "ref" || body === "attributes") {
      const code = this.parseRequiredExpression(body, pos);
      if (code === null) return { kind: "static", name, value: "", pos, endPos: this.locator(this.i) };
      const kind = body === "key" ? "key" : body === "ref" ? "ref" : "attributes";
      const codeStart = code.start === undefined ? undefined : this.locator(code.start);
      return { kind, code: code.code, codeStart, pos, endPos: this.locator(this.i) } as AttributeNode;
    }

    // F2: `@attach="…"` and `@attach:<name>="…"` (Razor's directive-attribute
    // parameter syntax, as `@bind:event`); the name only tells several apart.
    if (body === "attach" || body.startsWith("attach:")) {
      const attachName = body.slice("attach:".length);
      if (body !== "attach" && !/^[A-Za-z0-9_.-]+$/.test(attachName)) {
        if (src[this.i] === "=") this.i++;
        this.parseAttributeValue();
        this.diagnostics.error("TZS008", this.rangeFrom(pos, this.i), `'@${body}' needs a name after the colon (letters, digits, '_', '.', '-'), e.g. '@attach:tooltip'.`);
        return { kind: "static", name, value: "", pos, endPos: this.locator(this.i) };
      }
      const code = this.parseRequiredExpression(body, pos);
      if (code === null) return { kind: "static", name, value: "", pos, endPos: this.locator(this.i) };
      const codeStart = code.start === undefined ? undefined : this.locator(code.start);
      return { kind: "attach", attachName, code: code.code, codeStart, pos, endPos: this.locator(this.i) };
    }

    // F4/F5: `@transition`, `@in`, `@out`, `@animate` with a value, and the
    // valueless `global` modifier of a transition (Razor's
    // `@onclick:preventDefault` form): `@in:global`.
    const motion = /^(transition|in|out|animate)(?::(.*))?$/.exec(body);
    if (motion !== null) {
      const directive = motion[1] as "transition" | "in" | "out" | "animate";
      const modifier = motion[2];
      if (modifier !== undefined) {
        const hasValue = src[this.i] === "=";
        if (hasValue) {
          this.i++;
          this.parseAttributeValue();
        }
        if (modifier === "global" && directive !== "animate" && !hasValue) {
          return { kind: "motionGlobal", directive, pos, endPos: this.locator(this.i) };
        }
        const message =
          modifier === "global" && directive !== "animate"
            ? `'@${body}' takes no value — write it on its own: '@${directive}="…" @${directive}:global'.`
            : directive === "animate"
              ? `'@animate' has no modifiers.`
              : `Unknown modifier ':${modifier}' on '@${directive}' (expected ':global').`;
        this.diagnostics.error("TZS008", this.rangeFrom(pos, this.i), message);
        return { kind: "static", name, value: "", pos, endPos: this.locator(this.i) };
      }
      const code = this.parseRequiredExpression(body, pos);
      if (code === null) return { kind: "static", name, value: "", pos, endPos: this.locator(this.i) };
      const codeStart = code.start === undefined ? undefined : this.locator(code.start);
      return { kind: "motion", directive, code: code.code, codeStart, pos, endPos: this.locator(this.i) };
    }

    // Event handler `@onclick="…"`, or one of its modifiers
    // `@onclick:preventDefault[="bool"]` / `@onclick:stopPropagation[="bool"]`.
    if (/^on[A-Za-z]/i.test(body)) {
      const [base, ...modifiers] = body.split(":");
      const hasValue = src[this.i] === "=";
      if (modifiers.length > 0) {
        const lower = modifiers.join(":").toLowerCase();
        const modifier = lower === "preventdefault" ? "preventDefault" : lower === "stoppropagation" ? "stopPropagation" : null;
        if (modifier === null) {
          if (hasValue) this.parseRequiredExpression(body, pos);
          this.diagnostics.error("TZS008", this.rangeFrom(pos, this.i), `Unknown event modifier ':${modifiers.join(":")}' (expected ':preventDefault' or ':stopPropagation').`);
          return { kind: "static", name, value: "", pos, endPos: this.locator(this.i) };
        }
        // Valueless form = true (Blazor).
        if (!hasValue) return { kind: "eventModifier", name: base!, modifier, pos, endPos: this.locator(this.i) };
        const code = this.parseRequiredExpression(body, pos);
        if (code === null) return { kind: "eventModifier", name: base!, modifier, pos, endPos: this.locator(this.i) };
        const codeStart = code.start === undefined ? undefined : this.locator(code.start);
        return { kind: "eventModifier", name: base!, modifier, code: code.code, codeStart, pos, endPos: this.locator(this.i) };
      }
      if (!hasValue) {
        this.diagnostics.error("TZS008", this.rangeFrom(pos, this.i), `'@${base}' without a handler value.`);
        return { kind: "eventHandler", name: base!, code: "", pos, endPos: this.locator(this.i) };
      }
      const code = this.parseRequiredExpression(base!, pos);
      if (code === null) return { kind: "eventHandler", name: base!, code: "", pos, endPos: this.locator(this.i) };
      return { kind: "eventHandler", name: base!, code: code.code, codeStart: code.start === undefined ? undefined : this.locator(code.start), pos, endPos: this.locator(this.i) };
    }

    if (body.startsWith("bind")) {
      return this.parseBindAttribute(body, name, pos);
    }

    if (src[this.i] === "=") this.i++;
    this.parseAttributeValue();
    this.diagnostics.error("TZS001", this.rangeFrom(pos, this.i), `Unknown directive attribute '@${body}'.`);
    return { kind: "static", name, value: "", pos, endPos: this.locator(this.i) };
  }

  /**
   * Parses the @bind family: @bind, @bind:event/:format/:get/:set/:after and
   * @bind-<Target> (+ target modifiers). Modifier-only nodes carry exactly
   * one detail field and are folded into the preceding bind attribute by
   * parseTagAttributes (like event modifier attributes).
   */
  private parseBindAttribute(body: string, name: string, pos: SourcePos): AttributeNode {
    const src = this.source;
    const rest = body.slice(4); // after "bind"
    const end = (): SourceSpan => ({ pos, endPos: this.locator(this.i) });
    // Where a bind's code starts (syntax errors are reported there).
    const codeStarts = (key: string, value: { start?: number } | null) =>
      (value?.start === undefined ? {} : { codeStarts: { [key]: this.locator(value.start) } });

    // @bind="expr"
    if (rest === "") {
      const expression = this.parseRequiredExpression("bind", pos);
      return { kind: "bind", expression: expression?.code ?? "", ...codeStarts("expression", expression), ...end() };
    }

    // @bind-<Target>[:event|:format|:get|:set|:after] — a component parameter,
    // or on an element the attribute <Target> (codegen decides).
    if (rest.startsWith("-")) {
      const target = rest.slice(1);
      const colon = target.indexOf(":");
      const targetName = colon >= 0 ? target.slice(0, colon) : target;
      const modifier = colon >= 0 ? target.slice(colon + 1).toLowerCase() : undefined;
      if (targetName.length === 0) {
        if (src[this.i] === "=") this.i++;
        this.parseAttributeValue();
        this.diagnostics.error("TZS008", end(), "'@bind-' requires a parameter name (e.g. '@bind-Value').");
        return { kind: "bind", ...end() };
      }
      if (modifier === undefined) {
        const expression = this.parseRequiredExpression(`bind-${targetName}`, pos);
        return { kind: "bind", bindTarget: targetName, expression: expression?.code ?? "", ...codeStarts("expression", expression), ...end() };
      }
      if (modifier === "event" || modifier === "format" || modifier === "culture" || modifier === "get" || modifier === "set" || modifier === "after") {
        const value = this.parseRequiredExpression(`bind-${targetName}:${modifier}`, pos);
        // A plain-text :format value is a string literal (Razor: @bind:format="yyyy-MM-dd"); @expressions are code.
        const formatLiteral = modifier === "format" && value?.isText === true ? true : undefined;
        return {
          kind: "bind", bindTarget: targetName, [modifier]: value?.code ?? "", modifierSpans: { [modifier]: end() }, ...codeStarts(modifier, value), formatLiteral, ...end(),
        };
      }
      if (src[this.i] === "=") this.i++;
      this.parseAttributeValue();
      this.diagnostics.error("TZS008", end(), `Unknown bind modifier '@bind-${targetName}:${modifier}'.`);
      return { kind: "bind", ...end() };
    }

    // @bind:event / @bind:format / @bind:culture / @bind:get / @bind:set / @bind:after
    if (rest.startsWith(":")) {
      const modifier = rest.slice(1);
      const known = ["event", "format", "culture", "get", "set", "after"];
      if (!known.includes(modifier.toLowerCase())) {
        if (src[this.i] === "=") this.i++;
        this.parseAttributeValue();
        this.diagnostics.error("TZS008", end(), `Unknown bind modifier '@bind:${modifier}'.`);
        return { kind: "bind", ...end() };
      }
      const value = this.parseRequiredExpression(`bind:${modifier}`, pos);
      const key = modifier.toLowerCase();
      // A plain-text :format value is a string literal (Razor: @bind:format="yyyy-MM-dd"); @expressions are code.
      const formatLiteral = key === "format" && value?.isText === true ? true : undefined;
      return { kind: "bind", [key]: value?.code ?? "", modifierSpans: { [key]: end() }, ...codeStarts(key, value), formatLiteral, ...end() } as AttributeNode;
    }

    if (src[this.i] === "=") this.i++;
    this.parseAttributeValue();
    this.diagnostics.error("TZS008", end(), `Invalid '@${name}' attribute.`);
    return { kind: "bind", ...end() };
  }

  /** Parses an attribute's required expression value. `start` is the absolute
   *  index of the code's first character (undefined for quoted plain values
   *  that double as expression source — `@onclick="Increment"`). */
  private parseRequiredExpression(attrName: string, pos: SourcePos): { code: string; start?: number; isText?: boolean } | null {
    const src = this.source;
    // Without '=' there is no value to parse (reported once, on the attribute).
    const value = src[this.i] === "=" ? (this.i++, this.parseAttributeValue()) : null;
    if (value === null) {
      this.diagnostics.error("TZS009", this.rangeFrom(pos, this.i), `Attribute '@${attrName}' requires a value.`);
      return null;
    }
    // Directive attributes take expressions: a quoted plain value is the
    // expression source itself (Blazor's @onclick="Increment" style).
    if (value.kind === "code") return { code: value.code, start: value.start };
    if (value.kind === "parts" && value.parts.length === 1) {
      const part = value.parts[0]!;
      if (part.code !== undefined) return { code: part.code, start: part.start };
      if (part.text !== undefined) return { code: part.text, start: part.start, isText: true };
    }
    this.diagnostics.error("TZS009", this.rangeFrom(pos, this.i), `Attribute '@${attrName}' requires a single expression value.`);
    return null;
  }

  /** One parenthesized expression value `@(...)`: `code` is the text between
   *  the parens, `start` its absolute index. `at` is on the `@`. Unbalanced
   *  parens are TZS003, parsing resumes at the end of the file. */
  private parseParenthesizedValue(at: number): { kind: "code"; code: string; start: number } | null {
    const src = this.source;
    const end = this.ts.scanBalanced(at + 1, "(", ")");
    if (end < 0) {
      this.diagnostics.error("TZS003", this.range(at, at + 2), "Parenthesized attribute expression never closes.");
      this.i = src.length;
      return null;
    }
    const code = src.slice(at + 2, end - 1);
    this.i = end;
    return { kind: "code", code, start: at + 2 };
  }

  private parseAttributeValue(): { kind: "code"; code: string; start?: number } | { kind: "parts"; parts: ValuePart[] } | null {
    const src = this.source;
    if (src[this.i] === "@") {
      // Unquoted expression value, directly parenthesized `@(...)`: the value is
      // one parenthesized TS expression (Roslyn binds `@(` regardless of markup;
      // the string scan must skip literals, which scanBalanced does).
      if (src[this.i + 1] === "(") {
        return this.parseParenthesizedValue(this.i);
      }
      // Unquoted expression value.
      const at = this.i;
      const end = this.ts.scanImplicitExpression(this.i + 1);
      if (end <= this.i + 1) {
        this.diagnostics.error("TZS009", this.range(this.i, Math.max(end, this.i + 1)), "Expected an expression value.");
        return null;
      }
      const code = src.slice(this.i + 1, end);
      this.i = end;
      // `start` = absolute index of the code's first character (right after
      // the `@`, parens included when the value is `@(...)`), for token-precise
      // source maps in the LSP.
      return { kind: "code", code, start: at + 1 };
    }
    const quote = src[this.i];
    if (quote !== '"' && quote !== "'") {
      // Unquoted value (HTML): runs up to whitespace or the end of the tag.
      const start = this.i;
      while (this.i < src.length && !/[\s>]/.test(src[this.i]!) && !(src[this.i] === "/" && src[this.i + 1] === ">")) this.i++;
      if (this.i === start) {
        // On the `=` that announced the value (or where it was expected).
        const at = src[this.i - 1] === "=" ? this.i - 1 : this.i;
        this.diagnostics.error("TZS009", this.range(at, at + 1), "Expected an attribute value.");
        return null;
      }
      return { kind: "parts", parts: [{ text: src.slice(start, this.i), start }] };
    }
    const quoteAt = this.i;
    this.i++;
    const parts: ValuePart[] = [];
    let textBuf = "";
    let partTextStart: number | undefined;
    const pushText = (): void => {
      if (textPartsBuffer.length > 0) parts.push({ text: textPartsBuffer.join(""), start: partTextStart });
      textPartsBuffer.length = 0;
      partTextStart = undefined;
    };
    const textPartsBuffer: string[] = [];
    while (this.i < src.length && src[this.i] !== quote) {
      const ch = src[this.i]!;
      if (ch === "@") {
        if (src[this.i + 1] === "@") {
          textPartsBuffer.push("@");
          if (partTextStart === undefined) partTextStart = this.i;
          this.i += 2;
          continue;
        }
        if (src[this.i + 1] === "(") {
          pushText();
          const value = this.parseParenthesizedValue(this.i);
          if (value === null) return null;
          parts.push({ code: value.code, start: value.start ?? this.i + 2 });
          continue;
        }
        // Email rule: `@` right after an alphanumeric text character is literal.
        const emailLike = textPartsBuffer.length > 0 && isAlnum(src[this.i - 1]);
        if (isIdStart(src[this.i + 1]) && !emailLike) {
          const idStart = this.i + 1;
          const end = this.ts.scanImplicitExpression(idStart);
          pushText();
          parts.push({ code: src.slice(idStart, end), start: idStart });
          this.i = end;
          continue;
        }
      }
      textPartsBuffer.push(ch);
      if (partTextStart === undefined) partTextStart = this.i;
      this.i++;
    }
    if (src[this.i] !== quote) {
      this.diagnostics.error("TZS009", this.range(quoteAt, quoteAt + 1), "Attribute value is never closed.");
      this.i = src.length;
      return null;
    }
    this.i++;
    pushText();
    if (parts.length === 0) return { kind: "code", code: "" };
    return { kind: "parts", parts };
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  /** Parses a control header `(…)` (TS-balanced) at the next non-space. */
  private parseHeader(pos: SourcePos, word: string): Header {
    const keywordEnd = this.i;
    this.skipWhitespace();
    if (this.source[this.i] !== "(") {
      this.diagnostics.error("TZS003", this.rangeFrom(pos, keywordEnd), `Expected '(' after '${word}'.`);
      this.i = this.source.length;
      return { code: "" };
    }
    const end = this.code.scanBalanced(this.i);
    if (end < 0) {
      this.diagnostics.error("TZS003", this.rangeFrom(pos, this.i + 1), "Control condition never closes.");
      this.i = this.source.length;
      return { code: "" };
    }
    const raw = this.source.slice(this.i + 1, end - 1);
    const lead = raw.length - raw.trimStart().length;
    const start = this.locator(this.i + 1 + lead);
    this.i = end;
    return { code: raw.trim(), start, end: this.locator(end) };
  }

  /** A control body: a `{ … }` block or a single statement (both code-first). */
  private parseBody(pos: SourcePos): MarkupNode[] {
    // A missing statement is reported on the keyword and header before it.
    const header = this.rangeFrom(pos, this.i);
    this.skipCodeTrivia();
    const children: MarkupNode[] = [];
    this.nesting++;
    if (this.source[this.i] === "{") {
      this.i++;
      this.parseCodeStatements(children, "block", this.range(this.i - 1, this.i));
    } else {
      this.parseCodeStatements(children, "single", header);
    }
    this.nesting--;
    return children;
  }

  private nextNonSpace(from: number): string | undefined {
    let k = from;
    while (k < this.source.length && /\s/.test(this.source[k]!)) k++;
    return this.source[k];
  }

  private skipWhitespace(): void {
    while (this.i < this.source.length && /\s/.test(this.source[this.i]!)) this.i++;
  }

  private skipOwnLine(): void {
    // A directive/code/control statement "owns" its trailing whitespace up to
    // and including the line break (Razor-style trimming).
    let i = this.i;
    while (i < this.source.length && /[ \t]/.test(this.source[i]!)) i++;
    if (this.source[i] === "\n") {
      this.i = i + 1;
      if (this.source[this.i] === "\r") this.i++;
    } else if (this.source[i] === "\r") {
      this.i = i + 1;
      if (this.source[this.i] === "\n") this.i++;
    }
  }

  private sliceWord(at: number): string {
    let end = at;
    while (isIdPart(this.source[end])) end++;
    return this.source.slice(at, end);
  }

  private findChar(from: number, ch: string): number {
    let i = from;
    while (i < this.source.length && this.source[i] !== ch) i++;
    return i;
  }

  private pushText(out: MarkupNode[], content: string, pos: SourcePos): void {
    out.push({ kind: "text", content, pos, endPos: this.locator(this.i) });
  }
}
