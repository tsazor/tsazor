import { ComponentBase } from "../components/component-base.js";
import { DEV } from "../components/observe.js";
import { CascadingParameter, Parameter } from "../components/parameter-metadata.js";
import type { RenderTreeBuilder } from "../render-tree/render-tree.js";
import { EditContext, type ValidationMessageStore } from "./edit-context.js";

/**
 * Standard Schema (standardschema.dev, v1): the interface zod (3.24+), Valibot, ArkType and others implement, so a
 * form can validate with any of them. Copied here as the spec intends — no dependency on it or on a library.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
  };
}

/** A Standard Schema validation result: the (transformed) value, or the issues. */
export type StandardSchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue> };

/** One problem a schema found; `path` names the field (a nested one by its segments). */
export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

/** The EditContext field an issue belongs to: its path's segments joined with dots; "" (the model) without a path. */
export function standardSchemaField(issue: StandardSchemaIssue): string {
  return (issue.path ?? []).map((segment) => String(typeof segment === "object" ? segment.key : segment)).join(".");
}

/**
 * Tsazor extension, the Blazor shape of a form library's schema resolver (react-hook-form's `zodResolver`;
 * Blazored.FluentValidation's `<FluentValidationValidator />`): inside an EditForm, it validates the form model with
 * a Standard Schema — a zod object, a Valibot or ArkType schema — and writes the issues as the fields' validation
 * messages, which ValidationMessage, ValidationSummary and the inputs' invalid state show as DataAnnotations' do.
 *
 * ```razor
 * <EditForm Model="@model" OnValidSubmit="@save">
 *     <StandardSchemaValidator Schema="@schema" />
 *     <InputText @bind-Value="model.email" />
 *     <ValidationMessage For="email" />
 * </EditForm>
 * ```
 *
 * Timing as DataAnnotationsValidator's: a field change validates the model and updates that field's messages (a
 * cross-field rule such as a password confirmation speaks on its own field); a submit (`validate()`) clears this
 * validator's messages and writes every issue. An issue without a path is the model's (field ""). The schema's
 * transformed output (zod's `.trim()`) is not written back: the submit handler parses the model when it needs it.
 * Synchronous, as EditContext.validate() is: a schema whose validation is async (zod's async refinements) still
 * shows its messages when they arrive, but a submit doesn't wait for them — a DEV warning says so.
 */
export class StandardSchemaValidator extends ComponentBase {
  /** The form's EditContext (cascaded by EditForm). */
  @CascadingParameter({ type: EditContext }) editContext?: EditContext;
  /** The schema the model must satisfy. */
  @Parameter() schema?: StandardSchemaV1;

  private store?: ValidationMessageStore;
  private originalEditContext?: EditContext;
  private subscriptions: Array<() => void> = [];
  private warnedAsync = false;

  protected override onInitialized(): void {
    const editContext = this.editContext;
    if (!editContext) {
      throw new Error(
        "StandardSchemaValidator requires a cascading parameter of type EditContext. For example, you can use StandardSchemaValidator inside an EditForm.",
      );
    }
    this.originalEditContext = editContext;
    this.store = editContext.createValidationMessageStore();
    this.subscriptions = [
      editContext.onValidationRequested.subscribe(() => this.validate(undefined)),
      editContext.onFieldChanged.subscribe((_context, field) => this.validate(field)),
    ];
  }

  protected override onParametersSet(): void {
    if (this.editContext !== this.originalEditContext) {
      throw new Error("StandardSchemaValidator does not support changing the EditContext dynamically.");
    }
    if (!this.schema) throw new Error("StandardSchemaValidator requires a Schema.");
  }

  /** Detaches from the EditContext and removes the validator's messages. */
  dispose(): void {
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions = [];
    this.store?.clear();
  }

  protected override buildRenderTree(_b: RenderTreeBuilder): void {
    // Renders nothing, as DataAnnotationsValidator.
  }

  /** The whole model's messages (`field` undefined: a submit) or one field's. */
  private validate(field: string | undefined): void {
    const editContext = this.editContext;
    const schema = this.schema;
    if (!editContext || !schema) return;
    const result = schema["~standard"].validate(editContext.model);
    if (isPromiseLike(result)) {
      if (DEV && !this.warnedAsync) {
        this.warnedAsync = true;
        // eslint-disable-next-line no-console
        console.warn("[tsazor] StandardSchemaValidator: the schema validates asynchronously — a submit doesn't wait for its messages.");
      }
      void Promise.resolve(result).then(
        (resolved) => this.apply(resolved, field, editContext),
        (error: unknown) => this.dispatchExceptionAsync(error),
      );
      return;
    }
    this.apply(result, field, editContext);
  }

  /** Replaces this validator's messages (all, or the field's) with the result's; the store's writes notify the form. */
  private apply(result: StandardSchemaResult<unknown>, field: string | undefined, editContext: EditContext): void {
    const store = this.store;
    if (!store || this.editContext !== editContext) return;
    store.clear(field);
    for (const issue of result.issues ?? []) {
      const issueField = standardSchemaField(issue);
      if (field === undefined || issueField === field) store.add(issueField, issue.message);
    }
  }
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}
