import { ComponentBase } from "../components/component-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import type { ParameterView } from "../components/parameter-view.js";
import type { RenderFragment } from "../render-tree/render-tree.js";
import { resolveSectionIdentifier, type SectionRegistry } from "./section-registry.js";

/**
 * Blazor's SectionContent: provides content to the SectionOutlet with the
 * matching SectionName/SectionId. Several providers may exist per identifier —
 * the most recently added one wins; a provider registered as default content
 * (Blazor's internal IsDefaultContent) loses to every later one.
 */
export class SectionContent extends ComponentBase {
  /** The section to provide content for (by name). */
  @Parameter() sectionName?: string;
  /** The section to provide content for (by identifier object). */
  @Parameter() sectionId?: unknown;
  /** The content rendered in the corresponding SectionOutlet. */
  @Parameter() childContent?: RenderFragment;
  /**
   * Blazor's internal IsDefaultContent. Parameter here only so the runtime's
   * HeadOutlet can pass it through its render tree — Tsazor has no
   * IComponent.Attach construction (documented deviation).
   */
  @Parameter() isDefaultContent = false;

  private registeredIdentifier?: unknown;
  private registeredIsDefaultContent?: boolean;

  private get registry(): SectionRegistry {
    return this.renderHandle.sectionRegistry;
  }

  /** Blazor's SetParametersAsync registration part (after parameter assignment). */
  override applyParameterValues(parameters: ParameterView): void {
    super.applyParameterValues(parameters);
    const identifier = resolveSectionIdentifier("SectionContent", this.sectionName, this.sectionId);
    if (identifier !== this.registeredIdentifier || this.isDefaultContent !== this.registeredIsDefaultContent) {
      if (this.registeredIdentifier !== undefined) this.registry.removeProvider(this.registeredIdentifier, this);
      this.registry.addProvider(identifier, this, this.isDefaultContent);
      this.registeredIdentifier = identifier;
      this.registeredIsDefaultContent = this.isDefaultContent;
    }
    this.registry.notifyContentProviderChanged(identifier, this);
  }

  dispose(): void {
    if (this.registeredIdentifier !== undefined) this.registry.removeProvider(this.registeredIdentifier, this);
  }
}