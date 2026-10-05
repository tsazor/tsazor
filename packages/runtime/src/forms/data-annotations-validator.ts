import { ComponentBase } from "../components/component-base.js";
import { CascadingParameter } from "../components/parameter-metadata.js";
import { getCurrentServices } from "../di/service-provider.js";
import type { Token } from "../di/service-collection.js";
import type { RenderTreeBuilder } from "../render-tree/render-tree.js";
import { EditContext } from "./edit-context.js";
import { enableDataAnnotationsValidation, type DataAnnotationsValidationSubscription } from "./edit-context.js";
import { StringLocalizer } from "../localization/string-localizer.js";

/**
 * DataAnnotationsValidator, port of Blazor's DataAnnotationsValidator.cs
 * (src/Components/Forms/src): inside an EditForm, it enables DataAnnotations
 * validation of the form model on the cascaded EditContext — Tsazor's pendant
 * are the field-rule decorators (validation-attributes.ts, roadmap 3.6):
 * `@Required()`, `@MinLength()`, `@MaxLength()`, `@StringLength()`, `@Range()`,
 * `@EmailAddress()`, `@RegularExpression()`, `@Compare()`.
 *
 * Timing like Blazor's DataAnnotationsEventSubscriptions:
 * - a field change revalidates exactly that field (its rules; a field without
 *   rules is not touched),
 * - validate() (form submit) validates every decorated field of the model and
 *   first clears this provider's messages.
 * Messages are stored with .NET's DataAnnotations texts (field name as display
 * name). Deviations: `DisableClientValidation` and the SSR client-validation
 * mapping (DataAnnotationsValidator's [Inject] IServiceProvider) have no
 * Tsazor counterpart; the validator is the only consumer of the model rules —
 * additional custom rules go through the EditForm `validators` adapter.
 */
export class DataAnnotationsValidator extends ComponentBase {
  /** Blazor's [CascadingParameter] EditContext CurrentEditContext (by type). */
  @CascadingParameter({ type: EditContext }) editContext?: EditContext;

  private subscription?: DataAnnotationsValidationSubscription;
  private originalEditContext?: EditContext;

  protected override onInitialized(): void {
    if (!this.editContext) {
      throw new Error(
        "DataAnnotationsValidator requires a cascading parameter of type EditContext. For example, you can use DataAnnotationsValidator inside an EditForm.",
      );
    }
    this.originalEditContext = this.editContext;
    // E8: a registered StringLocalizer localizes the built-in messages (the
    // reserved tsazor.validation.* keys) and re-validates on culture change.
    // tryGet, not inject: without one the messages stay English (a hand-built
    // tree has no provider at all) — and no auto-render subscription is
    // needed here: the validation pass's re-run notifies the form.
    const localizer = getCurrentServices(this)?.tryGet(StringLocalizer as unknown as Token<StringLocalizer>);
    this.subscription = enableDataAnnotationsValidation(this.editContext, { localizer });
  }

  protected override onParametersSet(): void {
    if (this.editContext !== this.originalEditContext) {
      // Blazor: an EditContext change is unsupported (InputBase restriction).
      throw new Error(`DataAnnotationsValidator does not support changing the EditContext dynamically.`);
    }
  }

  /** Detaches the validation handlers from the EditContext and removes the validator's messages. */
  dispose(): void {
    this.subscription?.dispose();
    this.subscription = undefined;
  }

  protected override buildRenderTree(_b: RenderTreeBuilder): void {
    // Blazor renders nothing itself.
  }
}