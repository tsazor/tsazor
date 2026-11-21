import type { ModelValidator } from "@tsazor/runtime";
import type { Localizer } from "../../i18n";
import { EntityExtendedAttributeType, type AddEditDocumentCommand, type AddEditExtendedAttributeCommand } from "../Misc";

// Application/Validators/Features/{DocumentTypes,Documents,ExtendedAttributes}/Commands/AddEdit (FluentValidation) as
// EditForm validators: per field, the message of its rule.

const text = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";
const positive = (value: unknown): boolean => typeof value === "number" && value > 0;

/** AddEditDocumentTypeCommandValidator. */
export function addEditDocumentTypeValidators(L: Localizer<"AddEditDocumentTypeCommandValidator">): Record<string, ModelValidator> {
    return {
        name: (value) => (text(value) ? null : L("Name is required!")),
        description: (value) => (text(value) ? null : L("Description is required!")),
    };
}

/** AddEditDocumentCommandValidator: a new document needs its file (`URL` is set once it was uploaded). */
export function addEditDocumentValidators(L: Localizer<"AddEditDocumentCommandValidator">): Record<string, ModelValidator> {
    return {
        title: (value) => (text(value) ? null : L("Title is required!")),
        description: (value) => (text(value) ? null : L("Description is required!")),
        documentTypeId: (value) => (positive(value) ? null : L("Document Type is required!")),
        url: (value, model) => (text(value) || (model as AddEditDocumentCommand).uploadRequest !== null ? null : L("File is required!")),
    };
}

/** AddEditExtendedAttributeCommandValidator: the value its type names is required (`When(Type == …)`). */
export function addEditExtendedAttributeValidators(L: Localizer<"AddEditExtendedAttributeCommandValidatorLocalization">): Record<string, ModelValidator> {
    const typeOf = (model: unknown): EntityExtendedAttributeType => (model as AddEditExtendedAttributeCommand<unknown, unknown>).type;
    const required = (type: EntityExtendedAttributeType, message: "Decimal value is required using {0} type!" | "Text value is required using {0} type!" | "DateTime value is required using {0} type!" | "Json value is required using {0} type!"): ModelValidator =>
        (value, model) => (typeOf(model) !== type || (value !== null && value !== undefined) ? null : L(message, { 0: EntityExtendedAttributeType[type] }));
    return {
        entityId: (value) => (value !== 0 && value !== null && value !== undefined && value !== "" ? null : L("Entity is required!")),
        key: (value) => (text(value) ? null : L("Key is required!")),
        decimal: required(EntityExtendedAttributeType.Decimal, "Decimal value is required using {0} type!"),
        text: required(EntityExtendedAttributeType.Text, "Text value is required using {0} type!"),
        dateTime: required(EntityExtendedAttributeType.DateTime, "DateTime value is required using {0} type!"),
        json: required(EntityExtendedAttributeType.Json, "Json value is required using {0} type!"),
    };
}
