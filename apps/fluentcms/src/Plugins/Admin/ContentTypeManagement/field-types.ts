import type { ComponentType } from "@tsazor/runtime";
import { FIELD_TYPES, type AnyFieldModel, type FieldTypeKey, type FieldView } from "./field-models";
import type { FieldValue } from "./field-values";
import BooleanFieldSettings from "./Fields/BooleanFieldSettings.tsazor";
import DateFieldSettings from "./Fields/DateFieldSettings.tsazor";
import MultiFileFieldSettings from "./Fields/MultiFileFieldSettings.tsazor";
import MultiSelectFieldSettings from "./Fields/MultiSelectFieldSettings.tsazor";
import NumberFieldSettings from "./Fields/NumberFieldSettings.tsazor";
import SelectFieldSettings from "./Fields/SelectFieldSettings.tsazor";
import SingleFileFieldSettings from "./Fields/SingleFileFieldSettings.tsazor";
import StringFieldSettings from "./Fields/StringFieldSettings.tsazor";
import BooleanFieldDataTableIndicator from "./Views/BooleanFieldDataTableIndicator.tsazor";
import BooleanFieldDataTableSwitch from "./Views/BooleanFieldDataTableSwitch.tsazor";
import BooleanFieldDataTableTrueFalse from "./Views/BooleanFieldDataTableTrueFalse.tsazor";
import BooleanFieldDataTableYesNo from "./Views/BooleanFieldDataTableYesNo.tsazor";
import BooleanFieldFormCheckbox from "./Views/BooleanFieldFormCheckbox.tsazor";
import BooleanFieldFormSwitch from "./Views/BooleanFieldFormSwitch.tsazor";
import DateFieldDataTableView from "./Views/DateFieldDataTableView.tsazor";
import DateFieldFormDate from "./Views/DateFieldFormDate.tsazor";
import DateFieldFormDateTime from "./Views/DateFieldFormDateTime.tsazor";
import DateFieldFormTime from "./Views/DateFieldFormTime.tsazor";
import FieldViewNotPorted from "./Views/FieldViewNotPorted.tsazor";
import MultiSelectFieldDataTableBadges from "./Views/MultiSelectFieldDataTableBadges.tsazor";
import MultiSelectFieldFormCheckboxes from "./Views/MultiSelectFieldFormCheckboxes.tsazor";
import NumberFieldDataTableView from "./Views/NumberFieldDataTableView.tsazor";
import NumberFieldFormInput from "./Views/NumberFieldFormInput.tsazor";
import NumberFieldFormRange from "./Views/NumberFieldFormRange.tsazor";
import SelectFieldDataTableBadge from "./Views/SelectFieldDataTableBadge.tsazor";
import SelectFieldFormRadioGroup from "./Views/SelectFieldFormRadioGroup.tsazor";
import SelectFieldFormSelect from "./Views/SelectFieldFormSelect.tsazor";
import StringFieldDataTableView from "./Views/StringFieldDataTableView.tsazor";
import StringFieldFormText from "./Views/StringFieldFormText.tsazor";
import StringFieldFormTextArea from "./Views/StringFieldFormTextArea.tsazor";

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

/** The form views by the name a field stores (FluentCMS's FieldType.FormComponents). */
const FORM_VIEWS: Readonly<Record<string, ComponentType>> = {
    StringFieldFormText,
    StringFieldFormTextArea,
    NumberFieldFormInput,
    NumberFieldFormRange,
    BooleanFieldFormSwitch,
    BooleanFieldFormCheckbox,
    DateFieldFormDate,
    DateFieldFormTime,
    DateFieldFormDateTime,
    SelectFieldFormSelect,
    SelectFieldFormRadioGroup,
    MultiSelectFieldFormCheckboxes,
};

/** The content list's views by the name a field stores (FluentCMS's FieldType.DataTableComponents). */
const DATA_TABLE_VIEWS: Readonly<Record<string, ComponentType>> = {
    StringFieldDataTableView,
    NumberFieldDataTableView,
    BooleanFieldDataTableTrueFalse,
    BooleanFieldDataTableYesNo,
    BooleanFieldDataTableSwitch,
    BooleanFieldDataTableIndicator,
    DateFieldDataTableView,
    SelectFieldDataTableBadge,
    MultiSelectFieldDataTableBadges,
};

/** A field view for a DynamicComponent: its type and its parameters. */
export interface FieldViewComponent {
    readonly type: ComponentType;
    readonly parameters: Record<string, unknown>;
}

function viewFor(
    views: Readonly<Record<string, ComponentType>>,
    offered: readonly FieldView[],
    name: string,
    field: AnyFieldModel,
    fieldValue: FieldValue<unknown>,
): FieldViewComponent {
    // The stored view if the type offers it, else the type's first (FluentCMS: the first that matches).
    const view = offered.find((candidate) => candidate.name === name) ?? offered[0]!;
    const type = views[view.name];
    if (type === undefined) return { type: FieldViewNotPorted, parameters: { field, fieldValue, viewName: view.title } };
    return { type, parameters: { field, fieldValue } };
}

/** How a content form shows a field (its `formViewComponent`). */
export function formView(field: AnyFieldModel, fieldValue: FieldValue<unknown>): FieldViewComponent {
    return viewFor(FORM_VIEWS, FIELD_TYPES[field.type].formViews, field.formViewComponent, field, fieldValue);
}

/** How the content list shows a field (its `dataTableViewComponent`). */
export function dataTableView(field: AnyFieldModel, fieldValue: FieldValue<unknown>): FieldViewComponent {
    return viewFor(DATA_TABLE_VIEWS, FIELD_TYPES[field.type].dataTableViews, field.dataTableViewComponent, field, fieldValue);
}
