import { ComponentBase } from "../components/component-base.js";
import { defineComponent } from "../components/component-definition.js";
import { Parameter } from "../components/parameter-metadata.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import { SectionContent } from "../sections/section-content.js";

import { headSectionId } from "./head-ids.js";
import { HeadOutlet } from "./head-outlet.js";
import { provideHeadOutlet } from "./head-support.js";

export { headSectionId, titleSectionId } from "./head-ids.js";

// Using HeadContent brings the document head into the app (head-support.ts).
provideHeadOutlet(HeadOutlet);

/**
 * Blazor's HeadContent: provides the content it wraps to the head-metadata
 * section of every HeadOutlet (rendered by the runtime's second root).
 */
export class HeadContent extends ComponentBase {
  /** The content rendered into the document head. */
  @Parameter() childContent?: RenderFragment;

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, defineComponent(SectionContent));
    b.addAttribute(1, "sectionId", headSectionId);
    if (this.childContent !== undefined) b.addAttribute(2, "childContent", this.childContent);
    b.closeComponent();
  }
}