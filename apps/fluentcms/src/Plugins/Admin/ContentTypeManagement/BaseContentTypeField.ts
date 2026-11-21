import { CascadingParameter, ComponentBase, EventCallback, Parameter, inject } from "@tsazor/runtime";
import { FluentCmsClient } from "../../../api/fluent-cms";
import type { ContentTypeDetailResponse, ContentTypeField } from "../../../api/models";
import { CONTENT_TYPE_CASCADE } from "./BaseFieldSettingView";

/**
 * A step of a content type's field management (FluentCMS's BaseContentTypeFieldComponent): the content type
 * (cascaded by name), the field, and what to do when the step is over.
 */
export abstract class BaseContentTypeField extends ComponentBase {
    protected readonly api = inject(FluentCmsClient);

    @CascadingParameter({ name: CONTENT_TYPE_CASCADE }) contentType?: ContentTypeDetailResponse;
    @Parameter() contentTypeField?: ContentTypeField;
    @Parameter() onComplete?: EventCallback;
}
