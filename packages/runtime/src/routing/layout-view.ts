import { ComponentBase } from "../components/component-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import { defineComponent } from "../components/component-definition.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";

/**
 * Blazor's LayoutView: renders content inside an optional layout (without
 * routing). Used by RouteView-style callers and app code directly.
 */
export class LayoutView extends ComponentBase {
  /** Layout component class; content renders bare when omitted. */
  @Parameter() layout?: abstract new (...args: never[]) => ComponentBase;
  /** The content to wrap (the layout's Body). */
  @Parameter() childContent?: RenderFragment;

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    if (!this.layout) {
      b.addContent(0, this.childContent);
      return;
    }
    b.openComponent(0, defineComponent(this.layout));
    b.addAttribute(1, "Body", this.childContent);
    b.closeComponent();
  }
}