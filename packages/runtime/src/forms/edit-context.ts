import type { RenderFragment } from "../render-tree/render-tree";

/**
 * Blazor's EditContext: change tracking and validation state for a model
 * object used by EditForm and Input* components.
 */
export class EditContext {
  private readonly fieldStates = new Map<string, { isModified: boolean; messages: string[] }>();
  private readonly validationMessage = new Map<string, (value: unknown, model: unknown) => string | null>();
  private listeners = new Set<() => void>();

  constructor(public readonly model: object) {
  }

  /** Registers a validator for a field (function-based, not DataAnnotations). */
  setValidator(field: string, validator: (value: unknown, model: unknown) => string | null): void {
    this.validationMessage.set(field, validator);
  }

  /** Marks a field as modified and re-runs its validators. */
  notifyFieldChanged(field: string, value: unknown): void {
    const state = this.ensure(field);
    state.isModified = true;
    const validator = this.validationMessage.get(field);
    const message = validator ? validator(value, this.model) : null;
    state.messages = message ? [message] : [];
    this.notifyListeners();
  }

  /** Messages for one field (empty when valid). */
  getValidationMessages(field: string): string[] {
    return this.ensure(field).messages.slice();
  }

  isModified(field: string): boolean {
    return this.ensure(field).isModified;
  }

  /** Runs all registered validators; returns whether the model is valid. */
  validate(): boolean {
    let valid = true;
    const model = this.model as Record<string, unknown>;
    for (const [field, validator] of this.validationMessage) {
      const message = validator(model[field], model);
      const state = this.ensure(field);
      state.messages = message ? [message] : [];
      if (message) valid = false;
    }
    this.notifyListeners();
    return valid;
  }

  isValid(): boolean {
    for (const state of this.fieldStates.values()) {
      if (state.messages.length > 0) return false;
    }
    return true;
  }

  /** Field names with at least one validation message. */
  getInvalidFields(): string[] {
    const result: string[] = [];
    for (const [field, state] of this.fieldStates) {
      if (state.messages.length > 0) result.push(field);
    }
    return result;
  }

  /** Blazor's OnValidationRequested / OnFieldChanged analogue. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  private ensure(field: string): { isModified: boolean; messages: string[] } {
    let state = this.fieldStates.get(field);
    if (!state) {
      state = { isModified: false, messages: [] };
      this.fieldStates.set(field, state);
    }
    return state;
  }
}

/** The FieldIdentifier concept: model + field name. */
export interface FieldIdentifier {
  readonly fieldName: string;
  readonly model: unknown;
}

/** Renders an EditContext-cascading subtree; used by EditForm. */
export type EditFormFragment = RenderFragment;