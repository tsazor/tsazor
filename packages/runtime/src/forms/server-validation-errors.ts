import type { EditContext, ValidationMessageStore } from "./edit-context.js";

/** A server's field errors: a field's key and its messages — ASP.NET Core's `ValidationProblemDetails.errors`. */
export type ServerFieldErrors = Readonly<Record<string, readonly string[]>>;

/** How ServerValidationErrors maps keys and when it lets its messages go. */
export interface ServerValidationErrorsOptions {
  /**
   * A key's field, before the built-in mapping: return the EditContext field (`"steps.1.hsn"`, `""` for the model),
   * or `undefined` to map it the built-in way.
   */
  readonly map?: (key: string) => string | undefined;
  /** An edited field drops its server messages (and its children's): true by default. */
  readonly clearOnFieldChange?: boolean;
  /** A submit (`EditContext.validate()`) drops every server message: true by default. */
  readonly clearOnSubmit?: boolean;
}

/**
 * Tsazor extension: a server's field errors as the form's validation messages — the glue every form that saves to a
 * server writes (Blazor apps write it against a `ValidationMessageStore` too). Any backend's
 * `Record<string, string[]>` works: `@tsazor/dotnet`'s `result.validationErrors`, a hand-written `fetch` of a
 * `ValidationProblemDetails`, another server's.
 *
 * ```ts
 * private readonly serverErrors = new ServerValidationErrors(this.editContext);
 *
 * async save(): Promise<void> {
 *     const result = await this.api.scenarios.update(this.model);
 *     if (!result.ok) this.serverErrors.apply(result.validationErrors);
 * }
 * ```
 *
 * A key names its field as the server does — `Steps[1].Hsn` (ASP.NET Core), `$.steps[1].hsn` (System.Text.Json),
 * `steps.1.hsn` — and resolves against the model, segment by segment: the property of that name, else the one whose
 * name differs only in case (PascalCase to camelCase), an index into an array. The result is the EditContext's field
 * (`"steps.1.hsn"`), where a ValidationMessage shows it. A key that resolves to nothing — an empty key, a property
 * the model doesn't have — is the model's (field `""`): a ValidationSummary shows it.
 *
 * Its messages go when the field is edited (and a parent's when one of its fields is) and all of them on the next
 * submit, or with `clear()`; `apply` replaces the previous ones. After the app moves items of a list (a step up), the
 * indices of the messages no longer match: `clear()` them, or `apply` the server's next answer.
 */
export class ServerValidationErrors {
  readonly #store: ValidationMessageStore;
  readonly #fields = new Set<string>();
  readonly #unsubscribe: Array<() => void> = [];

  /** Puts a store of its own into `editContext`; `options` maps keys and says when its messages go. */
  constructor(
    /** The form's EditContext. */
    readonly editContext: EditContext,
    private readonly options: ServerValidationErrorsOptions = {},
  ) {
    this.#store = editContext.createValidationMessageStore();
    if (options.clearOnFieldChange !== false) {
      this.#unsubscribe.push(editContext.onFieldChanged.subscribe((_context, field) => this.#clearEdited(field)));
    }
    if (options.clearOnSubmit !== false) {
      this.#unsubscribe.push(editContext.onValidationRequested.subscribe(() => this.clear()));
    }
  }

  /** Replaces the server messages with these errors (null or undefined: clears them). */
  apply(errors: ServerFieldErrors | null | undefined): void {
    this.clear();
    if (!errors) return;
    for (const [key, messages] of Object.entries(errors)) {
      if (messages.length === 0) continue;
      const field = this.fieldOf(key);
      this.#fields.add(field);
      this.#store.addAll(field, messages);
    }
  }

  /** Removes the server messages: all, or one field's. */
  clear(field?: string): void {
    if (field === undefined) {
      this.#fields.clear();
      this.#store.clear();
      return;
    }
    this.#fields.delete(field);
    this.#store.clear(field);
  }

  /** The EditContext field a server's key names: the `map` option's, else resolved against the model. */
  fieldOf(key: string): string {
    return this.options.map?.(key) ?? resolveServerField(this.editContext.model, key);
  }

  /** Detaches from the EditContext and removes the server messages. */
  dispose(): void {
    for (const unsubscribe of this.#unsubscribe.splice(0)) unsubscribe();
    this.clear();
  }

  /** An edited field's messages go, and those of the fields it contains or that contain it. */
  #clearEdited(edited: string): void {
    for (const field of [...this.#fields]) {
      if (field === "") continue;
      if (field === edited || field.startsWith(`${edited}.`) || edited.startsWith(`${field}.`)) this.clear(field);
    }
  }
}

/**
 * A server's field key as the EditContext field of `model`: `Steps[1].Hsn`, `$.steps[1].hsn` or `steps.1.hsn` is
 * `"steps.1.hsn"` when the model has `steps[1].hsn`; a key it can't resolve is the model's (`""`).
 */
export function resolveServerField(model: object, key: string): string {
  const segments = key
    .replace(/^\$\.?/, "")
    .split(/\.|\[|\]/)
    .filter((segment) => segment !== "");
  if (segments.length === 0) return "";
  const path: string[] = [];
  let value: unknown = model;
  for (const segment of segments) {
    if (value === null || typeof value !== "object") return "";
    if (Array.isArray(value)) {
      if (!/^\d+$/.test(segment) || Number(segment) >= value.length) return "";
      path.push(segment);
      value = value[Number(segment)];
      continue;
    }
    const name = propertyName(value, segment);
    if (name === undefined) return "";
    path.push(name);
    value = (value as Record<string, unknown>)[name];
  }
  return path.join(".");
}

/** The object's property named `segment`, else the one whose name differs only in case. */
function propertyName(value: object, segment: string): string | undefined {
  if (segment in value) return segment;
  const lower = segment.toLowerCase();
  for (let target: object | null = value; target !== null && target !== Object.prototype; target = Object.getPrototypeOf(target)) {
    for (const name of Object.getOwnPropertyNames(target)) {
      if (name.toLowerCase() === lower) return name;
    }
  }
  return undefined;
}
