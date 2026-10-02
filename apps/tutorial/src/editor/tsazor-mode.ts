/**
 * A `.tsazor` highlighting mode as a CodeMirror stream parser: Razor markup
 * with embedded TypeScript. Shared by the editor (StreamLanguage) and the
 * build-time highlighter of the lesson text.
 *
 * Contexts follow the language (language-reference.md, "Code contexts"):
 *
 * - markup (the document level) with `@expr`, `@(…)`, attribute values;
 * - `@code { }` / `@functions { }`: a TypeScript class body;
 * - `@{ }` and the bodies of `@if`/`else`, `@foreach`, `@for`, `@while`,
 *   `@switch`, `@try`… — **code-first**: TypeScript statements, where markup
 *   only starts at a tag in statement position (and runs until that element
 *   closes), at `@:` (the rest of the line) and at `@expr` (output);
 * - `@if (…)` / `@foreach (…)` headers and directive lines (`@import …`).
 *
 * It is a highlighter, not a parser: it tracks just enough context (brace and
 * paren depth, element nesting, quotes, comments) to color the tutorial's
 * code correctly.
 */

export interface StreamLike {
  pos: number;
  string: string;
  sol(): boolean;
  eol(): boolean;
  peek(): string | void;
  next(): string | void;
  eat(match: string | RegExp | ((ch: string) => boolean)): string | void;
  eatWhile(match: string | RegExp | ((ch: string) => boolean)): boolean;
  eatSpace(): boolean;
  skipToEnd(): void;
  match(pattern: string | RegExp, consume?: boolean, caseFold?: boolean): boolean | RegExpMatchArray | null;
  current(): string;
}

type Frame =
  /**
   * TS code until the matching close (`}` for blocks, `)` for expressions and
   * headers). `statements`: a code-first context (`@{ }`, control bodies),
   * where tags in statement position open markup; `control`: a control body,
   * whose `}` may continue with `else`/`catch`/`finally`.
   */
  | { kind: "code"; close: "}" | ")" | "]"; depth: number; statements?: boolean; control?: boolean }
  /** Element content opened from a code context: markup until the element closes. */
  | { kind: "element"; depth: number }
  /** Inside `<tag …>` after the name. `fromCode`: opened in statement position. */
  | { kind: "tag"; closing: boolean; void: boolean; fromCode: boolean }
  /** A quoted attribute value. */
  | { kind: "attr"; quote: string };

export interface TsazorState {
  stack: Frame[];
  /** Multi-line comment in progress: Razor `@* *@`, HTML `<!-- -->` or TS block comment. */
  comment: "" | "razor" | "html" | "ts";
  /** Template literal in progress (TS). */
  template: boolean;
  /** The last token was a control keyword: its `(` opens a code header. */
  expectHeader: boolean;
  /** The next `{` opens a code block: a class body (`@code`) or statements (`@{`, control bodies). */
  expectBlock: "" | "code" | "control";
  /** A control body just closed: `else` / `catch` / `finally` may continue it. */
  maybeContinuation: boolean;
  /** Rest of a directive line (`@import …`, `@inject …`): tokenized as TypeScript. */
  lineCode: boolean;
  /** Rest of a `@:` line inside a code context: tokenized as markup. */
  lineMarkup: boolean;
  /** The `@` of an implicit expression was emitted; its identifier chain follows. */
  implicit: boolean;
  /** Last significant character in a code context (statement-position check for tags). */
  prev: string;
}

const TS_KEYWORDS = new Set([
  "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "declare", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for", "from", "function", "get", "if",
  "implements", "import", "in", "instanceof", "interface", "keyof", "let", "new", "null", "of", "override", "private",
  "protected", "public", "readonly", "return", "satisfies", "set", "static", "super", "switch", "this", "throw",
  "true", "try", "type", "typeof", "undefined", "var", "void", "while", "yield", "accessor",
]);
const TS_TYPES = new Set(["string", "number", "boolean", "bigint", "unknown", "any", "never", "object", "symbol"]);
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

const CONTROL = /^(if|else|foreach|for|while|do|switch|try|catch|finally)\b/;
const DIRECTIVES = /^(page|layout|using|import|inject|inherits|typeparam|implements|namespace|attribute|authorize|rendermode|preservewhitespace)\b/;

export function startState(): TsazorState {
  return {
    stack: [],
    comment: "",
    template: false,
    expectHeader: false,
    expectBlock: "",
    maybeContinuation: false,
    lineCode: false,
    lineMarkup: false,
    implicit: false,
    prev: "",
  };
}

export function copyState(state: TsazorState): TsazorState {
  return { ...state, stack: state.stack.map((frame) => ({ ...frame })) };
}

/** Pseudo frame for directive lines: never closes (the line end does), depth is irrelevant. */
const LINE_FRAME = { close: "]" as const, depth: Number.POSITIVE_INFINITY };

const top = (state: TsazorState): Frame | undefined => state.stack[state.stack.length - 1];

export function token(stream: StreamLike, state: TsazorState): string | null {
  if (state.comment === "razor") return razorComment(stream, state);
  if (state.comment === "html") return htmlComment(stream, state);
  if (state.comment === "ts") return tsBlockComment(stream, state);
  if (state.template) return templateLiteral(stream, state);
  if (state.implicit) {
    state.implicit = false;
    if (stream.match(/^[A-Za-z_$][\w$]*/)) {
      implicitTail(stream, state);
      return "variableName";
    }
  }
  if (stream.sol()) {
    state.lineCode = false;
    state.lineMarkup = false;
  }
  if (state.lineCode) return code(stream, state, LINE_FRAME);
  const frame = top(state);
  if (frame?.kind === "tag") return tag(stream, state, frame);
  if (frame?.kind === "attr") return attrValue(stream, state, frame);
  if (state.lineMarkup) return markup(stream, state);
  if (frame?.kind === "code") return code(stream, state, frame);
  return markup(stream, state);
}

/* Markup --------------------------------------------------------------------------- */

function markup(stream: StreamLike, state: TsazorState): string | null {
  if (stream.eatSpace()) return null;
  if (state.maybeContinuation) {
    state.maybeContinuation = false;
    const continuation = stream.match(/^(else|catch|finally)\b/) as RegExpMatchArray | null;
    if (continuation) {
      state.expectBlock = "control";
      if (continuation[1] === "catch") state.expectHeader = true;
      else if (continuation[1] === "else" && stream.match(/^\s*if\b/, false)) {
        stream.eatSpace();
        stream.match("if");
        state.expectHeader = true;
      }
      return "keyword";
    }
  }
  if (stream.match("@*")) {
    state.comment = "razor";
    return razorComment(stream, state);
  }
  if (stream.match("<!--")) {
    state.comment = "html";
    return htmlComment(stream, state);
  }
  if (stream.match("@@")) return null;
  if (stream.peek() === "@") return transition(stream, state);
  if (state.expectHeader && stream.peek() === "(") {
    stream.next();
    state.expectHeader = false;
    state.stack.push({ kind: "code", close: ")", depth: 0 });
    return "bracket";
  }
  if (stream.peek() === "{" && state.expectBlock) {
    stream.next();
    state.stack.push(
      state.expectBlock === "code"
        ? { kind: "code", close: "}", depth: 0 }
        : { kind: "code", close: "}", depth: 0, statements: true, control: true },
    );
    state.expectBlock = "";
    state.prev = "{";
    return "brace";
  }
  if (stream.match(/^<\/?[A-Za-z][\w.:-]*/, false)) return openTag(stream, state, false);
  if (stream.match("&")) {
    stream.match(/^#?\w+;/);
    return "atom";
  }
  stream.next();
  stream.eatWhile(/[^@<&\s]/);
  return null;
}

function openTag(stream: StreamLike, state: TsazorState, fromCode: boolean): string {
  const match = stream.match(/^<(\/?)([A-Za-z][\w.:-]*)/) as RegExpMatchArray;
  const name = match[2]!;
  state.stack.push({ kind: "tag", closing: match[1] === "/", void: VOID_ELEMENTS.has(name.toLowerCase()), fromCode });
  return /^[A-Z]/.test(name) ? "typeName" : "tagName";
}

function transition(stream: StreamLike, state: TsazorState): string {
  stream.next(); // @
  if (stream.peek() === "(") {
    stream.next();
    state.stack.push({ kind: "code", close: ")", depth: 0 });
    return "meta";
  }
  if (stream.peek() === "{") {
    stream.next();
    state.stack.push({ kind: "code", close: "}", depth: 0, statements: true });
    state.prev = "{";
    return "meta";
  }
  if (stream.peek() === ":") {
    stream.next();
    state.lineMarkup = true;
    return "meta";
  }
  if (stream.match(/^(code|functions)\b/)) {
    state.expectBlock = "code";
    return "keyword";
  }
  if (stream.match(CONTROL)) {
    const word = stream.current().slice(1);
    state.expectHeader = word !== "else" && word !== "do" && word !== "try" && word !== "finally";
    state.expectBlock = "control";
    return "keyword";
  }
  if (stream.sol() || stream.string.slice(0, stream.pos - 1).trim() === "") {
    if (stream.match(DIRECTIVES)) {
      // The rest of a directive line is TS-ish text (types, specifiers, strings).
      state.lineCode = true;
      return "keyword";
    }
  }
  // Implicit expression: the `@` is meta, the identifier chain follows as the next token.
  if (stream.match(/^[A-Za-z_$]/, false)) state.implicit = true;
  return "meta";
}

/** `.member`, `(args)` and `[index]` continuations of an implicit expression. */
function implicitTail(stream: StreamLike, state: TsazorState): void {
  for (;;) {
    if (stream.match(/^\??\.[A-Za-z_$][\w$]*/)) continue;
    if (stream.peek() === "(" || stream.peek() === "[") {
      const open = stream.next()!;
      state.stack.push({ kind: "code", close: open === "(" ? ")" : "]", depth: 0 });
      return;
    }
    return;
  }
}

/* Tags and attributes ----------------------------------------------------------- */

function tag(stream: StreamLike, state: TsazorState, frame: Extract<Frame, { kind: "tag" }>): string | null {
  if (stream.eatSpace()) return null;
  const selfClosing = stream.match("/>");
  if (selfClosing || stream.match(">")) {
    state.stack.pop();
    const opensContent = !selfClosing && !frame.closing && !frame.void;
    const parent = top(state);
    if (parent?.kind === "element") {
      // Nested element inside markup that a code context opened.
      if (opensContent) parent.depth++;
      else if (frame.closing && --parent.depth === 0) {
        state.stack.pop();
        state.prev = ">";
      }
    } else if (frame.fromCode) {
      if (opensContent) state.stack.push({ kind: "element", depth: 1 });
      else state.prev = ">";
    }
    return "tagName";
  }
  if (stream.peek() === '"' || stream.peek() === "'") {
    const quote = stream.next()!;
    state.stack.push({ kind: "attr", quote });
    return "string";
  }
  if (stream.match(/^@[\w-]+(:[\w-]+)?/)) return "meta";
  if (stream.match(/^[^\s=>/"']+/)) return "attributeName";
  if (stream.eat("=")) return "operator";
  stream.next();
  return null;
}

function attrValue(stream: StreamLike, state: TsazorState, frame: { quote: string }): string | null {
  if (stream.peek() === frame.quote) {
    stream.next();
    state.stack.pop();
    return "string";
  }
  if (stream.peek() === "@") {
    // Email rule: `@` after an alphanumeric is literal.
    const before = stream.string[stream.pos - 1];
    if (!before || !/[A-Za-z0-9]/.test(before)) return transition(stream, state);
  }
  stream.next();
  stream.eatWhile((ch) => ch !== frame.quote && ch !== "@");
  return "string";
}

/* TypeScript -------------------------------------------------------------------- */

function code(stream: StreamLike, state: TsazorState, frame: { close: string; depth: number; statements?: boolean; control?: boolean }): string | null {
  if (stream.eatSpace()) return null;
  const style = codeToken(stream, state, frame);
  const text = stream.current().trim();
  if (text.length > 0 && style !== "comment") state.prev = text[text.length - 1]!;
  return style;
}

function codeToken(stream: StreamLike, state: TsazorState, frame: { close: string; depth: number; statements?: boolean; control?: boolean }): string | null {
  const ch = stream.peek()!;
  if (stream.match("//")) {
    stream.skipToEnd();
    return "comment";
  }
  if (stream.match("/*")) {
    state.comment = "ts";
    return tsBlockComment(stream, state);
  }
  if (frame.statements) {
    // Code-first contexts: markup at a tag in statement position, `@:` lines, `@expr` output.
    if (ch === "@" && stream.match(/^@[:({A-Za-z_$]/, false)) return transition(stream, state);
    if (ch === "<" && /^[{};)>]?$/.test(state.prev) && stream.match(/^<\/?[A-Za-z]/, false)) return openTag(stream, state, true);
  }
  if (ch === '"' || ch === "'") {
    stream.next();
    let escaped = false;
    for (let next = stream.next(); next !== undefined; next = stream.next()) {
      if (next === ch && !escaped) break;
      escaped = !escaped && next === "\\";
    }
    return "string";
  }
  if (ch === "`") {
    stream.next();
    state.template = true;
    return templateLiteral(stream, state);
  }
  if (stream.match(/^\d[\d_]*(\.\d+)?(e[+-]?\d+)?n?/i)) return "number";
  if (stream.match(/^@[A-Za-z_$][\w$]*/)) return "meta"; // decorators
  if (stream.match(/^[A-Za-z_$][\w$]*/)) {
    const word = stream.current();
    if (TS_KEYWORDS.has(word)) return "keyword";
    if (TS_TYPES.has(word)) return "typeName";
    if (/^[A-Z]/.test(word)) return "typeName";
    if (stream.match(/^\s*\(/, false)) return "variableName.function";
    return "variableName";
  }
  const open = frame.close === "}" ? "{" : frame.close === ")" ? "(" : "[";
  if (ch === open) {
    stream.next();
    frame.depth++;
    return frame.close === "}" ? "brace" : "bracket";
  }
  if (ch === frame.close) {
    stream.next();
    if (frame.depth === 0) {
      state.stack.pop();
      // A control body closed: `} else {`, `} catch (e) {`, `} finally {` may follow.
      if (frame.control) state.maybeContinuation = true;
      return frame.close === "}" ? "brace" : "bracket";
    }
    frame.depth--;
    return frame.close === "}" ? "brace" : "bracket";
  }
  if (stream.match(/^[{}()[\]]/)) return "bracket";
  if (stream.match(/^[=<>!+\-*/%&|^~?:]+/)) return "operator";
  stream.next();
  return "punctuation";
}

function templateLiteral(stream: StreamLike, state: TsazorState): string {
  while (!stream.eol()) {
    const next = stream.next();
    if (next === "\\") {
      stream.next();
      continue;
    }
    if (next === "`") {
      state.template = false;
      return "string";
    }
  }
  return "string";
}

function tsBlockComment(stream: StreamLike, state: TsazorState): string {
  while (!stream.eol()) {
    if (stream.match("*/")) {
      state.comment = "";
      return "comment";
    }
    stream.next();
  }
  return "comment";
}

function razorComment(stream: StreamLike, state: TsazorState): string {
  while (!stream.eol()) {
    if (stream.match("*@")) {
      state.comment = "";
      return "comment";
    }
    stream.next();
  }
  return "comment";
}

function htmlComment(stream: StreamLike, state: TsazorState): string {
  while (!stream.eol()) {
    if (stream.match("-->")) {
      state.comment = "";
      return "comment";
    }
    stream.next();
  }
  return "comment";
}

/** The stream-parser spec for `StreamLanguage.define`. */
export const tsazorStreamParser = {
  name: "tsazor",
  startState,
  copyState,
  token,
  languageData: { commentTokens: { block: { open: "@*", close: "*@" } } },
};
