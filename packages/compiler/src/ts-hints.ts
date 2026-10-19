/**
 * S4: plain-language hints for the TypeScript errors people meet most in
 * `.tsazor` files. TypeScript's messages are precise but terse ("Parameter
 * 'item' implicitly has an 'any' type."); tooling (the language server,
 * `tsazor check`, the tutorial) appends one sentence that says what to do.
 */

/** Hints by TypeScript error code. */
const HINTS: ReadonlyMap<number, string> = new Map([
  // Implicit any.
  [7006, "TypeScript can't tell this parameter's type from here: annotate it (`item: Order`), or use the quick fix \"Infer parameter types from usage\"."],
  [7031, "TypeScript can't tell this binding's type from here: annotate the parameter it comes from."],
  [7005, "TypeScript can't tell this variable's type: give it an initial value or an annotation (`orders: Order[] = []`)."],
  [7034, "TypeScript can't tell this variable's type: give it an initial value or an annotation (`orders: Order[] = []`)."],
  [7008, "TypeScript can't tell this member's type: give it an initial value or an annotation."],
  // Possibly null or undefined.
  [2531, "The value may be null here. Check it first (`@if (x != null)`, `x?.name`) or make sure it always has a value."],
  [2532, "The value may be undefined here. Check it first (`@if (x)`, `x?.name`) or give it a value up front."],
  [18047, "The value may be null here. Check it first (`@if (x != null)`, `x?.name`) or make sure it always has a value."],
  [18048, "The value may be undefined here. Check it first (`@if (x)`, `x?.name`) or give it a value up front."],
  [18049, "The value may be null or undefined here. Check it first (`@if (x != null)`, `x?.name`)."],
  // Names and members.
  [2339, "Check the spelling, and the type the value has: TypeScript knows only the members that type declares."],
  [2551, "Probably a typo — see the suggestion."],
  [2304, "Markup and `@code` see the component's members, `@inject` fields and `@import`ed names: declare, inject or import it."],
  [2552, "Probably a typo — see the suggestion."],
  // A type-only import used as a value.
  [1361, "`import type` erases the name at runtime: import it without `type` to use it as a value — `@inject` needs the class itself, it is the service's key (or leave the import out: `@inject` finds a class in `X.ts` by name)."],
  [1362, "`export type` erases the name at runtime: export it as a value to use it as one (`@inject` needs the class itself)."],
  // Types that don't fit.
  [2322, "The value's type doesn't fit where it goes (a field, a parameter, a return value): convert it, or change the declared type."],
  [2345, "The argument's type doesn't fit the parameter: convert it, or pass a different value."],
  [2554, "The number of arguments doesn't match the function's parameters."],
  [2367, "The two sides can never be equal — often a string compared with a number (`\"1\" === 1`)."],
]);

/**
 * `RenderFragment<TItem>` called in a generic component (`@ChildContent?.(item)`): its conditional type — a builder
 * for `void`, a template otherwise — stays open while `TItem` is, and TypeScript calls both branches at once.
 */
const OPEN_FRAGMENT = /RenderTreeBuilder & |& RenderTreeBuilder'|'void \| \(\(builder: RenderTreeBuilder\) => void\)/;
const OPEN_FRAGMENT_HINT =
  "In a generic component `RenderFragment<TItem>` can't be called while `TItem` is open (it is a conditional type): " +
  "declare the parameter as `(item: TItem) => RenderFragment` — the same template to the compiler and to its users.";

/**
 * The message with a plain-language hint appended for the common TypeScript
 * errors; others (and messages that already carry an explanation, see
 * explainExpressionValue) come back unchanged.
 */
export function explainTypeScriptError(code: number, message: string): string {
  const hint = code === 2345 && OPEN_FRAGMENT.test(message) ? OPEN_FRAGMENT_HINT : HINTS.get(code);
  if (hint === undefined || message.includes(" Note: ") || message.includes(" Hint: ")) return message;
  return `${message} Hint: ${hint}`;
}
