import ts from "typescript";

/**
 * TypeScript-token scanner for code contexts (`@{ }`, control-block bodies
 * and headers, `@code`, `@(...)`). Built on `ts.createScanner`, so strings,
 * template literals (with nested `${}`), comments and regex literals are
 * handled by the real TS lexer instead of a heuristic brace pre-scan.
 */

const SK = ts.SyntaxKind;

export interface CodeToken {
  kind: ts.SyntaxKind;
  start: number;
  end: number;
  /** A line break sits between the previous token and this one. */
  newlineBefore: boolean;
}

/** Keywords after which an expression (and thus a regex) or a continuation must follow. */
const EXPECTS_CONTINUATION = new Set<ts.SyntaxKind>([
  SK.NewKeyword, SK.TypeOfKeyword, SK.DeleteKeyword, SK.AwaitKeyword, SK.YieldKeyword,
  SK.InKeyword, SK.InstanceOfKeyword, SK.AsKeyword, SK.SatisfiesKeyword, SK.ExtendsKeyword,
  SK.ImplementsKeyword, SK.KeyOfKeyword, SK.ConstKeyword, SK.LetKeyword, SK.VarKeyword,
  SK.FunctionKeyword, SK.ClassKeyword, SK.IfKeyword, SK.ElseKeyword, SK.ForKeyword,
  SK.WhileKeyword, SK.DoKeyword, SK.SwitchKeyword, SK.CaseKeyword, SK.ThrowKeyword,
  SK.TryKeyword, SK.CatchKeyword, SK.FinallyKeyword, SK.ImportKeyword, SK.ExportKeyword,
  SK.EnumKeyword, SK.InterfaceKeyword, SK.WithKeyword, SK.OfKeyword,
]);

/** Keywords that continue an expression across a line break (`a\n in b`). */
const CONTINUING_KEYWORDS = new Set<ts.SyntaxKind>([
  SK.InKeyword, SK.InstanceOfKeyword, SK.AsKeyword, SK.SatisfiesKeyword, SK.OfKeyword,
]);

const isKeyword = (kind: ts.SyntaxKind): boolean => kind >= SK.FirstKeyword && kind <= SK.LastKeyword;

const isLiteral = (kind: ts.SyntaxKind): boolean =>
  kind === SK.StringLiteral || kind === SK.NumericLiteral || kind === SK.BigIntLiteral ||
  kind === SK.NoSubstitutionTemplateLiteral || kind === SK.RegularExpressionLiteral || kind === SK.TemplateTail;

/** Whether a `/` after `prev` is a division (false ⇒ a regex literal starts). */
function slashIsDivision(prev: ts.SyntaxKind | undefined): boolean {
  if (prev === undefined) return false;
  if (prev === SK.Identifier || prev === SK.PrivateIdentifier || isLiteral(prev)) return true;
  if (prev === SK.CloseParenToken || prev === SK.CloseBracketToken || prev === SK.CloseBraceToken) return true;
  if (prev === SK.PlusPlusToken || prev === SK.MinusMinusToken) return true;
  return prev === SK.ThisKeyword || prev === SK.SuperKeyword || prev === SK.TrueKeyword ||
    prev === SK.FalseKeyword || prev === SK.NullKeyword;
}

/** Whether a statement may end right after `prev` (automatic semicolon insertion). */
function canEndStatement(prev: ts.SyntaxKind): boolean {
  if (prev === SK.Identifier || prev === SK.PrivateIdentifier || isLiteral(prev)) return true;
  if (prev === SK.CloseParenToken || prev === SK.CloseBracketToken || prev === SK.CloseBraceToken) return true;
  if (prev === SK.PlusPlusToken || prev === SK.MinusMinusToken || prev === SK.ExclamationToken) return true;
  // `let m: Map<K, V>` ends a declaration.
  if (prev === SK.GreaterThanToken) return true;
  return isKeyword(prev) && !EXPECTS_CONTINUATION.has(prev);
}

export class CodeScanner {
  private readonly scanner: ts.Scanner;
  /** Open `(`, `[`, `{` and template `${` of the current scan. */
  private stack: string[] = [];
  private prev: ts.SyntaxKind | undefined;

  constructor(private readonly source: string) {
    this.scanner = ts.createScanner(ts.ScriptTarget.Latest, /* skipTrivia */ true, ts.LanguageVariant.Standard, source);
  }

  /** Nesting depth (brackets + template spans) after the last token. */
  get depth(): number {
    return this.stack.length;
  }

  /** Starts a fresh token stream at `index`. */
  reset(index: number): void {
    this.scanner.resetTokenState(index);
    this.stack = [];
    this.prev = undefined;
  }

  /** Next token, with regex literals and template continuations resolved. */
  next(): CodeToken {
    let kind = this.scanner.scan();
    if ((kind === SK.SlashToken || kind === SK.SlashEqualsToken) && !slashIsDivision(this.prev)) {
      kind = this.scanner.reScanSlashToken();
    }
    if (kind === SK.CloseBraceToken && this.stack[this.stack.length - 1] === "${") {
      kind = this.scanner.reScanTemplateToken(false);
    }
    switch (kind) {
      case SK.OpenParenToken: this.stack.push("("); break;
      case SK.OpenBracketToken: this.stack.push("["); break;
      case SK.OpenBraceToken: this.stack.push("{"); break;
      case SK.TemplateHead: this.stack.push("${"); break;
      case SK.TemplateTail:
      case SK.CloseParenToken:
      case SK.CloseBracketToken:
      case SK.CloseBraceToken:
        this.stack.pop();
        break;
    }
    this.prev = kind;
    return {
      kind,
      start: this.scanner.getTokenStart(),
      end: this.scanner.getTokenEnd(),
      newlineBefore: this.scanner.hasPrecedingLineBreak(),
    };
  }

  /**
   * Continues the token stream at `index` with the open brackets kept, after a value the caller read itself (a
   * Razor template in `@code`): a `/` that follows divides.
   */
  resume(index: number): void {
    this.scanner.resetTokenState(index);
    this.prev = SK.Identifier;
  }

  /** First token at or after `index` (trivia skipped), without state. */
  peek(index: number): CodeToken {
    this.reset(index);
    return this.next();
  }

  /**
   * Scans the balanced region opened by the bracket at `index` (`(`, `[` or
   * `{`) and returns the index right after its closing bracket, or -1 when it
   * never closes.
   */
  scanBalanced(index: number): number {
    this.reset(index);
    const first = this.next();
    if (first.start !== index || this.depth !== 1) return -1;
    for (;;) {
      const token = this.next();
      if (token.kind === SK.EndOfFileToken) return -1;
      if (this.stack.length === 0) return token.end;
    }
  }

  /**
   * Finds the end of a run of TypeScript statements starting at `index`: the
   * run stops before a `}` that closes the enclosing block, before markup in
   * statement position (`<tag`, `@…`) and before a line that starts a control
   * statement, which the caller parses into its own node. Statement boundaries
   * follow `;` and automatic semicolon insertion at line breaks.
   *
   * `isBoundary(token)` decides, for a token at statement start (depth 0,
   * after a completed statement), whether the run must stop before it.
   * `single` stops after the first statement (braceless control bodies).
   */
  scanStatements(index: number, isBoundary: (token: CodeToken) => boolean, single = false): number {
    this.reset(index);
    let lastEnd = index;
    let atStatementStart = true;
    let first = true;
    let prevKind: ts.SyntaxKind | undefined;
    for (;;) {
      const depthBefore = this.depth;
      const token = this.next();
      if (token.kind === SK.EndOfFileToken) return lastEnd;
      if (depthBefore === 0) {
        // A closing bracket that was never opened here belongs to the caller.
        if (token.kind === SK.CloseBraceToken || token.kind === SK.CloseParenToken || token.kind === SK.CloseBracketToken) {
          return lastEnd;
        }
        // Automatic semicolon insertion: a line break after a complete
        // expression, followed by something that cannot continue it. (A
        // block-bodied statement like `function f() { }` ends this way too.)
        if (!atStatementStart && token.newlineBefore && prevKind !== undefined && canEndStatement(prevKind) &&
          this.startsStatement(token)) {
          atStatementStart = true;
        }
        if (atStatementStart && !first && (single || isBoundary(token))) return lastEnd;
      }
      first = false;
      atStatementStart = depthBefore === 0 && token.kind === SK.SemicolonToken;
      if (single && atStatementStart) return token.end;
      prevKind = token.kind;
      lastEnd = token.end;
    }
  }

  /** Whether `token`, on a new line after a complete expression, starts a new statement. */
  private startsStatement(token: CodeToken): boolean {
    const kind = token.kind;
    if (kind === SK.Identifier || kind === SK.PrivateIdentifier) return true;
    if (isKeyword(kind)) return !CONTINUING_KEYWORDS.has(kind);
    if (kind === SK.StringLiteral || kind === SK.NumericLiteral || kind === SK.BigIntLiteral ||
      kind === SK.NoSubstitutionTemplateLiteral || kind === SK.TemplateHead) return true;
    if (kind === SK.AtToken || kind === SK.OpenBraceToken || kind === SK.PlusPlusToken || kind === SK.MinusMinusToken ||
      kind === SK.ExclamationToken || kind === SK.TildeToken || kind === SK.SemicolonToken) return true;
    // `<tag` on a new line is markup in statement position; `a\n< b` continues.
    if (kind === SK.LessThanToken) return /[A-Za-z!/]/.test(this.source[token.end] ?? "");
    return false;
  }
}

/** Names a run of statements binds in its own scope, plus TS parse errors. */
export interface StatementInfo {
  declares: string[];
  /** The declared names that cannot be assigned to (`const`, function, class, enum) — `@bind` targets them in error. */
  readonly: Record<string, ReadonlyDeclaration>;
  /** Parse errors: offset relative to the code, length (≥ 1), message. */
  errors: Array<{ offset: number; length: number; message: string }>;
}

export type ReadonlyDeclaration = "const" | "function" | "class" | "enum";

/** Parses statement code with the TS parser (syntax only) to collect its
 *  top-level declarations (const/let/var incl. destructuring, function,
 *  class, enum) and syntax errors. */
export function analyzeStatements(code: string): StatementInfo {
  const file = ts.createSourceFile("statement.ts", code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const declares: string[] = [];
  const readonly: StatementInfo["readonly"] = {};
  let kind: ReadonlyDeclaration | null = null;
  const addBinding = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) {
      declares.push(name.text);
      if (kind) readonly[name.text] = kind;
      else delete readonly[name.text];
      return;
    }
    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element)) addBinding(element.name);
    }
  };
  const errors: StatementInfo["errors"] = [];
  for (const statement of file.statements) {
    if (ts.isExpressionStatement(statement) && !isStatementExpression(statement.expression)) {
      // C# rule CS0201: only assignment, call, increment/decrement, await and
      // `new` expressions are statements. A bare word in a body (`Light`) is
      // markup text the author forgot to mark — valid TS, so say it here.
      errors.push({
        offset: statement.getStart(file),
        length: statement.getEnd() - statement.getStart(file),
        message: `'${statement.getText(file)}' is not a statement`,
      });
    }
    if (ts.isVariableStatement(statement)) {
      kind = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0 ? "const" : null;
      for (const declaration of statement.declarationList.declarations) addBinding(declaration.name);
    } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) {
      declares.push(statement.name.text);
      readonly[statement.name.text] = ts.isFunctionDeclaration(statement) ? "function" : ts.isClassDeclaration(statement) ? "class" : "enum";
    }
  }
  const parseDiagnostics = (file as unknown as { parseDiagnostics?: readonly ts.DiagnosticWithLocation[] }).parseDiagnostics ?? [];
  const syntax = parseDiagnostics.map((d) => ({
    offset: d.start,
    length: Math.max(1, d.length),
    message: ts.flattenDiagnosticMessageText(d.messageText, " "),
  }));
  // Syntax errors first: they explain a following non-statement.
  return { declares, readonly, errors: [...syntax, ...errors] };
}

/** Expressions that may stand alone as a statement (C#'s CS0201 set). */
function isStatementExpression(expression: ts.Expression): boolean {
  let e = expression;
  while (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e)) e = e.expression;
  if (ts.isCallExpression(e) || ts.isNewExpression(e) || ts.isAwaitExpression(e) || ts.isYieldExpression(e) ||
    ts.isDeleteExpression(e) || ts.isVoidExpression(e) || ts.isTaggedTemplateExpression(e)) return true;
  if (ts.isPrefixUnaryExpression(e) || ts.isPostfixUnaryExpression(e)) {
    return e.operator === ts.SyntaxKind.PlusPlusToken || e.operator === ts.SyntaxKind.MinusMinusToken;
  }
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment) return true;
    // `a && a.run()`, `a, b()` — the right operand carries the effect.
    if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.CommaToken) return isStatementExpression(e.right);
    return false;
  }
  if (ts.isConditionalExpression(e)) return isStatementExpression(e.whenTrue) && isStatementExpression(e.whenFalse);
  return false;
}
