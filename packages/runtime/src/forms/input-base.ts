import { ComponentBase } from "../components/component-base.js";
import { CascadingParameter, Parameter } from "../components/parameter-metadata.js";
import { EventCallback } from "../components/event-callback.js";
import type { RenderTreeBuilder } from "../render-tree/render-tree.js";
import { EditContext } from "./edit-context.js";
import { componentInternals } from "../components/component-internals.js";

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
  /**
   * The bound value (two-way via ValueChanged). It may be null, as Blazor's `TValue? Value`: a
   * `string | null` field binds to a text input, which hands back a string.
   */
  @Parameter() value?: TValue | null;
  /** Invoked when the user edits the input (compiler @bind-Value emits this). */
  @Parameter() valueChanged?: EventCallback<TValue>;
  /** Field name used for EditContext registration and validation. */
  @Parameter() valueExpression?: string;
  /** Resolved from the nearest EditForm (by-type cascading). */
  @CascadingParameter({ type: EditContext }) editContext?: EditContext;
  /** Pass-through attributes (class, style, placeholder, …), as the caller gave them. */
  @Parameter({ captureUnmatchedValues: true }) additionalAttributes?: Record<string, unknown>;

  /**
   * Blazor's Element: the input's element once it has rendered, as InputFile's `element` — focus it with
   * `input.element?.focus()` (Blazor's `Element.Value.FocusAsync()`). A component on InputBase sets it with
   * `@ref="element"` on its input.
   */
  element?: HTMLElement;

  #editContextUnsubscribe: (() => void) | undefined;

  /** Blazor's CurrentValue. */
  get currentValue(): TValue | null | undefined {
    return this.value;
  }

  set currentValue(value: TValue) {
    if (Object.is(value, this.value)) return;
    this.value = value;
    // Blazor's order: ValueChanged first (the bound model field is written by
    // the synchronous part of the @bind setter), then NotifyFieldChanged — so
    // validators that read the model see the new value.
    void this.valueChanged?.invokeAsync(value);
    if (this.valueExpression && this.editContext) {
      this.editContext.notifyFieldChanged(this.valueExpression, value);
    }
  }

  protected override onInitialized(): void {
    if (this.editContext) {
      // Blazor's OnValidateStateChanged.
      this.#editContextUnsubscribe = this.editContext.onValidationStateChanged.subscribe(() => componentInternals.requestRender(this));
    }
  }

  /** Stops listening to the EditContext's change notifications. */
  dispose(): void {
    this.#editContextUnsubscribe?.();
    this.#editContextUnsubscribe = undefined;
  }

  /** Blazor's FieldClass: validation CSS class for the bound field (the EditContext's FieldCssClass). */
  protected get fieldClass(): string {
    if (!this.editContext || !this.valueExpression) return "";
    return this.editContext.fieldCssClass(this.valueExpression);
  }

  /** Blazor's CssClass: the caller's `class` and the field's validation class, for a component's own markup. */
  protected get cssClass(): string {
    const userClass = typeof this.additionalAttributes?.["class"] === "string" ? (this.additionalAttributes["class"] as string) : undefined;
    return [userClass, this.fieldClass].filter(Boolean).join(" ");
  }

  /**
   * The attributes with Blazor's validation state (its UpdateAdditionalValidationAttributes, which writes it into
   * AdditionalAttributes): `aria-invalid="true"` while the field has messages (a caller's own value kept then),
   * none — not even the caller's — while it has none. For a component that inherits an input and renders its own
   * markup: `<input @attributes="@attributesWithValidation" class="@cssClass" …>`. (Deviation: Blazor changes
   * AdditionalAttributes itself; here they stay the caller's, so a skin that shows the invalid state only after a
   * submit decides that itself.) Outside an EditForm, the attributes as given.
   */
  protected get attributesWithValidation(): Record<string, unknown> | undefined {
    const attributes = this.additionalAttributes;
    if (!this.editContext || !this.valueExpression) return attributes;
    const hasAriaInvalid = attributes !== undefined && "aria-invalid" in attributes;
    if (this.editContext.getValidationMessages(this.valueExpression).length > 0) {
      return hasAriaInvalid ? attributes : { ...attributes, "aria-invalid": "true" };
    }
    if (!hasAriaInvalid) return attributes;
    const { "aria-invalid": _removed, ...rest } = attributes!;
    return rest;
  }

  /** Captures the rendered input as `element` (after its attributes, before its content). */
  protected captureElement(b: RenderTreeBuilder): void {
    b.addElementReferenceCapture(this.nextSequence(), (element) => {
      this.element = element as HTMLElement;
    });
  }

  /** Merges validation class with pass-through attributes for one element. */
  protected applyCommonAttributes(b: RenderTreeBuilder): void {
    const fieldClass = this.fieldClass;
    const extra = this.attributesWithValidation;
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

  #sequenceCounter = 0;

  /** @internal Monotone sequence helper for concrete inputs. */
  protected nextSequence(): number {
    return this.#sequenceCounter++;
  }

  /** @internal Resets the per-render sequence counter. */
  protected beginRender(): void {
    this.#sequenceCounter = 0;
  }

  /** Builds a change handler that extracts the DOM value and runs the bind flow. */
  protected changeHandler(extract: (e: Event) => TValue): EventCallback<Event> {
    return EventCallback.bind(this, (e: Event) => {
      this.currentValue = extract(e);
    });
  }

  /**
   * The handlers of an input that binds on every keystroke (InputText's `immediate`, react-hook-form's
   * `register()`): `input` sets the value (ValueChanged) and — while the field has a message — tells the form, so
   * the message goes as soon as the value is fixed (react-hook-form's reValidateMode); `change` tells the form, as
   * the plain bind does (validation, the modified state).
   */
  protected addImmediateHandlers(b: RenderTreeBuilder, extract: (e: Event) => TValue): void {
    b.addEventHandler(
      this.nextSequence(),
      "oninput",
      EventCallback.bind(this, (e: Event) => {
        const value = extract(e);
        if (Object.is(value, this.value)) return;
        this.value = value;
        void this.valueChanged?.invokeAsync(value);
        if (this.valueExpression && this.editContext && !this.editContext.isValid(this.valueExpression)) {
          this.editContext.notifyFieldChanged(this.valueExpression, value);
        }
      }),
    );
    b.addEventHandler(
      this.nextSequence(),
      "onchange",
      EventCallback.bind(this, (e: Event) => {
        const value = extract(e);
        if (!Object.is(value, this.value)) {
          this.currentValue = value;
        } else if (this.valueExpression && this.editContext) {
          this.editContext.notifyFieldChanged(this.valueExpression, value);
        }
      }),
    );
  }
}