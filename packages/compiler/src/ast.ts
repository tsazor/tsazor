/** AST for .tsazor markup. Positions are 1-based line / 0-based column. */

export interface SourceSpan {
  pos: { line: number; column: number };
  endPos: { line: number; column: number };
}

export interface TextNode extends SourceSpan {
  kind: "text";
  content: string;
}

export interface DirectiveNode extends SourceSpan {
  kind: "directive";
  name: string;
  /** Raw value text after the directive keyword (trimmed). Empty when absent. */
  value: string;
  /** Source position of `value[0]` — `@import` values may span lines,
   *  `@attribute` decorators are emitted mapped, diagnostics cover the value.
   *  Set by the parser for every directive. */
  valueStart?: { line: number; column: number };
}

export interface ElementNode extends SourceSpan {
  kind: "element";
  tagName: string;
  isComponent: boolean;
  selfClosing: boolean;
  attributes: AttributeNode[];
  children: MarkupNode[];
}

export interface ExpressionNode extends SourceSpan {
  kind: "expression";
  /** TS code of the expression, without the leading @. */
  code: string;
}

export interface CodeBlockNode extends SourceSpan {
  kind: "codeBlock";
  /** Verbatim TS source between the braces. */
  code: string;
  /** True for @code/@functions blocks (class members); false for inline @{…}. */
  member?: boolean;
  /** Absolute position of the code's first character (right after the `{`),
   *  for exact source-map columns. */
  codeStart?: SourceSpan["pos"];
  /** Inline @{…} only: the block parsed code-first (statements + markup).
   *  Razor semantics: the block opens no scope — its locals stay visible to
   *  the markup that follows. */
  children?: MarkupNode[];
}

/**
 * A run of TypeScript statements in a code context (`@{ }`, control-block
 * bodies) — Razor's C# code span. Control statements and markup in statement
 * position are separate nodes; everything else is verbatim code.
 */
export interface StatementNode extends SourceSpan {
  kind: "statement";
  code: string;
  /** Names the run binds in its enclosing scope (const/let/var incl.
   *  destructuring, function, class, enum) — later markup expressions in the
   *  same scope must not rewrite them to `this.X`. */
  declares: string[];
  /** The subset of `declares` that cannot be assigned to — a `@bind` on one is an error. */
  readonly?: Record<string, "const" | "function" | "class" | "enum">;
}

/** A plain `{ … }` block statement in a code context (opens a scope). */
export interface BlockNode extends SourceSpan {
  kind: "block";
  children: MarkupNode[];
}

export interface TextTagNode extends SourceSpan {
  kind: "textTag";
  children: MarkupNode[];
}

export interface ConditionalBranch {
  condition: string | null; // null for @else
  /** Absolute position of the condition's first character. */
  conditionStart?: SourceSpan["pos"];
  children: MarkupNode[];
  span?: SourceSpan;
}

export interface IfNode extends SourceSpan {
  kind: "if";
  branches: ConditionalBranch[];
}

export interface ForNode extends SourceSpan {
  kind: "for";
  /** Contents of @for (…) or @foreach (…), verbatim. */
  code: string;
  /** Absolute position of the header code's first character. */
  codeStart?: SourceSpan["pos"];
  /** Position right after the header's closing `)` (`pos`…`headerEnd` = `@foreach (…)`). */
  headerEnd?: SourceSpan["pos"];
  isForEach: boolean;
  children: MarkupNode[];
}

/** `while (…) { }` and `do { } while (…);`. */
export interface WhileNode extends SourceSpan {
  kind: "while";
  condition: string;
  conditionStart?: SourceSpan["pos"];
  /** True for `do { } while (…);` (body runs before the first test). */
  isDoWhile: boolean;
  children: MarkupNode[];
}

export interface CatchClause {
  /** Catch binding as written (`e`, `e: unknown`), null for `catch { }`. */
  param: string | null;
  /** The bound name (`e`), registered as a local of the catch body. */
  paramName: string | null;
  children: MarkupNode[];
  span: SourceSpan;
}

export interface TryNode extends SourceSpan {
  kind: "try";
  children: MarkupNode[];
  catchClause?: CatchClause;
  finallyChildren?: MarkupNode[];
}

export interface SwitchCase {
  /** Case expression code (null for @default). */
  code: string | null;
  codeStart?: SourceSpan["pos"];
  /** Statements and markup of the section; empty for a stacked label
   *  (`case 1:\ncase 2:` falls through, as in C# and TS). */
  children: MarkupNode[];
  /** The label (`case X:` / `default:`). */
  span: SourceSpan;
}

export interface SwitchNode extends SourceSpan {
  kind: "switch";
  code: string;
  codeStart?: SourceSpan["pos"];
  cases: SwitchCase[];
}

export type MarkupNode =
  | TextNode
  | DirectiveNode
  | ElementNode
  | ExpressionNode
  | CodeBlockNode
  | StatementNode
  | BlockNode
  | TextTagNode
  | IfNode
  | ForNode
  | WhileNode
  | TryNode
  | SwitchNode;

/** Direct child nodes of a node in source order (all bodies, branches and
 *  cases) — for tree walks that do not care about the statement structure. */
export function childNodes(node: MarkupNode): MarkupNode[] {
  switch (node.kind) {
    case "element":
    case "textTag":
    case "block":
    case "for":
    case "while":
      return node.children;
    case "codeBlock":
      return node.children ?? [];
    case "if":
      return node.branches.flatMap((branch) => branch.children);
    case "switch":
      return node.cases.flatMap((c) => c.children);
    case "try":
      return [...node.children, ...(node.catchClause?.children ?? []), ...(node.finallyChildren ?? [])];
    default:
      return [];
  }
}

export type AttributeNode =
  | (SourceSpan & {
      kind: "static";
      name: string;
      value: string;
      /** Bare attribute without a value (`<input disabled>`): Razor passes `true`. */
      minimized?: boolean;
      raw?: RawAttributeValue;
    })
  | (SourceSpan & {
      kind: "expression";
      name: string;
      code: string;
      /** Absolute position of the expression's first character (the `@` of
       *  `@expr`, or the first inner character of `@(...)`), for token-precise
       *  source maps in the LSP. */
      codeStart?: SourceSpan["pos"];
    })
  | (SourceSpan & {
      kind: "mixedValue";
      name: string;
      parts: Array<{ text?: string; code?: string; /** Abs. code first char, like codeStart. */ codeStart?: SourceSpan["pos"] }>;
      raw?: RawAttributeValue;
    })
  | (SourceSpan & {
      kind: "eventHandler";
      name: string;
      code: string;
      codeStart?: SourceSpan["pos"];
    })
  /** `@onclick:preventDefault` / `@onclick:stopPropagation` — a flag of the
   *  element's `onclick` listener, not a handler (Blazor's
   *  `__internal_preventDefault_onclick` attribute). `code` is the flag's
   *  bool expression; absent for the valueless form (= true). */
  | (SourceSpan & {
      kind: "eventModifier";
      name: string;
      modifier: "preventDefault" | "stopPropagation";
      code?: string;
      codeStart?: SourceSpan["pos"];
    })
  | (SourceSpan & { kind: "key"; code: string; codeStart?: SourceSpan["pos"] })
  | (SourceSpan & { kind: "ref"; code: string; codeStart?: SourceSpan["pos"] })
  | (SourceSpan & { kind: "attributes"; code: string; codeStart?: SourceSpan["pos"] })
  /** @bind and its modifiers. Modifier-only nodes (@bind:event etc.) carry exactly one detail field. */
  | (SourceSpan & {
      kind: "bind";
      /** Two-way expression (from @bind, @bind:get is stored separately). */
      expression?: string;
      /** Target of @bind-Value: a component parameter ("Value"), on an element the bound attribute ("value"). */
      bindTarget?: string;
      event?: string;
      format?: string;
      /** The @bind:format value was plain attribute text (Razor: a string literal, e.g. "yyyy-MM-dd"); an @expression carries none. */
      formatLiteral?: boolean;
      get?: string;
      set?: string;
      after?: string;
      /** Source spans of the modifier attributes folded into this bind (diagnostic ranges). */
      modifierSpans?: Partial<Record<BindModifier, SourceSpan>>;
      /** Where the code of the bound expression and of each modifier starts (syntax diagnostics). */
      codeStarts?: Partial<Record<"expression" | BindModifier, SourceSpan["pos"]>>;
    });

/**
 * An attribute value as written (between the quotes; `@@` and entities not
 * decoded) and where it starts: on a non-string component parameter the value
 * is a TypeScript expression (Razor's component attribute lowering, 2.2).
 */
export interface RawAttributeValue {
  text: string;
  start: SourceSpan["pos"];
}

export type BindModifier = "event" | "format" | "get" | "set" | "after";

export interface DocumentNode {
  directives: DirectiveNode[];
  body: MarkupNode[];
  codeBlocks: CodeBlockNode[];
}
