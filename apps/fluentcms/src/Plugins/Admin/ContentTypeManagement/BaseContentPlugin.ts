import { SupplyParameterFromQuery } from "@tsazor/runtime";
import type { ContentTypeDetailResponse } from "../../../api/models";
import { ensureOk } from "../../../api/api-result";
import { BasePlugin } from "../../Base/BasePlugin";
import { toFieldModel, type AnyFieldModel } from "./field-models";
import type { FieldValue } from "./field-values";

/** A field of a content form and its value. */
export interface ContentField {
    readonly field: AnyFieldModel;
    readonly value: FieldValue<unknown>;
}

/** A plugin for the contents of one content type, named by `?slug=` (FluentCMS's BaseContentPlugin). */
export abstract class BaseContentPlugin extends BasePlugin {
    @SupplyParameterFromQuery({ name: "slug" }) contentTypeSlug: string | null = null;

    protected contentType?: ContentTypeDetailResponse;
    /** The content type's fields as their settings describe them. */
    protected fields: AnyFieldModel[] = [];

    protected override async onInitialized(): Promise<void> {
        if (!this.contentTypeSlug) return;
        this.contentType = ensureOk(await this.api.contentTypeGetBySlug(this.contentTypeSlug, { siteId: this.viewState.site.id }));
        this.fields = (this.contentType.fields ?? []).map(toFieldModel);
    }

    /** The fields in the order a content form shows them. */
    protected get formFields(): AnyFieldModel[] {
        return [...this.fields].sort((a, b) => a.formViewOrder - b.formViewOrder);
    }
}
