import { ComponentBase } from "../components/component-base.js";
import { defineComponent } from "../components/component-definition.js";
import { Parameter } from "../components/parameter-metadata.js";
import type { ParameterView } from "../components/parameter-view.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import { resolveSectionIdentifier, type SectionRegistry, type SectionContentLike } from "./section-registry.js";

/** An empty fragment (Blazor's SectionOutlet._emptyRenderFragment). */
const emptyFragment: RenderFragment = () => {};

/**
 * Blazor's SectionOutlet: renders the content of the SectionContent with the
 * matching SectionName/SectionId. One outlet per section identifier (a second
 * one throws); without a provider nothing is rendered. The content is rendered
 * through a keyed inner component (SectionOutletContentRenderer) so descendant
 * component instances are preserved only while they come from the same
 * SectionContent — Blazor's `@key(fragment)` rationale.
 */
export class SectionOutlet extends ComponentBase {
  /** The section to render the content of (by name). */
  @Parameter() sectionName?: string;
  /** The section to render the content of (by identifier object). */
  @Parameter() sectionId?: unknown;

  /** @internal Blazor's _currentContentProvider / CurrentLogicalParent. */
  currentContentProvider: { childContent?: RenderFragment | undefined } | null = null;
  private subscribedIdentifier?: unknown;

  private get registry(): SectionRegistry {
    return this.renderHandle.sectionRegistry;
  }

  /** @internal Blazor's ContentUpdated — called by the registry. */
  contentUpdated(provider: SectionContentLike | null): void {
    this.currentContentProvider = provider;
    this.stateHasChangedInternal();
  }

  /** Blazor's SetParametersAsync registration part (after parameter assignment). */
  override applyParameterValues(parameters: ParameterView): void {
    super.applyParameterValues(parameters);
    const identifier = resolveSectionIdentifier("SectionOutlet", this.sectionName, this.sectionId);
    if (identifier !== this.subscribedIdentifier) {
      if (this.subscribedIdentifier !== undefined) this.registry.unsubscribe(this.subscribedIdentifier);
      this.registry.subscribe(identifier, this);
      this.subscribedIdentifier = identifier;
    }
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    const fragment = this.currentContentProvider?.childContent ?? emptyFragment;
    b.openComponent(0, defineComponent(SectionOutletContentRenderer));
    b.setKey(fragment);
    b.addAttribute(1, "content", fragment);
    b.closeComponent();
  }

  /** Blazor's Dispose, called by the renderer: unsubscribes the outlet from its section, freeing the identifier for another outlet. */
  dispose(): void {
    if (this.subscribedIdentifier !== undefined) this.registry.unsubscribe(this.subscribedIdentifier);
  }
}

/**
 * Blazor's SectionOutlet.SectionOutletContentRenderer: opens a fresh component
 * instance per content provider — when the content switches, this instance and
 * its logical parent are rebuilt, so anything derived from the parent chain
 * (error boundaries, cascades) is re-evaluated for the new content.
 */
export class SectionOutletContentRenderer extends ComponentBase {
  /** The content of the provider currently shown. */
  @Parameter() content?: RenderFragment;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.content?.(b);
  }
}