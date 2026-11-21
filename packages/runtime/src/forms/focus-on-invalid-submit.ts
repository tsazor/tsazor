import { ComponentBase } from "../components/component-base.js";
import { CascadingParameter, Parameter } from "../components/parameter-metadata.js";
import type { RenderTreeBuilder } from "../render-tree/render-tree.js";
import { EditContext, formElements } from "./edit-context.js";
import { componentInternals } from "../components/component-internals.js";

/** Elements that can take the keyboard's focus, unless disabled (isFocusable checks the rest). */
const FOCUSABLE = "a[href], button, input:not([type=hidden]), select, textarea, [contenteditable]:not([contenteditable=false]), [tabindex]";

/** In the tab order: focusable, not disabled, not tabindex -1, not inert or hidden. */
function isFocusable(element: HTMLElement): boolean {
  return element.matches(FOCUSABLE) && !element.matches(":disabled") && element.tabIndex >= 0 && !element.closest("[inert],[hidden]");
}

/**
 * Focuses the first invalid field after a submit that found errors — react-hook-form's `shouldFocusError`, which is
 * on by default there; Blazor's EditForm leaves the focus on the submit button. A superset component, named after
 * Blazor's FocusOnNavigate and EditForm's OnInvalidSubmit: place it inside an EditForm.
 *
 * When the form validates (a submit; an own `editContext.validate()` counts too), the first element of the form that
 * matches `selector` — by default the fields InputBase marks `aria-invalid="true"`, in the form's order — takes the
 * focus once that render is on the screen. A match that can't take the focus itself (a fieldset, a rating's group)
 * passes it to the first element inside it that can; one with none is skipped. A valid form keeps the focus where it
 * is. Renders nothing.
 */
export class FocusOnInvalidSubmit extends ComponentBase {
  /** The enclosing form's EditContext (cascaded by EditForm). */
  @CascadingParameter({ type: EditContext }) editContext?: EditContext;
  /** CSS selector of the invalid fields, as FocusOnNavigate's `selector`. */
  @Parameter() selector = '[aria-invalid="true"]';

  private focusAfterRender = false;
  private unsubscribe?: () => void;

  protected override onInitialized(): void {
    const editContext = this.editContext;
    if (!editContext) {
      throw new Error("FocusOnInvalidSubmit requires a cascading parameter of type EditContext. For example, you can use FocusOnInvalidSubmit inside an EditForm.");
    }
    this.unsubscribe = editContext.onValidationRequested.subscribe(() => {
      this.focusAfterRender = true;
      componentInternals.requestRender(this);
    });
  }

  protected override buildRenderTree(_b: RenderTreeBuilder): void {}

  protected override onAfterRender(): void {
    if (!this.focusAfterRender) return;
    this.focusAfterRender = false;
    const form = this.editContext ? formElements.get(this.editContext) : undefined;
    if (!form) return;
    for (const match of form.querySelectorAll<HTMLElement>(this.selector)) {
      const target = isFocusable(match) ? match : [...match.querySelectorAll<HTMLElement>(FOCUSABLE)].find(isFocusable);
      if (target) {
        target.focus();
        return;
      }
    }
  }

  /** Stops listening to the EditContext. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
