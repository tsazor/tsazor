/**
 * `role="alert"` rows only on submit errors (4.2): an input's validation row
 * appears only once the form has been submitted —
 * before that, live field validation only gets in the way (field classes stay live).
 *
 * The state hangs on the EditContext (one context per form lifetime); a
 * WeakSet holds it without referencing the components.
 */
import type { EditContext } from "@tsazor/runtime";

/** The EditContexts on which a submit has already been attempted. */
const attempts = new WeakSet<EditContext>();

/** Records a submit attempt (valid or invalid) of a FluentForm. */
export function markSubmitAttempt(context: EditContext): void {
  attempts.add(context);
}

/**
 * Gate for the message rows: only after the first submit attempt do
 * inputs show their validation messages (and carry `role="alert"`).
 */
export function hasSubmitAttempt(context?: EditContext): boolean {
  return context !== undefined && attempts.has(context);
}