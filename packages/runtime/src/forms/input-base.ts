import { ComponentBase } from "../components/component-base.js";
import { CascadingParameter, Parameter } from "../components/parameter-metadata.js";
import { EventCallback } from "../components/event-callback.js";
import type { RenderTreeBuilder } from "../render-tree/render-tree.js";
import { EditContext } from "./edit-context.js";

/**
 * Blazor's InputBase<TValue>: the foundation of the Input* component family.
 * Holds the two-way value parameters, resolves the EditContext cascading
 * value, and tracks validation state for the bound field.
 *
 * v1 deviation: `ValueExpression` is a plain field name string (Blazor uses a
 * compiler-generated expression); the form validators and ValidationMessage
 * key on the same string.
 */
export abstract class InputBase<TValue> extends ComponentBase {
  /** The bound value (two-way via ValueChanged). */
  @Parameter() Value?: TValue;
  /** Invoked when the user edits the input (compiler @bind-Value emits this). */
  @Parameter() ValueChanged?: EventCallback<TValue>;
  /** Field name used for EditContext registration and validation. */
  @Parameter() ValueExpression?: string;
  /** Resolved from the nearest EditForm (by-type cascading). */
  @CascadingParameter({ type: EditContext }) editContext?: EditContext;
  /** Pass-through attributes (class, style, placeholder, …). */
  @Parameter({ captureUnmatchedValues: true }) additionalAttributes?: Record<string, unknown>;

  private editContextUnsubscribe?: () => void;

  /** Blazor's CurrentValue. */
  get currentValue(): TValue | undefined {
    return this.Value;
  }

  set currentValue(value: TValue) {
    if (Object.is(value, this.Value)) return;
    this.Value = value;
    // Blazor's order: ValueChanged first (the bound model field is written by
    // the synchronous part of the @bind setter), then NotifyFieldChanged — so
    // validators that read the model see the new value.
    void this.ValueChanged?.invokeAsync(value);
    if (this.ValueExpression && this.editContext) {
      this.editContext.notifyFieldChanged(this.ValueExpression, value);
    }
  }

  protected override onInitialized(): void {
    if (this.editContext) {
      this.editContextUnsubscribe = this.editContext.subscribe(() => this.stateHasChangedInternal());
    }
  }

  /** Stops listening to the EditContext's change notifications. */
  dispose(): void {
    this.editContextUnsubscribe?.();
    this.editContextUnsubscribe = undefined;
  }

  /** Blazor's FieldClass: validation CSS class for the bound field. */
  protected get fieldClass(): string {
    if (!this.editContext || !this.ValueExpression) return "";
    const isValid = this.editContext.getValidationMessages(this.ValueExpression).length === 0;
    const isModified = this.editContext.isModified(this.ValueExpression);
    // Blazor's EditContext.FieldCssClass: the four documented states.
    if (isModified) return isValid ? "modified valid" : "modified invalid";
    return isValid ? "valid" : "invalid";
  }

  /** Merges validation class with pass-through attributes for one element. */
  protected applyCommonAttributes(b: RenderTreeBuilder): void {
    const fieldClass = this.fieldClass;
    const extra = this.additionalAttributes;
    const userClass = typeof extra?.["class"] === "string" ? (extra["class"] as string) : undefined;
    if (fieldClass || userClass) {
      const combined = [userClass, fieldClass].filter(Boolean).join(" ");
      b.addAttribute(this.nextSequence(), "class", combined);
    }
    if (extra) {
      for (const [name, value] of Object.entries(extra)) {
        if (name === "class") continue;
        b.addAttribute(this.nextSequence(), name, value as never);
      }
    }
  }

  private sequenceCounter = 0;

  /** @internal Monotone sequence helper for concrete inputs. */
  protected nextSequence(): number {
    return this.sequenceCounter++;
  }

  /** @internal Resets the per-render sequence counter. */
  protected beginRender(): void {
    this.sequenceCounter = 0;
  }

  /** Builds a change handler that extracts the DOM value and runs the bind flow. */
  protected changeHandler(extract: (e: Event) => TValue): EventCallback<Event> {
    return EventCallback.bind(this, (e: Event) => {
      this.currentValue = extract(e);
    });
  }
}