import { ComponentBase } from "../components/component-base";
import { CascadingParameter, Parameter } from "../components/parameter-metadata";
import type { RenderTreeBuilder } from "../render-tree/render-tree";
import { EditContext } from "./edit-context";

/**
 * Blazor's ValidationMessage<T>: shows validation messages for one field.
 * v1 deviation: `For` is a plain field name string (Blazor uses an expression).
 */
export class ValidationMessage extends ComponentBase {
  /** Field name to display messages for (matches the form's validator keys). */
  @Parameter() For?: string;
  /** Pass-through attributes. */
  @Parameter({ captureUnmatchedValues: true }) additionalAttributes?: Record<string, unknown>;
  @CascadingParameter({ type: EditContext }) editContext?: EditContext;

  private editContextUnsubscribe?: () => void;

  protected override onInitialized(): void {
    if (this.editContext) {
      this.editContextUnsubscribe = this.editContext.subscribe(() => this.stateHasChangedInternal());
    }
  }

  dispose(): void {
    this.editContextUnsubscribe?.();
    this.editContextUnsubscribe = undefined;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.beginRender();
    if (!this.editContext || !this.For) return;
    const messages = this.editContext.getValidationMessages(this.For);
    if (messages.length === 0) return;
    for (const message of messages) {
      b.openElement(this.nextSequence(), "span");
      b.addAttribute(this.nextSequence(), "class", "validation-message");
      for (const [name, value] of Object.entries(this.additionalAttributes ?? {})) {
        b.addAttribute(this.nextSequence(), name, value as never);
      }
      b.addContent(this.nextSequence(), message);
      b.closeElement();
    }
  }

  private sequenceCounter = 0;
  private beginRender(): void {
    this.sequenceCounter = 0;
  }
  private nextSequence(): number {
    return this.sequenceCounter++;
  }
}

/** Blazor's ValidationSummary: lists all validation messages of the EditContext. */
export class ValidationSummary extends ComponentBase {
  @Parameter({ captureUnmatchedValues: true }) additionalAttributes?: Record<string, unknown>;
  @CascadingParameter({ type: EditContext }) editContext?: EditContext;

  private editContextUnsubscribe?: () => void;

  protected override onInitialized(): void {
    if (this.editContext) {
      this.editContextUnsubscribe = this.editContext.subscribe(() => this.stateHasChangedInternal());
    }
  }

  dispose(): void {
    this.editContextUnsubscribe?.();
    this.editContextUnsubscribe = undefined;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.beginRender();
    if (!this.editContext) return;
    const invalid = this.editContext.getInvalidFields();
    if (invalid.length === 0) return;
    b.openElement(this.nextSequence(), "ul");
    for (const [name, value] of Object.entries(this.additionalAttributes ?? {})) {
      b.addAttribute(this.nextSequence(), name, value as never);
    }
    b.addAttribute(this.nextSequence(), "class", `validation-summary${this.additionalAttributes?.["class"] ? ` ${this.additionalAttributes["class"]}` : ""}`);
    for (const field of invalid) {
      for (const message of this.editContext.getValidationMessages(field)) {
        b.openElement(this.nextSequence(), "li");
        b.addContent(this.nextSequence(), message);
        b.closeElement();
      }
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
}