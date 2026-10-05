/**
 * Blazor's MarkupString: a string rendered unescaped (raw HTML). The compiler
 * rewrites `new MarkupString(expr)` and `expr as MarkupString` content directly
 * into `addMarkupContent` (Blazor's compiler renders `(MarkupString)s` through
 * Markup frames too); instances given to `addContent` by hand-built trees are
 * unwrapped there into Markup frames, so dynamic values work the same.
 */
export class MarkupString {
  /** The raw HTML. */
  readonly value: string;
  /** @param value — HTML inserted as is; never pass unsanitized user input. */
  constructor(value: string) {
    this.value = value;
  }
  /** Returns the raw HTML, so string interpolation yields the markup text. */
  toString(): string {
    return this.value;
  }
}