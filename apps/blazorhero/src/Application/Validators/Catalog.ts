import type { ModelValidator } from "@tsazor/runtime";
import type { Localizer } from "../../i18n";

// Application/Validators/Features/{Brands,Products}/Commands/AddEdit (FluentValidation) as EditForm validators:
// per field, the message of its rule.

const text = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";
const positive = (value: unknown): boolean => typeof value === "number" && value > 0;

/** AddEditBrandCommandValidator. */
export function addEditBrandValidators(L: Localizer<"AddEditBrandCommandValidator">): Record<string, ModelValidator> {
    return {
        name: (value) => (text(value) ? null : L("Name is required!")),
        description: (value) => (text(value) ? null : L("Description is required!")),
        tax: (value) => (positive(value) ? null : L("Tax must be greater than 0")),
    };
}

/** AddEditProductCommandValidator. */
export function addEditProductValidators(L: Localizer<"AddEditProductCommandValidator">): Record<string, ModelValidator> {
    return {
        name: (value) => (text(value) ? null : L("Name is required!")),
        barcode: (value) => (text(value) ? null : L("Barcode is required!")),
        description: (value) => (text(value) ? null : L("Description is required!")),
        brandId: (value) => (positive(value) ? null : L("Brand is required!")),
        rate: (value) => (positive(value) ? null : L("Rate must be greater than 0")),
    };
}
