/**
 * Plain-text attribute values read as TypeScript expressions (2.2): a
 * component parameter that isn't a string takes `answer="42"` as the
 * expression `42` — so `answer="hello"` names a member `hello`, and
 * TypeScript reports "Property 'hello' does not exist on type 'App'". True,
 * but puzzling for someone who meant text. The compiler records where such
 * values sit (typed-shadow builds); tooling appends the explanation to the
 * unknown-name diagnostics that land in them.
 */
import type { SourcePos } from "./diagnostics.js";

/** One plain-text value (no `@`) of a non-string component parameter. */
export interface ExpressionValue {
  /** Start of the value as written (inside the quotes). */
  readonly start: SourcePos;
  /** End of the value (exclusive). */
  readonly end: SourcePos;
  /** The parameter the attribute sets. */
  readonly parameter: string;
  /** The component tag (`Nested`). */
  readonly tag: string;
  /** The parameter's declared (or inferred) type, when known. */
  readonly type?: string;
}

/** TS2304 "Cannot find name", TS2339 "Property … does not exist", and their "did you mean" forms. */
const UNKNOWN_NAME_CODES = new Set([2304, 2339, 2551, 2552]);

const before = (a: SourcePos, b: SourcePos): boolean => a.line < b.line || (a.line === b.line && a.column < b.column);

/**
 * The diagnostic message, explained when an unknown-name error lands in a
 * plain-text expression value: `position` uses SourcePos coordinates (1-based
 * line, 0-based column). Other diagnostics come back unchanged.
 */
export function explainExpressionValue(
  code: number,
  message: string,
  position: SourcePos,
  values: readonly ExpressionValue[] | undefined,
): string {
  if (values === undefined || !UNKNOWN_NAME_CODES.has(code)) return message;
  const value = values.find((candidate) => !before(position, candidate.start) && before(position, candidate.end));
  if (value === undefined) return message;
  const kind = value.type !== undefined ? `a '${value.type}' parameter` : "not a string parameter";
  return `${message} Note: '${value.parameter}' on <${value.tag}> is ${kind}, so its value is read as a TypeScript expression, not as text.`;
}
