import { describe, expect, it } from "vitest";
import { ContentTypeField } from "../src/api/models";
import {
    FIELD_TYPES,
    ORDERED_FIELD_TYPES,
    StringFieldModel,
    newFieldModel,
    selectOptions,
    toContentTypeField,
    toFieldModel,
} from "../src/Plugins/Admin/ContentTypeManagement/field-models";

describe("a content type's fields (FluentCMS's FieldModel)", () => {
    it("lists the eight field types in FluentCMS's order", () => {
        expect(ORDERED_FIELD_TYPES.map((type) => type.key)).toEqual([
            "string", "number", "bool", "datetime", "single-select", "multi-select", "single-file", "multi-file",
        ]);
    });

    it("starts a new field with its type's first views", () => {
        const model = newFieldModel("single-select");
        expect(model.type).toBe("single-select");
        expect(model.formViewComponent).toBe("SelectFieldFormSelect");
        expect(model.dataTableViewComponent).toBe(FIELD_TYPES["single-select"].dataTableViews[0]!.name);
    });

    it("stores the settings under FluentCMS's C# property names, and reads them back", () => {
        const model = newFieldModel("string") as StringFieldModel;
        Object.assign(model, { name: "title", label: "Title", description: "The title", required: true, maximumLength: 80, placeholder: "A title" });
        const field = toContentTypeField(model);
        expect(field).toMatchObject({ name: "title", type: "string", label: "Title", description: "The title", required: true, unique: false });
        expect(field.settings).toEqual({
            DataTableColumnOrder: 0,
            DataTableVisible: true,
            DataTableViewComponent: "StringFieldDataTableView",
            FormViewOrder: 0,
            FormColWidth: 12,
            FormViewComponent: "StringFieldFormText",
            DefaultValue: null,
            Placeholder: "A title",
            MinimumLength: null,
            MaximumLength: 80,
            Pattern: null,
        });
        expect(toFieldModel(field)).toEqual(model);
    });

    it("reads a field the original admin stored, and keeps defaults for settings it lacks", () => {
        const stored = Object.assign(new ContentTypeField(), {
            name: "tags",
            type: "multi-select",
            label: "Tags",
            description: "",
            settings: { Options: "news\nevents", DataTableVisible: false, DefaultValue: ["news"], Unknown: 1 },
        });
        const model = toFieldModel(stored);
        expect(model).toMatchObject({ type: "multi-select", options: "news\nevents", dataTableVisible: false, defaultValue: ["news"], formColWidth: 12 });
        expect("unknown" in model || "Unknown" in model).toBe(false);
        expect(() => toFieldModel(Object.assign(new ContentTypeField(), { type: "color" }))).toThrow("Field type 'color' is not supported.");
    });

    it("splits a select's options by line", () => {
        expect(selectOptions(" red \n\ngreen\r\nblue ")).toEqual(["red", "green", "blue"]);
    });
});
