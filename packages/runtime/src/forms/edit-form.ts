import { componentInternals } from "../components/component-internals.js";
import { ComponentBase } from "../components/component-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import { EventCallback } from "../components/event-callback.js";
import { EventHandlerFlags } from "../render-tree/frame-type.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { CascadingValueSupplier } from "../renderer/cascading-value.js";
import { EditContext, formElements } from "./edit-context.js";

/** Function-based validator (the adapter; rules come from the field decorators). */
export type ModelValidator = (value: unknown, model: unknown) => string | null;

/**
 * Stable identity for an EditContext, mirroring Blazor's
 * `builder.OpenRegion(_editContext.GetHashCode())`: the region sequence is the
 * context's identity, so a recreated context tears down and rebuilds the form's
 * entire subtree (state inside inputs is reset) — which is what makes cascading
 * the context with IsFixed=true safe (Blazor's rationale in EditForm.cs).
 *
 * GetHashCode() itself cannot be ported: a TS object's identity hash is not
 * observable in a defined way, so the counter serves the same purpose.
 */
const editContextIdentity = new WeakMap<EditContext, number>();
let nextEditContextIdentity = 1;
function regionSequenceFor(context: EditContext): number {
  let identity = editContextIdentity.get(context);
  if (identity === undefined) {
    identity = nextEditContextIdentity++;
    editContextIdentity.set(context, identity);
  }
  return identity;
}

/**
 * Blazor's EditForm (src/Components/Web/src/Forms/EditForm.cs): hosts an
 * EditContext around the model and cascades it to the Input* components in its
 * child content. Submit routes through `onsubmit`; with `onSubmit` the delegate
 * decides everything itself, otherwise the EditContext validates first and the
 * result routes to `onValidSubmit`/`onInvalidSubmit`. Validation providers are
 * two-fold (roadmap 3.6): `validators` maps field names to validator functions
 * (the adapter), and the DataAnnotationsValidator built-in enables the model's
 * field-rule decorators (`@Required()`, …) on the context.
 *
 * The cascaded context is fixed (Blazor: CascadingValue.IsFixed=true) — safe
 * because the region keyed by the context's identity tears the whole subtree
 * down whenever a new context appears (a new model).
 */
export class EditForm extends ComponentBase implements CascadingValueSupplier {
  /** The model object to edit and validate (Blazor's Model parameter). */
  @Parameter() model?: object;
  /** The context to use instead of one created around `model`. */
  @Parameter() editContext?: EditContext;
  /** Field name → validator function (the adapter for logic a decorator rule cannot express). */
  @Parameter() validators?: Record<string, ModelValidator>;
  /** Invoked after form submit (no automatic validation). */
  @Parameter() onSubmit?: EventCallback<EditContext>;
  /** Invoked after a successful submit (validation passed). */
  @Parameter() onValidSubmit?: EventCallback<EditContext>;
  /** Invoked after a failed submit (validation failed). */
  @Parameter() onInvalidSubmit?: EventCallback<EditContext>;
  /** Form contents (the inputs); receives the cascaded EditContext. Blazor's
   *  RenderFragment<EditContext> — Tsazor's spelling is the function type. */
  @Parameter() childContent?: (context: EditContext) => RenderFragment;
  /** Pass-through attributes (class, id, …). */
  @Parameter({ captureUnmatchedValues: true }) additionalAttributes?: Record<string, unknown>;

  /** Marks the component as a cascading value supplier for the renderer. */
  readonly isCascadingValueSupplier = true;
  /**
   * Blazor's IsFixed: true. This component re-renders whenever the context
   * changes, so the value is always up to date before children render — and a
   * context change tears the region down wholesale.
   */
  readonly isFixed = true;
  /** Cascades by type, unnamed (Blazor's CascadingValue<EditContext>). */
  readonly cascadeType = EditContext;
  /** The cascaded EditContext: the `editContext` parameter, or the one built for `model`. */
  get cascadeValue(): unknown {
    return this.currentEditContext;
  }

  /** The cascaded EditContext (Blazor's CascadingValue<EditContext> value). */
  private currentEditContext?: EditContext;
  private editContextUnsubscribe?: () => void;

  protected override onParametersSet(): void {
    // Blazor's OnParametersSet: parameter-level validation, then the context
    // is (re)created so children can cascade it — the errors use Blazor's
    // exact messages (they mention the parameters, not the component).
    const hasExplicitContext = this.editContext !== undefined;
    const hasModel = this.model !== undefined;
    if (hasExplicitContext && hasModel) {
      throw new Error("EditForm requires a Model parameter, or an EditContext parameter, but not both.");
    }
    if (!hasExplicitContext && !hasModel) {
      throw new Error("EditForm requires either a Model parameter, or an EditContext parameter, please provide one of these.");
    }
    if (this.onSubmit?.hasDelegate && (this.onValidSubmit?.hasDelegate || this.onInvalidSubmit?.hasDelegate)) {
      throw new Error("When supplying an OnSubmit parameter to EditForm, do not also supply OnValidSubmit or OnInvalidSubmit.");
    }

    // Blazor: a new Model creates a context, a new EditContext replaces it —
    // with an EditContext parameter the (absent) Model must not be compared,
    // or every re-render would wrap `undefined` in a fresh context.
    if (this.editContext !== undefined) {
      if (this.editContext !== this.currentEditContext) this.bindEditContext(this.editContext);
      else this.applyValidators();
    } else if (this.model !== this.currentEditContext?.model) {
      this.bindEditContext(new EditContext(this.model!));
    } else {
      this.applyValidators();
    }
  }

  /** Blazor's subscribe-to-validation-changed part of the EditContext setup. */
  private bindEditContext(context: EditContext): void {
    this.editContextUnsubscribe?.();
    this.currentEditContext = context;
    this.applyValidators();
    this.editContextUnsubscribe = context.subscribe(() => componentInternals.requestRender(this));
  }

  private applyValidators(): void {
    if (!this.currentEditContext || !this.validators) return;
    for (const [field, validator] of Object.entries(this.validators)) {
      this.currentEditContext.setValidator(field, validator);
    }
  }

  /**
   * Blazor's HandleSubmitAsync: with `onSubmit` the delegate decides everything
   * itself; otherwise the EditContext validates and the result routes to
   * `onValidSubmit`/`onInvalidSubmit`. The callbacks receive the EditContext,
   * and this whole method awaits them inside the tracked submit handler, so
   * renderer-idle waits cover a nested async OnValidSubmit.
   */
  private async handleSubmit(): Promise<void> {
    const editContext = this.currentEditContext!;
    if (this.onSubmit?.hasDelegate) {
      await this.onSubmit.invokeAsync(editContext);
      return;
    }
    const isValid = editContext.validate();
    if (isValid) {
      await this.onValidSubmit?.invokeAsync(editContext);
    } else {
      await this.onInvalidSubmit?.invokeAsync(editContext);
    }
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    // Blazor: OpenRegion(_editContext.GetHashCode()) → a context change
    // replaces this region wholesale, resetting everything inside the form.
    b.openRegion(regionSequenceFor(this.currentEditContext!));
    b.openElement(0, "form");
    // Submit must not navigate: preventDefault, then HandleSubmitAsync.
    b.addEventHandler(1, "onsubmit", EventCallback.bind(this, () => this.handleSubmit()), EventHandlerFlags.PreventDefault);
    for (const [name, value] of Object.entries(this.additionalAttributes ?? {})) {
      b.addAttribute(2, name, value as never);
    }
    // The form of this context, for components inside it that work on its fields (FocusOnInvalidSubmit).
    const editContext = this.currentEditContext!;
    b.addElementReferenceCapture(3, (element) => formElements.set(editContext, element as HTMLFormElement));
    if (this.childContent) {
      this.childContent(this.currentEditContext!)(b);
    }
    b.closeElement();
    b.closeRegion();
  }

  /** Stops listening to the EditContext's change notifications. */
  dispose(): void {
    this.editContextUnsubscribe?.();
    this.editContextUnsubscribe = undefined;
  }
}