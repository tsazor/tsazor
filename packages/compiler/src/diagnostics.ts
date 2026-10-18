/**
 * Stable diagnostic codes (TZS001…). The compiler never fails silently:
 * every parse/codegen problem lands here with the source range of the
 * offending construct.
 */

export interface SourcePos {
  /** 1-based line. */
  readonly line: number;
  /** 0-based column. */
  readonly column: number;
}

/** A source range: `pos` inclusive, `endPos` exclusive (AST spans have the same shape). */
export interface SourceRange {
  readonly pos: SourcePos;
  readonly endPos: SourcePos;
}

/** Replaces the text of a source range (empty `text` = delete). */
export interface TextEdit extends SourceRange {
  readonly text: string;
}

/**
 * A mechanical fix of a diagnostic (C# form ⇒ TS form, `var` ⇒ `let`): the
 * edits turn the source into the form the message names — for LSP code
 * actions and the `.razor` → `.tsazor` codemod.
 */
export interface DiagnosticFix {
  /** Short description (`Use 'const x of xs'`). */
  readonly title: string;
  readonly edits: readonly TextEdit[];
}

export type DiagnosticSeverity = "error" | "warning";

/**
 * One diagnostic. `pos` is the start (kept for every consumer that only
 * needs a location), `endPos` the exclusive end of the construct — the whole
 * `@foreach (…)` header, the directive, the attribute, the expression.
 */
export interface TszDiagnostic extends SourceRange {
  readonly code: string;
  readonly message: string;
  readonly severity: DiagnosticSeverity;
  readonly fix?: DiagnosticFix;
}

/** Each code with its message (the first sentence of every diagnostic; the reference's title). */
export const DIAGNOSTIC_MESSAGES = {
  TZS001: "Invalid or misplaced directive.",
  TZS002: "Unclosed element.",
  TZS003: "Unbalanced braces in expression or code block.",
  TZS004: "Invalid implicit expression.",
  TZS005: "Unresolved component tag.",
  TZS006: "Unclosed code block.",
  TZS008: "Unsupported directive attribute.",
  TZS009: "Missing attribute value.",
  TZS011: "Conflicting code-behind.",
  TZS012: "Unsupported C# construct.",
  TZS013: "Directive not allowed here.",
  TZS014: "Ignored directive or clause.",
  TZS015: "Invalid TypeScript in code block.",
  TZS016: "Invalid @import directive.",
  TZS017: "Ambiguous component tag.",
  TZS018: "Unresolved @using directory.",
  TZS019: "Invalid @attribute directive.",
  TZS020: "Member conflicts with the generated component code.",
  TZS021: "C# form — use the TypeScript form.",
  TZS022: "'var' declaration — use 'let' or 'const'.",
  TZS023: "Switch case falls through.",
  TZS024: "Invalid TypeScript expression.",
  TZS025: "Unknown component parameter.",
  TZS026: "Component parameter type unknown.",
  TZS027: "Unrecognized child content.",
  TZS028: "Invalid child content element.",
  TZS029: "Template context name conflict.",
  TZS030: "@Bindable()/@State() needs an auto-accessor of its own.",
  TZS031: "Name reserved by ComponentBase.",
  TZS032: "Blazor lifecycle name — Tsazor never calls it.",
  TZS033: "TypeScript isn't strict.",
  TZS034: "File not readable.",
  TZS035: "The compiler failed.",
  TZS036: "Component manifest unreadable or newer.",
  TZS037: "Editor-required parameter not provided.",
  TZS038: "Code-like text in markup.",
} as const;


const CODES = DIAGNOSTIC_MESSAGES;

export type DiagnosticCode = keyof typeof CODES;

export class DiagnosticBag {
  private readonly items: TszDiagnostic[] = [];

  add(code: DiagnosticCode, severity: DiagnosticSeverity, range: SourceRange, detail?: string, fix?: DiagnosticFix): void {
    const message = detail ? `${CODES[code]} ${detail}` : CODES[code];
    const { pos, endPos } = range;
    // The same finding reached twice (an expression baked for display and
    // for assignment) is reported once.
    const duplicate = this.items.some((d) =>
      d.code === code && d.message === message && d.pos.line === pos.line && d.pos.column === pos.column);
    if (duplicate) return;
    this.items.push({ code, message, severity, pos, endPos, ...(fix ? { fix } : {}) });
  }

  error(code: DiagnosticCode, range: SourceRange, detail?: string, fix?: DiagnosticFix): void {
    this.add(code, "error", range, detail, fix);
  }

  warning(code: DiagnosticCode, range: SourceRange, detail?: string, fix?: DiagnosticFix): void {
    this.add(code, "warning", range, detail, fix);
  }

  get all(): readonly TszDiagnostic[] {
    return this.items;
  }

  get errors(): readonly TszDiagnostic[] {
    return this.items.filter((d) => d.severity === "error");
  }

  get hasErrors(): boolean {
    return this.errors.length > 0;
  }
}
