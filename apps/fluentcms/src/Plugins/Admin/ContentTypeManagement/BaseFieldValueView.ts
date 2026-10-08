import { ComponentBase, Parameter } from "@tsazor/runtime";
import type { AnyFieldModel } from "./field-models";
import type { FieldValue } from "./field-values";

/**
 * A way to show or edit one field of a content (FluentCMS's BaseFieldValueComponent<T, TField>): the field's
 * settings and its value; a form view binds `fieldValue.value`. Shown through a DynamicComponent, by the name
 * the field's settings store.
 */
export abstract class BaseFieldValueView<TValue, TField extends AnyFieldModel> extends ComponentBase {
    @Parameter() field!: TField;
    @Parameter() fieldValue!: FieldValue<TValue>;
}
