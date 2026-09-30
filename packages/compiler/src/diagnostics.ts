/**
 * Stable diagnostic codes (TZS001…). The compiler never fails silently:
 * every parse/codegen problem lands here with a source position.
 */

export interface SourcePos {
  /** 1-based line. */
  readonly line: number;
  /** 0-based column. */
  readonly column: number;
}

export type DiagnosticSeverity = "error" | "warning";

export interface TszDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: DiagnosticSeverity;
  readonly pos: SourcePos;
}

const CODES = {
  TZS001: "Unknown directive.",
  TZS002: "Unclosed element.",
  TZS003: "Unbalanced braces in expression or code block.",
  TZS004: "Invalid implicit expression.",
  TZS005: "Unresolved component tag.",
  TZS006: "Unclosed code block.",
  TZS007: "Duplicate attribute.",
  TZS008: "Unsupported directive attribute.",
  TZS009: "Missing attribute value.",
  TZS010: "Invalid implicit expression terminator.",
  TZS011: "Conflicting code-behind.",
  TZS012: "Unsupported C# construct.",
  TZS013: "Directive not allowed here.",
  TZS014: "Ignored directive or clause.",
  TZS015: "Invalid TypeScript in code block.",
  TZS016: "Invalid @import directive.",
  TZS017: "Ambiguous component tag.",
  TZS018: "Unresolved @using directory.",
} as const;

export type DiagnosticCode = keyof typeof CODES;

export class DiagnosticBag {
  private readonly items: TszDiagnostic[] = [];

  add(code: DiagnosticCode, severity: DiagnosticSeverity, pos: SourcePos, detail?: string): void {
    const message = detail ? `${CODES[code]} ${detail}` : CODES[code];
    this.items.push({ code, message, severity, pos });
  }

  error(code: DiagnosticCode, pos: SourcePos, detail?: string): void {
    this.add(code, "error", pos, detail);
  }

  warning(code: DiagnosticCode, pos: SourcePos, detail?: string): void {
    this.add(code, "warning", pos, detail);
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