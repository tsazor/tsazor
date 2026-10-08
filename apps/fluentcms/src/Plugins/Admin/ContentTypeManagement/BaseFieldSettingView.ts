import { CascadingParameter, ComponentBase, EventCallback, Parameter } from "@tsazor/runtime";
import type { ContentTypeField } from "../../../api/models";
import { toContentTypeField, type AnyFieldModel } from "./field-models";

/** Where the field management of a content type is (FluentCMS's FieldManagementState). */
export type FieldManagementState = "list" | "create" | "edit" | "delete";

/**
 * The cascades of the field management. By name, not by type: the content type is API data (parsed
 * JSON, never an instance of its model class) and the state a string.
 */
export const CONTENT_TYPE_CASCADE = "ContentType";
export const FIELD_STATE_CASCADE = "FieldManagementState";

/**
 * A field type's settings form (FluentCMS's BaseFieldSettingViewComponent<T, TField>): the field it edits,
 * Cancel, and Submit with the field as a content type stores it.
 */
export abstract class BaseFieldSettingView<TField extends AnyFieldModel> extends ComponentBase {
    @Parameter() model!: TField;
    @CascadingParameter({ name: FIELD_STATE_CASCADE }) currentState: FieldManagementState = "list";
    @Parameter() onCancel?: EventCallback;
    @Parameter() onSubmit?: EventCallback<ContentTypeField>;

    protected get formTitle(): string {
        return this.currentState === "create" ? "Create New Field" : "Update Field";
    }

    protected submitForm(): Promise<void> | undefined {
        return this.onSubmit?.invokeAsync(toContentTypeField(this.model));
    }
}
