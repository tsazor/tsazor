/**
 * Stable diagnostic codes (TZR001…). The compiler never fails silently:
 * every parse/codegen problem lands here with a source position.
 */

export interface SourcePos {
  /** 1-based line. */
  readonly line: number;
  /** 0-based column. */
  readonly column: number;
}

export type DiagnosticSeverity = "error" | "warning";

export interface TzrDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: DiagnosticSeverity;
  readonly pos: SourcePos;
}

const CODES = {
  TZR001: "Unknown directive.",
  TZR002: "Unclosed element.",
  TZR003: "Unbalanced braces in expression or code block.",
  TZR004: "Invalid implicit expression.",
  TZR005: "Unresolved component tag.",
  TZR006: "Unclosed code block.",
  TZR007: "Duplicate attribute.",
  TZR008: "Unsupported directive attribute.",
  TZR009: "Missing attribute value.",
  TZR010: "Invalid implicit expression terminator.",
  TZR011: "Conflicting code-behind.",
} as const;

export type DiagnosticCode = keyof typeof CODES;

export class DiagnosticBag {
  private readonly items: TzrDiagnostic[] = [];

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

  get all(): readonly TzrDiagnostic[] {
    return this.items;
  }

  get errors(): readonly TzrDiagnostic[] {
    return this.items.filter((d) => d.severity === "error");
  }

  get hasErrors(): boolean {
    return this.errors.length > 0;
  }
}