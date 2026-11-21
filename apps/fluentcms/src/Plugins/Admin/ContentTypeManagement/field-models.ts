import { Required } from "@tsazor/runtime";
import type { IconValue } from "@tsazor/fluent";
import { ContentTypeField } from "../../../api/models";
import { IconName } from "../../../Components/IconName";

/** FluentCMS's field types, by the key a content type stores. */
export const FIELD_TYPE = {
    STRING: "string",
    NUMBER: "number",
    BOOLEAN: "bool",
    SINGLE_SELECT: "single-select",
    MULTI_SELECT: "multi-select",
    DATE_TIME: "datetime",
    SINGLE_FILE: "single-file",
    MULTI_FILE: "multi-file",
} as const;

export type FieldTypeKey = (typeof FIELD_TYPE)[keyof typeof FIELD_TYPE];

/** A component a field can be shown with: its name is what a content type stores (FluentCMS's type name). */
export interface FieldView {
    readonly name: string;
    readonly title: string;
}

/** What a field type is (FluentCMS's FieldType), without its components: those are in field-types.ts. */
export interface FieldTypeInfo {
    readonly key: FieldTypeKey;
    readonly title: string;
    readonly description: string;
    /** FluentCMS's icon for the type. */
    readonly icon: IconValue;
    readonly order: number;
    /** The ways a content form can show the field; the first is the default. */
    readonly formViews: readonly FieldView[];
    /** The ways the content list can show the field; the first is the default. */
    readonly dataTableViews: readonly FieldView[];
}

const view = (name: string, title: string): FieldView => ({ name, title });

export const FIELD_TYPES: Readonly<Record<FieldTypeKey, FieldTypeInfo>> = {
    string: {
        key: FIELD_TYPE.STRING,
        title: "String",
        description: "Small or long text like title or description",
        icon: IconName.Text,
        order: 1,
        formViews: [
            view("StringFieldFormText", "Input"),
            view("StringFieldFormTextArea", "TextArea"),
            view("StringFieldFormRichText", "Rich Text Editor"),
            view("StringFieldFormMarkdownText", "Markdown Editor"),
        ],
        dataTableViews: [view("StringFieldDataTableView", "Raw Text")],
    },
    number: {
        key: FIELD_TYPE.NUMBER,
        title: "Number",
        description: "Numbers (integer, float, decimal)",
        icon: IconName.Number,
        order: 2,
        formViews: [view("NumberFieldFormInput", "Number Input"), view("NumberFieldFormRange", "Range Input")],
        dataTableViews: [view("NumberFieldDataTableView", "Raw Text")],
    },
    bool: {
        key: FIELD_TYPE.BOOLEAN,
        title: "Boolean",
        description: "Yes or no, 1 or 0, true or false",
        icon: IconName.Boolean,
        order: 3,
        formViews: [view("BooleanFieldFormSwitch", "Switch"), view("BooleanFieldFormCheckbox", "Checkbox")],
        dataTableViews: [
            view("BooleanFieldDataTableTrueFalse", "True/False"),
            view("BooleanFieldDataTableYesNo", "Yes/No"),
            view("BooleanFieldDataTableSwitch", "Switch"),
            view("BooleanFieldDataTableIndicator", "Indicator"),
        ],
    },
    datetime: {
        key: FIELD_TYPE.DATE_TIME,
        title: "Date Time",
        description: "A date picker with hours, minutes and seconds",
        icon: IconName.Clock,
        order: 4,
        formViews: [
            view("DateFieldFormDate", "Date Picker"),
            view("DateFieldFormTime", "Time Picker"),
            view("DateFieldFormDateTime", "DateTime Picker"),
        ],
        dataTableViews: [view("DateFieldDataTableView", "Text")],
    },
    "single-select": {
        key: FIELD_TYPE.SINGLE_SELECT,
        title: "Single Select",
        description: "List of values, then pick one",
        icon: IconName.List,
        order: 5,
        formViews: [
            view("SelectFieldFormSelect", "Dropdown"),
            view("SelectFieldFormRadioGroup", "Radio Group"),
            view("SelectFieldFormAutocomplete", "Autocomplete"),
        ],
        dataTableViews: [view("SelectFieldDataTableBadge", "Badge")],
    },
    "multi-select": {
        key: FIELD_TYPE.MULTI_SELECT,
        title: "Multi Select",
        description: "List of values, then pick one or more",
        icon: IconName.List,
        order: 6,
        formViews: [view("MultiSelectFieldFormCheckboxes", "Checkboxes"), view("MultiSelectFieldFormAutocomplete", "Autocomplete")],
        dataTableViews: [view("MultiSelectFieldDataTableBadges", "Badges")],
    },
    "single-file": {
        key: FIELD_TYPE.SINGLE_FILE,
        title: "Single File",
        description: "Files like images, videos, etc",
        icon: IconName.ClipboardList,
        order: 7,
        formViews: [view("SingleFileFieldFormFilePicker", "File Picker")],
        dataTableViews: [view("SingleFileFieldDataTableFile", "File")],
    },
    "multi-file": {
        key: FIELD_TYPE.MULTI_FILE,
        title: "Multi File",
        description: "Multiple Files like images, videos, etc",
        icon: IconName.ClipboardList,
        order: 8,
        formViews: [view("MultiFileFieldFormFilesPicker", "Files Picker")],
        dataTableViews: [view("MultiFileFieldDataTableFiles", "Files")],
    },
};

/** The field types in FluentCMS's order. */
export const ORDERED_FIELD_TYPES: readonly FieldTypeInfo[] = Object.values(FIELD_TYPES).sort((a, b) => a.order - b.order);

export function isFieldType(key: string | null | undefined): key is FieldTypeKey {
    return key !== null && key !== undefined && key in FIELD_TYPES;
}

/**
 * A field's settings as its settings form edits them (FluentCMS's FieldModel<T>): what every field has,
 * and per type what it adds. A content type stores them as `ContentTypeField`, see `toContentTypeField`.
 */
export abstract class FieldModel<T> {
    @Required() name = "";
    abstract readonly type: FieldTypeKey;
    required = false;
    unique = false;
    @Required() description = "";
    @Required() label = "";
    dataTableColumnOrder = 0;
    dataTableVisible = true;
    @Required() dataTableViewComponent = "";
    formViewOrder = 0;
    formColWidth = 12;
    @Required() formViewComponent = "";
    abstract defaultValue: T;
}

export class StringFieldModel extends FieldModel<string | null> {
    readonly type = FIELD_TYPE.STRING;
    defaultValue: string | null = null;
    placeholder: string | null = null;
    minimumLength: number | null = null;
    maximumLength: number | null = null;
    pattern: string | null = null;
}

export class NumberFieldModel extends FieldModel<number | null> {
    readonly type = FIELD_TYPE.NUMBER;
    defaultValue: number | null = null;
    placeholder: string | null = null;
    minimumValue: number | null = null;
    maximumValue: number | null = null;
}

export class BooleanFieldModel extends FieldModel<boolean> {
    readonly type = FIELD_TYPE.BOOLEAN;
    defaultValue = false;
}

export class DateFieldModel extends FieldModel<string | null> {
    readonly type = FIELD_TYPE.DATE_TIME;
    /** An ISO date-time (.NET's DateTime as JSON). */
    defaultValue: string | null = null;
    placeholder: string | null = null;
    /** A .NET date format (`MM/dd/yyyy`): FluentCMS formats with DateTime.ToString. */
    format: string | null = null;
}

export class SelectFieldModel extends FieldModel<string | null> {
    readonly type = FIELD_TYPE.SINGLE_SELECT;
    defaultValue: string | null = null;
    placeholder: string | null = null;
    /** One option per line. */
    @Required() options = "";
}

export class MultiSelectFieldModel extends FieldModel<string[]> {
    readonly type = FIELD_TYPE.MULTI_SELECT;
    defaultValue: string[] = [];
    placeholder = "";
    /** One option per line. */
    @Required() options = "";
}

export class SingleFileFieldModel extends FieldModel<string | null> {
    readonly type = FIELD_TYPE.SINGLE_FILE;
    /** A file id. */
    defaultValue: string | null = null;
    placeholder: string | null = null;
}

export class MultiFileFieldModel extends FieldModel<string[]> {
    readonly type = FIELD_TYPE.MULTI_FILE;
    /** File ids. */
    defaultValue: string[] = [];
    placeholder: string | null = null;
}

export type AnyFieldModel =
    | StringFieldModel
    | NumberFieldModel
    | BooleanFieldModel
    | DateFieldModel
    | SelectFieldModel
    | MultiSelectFieldModel
    | SingleFileFieldModel
    | MultiFileFieldModel;

const MODELS: Readonly<Record<FieldTypeKey, () => AnyFieldModel>> = {
    string: () => new StringFieldModel(),
    number: () => new NumberFieldModel(),
    bool: () => new BooleanFieldModel(),
    datetime: () => new DateFieldModel(),
    "single-select": () => new SelectFieldModel(),
    "multi-select": () => new MultiSelectFieldModel(),
    "single-file": () => new SingleFileFieldModel(),
    "multi-file": () => new MultiFileFieldModel(),
};

/** The members a content type stores on the field itself; every other one goes into its settings. */
const FIELD_MEMBERS = new Set(["name", "type", "description", "required", "unique", "label"]);

/** FluentCMS stores a setting under its C# property name: `minimumLength` → `MinimumLength`. */
const settingKey = (member: string): string => member.charAt(0).toUpperCase() + member.slice(1);

/** A new field of a type, with its first views as the defaults. */
export function newFieldModel(type: FieldTypeKey): AnyFieldModel {
    const model = MODELS[type]();
    model.formViewComponent = FIELD_TYPES[type].formViews[0]!.name;
    model.dataTableViewComponent = FIELD_TYPES[type].dataTableViews[0]!.name;
    return model;
}

/** A stored field as its settings form edits it (FluentCMS's ToFieldModel). */
export function toFieldModel(field: ContentTypeField): AnyFieldModel {
    if (!isFieldType(field.type)) throw new Error(`Field type '${field.type}' is not supported.`);
    const model = newFieldModel(field.type);
    model.name = field.name ?? "";
    model.description = field.description ?? "";
    model.label = field.label ?? "";
    model.required = field.required ?? false;
    model.unique = field.unique ?? false;
    const settings = field.settings ?? {};
    const target = model as unknown as Record<string, unknown>;
    for (const member of Object.keys(model)) {
        const value = settings[settingKey(member)];
        if (FIELD_MEMBERS.has(member) || value === null || value === undefined) continue;
        target[member] = value;
    }
    return model;
}

/** A field model as a content type stores it (FluentCMS's ToContentTypeField): the settings under C# names. */
export function toContentTypeField(model: AnyFieldModel): ContentTypeField {
    const settings: Record<string, unknown> = {};
    for (const [member, value] of Object.entries(model)) {
        if (!FIELD_MEMBERS.has(member)) settings[settingKey(member)] = value;
    }
    return Object.assign(new ContentTypeField(), {
        name: model.name,
        type: model.type,
        description: model.description,
        required: model.required,
        unique: model.unique,
        label: model.label,
        settings,
    });
}

/** The .NET date formats FluentCMS offers for showing a date field (DateFieldSettings). */
export const DATE_FORMATS: readonly string[] = [
    "MM/dd/yyyy",
    "yyyy-MM-dd",
    "dddd, dd MMMM yyyy",
    "MM/dd/yyyy HH:mm",
    "MM/dd/yyyy hh:mm tt",
    "MMMM dd",
    "yyyy'-'MM'-'dd'T'HH':'mm':'ss.fffffffK",
    "ddd, dd MMM yyy HH':'mm':'ss 'GMT'",
    "yyyy'-'MM'-'dd'T'HH':'mm':'ss",
    "HH:mm",
    "hh:mm tt",
    "H:mm",
    "h:mm tt",
    "HH:mm:ss",
    "yyyy MMMM",
];

/** The options of a select field: one per line, trimmed, empty lines left out. */
export function selectOptions(options: string): string[] {
    return options.split("\n").map((option) => option.trim()).filter((option) => option.length > 0);
}
