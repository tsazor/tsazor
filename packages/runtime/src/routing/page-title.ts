import { ComponentBase } from "../components/component-base";
import { Parameter } from "../components/parameter-metadata";
import type { RenderTreeBuilder } from "../render-tree/render-tree";

/**
 * Blazor's PageTitle: sets the document title during render. (Blazor renders
 * into the <head> via a special section; TS SPA v1 writes document.title.)
 */
export class PageTitle extends ComponentBase {
  @Parameter() childContent?: string;

  protected override buildRenderTree(_b: RenderTreeBuilder): void {
    if (typeof document !== "undefined" && typeof this.childContent === "string") {
      document.title = this.childContent;
    }
  }
}