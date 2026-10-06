import { EventCallback } from "./event-callback.js";

/**
 * Blazor's ChangeDetection.MayHaveChanged: false only when both values are
 * definitely equal — both null/undefined (the same one), or the same known
 * immutable kind and equal. Anything else may have been mutated in place
 * and counts as changed.
 *
 * Known immutable (Blazor: primitives, string, decimal, DateTime, Guid, enums,
 * EventCallback): string, number, boolean, bigint, symbol — compared with
 * `Object.is` (NaN equals NaN; unlike .NET's Double.Equals, 0 and -0 differ)
 * — and EventCallback, equal when receiver and delegate are the same
 * (EventCallback.equalsAsParameter: a compiler-hoisted handler that captures
 * locals is a new closure in C# every render, so it counts as changed). TS enums are numbers/strings and fall under the
 * primitives. Deliberately NOT immutable: Date (unlike .NET's DateTime value
 * type, a JS Date is a mutable reference — an in-place setTime would go
 * unnoticed), functions (Blazor: delegates are not known immutable; a
 * RenderFragment is a function, so child content always counts as changed),
 * arrays and all other objects.
 */
export function mayHaveChanged(oldValue: unknown, newValue: unknown): boolean {
  if (oldValue === null || oldValue === undefined || newValue === null || newValue === undefined) {
    return oldValue !== newValue;
  }
  const type = typeof oldValue;
  if (type !== typeof newValue) return true;
  switch (type) {
    case "string":
    case "number":
    case "boolean":
    case "bigint":
    case "symbol":
      return !Object.is(oldValue, newValue);
    case "object":
      if (oldValue instanceof EventCallback && newValue instanceof EventCallback) {
        return !oldValue.equalsAsParameter(newValue as EventCallback<never>);
      }
      return true;
    default:
      return true;
  }
}
