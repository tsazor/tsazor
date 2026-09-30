import { ComponentBase } from "../components/component-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import { EventCallback } from "../components/event-callback.js";
import { EventHandlerFlags } from "../render-tree/frame-type.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { CascadingValueSupplier } from "../renderer/cascading-value.js";
import { EditContext } from "./edit-context.js";

/** Function-based validator (v1 deviation from DataAnnotations). */
export type ModelValidator = (value: unknown, model: unknown) => string | null;

/**
 * Blazor's EditForm: hosts an EditContext around the model and cascades it to
 * the Input* components in its child content. Validation is function-based:
 * `validators` maps field names to validator functions.
 */
export class EditForm extends ComponentBase implements CascadingValueSupplier {
  /** The model object to edit and validate. */
  @Parameter() model!: object;
  /** Field name → validator; registered on the EditContext. */
  @Parameter() validators?: Record<string, ModelValidator>;
  /** Invoked after a successful submit (validation passed). */
  @Parameter() onValidSubmit?: EventCallback<Event>;
  /** Form contents (the inputs). */
  @Parameter() childContent?: RenderFragment;
  /** Pass-through attributes (class, id, …). */
  @Parameter({ captureUnmatchedValues: true }) additionalAttributes?: Record<string, unknown>;

  readonly isCascadingValueSupplier = true;
  /** Blazor's IsFixed: false — the EditContext is recreated when the model changes. */
  readonly isFixed = false;

  /** The cascaded EditContext (Blazor's EditForm cascades by type). */
  editContext?: EditContext;
  get cascadeValue(): unknown {
    return this.editContext;
  }

  private editContextUnsubscribe?: () => void;

  protected override onInitialized(): void {
    this.editContext = new EditContext(this.model);
    this.applyValidators();
    this.editContextUnsubscribe = this.editContext.subscribe(() => this.stateHasChangedInternal());
  }

  protected override onParametersSet(): void {
    // New model → fresh context (Blazor recreates the EditContext per model).
    if (this.editContext && this.editContext.model !== this.model) {
      this.editContextUnsubscribe?.();
      this.editContext = new EditContext(this.model);
      this.applyValidators();
      this.editContextUnsubscribe = this.editContext.subscribe(() => this.stateHasChangedInternal());
    } else {
      this.applyValidators();
    }
  }

  private applyValidators(): void {
    if (!this.editContext || !this.validators) return;
    for (const [field, validator] of Object.entries(this.validators)) {
      this.editContext.setValidator(field, validator);
    }
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.beginRender();
    b.openElement(this.nextSequence(), "form");
    // Submit must not navigate: preventDefault, validate, then notify.
    b.addEventHandler(
      this.nextSequence(),
      "onsubmit",
      EventCallback.bind(this, (e: Event) => {
        const valid = this.editContext!.validate();
        if (valid) {
          this.onValidSubmit?.invokeAsync(e);
        }
      }),
      EventHandlerFlags.PreventDefault,
    );
    for (const [name, value] of Object.entries(this.additionalAttributes ?? {})) {
      b.addAttribute(this.nextSequence(), name, value as never);
    }
    if (this.childContent) {
      this.childContent(b);
    }
    b.closeElement();
  }

  private sequenceCounter = 0;
  private beginRender(): void {
    this.sequenceCounter = 0;
  }
  private nextSequence(): number {
    return this.sequenceCounter++;
  }

  dispose(): void {
    this.editContextUnsubscribe?.();
    this.editContextUnsubscribe = undefined;
  }
}