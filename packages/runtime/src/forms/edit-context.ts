import { resolveValidationMessage, rulesForField, validationRulesOf, type ValidationRule } from "./validation-attributes.js";

/**
 * EditContext, port of Blazor's EditContext.cs (src/Components/Forms/src):
 * change tracking and validation state for a model object, used by EditForm
 * and the Input* components.
 *
 * Ported from Blazor:
 * - **FieldState** per field name (Blazor keys by FieldIdentifier); `isModified`.
 * - **ValidationMessageStore:** a provider (validators, DataAnnotations) owns
 *   one store; messages of different stores for the same field coexist and are
 *   read merged (Blazor's FieldState.GetValidationMessages). Clearing one
 *   store leaves the others untouched — that's how DataAnnotations messages
 *   appear next to a function validator instead of replacing them.
 * - **Events:** `onFieldChanged` (after a field is marked modified),
 *   `onValidationRequested` (from validate(), Blazor's OnValidationRequested —
 *   providers validate here), `onValidationStateChanged` (after a pass wrote
 *   messages; the Input* components re-render on it).
 *
 * Deviations (all deliberate, documented in the docs):
 * - Field identifiers are plain field-name strings, not expression-based
 *   `FieldIdentifier`s (TS has no expression trees; the compiler emits the
 *   binding's last member name as `ValueExpression`).
 * - `notifyFieldChanged(field, value)` carries the new value (Blazor reads the
 *   property) because a Tsazor model is updated by the compiler's bind before
 *   or after this call — the function validator needs the value as written.
 * - The DataAnnotations validator is synchronous (one event pass, no
 *   `AddAsyncValidator`): Tsazor's validators are pure functions.
 * - `Subscribe` (legacy Tsazor API) is `onValidationStateChanged.subscribe`.
 */
export class EditContext {
  readonly model: object;

  /** Blazor's OnFieldChanged: a field was marked modified. */
  readonly onFieldChanged: EventSet<(editContext: EditContext, field: string, value: unknown) => void>;
  /** Blazor's OnValidationRequested: validate() runs the validation pass. */
  readonly onValidationRequested: EventSet<(editContext: EditContext) => void>;
  /** Blazor's OnValidationStateChanged: messages changed during a pass. */
  readonly onValidationStateChanged: EventSet<(editContext: EditContext) => void>;

  private readonly fieldStates = new Map<string, FieldState>();
  /** The function-map adapter (EditForm's `validators`), writing the built-in store. */
  private readonly fieldValidators = new Map<string, ModelValidator>();
  private readonly builtinStore: ValidationMessageStore;

  constructor(model: object) {
    this.model = model;
    this.onFieldChanged = new EventSet();
    this.onValidationRequested = new EventSet();
    this.onValidationStateChanged = new EventSet();
    this.builtinStore = this.createValidationMessageStore();
  }

  /** Blazor's ValidationMessageStore: one provider's messages, per field. */
  createValidationMessageStore(): ValidationMessageStore {
    return new ValidationMessageStore(this);
  }

  /** @internal Marks the validation state changed (all listeners re-render). */
  notifyValidationStateChanged(): void {
    this.onValidationStateChanged.invoke(this);
  }

  /**
   * Blazor's NotifyFieldChanged: marks the field modified, then the field is
   * revalidated — first by the providers (onFieldChanged handlers), then the
   * function-map adapter for the registered validator. A field with neither
   * rule ends up without messages (a failed input became valid by editing).
   */
  notifyFieldChanged(field: string, value?: unknown): void {
    this.ensureFieldState(field).isModified = true;
    this.onFieldChanged.invoke(this, field, value);
    this.applyFunctionValidator(field, value);
    // Legacy semantic: every change notifies the listeners (a no-rule field
    // keeps no messages — its failed input became valid by editing).
    this.notifyValidationStateChanged();
  }

  /** Registers the adapter validator for a field (EditForm's `validators` map). */
  setValidator(field: string, validator: ModelValidator): void {
    this.fieldValidators.set(field, validator);
  }

  /** Legacy Tsazor API: `onValidationStateChanged.subscribe` (see InputBase). */
  subscribe(listener: () => void): () => void {
    return this.onValidationStateChanged.subscribe(() => listener());
  }

  /** Blazor's MarkAsUnmodified. */
  markAsUnmodified(field: string): void {
    this.fieldStates.get(field)?.setModified(false);
  }

  /** Blazor's GetFieldState(field).IsModified. */
  isModified(field: string): boolean {
    return this.fieldStates.get(field)?.isModified ?? false;
  }

  /**
   * Blazor's Validate: raises onValidationRequested (providers write their
   * message stores), then re-applies the function-map adapter, and reports
   * whether any validation message remains. Synchronous (deviation: .NET's
   * ValidateAsync/AddAsyncValidator has no TS counterpart here — a form that
   * needs async validation awaits it in OnValidSubmit's callback instead).
   */
  validate(): boolean {
    for (const field of this.fieldValidators.keys()) {
      this.builtinStore.clear(field);
    }
    this.onValidationRequested.invoke(this);
    for (const [field, validator] of this.fieldValidators) {
      this.applyFunctionValidator(field, (this.model as Record<string, unknown>)[field]);
    }
    this.notifyValidationStateChanged();
    return !this.hasValidationMessages();
  }

  /** Whether the field (parameterless: the whole model) has no validation messages. */
  isValid(field?: string): boolean {
    return field === undefined ? !this.hasValidationMessages() : this.getValidationMessages(field).length === 0;
  }

  /** All validation messages, merged across stores (field omitted: the whole model). */
  getValidationMessages(field?: string): string[] {
    if (field === undefined) {
      const messages: string[] = [];
      for (const state of this.fieldStates.values()) {
        messages.push(...state.getMessages());
      }
      return messages;
    }
    return this.fieldStates.get(field)?.getMessages() ?? [];
  }

  /** Field names (including the model-level name "") with at least one message. */
  getInvalidFields(): string[] {
    const result: string[] = [];
    for (const [field, state] of this.fieldStates) {
      if (state.getMessages().length > 0) result.push(field);
    }
    return result;
  }

  /** @internal Whether any field has a validation message (Blazor's !GetValidationMessages().Any()). */
  hasValidationMessages(): boolean {
    return this.getValidationMessages().length > 0;
  }

  /** @internal The (created on demand) state of a field. */
  private ensureFieldState(field: string): FieldState {
    let state = this.fieldStates.get(field);
    if (!state) {
      state = new FieldState();
      this.fieldStates.set(field, state);
    }
    return state;
  }

  /** @internal The state of a field, without creating one (for store clearing). */
  fieldStateFor(field: string): FieldState | undefined {
    return this.fieldStates.get(field);
  }

  /** @internal Stores the field state for a message store (Blazor's AssociateWithValidationMessageStore). */
  associateFieldState(field: string, store: ValidationMessageStore): FieldState {
    return this.ensureFieldState(field).associateWith(store);
  }

  /** @internal Dissociates a store from a field (its last messages left with it). */
  dissociateFieldState(field: string, store: ValidationMessageStore): void {
    this.fieldStates.get(field)?.dissociateFrom(store);
  }

  /**
   * The function-map adapter: the registered validator replaces the built-in
   * store's messages for the field. When no validator is registered the field's
   * builtin messages are cleared (an edited field with no rules is valid).
   */
  private applyFunctionValidator(field: string, value: unknown): void {
    const validator = this.fieldValidators.get(field);
    this.builtinStore.clear(field);
    if (validator) {
      const message = validator(value, this.model);
      if (message) this.builtinStore.add(field, message);
    }
  }
}

/** A model validator: the function-map adapter (v1 deviation from DataAnnotations). */
export type ModelValidator = (value: unknown, model: unknown) => string | null;

/** Blazor's FieldState (per field name): modification flag + the message stores. */
class FieldState {
  isModified = false;
  private readonly stores = new Set<ValidationMessageStore>();

  associateWith(store: ValidationMessageStore): this {
    this.stores.add(store);
    return this;
  }

  dissociateFrom(store: ValidationMessageStore): void {
    this.stores.delete(store);
  }

  getMessages(): string[] {
    const messages: string[] = [];
    for (const store of this.stores) {
      messages.push(...store.messagesFor(this));
    }
    return messages;
  }

  setModified(value: boolean): void {
    this.isModified = value;
  }
}

/**
 * Blazor's ValidationMessageStore: the messages of one validation provider.
 * The store keeps its own lists; the field state aggregates across stores.
 * Each write notifies the EditContext's validation-state change — the Input*
 * components re-render; within one batch the requests coalesce.
 */
export class ValidationMessageStore {
  private readonly messagesByField = new Map<FieldState, string[]>();

  constructor(readonly editContext: EditContext) {}

  /** Adds one message for a field (Blazor's Add(FieldIdentifier, message)). */
  add(field: string, message: string): void {
    this.getOrCreate(field).push(message);
    this.editContext.notifyValidationStateChanged();
  }

  /** Adds several messages for a field. */
  addAll(field: string, messages: readonly string[]): void {
    if (messages.length === 0) return;
    this.getOrCreate(field).push(...messages);
    this.editContext.notifyValidationStateChanged();
  }

  /** Removes all of this store's messages for a field (omitted: for every field). */
  clear(field?: string): void {
    if (field === undefined) {
      for (const state of [...this.messagesByField.keys()]) {
        this.clearState(state);
      }
      return;
    }
    const state = this.editContext.fieldStateFor(field);
    if (!state) return;
    this.clearState(state);
  }

  /** This store's messages for a field. */
  messagesFor(state: FieldState): string[] {
    return this.messagesByField.get(state) ?? [];
  }

  private getOrCreate(field: string): string[] {
    const state = this.editContext.associateFieldState(field, this);
    let messages = this.messagesByField.get(state);
    if (!messages) {
      messages = [];
      this.messagesByField.set(state, messages);
    }
    return messages;
  }

  private clearState(state: FieldState): void {
    if (this.messagesByField.delete(state)) {
      state.dissociateFrom(this);
      this.editContext.notifyValidationStateChanged();
    }
  }
}

/** Blazor's event pair (Subscribe/Unsubscribe without .NET events). */
class EventSet<Handler extends (...args: never[]) => void> {
  private readonly handlers = new Set<Handler>();

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  invoke(...args: Parameters<Handler>): void {
    for (const handler of [...this.handlers]) {
      handler(...args);
    }
  }
}

/** The validation rule list of one model field (DataAnnotations pendant). */
function dataAnnotationsRules(editContext: EditContext, field: string): readonly ValidationRule[] {
  return rulesForField(editContext.model, field);
}

/** One DataAnnotations validation provider — the port of EditContext.EnableDataAnnotationsValidation. */
export interface DataAnnotationsValidationSubscription {
  /** Removes the validator from the EditContext (Blazor returns an IDisposable). */
  dispose(): void;
}

/**
 * E8 (design-localization.md §4): what the DataAnnotations pass needs from a
 * StringLocalizer — structural, so the forms module carries no localization
 * dependency. `raw` looks a message up (undefined when missing);
 * `subscribe` re-runs validation when the culture changes or a table arrives.
 */
export interface ValidationMessagesLocalizer {
  /** @internal Reserved/override key lookup (StringLocalizer.raw). */
  raw(key: string): string | undefined;
  subscribe(listener: () => void): () => void;
}

/** The DataAnnotations validation pass options (E8 message localization). */
export interface DataAnnotationsValidationOptions {
  /** The StringLocalizer: reserved `tsazor.validation.*` keys and `messageKey`s resolve through it. */
  readonly localizer?: ValidationMessagesLocalizer;
}

/**
 * Enables DataAnnotations validation on the EditContext: field changes and the
 * validation pass validate the model's decorated fields (rules from
 * validation-attributes.js, the class chain of `editContext.model`). The
 * provider keeps its own ValidationMessageStore, so its messages coexist with
 * the function-map adapter's. The subscriptions mirror Blazor's
 * DataAnnotationsEventSubscriptions (OnFieldChanged/OnValidationRequested).
 *
 * E8: with a `localizer`, the built-in messages localize through it
 * (reserved `tsazor.validation.<kind>` keys) and a culture change re-validates
 * the fields that hold messages, so a form's errors follow the new language
 * without a full re-render.
 */
export function enableDataAnnotationsValidation(
  editContext: EditContext,
  options: DataAnnotationsValidationOptions = {},
): DataAnnotationsValidationSubscription {
  const localizer = options.localizer;
  const store = editContext.createValidationMessageStore();
  // The fields that currently hold this provider's messages — the culture
  // change re-validates exactly these (an untouched invalid field must not
  // surface messages just because the language switched).
  const fieldsWithMessages = new Set<string>();
  const resolve = (rule: ValidationRule, displayName: string, english: string): string =>
    resolveValidationMessage(rule, displayName, english, localizer);

  const validateField = (context: EditContext, field: string, value: unknown): void => {
    const rules = dataAnnotationsRules(context, field);
    if (rules.length === 0) return;
    store.clear(field);
    fieldsWithMessages.delete(field);
    const model = context.model;
    const displayName = field;
    const messages: string[] = [];
    for (const rule of rules) {
      const english = rule.validate(value !== undefined ? value : (model as Record<string, unknown>)[field], model, displayName);
      if (english) messages.push(resolve(rule, displayName, english));
    }
    if (messages.length > 0) {
      store.addAll(field, messages);
      fieldsWithMessages.add(field);
    }
  };

  const validateForm = (context: EditContext): void => {
    store.clear();
    fieldsWithMessages.clear();
    const model = context.model;
    for (const [field, rules] of validationRulesOfFieldMap(model)) {
      const displayName = field;
      const messages: string[] = [];
      for (const rule of rules) {
        const english = rule.validate((model as Record<string, unknown>)[field], model, displayName);
        if (english) messages.push(resolve(rule, displayName, english));
      }
      if (messages.length > 0) {
        store.addAll(field, messages);
        fieldsWithMessages.add(field);
      }
    }
  };

  const unsubscribeFieldChanged = editContext.onFieldChanged.subscribe(validateField);
  const unsubscribeValidationRequested = editContext.onValidationRequested.subscribe(validateForm);
  // E8: a culture change (or a late table arrival) re-localizes the fields
  // that hold messages — the store writes notify, so the form re-renders.
  const unsubscribeLocalizer = localizer?.subscribe(() => {
    for (const field of [...fieldsWithMessages]) {
      validateField(editContext, field, (editContext.model as Record<string, unknown>)[field]);
    }
  });

  return {
    dispose() {
      unsubscribeFieldChanged();
      unsubscribeValidationRequested();
      unsubscribeLocalizer?.();
      store.clear();
    },
  };
}

/** All annotated fields of a model's type with their rules (class chain). */
function validationRulesOfFieldMap(model: object): ReadonlyMap<string, readonly ValidationRule[]> {
  return validationRulesOf((model as { constructor?: unknown }).constructor ?? Object);
}

/** The FieldIdentifier concept: model + field name (Tsazor: field name only). */
export interface FieldIdentifier {
  readonly fieldName: string;
  readonly model: unknown;
}