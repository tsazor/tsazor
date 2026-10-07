import { ComponentBase } from "../components/component-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";

/** Blazor's ItemsProviderRequest: the slice the Virtualize needs. */
export interface VirtualizeItemsProviderRequest {
  /** Index of the first item to return (Blazor's `StartIndex`). */
  startIndex: number;
  /** Number of items requested, overscan included (Blazor's `Count`). */
  count: number;
}

/** Blazor's ItemsProviderResult. */
export interface VirtualizeItemsProviderResult<TItem> {
  /** The items of the requested slice; may be fewer than requested. */
  items?: TItem[];
  /** Total length of the list, which sizes the spacers; when omitted the previous total is kept. */
  totalItemCount?: number;
}

/** Loads one slice of the list on demand (Blazor's `ItemsProviderDelegate`). */
export type VirtualizeItemsProvider<TItem> = (
  request: VirtualizeItemsProviderRequest,
) => Promise<VirtualizeItemsProviderResult<TItem>>;

/**
 * Blazor's Virtualize<TItem>: renders only the visible window of a large list
 * using the spacer strategy — two height-allocating spacer divs around the
 * rendered slice, so the scrollbar geometry matches the full list.
 *
 * Like Blazor, it renders no element of its own — the spacers and items go
 * into the parent, and the visible window is measured against the nearest
 * scrolling ancestor (or the window). The per-item template is `itemTemplate`.
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
  /** The spacer elements' tag (Blazor's SpacerElement): `tr` inside a `<tbody>`, `li` in a list. */
  @Parameter() spacerElement = "div";

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
  private requestTicket = 0;

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
    // Blazor renders no element of its own: the spacers and the items sit
    // directly in the parent (a `<tbody>` with `spacerElement="tr"`).
    const topHeight = this.startIndex * this.itemSize;
    b.openElement(this.nextSequence(), this.spacerElement);
    b.addAttribute(this.nextSequence(), "class", "virtualize-spacer");
    b.addAttribute(this.nextSequence(), "aria-hidden", "true");
    b.addAttribute(this.nextSequence(), "style", `height: ${topHeight}px; flex-shrink: 0;`);
    b.addElementReferenceCapture(this.nextSequence(), (el) => {
      this.rootElement = el as HTMLElement;
    });
    b.closeElement();

    for (const item of this.visibleItems()) {
      const template = this.itemTemplate;
      if (template) {
        b.addContent(this.nextSequence(), template(item));
      } else {
        b.openElement(this.nextSequence(), "div");
        b.addAttribute(this.nextSequence(), "class", "virtualize-item");
        b.addContent(this.nextSequence(), String(item));
        b.closeElement();
      }
    }

    const rendered = this.visibleItems().length;
    const bottomHeight = Math.max(0, (this.totalItemCount - this.startIndex - rendered) * this.itemSize);
    b.openElement(this.nextSequence(), this.spacerElement);
    b.addAttribute(this.nextSequence(), "class", "virtualize-spacer");
    b.addAttribute(this.nextSequence(), "aria-hidden", "true");
    b.addAttribute(this.nextSequence(), "style", `height: ${bottomHeight}px; flex-shrink: 0;`);
    b.closeElement();
  }

  protected override async onAfterRender(firstRender: boolean): Promise<void> {
    if (!firstRender || !this.rootElement) return;
    const element = this.rootElement;
    const onScroll = () => {
      // Track the async load so renderer.waitUntilIdle includes it.
      this.renderHandle.track(this.handleScroll()).catch(() => undefined);
    };
    // Blazor measures against the nearest scrolling ancestor (or the
    // window), not the list's own element: a list without a height of its
    // own — the usual case, inside a scrolling panel — grows with its
    // content and would otherwise render every item.
    const container = scrollContainerOf(element);
    const target: EventTarget = container ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    if (container !== element) element.addEventListener("scroll", onScroll, { passive: true });
    this.unsubscribeScroll = () => {
      target.removeEventListener("scroll", onScroll);
      element.removeEventListener("scroll", onScroll);
    };
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(onScroll);
      this.resizeObserver.observe(element);
      if (container && container !== element) this.resizeObserver.observe(container);
    }
    await this.handleScroll();
  }

  private async handleScroll(): Promise<void> {
    const element = this.rootElement;
    if (!element) return;
    // Provider mode: the total is unknown before the first result — treat it
    // as unbounded so the initial request covers the full viewport window.
    const knownTotal = this.totalItemCount > 0 ? this.totalItemCount : Number.POSITIVE_INFINITY;
    const { viewportHeight, scrollTop } = visibleArea(element);
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
    // A newer request supersedes this one: its result (or failure) is dropped (Blazor cancels it).
    const ticket = ++this.requestTicket;
    let result: VirtualizeItemsProviderResult<never>;
    try {
      result = await this.itemsProvider({ startIndex, count });
    } catch (error) {
      if (ticket !== this.requestTicket) return;
      throw error;
    }
    if (ticket !== this.requestTicket) return;
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

  /** Removes the scroll listener and disconnects the resize observer. */
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
/** Viewport height when nothing can be measured yet (SSR, test DOMs). */
const FALLBACK_HEIGHT = 600;

/**
 * The element whose scrolling moves the list: the list's own element when it
 * scrolls itself (it has a height of its own and overflows), else the
 * nearest ancestor that scrolls; null for the window.
 */
function scrollContainerOf(element: HTMLElement): HTMLElement | null {
  if (scrolls(element)) return element;
  for (let current = element.parentElement; current; current = current.parentElement) {
    if (scrolls(current)) return current;
  }
  return null;
}

function scrolls(element: HTMLElement): boolean {
  const overflow = getComputedStyle(element).overflowY;
  if (overflow !== "auto" && overflow !== "scroll" && overflow !== "overlay") return false;
  // An element without a height of its own grows with its content and never scrolls.
  return element.scrollHeight > element.clientHeight || element.scrollTop > 0;
}

/**
 * How much of the list is in view: the viewport's height, and how far the
 * list's top has scrolled past the viewport's top (0 while it is below).
 * Measured against the scroll container; when nothing can be measured yet
 * (not laid out, or a test DOM), the fallback height from the top.
 */
function visibleArea(element: HTMLElement): { viewportHeight: number; scrollTop: number } {
  const container = scrollContainerOf(element);
  if (container === element) {
    return { viewportHeight: element.clientHeight || FALLBACK_HEIGHT, scrollTop: element.scrollTop };
  }
  const listTop = element.getBoundingClientRect().top;
  if (container) {
    const box = container.getBoundingClientRect();
    return { viewportHeight: container.clientHeight || FALLBACK_HEIGHT, scrollTop: Math.max(0, box.top + container.clientTop - listTop) };
  }
  const height = typeof window !== "undefined" ? window.innerHeight : 0;
  return { viewportHeight: height || FALLBACK_HEIGHT, scrollTop: Math.max(0, -listTop) };
}
