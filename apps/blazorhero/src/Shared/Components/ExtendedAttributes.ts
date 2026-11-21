import type { RenderFragment, RenderTreeBuilder } from "@tsazor/runtime";
import ExtendedAttributesBase from "./ExtendedAttributesBase.tsazor";

/**
 * Client/Shared/Components/ExtendedAttributes.razor.cs: the base's markup for a page with markup of its own. The
 * page's markup replaces buildRenderTree; `@this.inherited()` in it renders the base's (C#'s
 * `builder => base.BuildRenderTree(builder)`).
 */
export abstract class ExtendedAttributes<TId, TEntityId> extends ExtendedAttributesBase<TId, TEntityId> {
    protected override inherited(): RenderFragment {
        return (builder: RenderTreeBuilder) => super.buildRenderTree(builder);
    }
}
