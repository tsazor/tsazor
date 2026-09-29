/** AST for .tazor markup. Positions are 1-based line / 0-based column. */

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
  /** Verbatim TS statements. */
  code: string;
  /** True for @code/@functions blocks (class members); false for inline @{…}. */
  member?: boolean;
}

export interface TextTagNode extends SourceSpan {
  kind: "textTag";
  children: MarkupNode[];
}

export interface ConditionalBranch {
  condition: string | null; // null for @else
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
  isForEach: boolean;
  children: MarkupNode[];
}

export interface SwitchCase {
  /** Case expression code (null for @default). */
  code: string | null;
  children: MarkupNode[];
  span: SourceSpan;
}

export interface SwitchNode extends SourceSpan {
  kind: "switch";
  code: string;
  cases: SwitchCase[];
}

export type MarkupNode =
  | TextNode
  | DirectiveNode
  | ElementNode
  | ExpressionNode
  | CodeBlockNode
  | TextTagNode
  | IfNode
  | ForNode
  | SwitchNode;

export type AttributeNode =
  | (SourceSpan & { kind: "static"; name: string; value: string })
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
    })
  | (SourceSpan & {
      kind: "eventHandler";
      name: string;
      code: string;
      flags: number;
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
      /** Component parameter target of @bind-Value (e.g. "Value"). */
      bindTarget?: string;
      event?: string;
      format?: string;
      get?: string;
      set?: string;
      after?: string;
    });

export interface DocumentNode {
  directives: DirectiveNode[];
  body: MarkupNode[];
  codeBlocks: CodeBlockNode[];
}

/** Attribute flags for event handlers (mirrors runtime EventHandlerFlags). */
export const EVENT_FLAGS = {
  preventDefault: 1 << 0,
  stopPropagation: 1 << 1,
} as const;