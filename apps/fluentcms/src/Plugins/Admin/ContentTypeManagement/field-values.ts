import type { AnyFieldModel } from "./field-models";

/** A field's value in a content (FluentCMS's FieldValue<T>): the form views bind `value`. */
export class FieldValue<T> {
    constructor(
        readonly name: string,
        public value: T,
    ) {}
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.map((item) => String(item)) : []);

/**
 * A field's value out of a content's data, typed by the field (FluentCMS's GetFieldValue); without data, a new
 * content's value: the field's default.
 */
export function fieldValueOf(field: AnyFieldModel, data?: Readonly<Record<string, unknown>>): FieldValue<unknown> {
    const stored = data === undefined ? field.defaultValue : data[field.name];
    switch (field.type) {
        case "string":
        case "single-select":
        case "datetime":
        case "single-file":
            return new FieldValue(field.name, text(stored));
        case "number":
            return new FieldValue(field.name, typeof stored === "number" ? stored : null);
        case "bool":
            return new FieldValue(field.name, stored === true);
        case "multi-select":
        case "multi-file":
            return new FieldValue(field.name, texts(stored));
    }
}

/** A content's data as FluentCMS stores it: each field's value under its name. */
export function contentData(values: readonly FieldValue<unknown>[]): Record<string, unknown> {
    return Object.fromEntries(values.map((value) => [value.name, value.value]));
}
