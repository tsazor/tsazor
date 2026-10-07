/**
 * The form side of the component library core: what every skin's inputs
 * (built on the runtime's `InputBase`) share — ids that tie label, help
 * text and message to the input, the field's validity in Blazor's terms,
 * and when the validation message shows.
 *
 * Messages appear only once the form was submitted: live validation while
 * the user is still typing gets in the way. The field's validity classes
 * stay live (a corrected field turns valid at once).
 */
import type { EditContext } from "@tsazor/runtime";
import { uniqueId } from "./ids.js";

const attempts = new WeakSet<EditContext>();

/** Records a submit attempt (valid or invalid) of a form; a skin's `Form` calls it. */
export function markSubmitAttempt(context: EditContext): void {
  attempts.add(context);
}

/** Whether the form behind `context` was submitted at least once (messages show from then on). */
export function hasSubmitAttempt(context: EditContext | null | undefined): boolean {
  return context != null && attempts.has(context);
}

/**
 * A field's state for its styling: `invalid` (a rule fails), `valid` (the
 * user changed it and it passes — an untouched field stays quiet, as in
 * Blazor's `modified valid`), or `none`.
 */
export type FieldValidity = "invalid" | "valid" | "none";

/**
 * Ids and validation state of one input. A skin's input keeps one
 * `FieldState` and asks it while rendering:
 *
 * ```ts
 * private readonly field = new FieldState("tz-input");
 * // id="@field.id(id)", class from field.validity(fieldClass),
 * // @attributes="@field.aria(message, help)"
 * ```
 */
export class FieldState {
  private generated: string | undefined;

  constructor(private readonly prefix = "tz-field") {}

  /** The input's id: the explicit one, else a generated one that stays the same. */
  id(explicit?: string | null): string {
    return explicit ?? (this.generated ??= uniqueId(this.prefix));
  }

  /** The id of the help text. */
  helpId(explicit?: string | null): string {
    return `${this.id(explicit)}-help`;
  }

  /** The id of the validation message. */
  messageId(explicit?: string | null): string {
    return `${this.id(explicit)}-message`;
  }

  /** The field's first validation message — only after a submit attempt; "" otherwise. */
  message(context: EditContext | null | undefined, expression: string | null | undefined): string {
    if (!context || !expression || !hasSubmitAttempt(context)) return "";
    return context.getValidationMessages(expression)[0] ?? "";
  }

  /** The field's validity from InputBase's `fieldClass` (`modified valid`, `invalid`, …). */
  validity(fieldClass: string | null | undefined): FieldValidity {
    const classes = ` ${fieldClass ?? ""} `;
    if (classes.includes(" invalid ")) return "invalid";
    if (classes.includes(" modified ") && classes.includes(" valid ")) return "valid";
    return "none";
  }

  /**
   * `aria-invalid` and `aria-describedby` for the input: the message (when
   * shown) and the help text (when there is one) describe it.
   */
  aria(message: string, hasHelp = false, explicitId?: string | null): Record<string, string | undefined> {
    const describedBy = [hasHelp ? this.helpId(explicitId) : "", message ? this.messageId(explicitId) : ""].filter(Boolean).join(" ");
    return {
      "aria-invalid": message ? "true" : undefined,
      "aria-describedby": describedBy || undefined,
    };
  }
}
