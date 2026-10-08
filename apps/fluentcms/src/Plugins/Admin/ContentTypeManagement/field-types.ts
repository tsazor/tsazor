import type { ComponentType } from "@tsazor/runtime";
import type { FieldTypeKey } from "./field-models";
import BooleanFieldSettings from "./Fields/BooleanFieldSettings.tsazor";
import DateFieldSettings from "./Fields/DateFieldSettings.tsazor";
import MultiFileFieldSettings from "./Fields/MultiFileFieldSettings.tsazor";
import MultiSelectFieldSettings from "./Fields/MultiSelectFieldSettings.tsazor";
import NumberFieldSettings from "./Fields/NumberFieldSettings.tsazor";
import SelectFieldSettings from "./Fields/SelectFieldSettings.tsazor";
import SingleFileFieldSettings from "./Fields/SingleFileFieldSettings.tsazor";
import StringFieldSettings from "./Fields/StringFieldSettings.tsazor";

/**
 * Each field type's settings form (FluentCMS's FieldType.SettingViewType), shown through a DynamicComponent.
 * What a type is, and its views, are in field-models.ts.
 */
export const SETTINGS_VIEWS: Readonly<Record<FieldTypeKey, ComponentType>> = {
    string: StringFieldSettings,
    number: NumberFieldSettings,
    bool: BooleanFieldSettings,
    datetime: DateFieldSettings,
    "single-select": SelectFieldSettings,
    "multi-select": MultiSelectFieldSettings,
    "single-file": SingleFileFieldSettings,
    "multi-file": MultiFileFieldSettings,
};
