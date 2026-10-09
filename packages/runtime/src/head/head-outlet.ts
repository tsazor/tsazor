import { ComponentBase } from "../components/component-base.js";
import { defineComponent } from "../components/component-definition.js";
import type { RenderTreeBuilder } from "../render-tree/render-tree.js";
import { SectionContent } from "../sections/section-content.js";
import { SectionOutlet } from "../sections/section-outlet.js";
import { headSectionId, titleSectionId } from "./head-ids.js";

/**
 * Blazor's HeadOutlet: renders the title section and the head-metadata
 * section. The runtime mounts one per app as a second root in document.head
 * (createTsazorApp) — Blazor's WebAssembly host does the same via its
 * `<HeadOutlet>` root component.
 */
export class HeadOutlet extends ComponentBase {
  /** The title captured on the first render (Blazor's JS getAndRemoveExistingTitle). */
  private defaultTitle: string | null = null;

  protected override onAfterRender(firstRender: boolean): void {
    if (!firstRender) return;
    // Blazor's JS PageTitle.getAndRemoveExistingTitle: the static/prerendered
    // <title> is captured and REMOVED, so no duplicate remains; content
    // rendered by the framework itself is skipped (deviation: Blazor checks
    // its logical-element map, Tsazor recognizes its range-marker comments —
    // same observable rule).
    this.defaultTitle = getAndRemoveExistingTitle();
    this.stateHasChangedInternal();
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    // Render the title content.
    b.openComponent(0, defineComponent(SectionOutlet));
    b.addAttribute(1, "sectionId", titleSectionId);
    b.closeComponent();

    // Render the default title (the captured static one) if it exists.
    if (this.defaultTitle !== null && this.defaultTitle.length > 0) {
      b.openComponent(2, defineComponent(SectionContent));
      b.addAttribute(3, "sectionId", titleSectionId);
      b.addAttribute(4, "isDefaultContent", true);
      b.addAttribute(5, "childContent", this.buildDefaultTitle);
      b.closeComponent();
    }

    // Render the rest of the head metadata.
    b.openComponent(6, defineComponent(SectionOutlet));
    b.addAttribute(7, "sectionId", headSectionId);
    b.closeComponent();
  }

  /** One function per instance, as Blazor's method group `BuildDefaultTitleRenderTree`: the same section content on every render. */
  private readonly buildDefaultTitle = (builder: RenderTreeBuilder): void => {
    builder.openElement(0, "title");
    builder.addContent(1, this.defaultTitle);
    builder.closeElement();
  };
}
/** "Did the framework render this node?" — Tsazor's own range markers. */
const isRenderedByTsazor = (node: Node | null): boolean =>
  node instanceof Comment &&
  (node.data.startsWith("bl-tsazor:") || node.data.startsWith("/bl-tsazor:"));

/**
 * Blazor's JS PageTitle.getAndRemoveExistingTitle (Web.JS/src/PageTitle.ts):
 * walks the <title> elements of the head backwards, captures the text of the
 * first static one, removes every static one — titles whose previous sibling
 * is a framework render marker belong to Tsazor's output and are skipped.
 */
function getAndRemoveExistingTitle(): string | null {
  if (typeof document === "undefined") return null;
  const titleElements = document.head ? document.head.getElementsByTagName("title") : [];
  if (titleElements.length === 0) return null;
  let existingTitle: string | null = null;
  for (let index = titleElements.length - 1; index >= 0; index--) {
    const current = titleElements[index]!;
    if (isRenderedByTsazor(current.previousSibling)) continue;
    if (existingTitle === null) existingTitle = current.textContent;
    current.parentElement?.removeChild(current);
  }
  return existingTitle;
}
