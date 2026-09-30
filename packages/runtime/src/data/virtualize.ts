import { ComponentBase } from "../components/component-base";
import { Parameter } from "../components/parameter-metadata";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree";

/** Blazor's ItemsProviderRequest: the slice the Virtualize needs. */
export interface VirtualizeItemsProviderRequest {
  startIndex: number;
  count: number;
}

/** Blazor's ItemsProviderResult. */
export interface VirtualizeItemsProviderResult<TItem> {
  items?: TItem[];
  totalItemCount?: number;
}

export type VirtualizeItemsProvider<TItem> = (
  request: VirtualizeItemsProviderRequest,
) => Promise<VirtualizeItemsProviderResult<TItem>>;

/**
 * Blazor's Virtualize<TItem>: renders only the visible window of a large list
 * using the spacer strategy — two height-allocating spacer divs around the
 * rendered slice, so the scrollbar geometry matches the full list.
 *
 * v1: the per-item template is passed via `itemTemplate` (the .tsazor child
 * content sugar comes with the Vite plugin milestone).
 */
export class Virtualize extends ComponentBase {
  /** In-memory items (alternative to itemsProvider). */
  @Parameter() items?: unknown[];
  /** Async slice provider (Blazor's ItemsProvider). */
  @Parameter() itemsProvider?: VirtualizeItemsProvider<never>;
  /** Height of one item row in pixels. */
  @Parameter() itemSize = 50;
  /** Extra rows rendered above and below the viewport. */
  @Parameter() overscan = 3;
  /** Fragment factory rendered once per visible item. */
  @Parameter() itemTemplate?: (item: unknown) => RenderFragment;
  /** Pass-through attributes (class, style, …). */
  @Parameter({ captureUnmatchedValues: true }) additionalAttributes?: Record<string, unknown>;

  /** Viewport fallback when the host is not measurable yet (SSR/tests). */
  private static readonly fallbackViewportHeight = 600;

  private rootElement?: HTMLElement;
  private unsubscribeScroll?: () => void;
  private resizeObserver?: { disconnect: () => void; observe: (target: Element) => void };

  // Virtualization state
  private startIndex = 0;
  private renderedCount = 0;
  private totalItemCount = 0;
  private loadedItems: unknown[] = [];
  private lastRequestedStart = -1;
  private lastRequestedCount = -1;

  protected override onInitialized(): void {
    if (this.items) {
      this.totalItemCount = this.items.length;
    }
  }

  protected override onParametersSet(): void {
    if (this.items) {
      this.totalItemCount = this.items.length;
    }
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.beginRender();
    b.openElement(this.nextSequence(), "div");
    b.addAttribute(this.nextSequence(), "class", `virtualize${this.additionalAttributes?.["class"] ? ` ${this.additionalAttributes["class"]}` : ""}`);
    b.addAttribute(this.nextSequence(), "style", "overflow-y: auto;");
    for (const [name, value] of Object.entries(this.additionalAttributes ?? {})) {
      if (name === "class" || name === "style") continue;
      b.addAttribute(this.nextSequence(), name, value as never);
    }
    b.addElementReferenceCapture(this.nextSequence(), (el) => {
      this.rootElement = el as HTMLElement;
    });

    const topHeight = this.startIndex * this.itemSize;
    b.openElement(this.nextSequence(), "div");
    b.addAttribute(this.nextSequence(), "class", "virtualize-spacer");
    b.addAttribute(this.nextSequence(), "style", `height: ${topHeight}px;`);
    b.closeElement();

    for (const [offset, item] of this.visibleItems().entries()) {
      const template = this.itemTemplate;
      if (template) {
        b.addContent(this.nextSequence(), template(item));
      } else {
        b.openElement(this.nextSequence(), "div");
        b.addAttribute(this.nextSequence(), "class", "virtualize-item");
        b.addContent(this.nextSequence(), String(item));
        b.closeElement();
      }
      void offset;
    }

    const rendered = this.visibleItems().length;
    const bottomHeight = Math.max(0, (this.totalItemCount - this.startIndex - rendered) * this.itemSize);
    b.openElement(this.nextSequence(), "div");
    b.addAttribute(this.nextSequence(), "class", "virtualize-spacer");
    b.addAttribute(this.nextSequence(), "style", `height: ${bottomHeight}px;`);
    b.closeElement();

    b.closeElement();
  }

  protected override async onAfterRender(firstRender: boolean): Promise<void> {
    if (!firstRender || !this.rootElement) return;
    const element = this.rootElement;
    const onScroll = () => {
      // Track the async load so renderer.waitUntilIdle includes it.
      this.renderHandle.track(this.handleScroll()).catch(() => undefined);
    };
    element.addEventListener("scroll", onScroll);
    this.unsubscribeScroll = () => element.removeEventListener("scroll", onScroll);
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(onScroll);
      this.resizeObserver.observe(element);
    }
    await this.handleScroll();
  }

  private async handleScroll(): Promise<void> {
    const element = this.rootElement;
    if (!element) return;
    // Provider mode: the total is unknown before the first result — treat it
    // as unbounded so the initial request covers the full viewport window.
    const knownTotal = this.totalItemCount > 0 ? this.totalItemCount : Number.POSITIVE_INFINITY;
    const viewportHeight = element.clientHeight || Virtualize.fallbackViewportHeight;
    const scrollTop = element.scrollTop;
    const first = Math.floor(scrollTop / this.itemSize);
    const visibleCount = Math.ceil(viewportHeight / this.itemSize);
    const startIndex = Math.max(0, first - this.overscan);
    const count = Math.min(visibleCount + this.overscan * 2, Math.max(0, knownTotal - startIndex));

    if (this.items) {
      this.startIndex = startIndex;
      this.renderedCount = count;
      this.stateHasChangedInternal();
      return;
    }

    if (startIndex === this.lastRequestedStart && count === this.lastRequestedCount) return;
    this.lastRequestedStart = startIndex;
    this.lastRequestedCount = count;
    if (!this.itemsProvider) return;
    const result = await this.itemsProvider({ startIndex, count });
    this.startIndex = startIndex;
    this.renderedCount = result.items?.length ?? count;
    this.totalItemCount = result.totalItemCount ?? this.totalItemCount;
    this.loadedItems = result.items ?? [];
    this.stateHasChangedInternal();
  }

  private visibleItems(): unknown[] {
    if (this.items) {
      return this.items.slice(this.startIndex, this.startIndex + this.renderedCount);
    }
    return this.loadedItems;
  }

  /** Blazor's RefreshDataAsync: re-requests the current window. */
  async refreshData(): Promise<void> {
    this.lastRequestedStart = -1;
    this.lastRequestedCount = -1;
    await this.handleScroll();
  }

  dispose(): void {
    this.unsubscribeScroll?.();
    this.resizeObserver?.disconnect();
    this.unsubscribeScroll = undefined;
    this.resizeObserver = undefined;
  }

  private sequenceCounter = 0;
  private beginRender(): void {
    this.sequenceCounter = 0;
  }
  private nextSequence(): number {
    return this.sequenceCounter++;
  }
}