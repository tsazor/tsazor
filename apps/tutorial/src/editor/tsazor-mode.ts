/**
 * A `.tsazor` highlighting mode as a CodeMirror stream parser: Razor markup
 * with embedded TypeScript (`@code { }`, `@{ }`, `@( )`, control-block
 * headers, implicit `@expressions`, attribute values). Shared by the editor
 * (StreamLanguage) and the build-time highlighter of the lesson text.
 *
 * It is a highlighter, not a parser: it tracks just enough context (brace and
 * paren depth, quotes, comments) to color the tutorial's code correctly.
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
  /** TS code until the matching close (`}` for blocks, `)` for expressions/headers). */
  | { kind: "code"; close: "}" | ")" | "]"; depth: number }
  /** Inside `<tag …>` after the name. */
  | { kind: "tag" }
  /** A quoted attribute value. */
  | { kind: "attr"; quote: string };

export interface TsazorState {
  stack: Frame[];
  /** Multi-line comment in progress: Razor `@* *@`, HTML `<!-- -->` or TS block comment. */
  comment: "" | "razor" | "html" | "ts";
  /** Template literal in progress (TS). */
  template: boolean;
  /** The last markup token was a control keyword: its `(` opens a code header. */
  expectHeader: boolean;
  /** `@code` / `@functions` / `@if`… seen: the next `{` opens a code block (`@code`) or a markup body. */
  expectBlock: "" | "code" | "markup";
  /** Rest of a directive line (`@import …`, `@inject …`): tokenized as TypeScript. */
  lineCode: boolean;
  /** The `@` of an implicit expression was emitted; its identifier chain follows. */
  implicit: boolean;
}

const TS_KEYWORDS = new Set([
  "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "declare", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for", "from", "function", "get", "if",
  "implements", "import", "in", "instanceof", "interface", "keyof", "let", "new", "null", "of", "override", "private",
  "protected", "public", "readonly", "return", "satisfies", "set", "static", "super", "switch", "this", "throw",
  "true", "try", "type", "typeof", "undefined", "var", "void", "while", "yield",
]);
const TS_TYPES = new Set(["string", "number", "boolean", "bigint", "unknown", "any", "never", "object", "symbol"]);

const CONTROL = /^(if|else|foreach|for|while|do|switch|try|catch|finally)\b/;
const DIRECTIVES = /^(page|layout|using|import|inject|inherits|typeparam|implements|namespace|attribute|authorize|rendermode|preservewhitespace)\b/;

export function startState(): TsazorState {
  return { stack: [], comment: "", template: false, expectHeader: false, expectBlock: "", lineCode: false, implicit: false };
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
  if (state.lineCode && stream.sol()) state.lineCode = false;
  if (state.lineCode) return code(stream, state, LINE_FRAME);
  const frame = top(state);
  if (frame?.kind === "code") return code(stream, state, frame);
  if (frame?.kind === "tag") return tag(stream, state);
  if (frame?.kind === "attr") return attrValue(stream, state, frame);
  return markup(stream, state);
}

/* Markup --------------------------------------------------------------------------- */

function markup(stream: StreamLike, state: TsazorState): string | null {
  if (stream.eatSpace()) return null;
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
    if (state.expectBlock === "code") state.stack.push({ kind: "code", close: "}", depth: 0 });
    state.expectBlock = "";
    return "brace";
  }
  if (stream.peek() === "}") {
    stream.next();
    // `} else {` / `} else if (…) {`
    if (stream.match(/^\s*else\b/, false)) {
      stream.eatSpace();
      stream.match("else");
      state.expectBlock = "markup";
      if (stream.match(/^\s*if\b/, false)) {
        stream.eatSpace();
        stream.match("if");
        state.expectHeader = true;
      }
      return "keyword";
    }
    return "brace";
  }
  if (stream.match(/^<\/?[A-Za-z][\w.:-]*/, false)) {
    const name = (stream.match(/^<\/?([A-Za-z][\w.:-]*)/) as RegExpMatchArray)[1]!;
    state.stack.push({ kind: "tag" });
    return /^[A-Z]/.test(name) ? "typeName" : "tagName";
  }
  if (stream.match("&")) {
    stream.match(/^#?\w+;/);
    return "atom";
  }
  stream.next();
  stream.eatWhile(/[^@<{}&\s]/);
  return null;
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
    state.stack.push({ kind: "code", close: "}", depth: 0 });
    return "meta";
  }
  if (stream.peek() === ":") {
    stream.next();
    return "meta";
  }
  if (stream.match(/^(code|functions)\b/)) {
    state.expectBlock = "code";
    return "keyword";
  }
  if (stream.match(CONTROL)) {
    const word = stream.current().slice(1);
    state.expectHeader = word !== "else" && word !== "do" && word !== "try" && word !== "finally";
    state.expectBlock = "markup";
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

function tag(stream: StreamLike, state: TsazorState): string | null {
  if (stream.eatSpace()) return null;
  if (stream.match("/>") || stream.match(">")) {
    state.stack.pop();
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

function code(stream: StreamLike, state: TsazorState, frame: { close: string; depth: number }): string | null {
  if (stream.eatSpace()) return null;
  const ch = stream.peek()!;
  if (stream.match("//")) {
    stream.skipToEnd();
    return "comment";
  }
  if (stream.match("/*")) {
    state.comment = "ts";
    return tsBlockComment(stream, state);
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
      // `@if (…)` header closed: the body follows.
      return frame.close === "}" ? "brace" : "bracket";
    }
    frame.depth--;
    return frame.close === "}" ? "brace" : "bracket";
  }
  // Markup inside a code block: `<tag` in statement position.
  if (ch === "<" && frame.close === "}" && stream.match(/^<\/?[A-Za-z]/, false)) {
    const name = (stream.match(/^<\/?([A-Za-z][\w.:-]*)/) as RegExpMatchArray)[1]!;
    state.stack.push({ kind: "tag" });
    return /^[A-Z]/.test(name) ? "typeName" : "tagName";
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
