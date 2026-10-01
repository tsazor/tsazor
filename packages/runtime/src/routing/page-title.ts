import { ComponentBase } from "../components/component-base.js";
import { defineComponent } from "../components/component-definition.js";
import { Parameter } from "../components/parameter-metadata.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import { SectionContent } from "../sections/section-content.js";
import { titleSectionId } from "../head/head-content.js";

/**
 * Blazor's PageTitle: renders an HTML <title> into the title section of the
 * HeadOutlet (3.4) — the document title changes on navigation. Previously this
 * component wrote document.title directly at render time; the section port is
 * Blazor 1:1 (SectionContent under HeadOutlet.TitleSectionId).
 */
export class PageTitle extends ComponentBase {
  /** The content rendered as the document title. */
  @Parameter() childContent?: RenderFragment;

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, defineComponent(SectionContent));
    b.addAttribute(1, "sectionId", titleSectionId);
    b.addAttribute(2, "childContent", (builder: RenderTreeBuilder) => this.buildTitleContent(builder));
    b.closeComponent();
  }

  private buildTitleContent(builder: RenderTreeBuilder): void {
    builder.openElement(0, "title");
    if (this.childContent !== undefined) builder.addContent(1, this.childContent);
    builder.closeElement();
  }
}