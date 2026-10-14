import { componentInternals } from "../components/component-internals.js";
import { ComponentBase } from "../components/component-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import {
  createVirtualizeViewport,
  SpacerVisibilityReason,
  ViewportFillDirection,
  type VirtualizeViewport,
  type VirtualizeViewportCallbacks,
} from "./virtualize-viewport.js";

/** Blazor's ItemsProviderRequest: the slice the Virtualize needs. */
export interface VirtualizeItemsProviderRequest {
  /** Index of the first item to return (Blazor's `StartIndex`). */
  readonly startIndex: number;
  /**
   * Number of items requested (Blazor's `Count`). Not clamped to the total: the provider may return fewer,
   * and a request may reach past the end.
   */
  readonly count: number;
  /** Aborts when a newer request supersedes this one or the component goes away (Blazor's `CancellationToken`). */
  readonly signal: AbortSignal;
}

/** Blazor's ItemsProviderResult. */
export interface VirtualizeItemsProviderResult<TItem> {
  /** The items of the requested slice; may be fewer than requested. */
  items?: Iterable<TItem>;
  /** Total length of the list, which sizes the spacers. Tsazor extension: when omitted, the previous total is kept. */
  totalItemCount?: number;
}

/** Loads one slice of the list on demand (Blazor's `ItemsProviderDelegate`). */
export type VirtualizeItemsProvider<TItem> = (
  request: VirtualizeItemsProviderRequest,
) => Promise<VirtualizeItemsProviderResult<TItem>>;

/** Blazor's PlaceholderContext: what a placeholder for a not yet loaded item knows. */
export interface PlaceholderContext {
  /** The item's index in the whole list. */
  readonly index: number;
  /** The size the placeholder should take, in px (the measured average item size). */
  readonly size: number;
}

/**
 * Blazor's VirtualizeAnchorMode: how the viewport behaves at the edges of the list when items arrive.
 * Flags: `VirtualizeAnchorMode.Start | VirtualizeAnchorMode.End` pins both edges.
 */
export enum VirtualizeAnchorMode {
  /** No edge pinning: the viewport stays where it is whatever the items do. */
  None = 0,
  /** At (or within 1px of) the top, items that arrive at the start show: the viewport stays at the top. */
  Start = 1,
  /**
   * At (or within 2px of) the bottom, items that arrive at the end show: the viewport follows them. A user
   * scroll away from the bottom stops that until the user returns.
   */
  End = 2,
}

/** One `Items` / `ItemsProvider` load: what the request returned, as Blazor's ItemsProviderResult. */
interface LoadResult<TItem> {
  items: readonly TItem[];
  totalItemCount: number;
}

/** Blazor's InitialIndexPhase. */
const enum InitialIndexPhase {
  None,
  FillingViewport,
  ApplyingMeasuredGeometry,
  Completed,
}

/** Blazor's InitialIndexState: where positioning at `initialItemIndex` stands. */
class InitialIndexState {
  phase = InitialIndexPhase.None;
  spacerItemSize = 0;

  get isPositioning(): boolean {
    return this.phase === InitialIndexPhase.FillingViewport || this.phase === InitialIndexPhase.ApplyingMeasuredGeometry;
  }

  complete(): void {
    this.phase = InitialIndexPhase.Completed;
  }

  beginFillingViewport(itemSize: number): void {
    this.phase = InitialIndexPhase.FillingViewport;
    this.spacerItemSize = itemSize;
  }

  beginApplyingMeasuredGeometry(itemSize: number): void {
    this.phase = InitialIndexPhase.ApplyingMeasuredGeometry;
    this.spacerItemSize = itemSize;
  }

  abort(): void {
    if (this.isPositioning) this.phase = InitialIndexPhase.Completed;
  }
}

/** A promise with its resolve/reject (Blazor's TaskCompletionSource). */
interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
  settled: boolean;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // A rendezvous nobody awaits any more must not surface as an unhandled rejection.
  promise.catch(() => undefined);
  const d: Deferred = {
    promise,
    settled: false,
    resolve: () => {
      if (d.settled) return;
      d.settled = true;
      resolve();
    },
    reject: (error) => {
      if (d.settled) return;
      d.settled = true;
      reject(error);
    },
  };
  return d;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? abortError();
}

function abortError(): Error {
  return new DOMException("The operation was aborted.", "AbortError");
}

/** Whether `error` is the abort of `signal` (Blazor: an OperationCanceledException for that token). */
function isAbortOf(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted && (error === signal.reason || (error instanceof DOMException && error.name === "AbortError"));
}

/** An AbortController that also aborts when `parent` does (Blazor's CreateLinkedTokenSource). */
function linkedController(parent: AbortSignal | undefined): AbortController {
  const controller = new AbortController();
  if (parent !== undefined) {
    if (parent.aborted) controller.abort(parent.reason);
    else parent.addEventListener("abort", () => controller.abort(parent.reason), { once: true, signal: controller.signal });
  }
  return controller;
}

/** Creates the viewport of a Virtualize; a test environment puts its own in place (Blazor's tests mock IJSRuntime). */
type ViewportFactory = (
  callbacks: VirtualizeViewportCallbacks,
  spacerBefore: HTMLElement,
  spacerAfter: HTMLElement,
  anchorMode: VirtualizeAnchorMode,
) => VirtualizeViewport | undefined;

/**
 * Where a test environment puts its viewport factory: @tsazor/testing fills it so a Virtualize renders its
 * rows without layout, as bUnit does for Blazor's. A global slot keeps this test seam out of the public API
 * (the HMR bridge, `globalThis.__tsazor`, works the same way).
 */
const VIEWPORT_FACTORY = Symbol.for("tsazor.virtualize.viewportFactory");
/** How often scrollToItemAsync grows the window to fill the viewport (the capacity doubles each time). */
const MAX_FILL_STEPS = 8;
type FactorySlot = { [VIEWPORT_FACTORY]?: ViewportFactory };

function viewportFactory(): ViewportFactory {
  return (globalThis as FactorySlot)[VIEWPORT_FACTORY] ?? createVirtualizeViewport;
}

/** @internal Tests: replaces the DOM viewport (Blazor's tests mock IJSRuntime); returns the restore. */
export function setVirtualizeViewportFactory(factory: ViewportFactory): () => void {
  const slot = globalThis as FactorySlot;
  const previous = slot[VIEWPORT_FACTORY];
  slot[VIEWPORT_FACTORY] = factory;
  return () => {
    slot[VIEWPORT_FACTORY] = previous;
  };
}

/**
 * Blazor's Virtualize<TItem> (Blazor 11): renders only the part of a long list that is in view. Two spacers
 * stand for the items above and below, sized from the measured average item height, so the scrollbar matches
 * the whole list; rows of different heights work.
 *
 * Like Blazor, it renders no element of its own: the spacers and the items go into the parent (a `<tbody>`
 * with `SpacerElement="tr"`), and the visible window is measured against the nearest scrolling ancestor (or
 * the window). The item template is the child content or `ItemContent`. `AnchorMode` keeps the viewport at
 * an edge while items arrive there (`End` follows a feed or a chat), `InitialItemIndex` and `scrollToItemAsync`
 * scroll to an item.
 *
 * Tsazor deviations from Blazor 11, where Blazor has a bug (docs/design-virtualize.md §6): only finite
 * measurements count; rows never render beyond the window; placeholders take the measured average; changing
 * `ItemSize` resets every measurement; a grown or shrunk list shifts the window where the previously first
 * row actually went (deletes above the viewport are compensated); a resized container re-checks the window.
 */
export class Virtualize<TItem = unknown> extends ComponentBase {
  /** The item template (Blazor's ChildContent). `ItemContent` wins when both are set. */
  @Parameter() childContent?: (item: TItem) => RenderFragment;
  /** The item template (Blazor's ItemContent). */
  @Parameter() itemContent?: (item: TItem) => RenderFragment;
  /** What shows for an item that is not loaded yet; by default an empty block of the measured item height. */
  @Parameter() placeholder?: (context: PlaceholderContext) => RenderFragment;
  /** What shows when the list is empty (after a load; not while loading). */
  @Parameter() emptyContent?: RenderFragment;
  /** The estimated item size in px until the rendered items are measured; must be positive. */
  @Parameter() itemSize = 50;
  /** Loads a slice of the list on demand (Blazor's ItemsProvider); give it or `Items`. */
  @Parameter() itemsProvider?: VirtualizeItemsProvider<TItem>;
  /** The whole list in memory (Blazor's Items); give it or `ItemsProvider`. */
  @Parameter() items?: readonly TItem[];
  /** How many items render above and below the visible ones. */
  @Parameter() overscanCount = 15;
  /** The spacers' tag: `tr` inside a `<tbody>`, `li` in a list. */
  @Parameter() spacerElement = "div";
  /** At most this many items (plus the overscan) render, however large the viewport: a safeguard. */
  @Parameter() maxItemCount = 100;
  /** How the viewport behaves at the edges when items arrive; `Start` by default. */
  @Parameter() anchorMode: VirtualizeAnchorMode = VirtualizeAnchorMode.Start;
  /**
   * Whether two items are the same item (Blazor's ItemComparer): an `ItemsProvider` list compares the item
   * it showed with the one now at that index to tell a prepend from an append. The default compares
   * references; a provider that returns fresh objects needs a comparer by key (`(a, b) => a.id === b.id`).
   */
  @Parameter() itemComparer: (a: TItem, b: TItem) => boolean = Object.is;
  /** The item to scroll to on the first render (applied once; later, call `scrollToItemAsync`). */
  @Parameter() initialItemIndex = 0;

  private viewport: VirtualizeViewport | undefined;
  private spacerBefore: HTMLElement | undefined;
  private spacerAfter: HTMLElement | undefined;

  /** @internal Blazor's _itemsBefore: the window's first index. */
  itemsBefore = 0;
  private visibleItemCapacity = 0;
  /**
   * If the viewport could show more than MaxItemCount items, the capacity left unused: blank space below the
   * window. Without it the after spacer would stay visible and ask for more items forever.
   */
  private unusedItemCapacity = 0;
  private itemCount = 0;
  private loadedItemsStartIndex = 0;
  /** The window start of the DOM as last rendered. */
  private renderedItemsBefore = -1;
  /** @internal */
  lastRenderedItemCount = 0;
  /** @internal */
  lastRenderedPlaceholderCount = 0;
  private recalibratedItemSize = 0;
  private lastSetItemSize = 0;
  private loadedItems: readonly TItem[] | undefined;
  private previousFirstLoadedItem: { item: TItem } | undefined;
  private previousFirstLoadedItemIndex = -1;
  private previousLastLoadedItem: { item: TItem } | undefined;
  private previousLastLoadedItemIndex = -1;
  private refreshController: AbortController | undefined;
  private currentScrollController: AbortController | undefined;
  private nextRender: Deferred | undefined;
  private readonly initialIndex = new InitialIndexState();
  private skipNextDistributionRefresh = false;
  private refreshError: { error: unknown } | undefined;
  private itemTemplateInUse: ((item: TItem) => RenderFragment) | undefined;
  private placeholderInUse: (context: PlaceholderContext) => RenderFragment = (context) => this.defaultPlaceholder(context);
  private loading = false;
  /** @internal */
  totalMeasuredHeight = 0;
  /** @internal */
  measuredItemCount = 0;
  /** @internal */
  pendingScrollToBottom = false;
  private lastRenderedAnchorMode = VirtualizeAnchorMode.Start;
  /** After a prepend or append: onAfterRender restores the anchor so the viewport stays where it was. */
  private pendingAnchorRestore = false;
  private deferAnchorRestoreClear = false;
  private disposed = false;

  private get usesItems(): boolean {
    return this.itemsProvider === undefined;
  }

  private get effectiveOverscanCount(): number {
    return this.overscanCount;
  }

  private get canDetectPrepend(): boolean {
    return this.previousFirstLoadedItem !== undefined;
  }

  /**
   * Blazor's RefreshDataAsync: asks the `ItemsProvider` again for the current window (an `Items` list needs
   * no call: it is read on every render). It doesn't render on success; the caller's own render follows.
   */
  async refreshDataAsync(): Promise<void> {
    this.totalMeasuredHeight = 0;
    this.measuredItemCount = 0;
    await this.refreshDataCore(false, undefined, true);
  }

  /**
   * Blazor's ScrollToItemAsync: scrolls so the item at `itemIndex` sits at the top of the visible area
   * (clamped to the list). A newer call supersedes this one, which then resolves; so does a call the user
   * overrides by scrolling. It rejects only when `signal` aborts. Throws before the first render: use
   * `InitialItemIndex` for the first position.
   */
  scrollToItemAsync(itemIndex: number, signal?: AbortSignal): Promise<void> {
    if (this.viewport === undefined) {
      throw new Error(
        "Virtualize: scrollToItemAsync cannot be called before the Virtualize has rendered in the browser. " +
          "Use the InitialItemIndex parameter to set the initial scroll position.",
      );
    }
    if (signal?.aborted) return Promise.reject(signal.reason ?? abortError());
    this.initialIndex.abort();
    return this.track(this.scrollToItemCore(itemIndex, signal));
  }

  private async scrollToItemCore(itemIndex: number, signal: AbortSignal | undefined): Promise<void> {
    // Last call wins; the finally clears shared state only when it is still ours.
    this.currentScrollController?.abort();
    const ours = linkedController(signal);
    this.currentScrollController = ours;
    const token = ours.signal;
    let fillDirection: ViewportFillDirection | null = null;

    this.viewport?.beginProgrammaticScroll();
    try {
      throwIfAborted(token);
      const refetchRequired = this.moveWindowToContain(itemIndex);
      await this.ensureRenderCommitted(refetchRequired, token);
      fillDirection = this.alignToTarget(itemIndex);
      if (!this.initialIndex.isPositioning) fillDirection = await this.fillViewportAroundTarget(itemIndex, fillDirection, token);
    } catch (error) {
      // A superseded call (or one the user overrode) resolves; only the caller's own abort rejects.
      if (!(token.aborted && !signal?.aborted && isAbortOf(error, token))) throw error;
    } finally {
      if (this.currentScrollController === ours) this.currentScrollController = undefined;
    }
    this.updateWindowFromViewport(fillDirection, this.visibleItemCapacity, this.unusedItemCapacity);
  }

  private moveWindowToContain(itemIndex: number): boolean {
    const clamped = this.clampToItemRange(itemIndex);
    const capacity = this.visibleItemCapacity > 0 ? this.visibleItemCapacity : this.effectiveOverscanCount * 2 + 1;
    let desiredItemsBefore = Math.max(0, clamped - this.effectiveOverscanCount);
    if (this.itemCount > 0 && desiredItemsBefore + capacity > this.itemCount) {
      desiredItemsBefore = Math.max(0, this.itemCount - capacity);
    }
    const windowChanged = desiredItemsBefore !== this.itemsBefore;
    // Seed the capacity when no spacer has reported yet, so the request asks for a meaningful slice.
    if (this.visibleItemCapacity <= 0) this.visibleItemCapacity = capacity;
    if (windowChanged) {
      this.itemsBefore = desiredItemsBefore;
      this.skipNextDistributionRefresh = false;
    }
    const alreadyLoadedForWindow = this.loadedItems !== undefined && this.loadedItemsStartIndex === this.itemsBefore;
    return windowChanged || !alreadyLoadedForWindow;
  }

  private async ensureRenderCommitted(refetchRequired: boolean, token: AbortSignal): Promise<void> {
    // The rendezvous exists before any render is requested.
    const renderCommitted = deferred();
    this.nextRender = renderCommitted;
    const onAbort = (): void => renderCommitted.reject(token.reason ?? abortError());
    token.addEventListener("abort", onAbort, { once: true });
    try {
      if (refetchRequired) {
        await this.refreshDataCore(true, token);
        throwIfAborted(token);
      } else {
        // The window is loaded already: one render, so the DOM shows it.
        this.stateHasChanged();
      }
      // onAfterRender settles it once the rendered slice is this window.
      await renderCommitted.promise;
      throwIfAborted(token);
    } finally {
      token.removeEventListener("abort", onAbort);
    }
  }

  /**
   * Tsazor (A15): grows the window until the rows cover the viewport, aligning the target again after each
   * render, before scrollToItemAsync completes (InitialItemIndex fills the same way). Blazor grows it once: a spacer
   * still in view then reports after the scroll completed and slides the window, converted with an average
   * that changed since the spacers were sized, away from the target.
   */
  private async fillViewportAroundTarget(
    itemIndex: number,
    fillDirection: ViewportFillDirection | null,
    token: AbortSignal,
  ): Promise<ViewportFillDirection | null> {
    for (let step = 0; step < MAX_FILL_STEPS; step++) {
      if (fillDirection !== ViewportFillDirection.Before && fillDirection !== ViewportFillDirection.After) break;
      const grown = this.grownWindow(fillDirection, this.visibleItemCapacity);
      if (grown === undefined) break;
      this.itemsBefore = grown.itemsBefore;
      this.visibleItemCapacity = grown.visibleItemCapacity;
      this.skipNextDistributionRefresh = false;
      await this.ensureRenderCommitted(true, token);
      fillDirection = this.alignToTarget(itemIndex);
    }
    return fillDirection;
  }

  private alignToTarget(itemIndex: number): ViewportFillDirection | null {
    // Clamped again: the count may have changed during the load.
    const localIndex = this.clampToItemRange(itemIndex) - this.itemsBefore;
    if (localIndex < 0 || localIndex >= this.visibleItemCapacity || this.lastRenderedItemCount === 0) return null;
    return this.viewport?.alignToItem(localIndex) ?? null;
  }

  private clampToItemRange(requested: number): number {
    if (this.itemCount <= 0) return Math.max(0, requested);
    if (requested < 0) return 0;
    if (requested >= this.itemCount) return this.itemCount - 1;
    return requested;
  }

  protected override onParametersSet(): void {
    if (!(this.itemSize > 0)) {
      throw new Error("Virtualize requires a positive value for parameter 'ItemSize'.");
    }
    if (this.recalibratedItemSize <= 0) this.recalibratedItemSize = this.itemSize;
    // Without this reset the capacity is wrong after a size change, which causes extra provider calls.
    if (this.lastSetItemSize !== this.itemSize) {
      this.lastSetItemSize = this.itemSize;
      this.totalMeasuredHeight = 0;
      this.measuredItemCount = 0;
      // Tsazor (A4): the recalibrated size starts over too.
      this.recalibratedItemSize = this.itemSize;
    }
    if (this.initialIndex.phase === InitialIndexPhase.None && this.initialItemIndex > 0) {
      this.moveWindowToContain(this.initialItemIndex);
    }
    if (this.itemsProvider !== undefined) {
      if (this.items !== undefined) {
        throw new Error(
          "Virtualize can only accept one item source from its parameters. Do not supply both 'Items' and 'ItemsProvider'.",
        );
      }
    } else if (this.items !== undefined) {
      // An in-memory list costs nothing to read again, so every parameter set does: items added to or removed
      // from it show without refreshDataAsync. This load is synchronous.
      void this.refreshDataCore(false);
    } else {
      throw new Error("Virtualize requires either the 'Items' or 'ItemsProvider' parameters to be specified and non-null.");
    }
    this.itemTemplateInUse = this.itemContent ?? this.childContent;
    this.placeholderInUse = this.placeholder ?? ((context) => this.defaultPlaceholder(context));
  }

  protected override async onAfterRender(firstRender: boolean): Promise<void> {
    if (this.disposed) return;
    // A scrollToItemAsync waits for the render that shows its window.
    const pendingRender = this.nextRender;
    if (
      pendingRender !== undefined &&
      this.loadedItemsStartIndex === this.itemsBefore &&
      (this.lastRenderedItemCount > 0 || this.itemCount === 0)
    ) {
      this.nextRender = undefined;
      pendingRender.resolve();
    }

    if (firstRender && this.spacerBefore !== undefined && this.spacerAfter !== undefined) {
      this.viewport = viewportFactory()(this, this.spacerBefore, this.spacerAfter, this.anchorMode);
      this.lastRenderedAnchorMode = this.anchorMode;
    }
    const viewport = this.viewport;
    if (viewport === undefined) return;

    viewport.afterRender();

    if (this.pendingScrollToBottom) {
      this.pendingScrollToBottom = false;
      viewport.scrollToBottom();
    }

    if (!firstRender) {
      if (this.lastRenderedAnchorMode !== this.anchorMode) {
        this.lastRenderedAnchorMode = this.anchorMode;
        viewport.setAnchorMode(this.anchorMode);
      }
      // Restore the anchor a data shift captured, so the same row stays at the same offset; not while a
      // scrollToItemAsync moves the viewport on purpose.
      const shouldRestore = this.pendingAnchorRestore && !this.pendingScrollToBottom && this.currentScrollController === undefined;
      const deferClear =
        shouldRestore &&
        (this.anchorMode === VirtualizeAnchorMode.None ||
          this.anchorMode === VirtualizeAnchorMode.End ||
          ((this.anchorMode & VirtualizeAnchorMode.Start) !== 0 && this.deferAnchorRestoreClear));
      if (!deferClear) this.pendingAnchorRestore = false;
      if (shouldRestore) viewport.restoreAnchor();
      this.pendingAnchorRestore = false;
      this.deferAnchorRestoreClear = false;
      viewport.refreshObservers(this.loading);
    }

    // InitialItemIndex applies once, through scrollToItemAsync's path: the spacer callback at scrollTop 0 must not
    // reset the window to index 0 first.
    if (this.initialIndex.phase === InitialIndexPhase.None) {
      if (this.initialItemIndex > 0) {
        this.initialIndex.beginFillingViewport(this.recalibratedItemSize);
        // A failed load surfaces through the render (an error boundary), as Blazor's does.
        await this.scrollToItemCore(this.initialItemIndex, undefined).catch(() => undefined);
      } else if (this.itemCount > 0) {
        this.initialIndex.complete();
      }
    }

    if (
      this.viewport !== undefined &&
      !this.loading &&
      this.loadedItemsStartIndex === this.itemsBefore &&
      this.lastRenderedItemCount > 0 &&
      this.lastRenderedPlaceholderCount === 0 &&
      this.initialIndex.isPositioning
    ) {
      const fillDirection = this.alignToTarget(this.initialItemIndex);
      if (fillDirection === null && this.initialIndex.phase === InitialIndexPhase.ApplyingMeasuredGeometry) {
        this.initialIndex.abort();
        return;
      }
      this.updateWindowFromViewport(fillDirection, this.visibleItemCapacity, this.unusedItemCapacity);
    }
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    if (this.refreshError !== undefined) {
      const { error } = this.refreshError;
      this.refreshError = undefined;
      throw error;
    }

    this.renderedItemsBefore = this.itemsBefore;
    b.openElement(0, this.spacerElement);
    b.addAttribute(1, "style", this.spacerStyle(this.itemsBefore, 0));
    b.addAttribute(2, "aria-hidden", "true");
    b.addElementReferenceCapture(3, (element) => {
      this.spacerBefore = element as HTMLElement;
    });
    b.closeElement();

    const lastItemIndex = Math.min(this.itemsBefore + this.visibleItemCapacity, this.itemCount);
    let renderIndex = this.itemsBefore;
    const placeholdersBeforeCount = Math.min(this.loadedItemsStartIndex, lastItemIndex);

    b.openRegion(3);
    // Placeholders before the loaded items. The absolute index as the sequence number is valid here: nothing
    // else is in this region, and a placeholder for index i then matches the previous one for index i.
    for (; renderIndex < placeholdersBeforeCount; renderIndex++) {
      b.addContent(renderIndex, this.placeholderInUse(this.placeholderContext(renderIndex)));
    }
    b.closeRegion();

    this.lastRenderedItemCount = 0;

    const loadedItems = this.loadedItems;
    if (loadedItems !== undefined && !this.loading && this.itemCount === 0 && this.emptyContent !== undefined) {
      b.addContent(4, this.emptyContent);
    } else if (loadedItems !== undefined && this.itemTemplateInUse !== undefined) {
      const template = this.itemTemplateInUse;
      // Tsazor (A2): only rows inside the window, even when a longer loaded slice is still around.
      const start = Math.max(0, this.itemsBefore - this.loadedItemsStartIndex);
      const end = Math.min(loadedItems.length, lastItemIndex - this.loadedItemsStartIndex);
      b.openRegion(5);
      let isFirstRenderedItem = true;
      for (let i = start; i < end; i++) {
        const item = loadedItems[i] as TItem;
        // Inline, as Blazor does: every row shares the template's sequence numbers, so `@key` keeps a row's
        // element when the window slides.
        template(item)(b);
        this.lastRenderedItemCount++;
        if (!this.usesItems) {
          if (isFirstRenderedItem) {
            this.previousFirstLoadedItem = { item };
            this.previousFirstLoadedItemIndex = renderIndex;
            isFirstRenderedItem = false;
          }
          this.previousLastLoadedItem = { item };
          this.previousLastLoadedItemIndex = renderIndex + this.lastRenderedItemCount - 1;
        }
      }
      renderIndex += this.lastRenderedItemCount;
      b.closeRegion();
    }

    this.lastRenderedPlaceholderCount = Math.max(0, lastItemIndex - this.itemsBefore - this.lastRenderedItemCount);

    b.openRegion(6);
    // The placeholders after the loaded items.
    for (; renderIndex < lastItemIndex; renderIndex++) {
      b.addContent(renderIndex, this.placeholderInUse(this.placeholderContext(renderIndex)));
    }
    b.closeRegion();

    const itemsAfter = Math.max(0, this.itemCount - this.visibleItemCapacity - this.itemsBefore);
    b.openElement(7, this.spacerElement);
    b.addAttribute(8, "aria-hidden", "true");
    b.addAttribute(9, "style", this.spacerStyle(itemsAfter, this.unusedItemCapacity));
    b.addElementReferenceCapture(11, (element) => {
      this.spacerAfter = element as HTMLElement;
    });
    b.closeElement();
  }

  /**
   * A spacer's style: the reserved height, and the "loop breaker" (unused capacity pushes the after spacer
   * out of view). Blazor writes these as data attributes that its JS mirrors to the CSSOM; Tsazor's renderer
   * writes `style` through the CSSOM itself under `strictCsp`. The viewport's own spacer styles are part of it,
   * so a render doesn't drop them.
   */
  private spacerStyle(itemCount: number, loopBreakerItems: number): string {
    let style = `height: ${this.toPx(itemCount * this.getItemHeight())}px; flex-shrink: 0;`;
    if (loopBreakerItems !== 0) style += ` transform: translateY(${this.toPx(loopBreakerItems * this.getItemHeight())}px);`;
    const extra = this.viewport?.spacerStyle;
    if (extra) style += ` ${extra}`;
    return style;
  }

  private toPx(value: number): string {
    return Number.isFinite(value) ? String(value) : "0";
  }

  private placeholderContext(index: number): PlaceholderContext {
    // Tsazor (A3): the measured average, as the spacers use (Blazor passes the last window's recalibration).
    return { index, size: this.getItemHeight() };
  }

  private defaultPlaceholder(context: PlaceholderContext): RenderFragment {
    return (b) => {
      b.openElement(0, "div");
      b.addAttribute(1, "style", `height: ${this.toPx(context.size)}px; flex-shrink: 0;`);
      b.closeElement();
    };
  }

  private getItemHeight(): number {
    return this.initialIndex.isPositioning ? this.initialIndex.spacerItemSize : this.getMeasuredItemHeight();
  }

  private getMeasuredItemHeight(): number {
    return this.measuredItemCount > 0 ? this.totalMeasuredHeight / this.measuredItemCount : this.recalibratedItemSize;
  }

  private updateItemSizeFromRenderedContent(spacerSize: number, spacerSeparation: number, containerSize: number): void {
    if (this.initialIndex.phase !== InitialIndexPhase.FillingViewport) return;
    this.calculateItemDistribution(spacerSize, spacerSeparation, containerSize);
  }

  private cancelInFlightScrollForUserInteraction(): void {
    this.initialIndex.abort();
    if (this.currentScrollController !== undefined) {
      this.currentScrollController.abort();
      this.currentScrollController = undefined;
      this.refreshController?.abort();
    }
  }

  /** @internal The viewport: whether a scrollToItemAsync is in flight (user input then cancels it, A13). */
  isScrollToItemPending(): boolean {
    return this.currentScrollController !== undefined;
  }

  /** @internal The viewport: the before spacer is in view (Blazor's OnBeforeSpacerVisible). */
  spacerBeforeVisible(spacerSize: number, spacerSeparation: number, containerSize: number, reason: SpacerVisibilityReason): void {
    if (this.disposed) return;
    if (reason === SpacerVisibilityReason.RenderedContentMeasurement) {
      this.updateItemSizeFromRenderedContent(spacerSize, spacerSeparation, containerSize);
      return;
    }
    if (this.pendingAnchorRestore) return;
    if (this.initialIndex.phase === InitialIndexPhase.None && this.initialItemIndex > 0) return;
    switch (reason) {
      case SpacerVisibilityReason.ProgrammaticScroll:
        return;
      case SpacerVisibilityReason.UserScroll:
        this.cancelInFlightScrollForUserInteraction();
        break;
      case SpacerVisibilityReason.ViewportFill:
        // A side effect of our own scroll: acting on it would move the target.
        if (this.currentScrollController !== undefined || this.initialIndex.phase === InitialIndexPhase.ApplyingMeasuredGeometry) return;
        break;
    }
    const distribution = this.calculateItemDistribution(spacerSize, spacerSeparation, containerSize);
    let itemsBefore = distribution.itemsInSpacer;
    if (this.initialIndex.isPositioning) {
      this.updateWindowFromViewport(ViewportFillDirection.Before, distribution.visibleItemCapacity, distribution.unusedItemCapacity);
      return;
    }
    // The before spacer is visible, so the window moves up by at least one.
    if (this.lastRenderedItemCount > 0 && itemsBefore === this.itemsBefore && itemsBefore > 0) itemsBefore--;
    this.updateItemDistribution(itemsBefore, distribution.visibleItemCapacity, distribution.unusedItemCapacity);
  }

  /** @internal The viewport: the after spacer is in view (Blazor's OnAfterSpacerVisible). */
  spacerAfterVisible(spacerSize: number, spacerSeparation: number, containerSize: number, reason: SpacerVisibilityReason): void {
    if (this.disposed) return;
    if (reason === SpacerVisibilityReason.RenderedContentMeasurement) {
      this.updateItemSizeFromRenderedContent(spacerSize, spacerSeparation, containerSize);
      return;
    }
    if (this.pendingAnchorRestore || reason === SpacerVisibilityReason.ProgrammaticScroll) return;
    // Tsazor (A9): like the before spacer, nothing moves before InitialItemIndex positioning starts.
    if (this.initialIndex.phase === InitialIndexPhase.None && this.initialItemIndex > 0) return;
    if (reason === SpacerVisibilityReason.UserScroll) {
      this.cancelInFlightScrollForUserInteraction();
    } else if (
      reason === SpacerVisibilityReason.ViewportFill &&
      (this.currentScrollController !== undefined || this.initialIndex.phase === InitialIndexPhase.ApplyingMeasuredGeometry)
    ) {
      // Our own scroll is in flight: the window moved but the scroll position hasn't landed yet.
      return;
    }
    const distribution = this.calculateItemDistribution(spacerSize, spacerSeparation, containerSize);
    if (this.initialIndex.isPositioning) {
      this.updateWindowFromViewport(ViewportFillDirection.After, distribution.visibleItemCapacity, distribution.unusedItemCapacity);
      return;
    }
    const itemsAfter = distribution.itemsInSpacer;
    let itemsBefore = Math.max(0, this.itemCount - itemsAfter - distribution.visibleItemCapacity);
    // The after spacer is visible, so the window moves down by at least one.
    if (this.lastRenderedItemCount > 0 && itemsBefore === this.itemsBefore && itemsBefore < this.itemCount - distribution.visibleItemCapacity) {
      itemsBefore++;
    }
    // In End mode, keep scrolling to the bottom while the measurements converge.
    if (itemsAfter === 0 && distribution.hadNewMeasurements && (this.anchorMode & VirtualizeAnchorMode.End) !== 0) {
      this.pendingScrollToBottom = true;
      this.pendingAnchorRestore = false;
    }
    this.updateItemDistribution(itemsBefore, distribution.visibleItemCapacity, distribution.unusedItemCapacity);
  }

  /** Grows the window toward the side the viewport doesn't cover, instead of sliding it. */
  private updateWindowFromViewport(fillDirection: ViewportFillDirection | null, visibleItemCapacity: number, unusedItemCapacity: number): void {
    if (fillDirection === ViewportFillDirection.Covered) {
      if (this.initialIndex.isPositioning && this.lastRenderedPlaceholderCount === 0) this.advanceInitialIndexPhase();
      return;
    }
    if (fillDirection === null) return;
    const grown = this.grownWindow(fillDirection, visibleItemCapacity);
    if (grown !== undefined || unusedItemCapacity !== this.unusedItemCapacity) {
      this.skipNextDistributionRefresh = false;
      this.updateItemDistribution(
        grown?.itemsBefore ?? this.itemsBefore,
        grown?.visibleItemCapacity ?? this.visibleItemCapacity,
        unusedItemCapacity,
      );
    } else if (this.initialIndex.isPositioning && !this.loading) {
      this.advanceInitialIndexPhase();
    }
  }

  /** The window grown toward the uncovered side: to the capacity given, or double; undefined when it can't grow. */
  private grownWindow(
    fillDirection: ViewportFillDirection.Before | ViewportFillDirection.After,
    visibleItemCapacity: number,
  ): { itemsBefore: number; visibleItemCapacity: number } | undefined {
    const maximumCapacity = Math.min(this.getMaximumItemCapacity(), this.itemCount);
    const doubledCapacity = Math.max(1, this.visibleItemCapacity) * 2;
    const desiredCapacity = Math.min(Math.max(visibleItemCapacity, doubledCapacity), maximumCapacity);
    const availableItems =
      fillDirection === ViewportFillDirection.Before
        ? this.itemsBefore
        : Math.max(0, this.itemCount - this.itemsBefore - this.visibleItemCapacity);
    const addedItems = Math.min(Math.max(0, desiredCapacity - this.visibleItemCapacity), availableItems);
    if (addedItems <= 0) return undefined;
    return {
      itemsBefore: fillDirection === ViewportFillDirection.Before ? this.itemsBefore - addedItems : this.itemsBefore,
      visibleItemCapacity: this.visibleItemCapacity + addedItems,
    };
  }

  private advanceInitialIndexPhase(): void {
    if (this.initialIndex.phase === InitialIndexPhase.FillingViewport) {
      if (this.lastRenderedItemCount === 0 || this.lastRenderedPlaceholderCount > 0) {
        this.initialIndex.complete();
        return;
      }
      this.initialIndex.beginApplyingMeasuredGeometry(this.getMeasuredItemHeight());
      this.stateHasChanged();
    } else {
      this.initialIndex.complete();
    }
  }

  private getEffectiveItemSizeForStaleSpacer(): number {
    const effectiveItemSize = this.getItemHeight();
    if (effectiveItemSize > 0 && Number.isFinite(effectiveItemSize)) return effectiveItemSize;
    return this.recalibratedItemSize > 0 ? this.recalibratedItemSize : this.itemSize;
  }

  private accumulateMeasurement(spacerSeparation: number): boolean {
    // Only windows without placeholders count, so the separation is real item heights. Subtracting the
    // placeholders' assumed size would make the average depend on itself, which diverges under CSS zoom.
    // Tsazor (A1): only finite, positive measurements (Blazor lets NaN and ∞ through).
    if (this.lastRenderedItemCount <= 0 || this.lastRenderedPlaceholderCount > 0 || !(spacerSeparation > 0) || !Number.isFinite(spacerSeparation)) {
      return false;
    }
    this.totalMeasuredHeight += spacerSeparation;
    this.measuredItemCount += this.lastRenderedItemCount;
    return true;
  }

  private recalibrateItemSize(spacerSeparation: number): void {
    if (this.lastRenderedItemCount > 0 && Number.isFinite(spacerSeparation)) {
      this.recalibratedItemSize =
        (spacerSeparation - this.lastRenderedPlaceholderCount * this.recalibratedItemSize) / this.lastRenderedItemCount;
    }
    // Something unusual happened, likely a misuse: back to the given size.
    if (!(this.recalibratedItemSize > 0)) this.recalibratedItemSize = this.itemSize;
  }

  private calculateItemDistribution(
    spacerSize: number,
    spacerSeparation: number,
    containerSize: number,
  ): { hadNewMeasurements: boolean; itemsInSpacer: number; visibleItemCapacity: number; unusedItemCapacity: number } {
    const hadNewMeasurements = this.accumulateMeasurement(spacerSeparation);
    this.recalibrateItemSize(spacerSeparation);
    const effectiveItemSize = this.getEffectiveItemSizeForStaleSpacer();
    const maxItemCount = this.getMaximumItemCapacity();
    const overscan = this.effectiveOverscanCount;
    const itemsInSpacer = Math.max(0, Math.floor(finiteOr(spacerSize, 0) / effectiveItemSize) - overscan);
    let visibleItemCapacity = Math.ceil(finiteOr(containerSize, 0) / effectiveItemSize) + 2 * overscan;
    const unusedItemCapacity = Math.max(0, visibleItemCapacity - maxItemCount);
    visibleItemCapacity -= unusedItemCapacity;
    return { hadNewMeasurements, itemsInSpacer, visibleItemCapacity, unusedItemCapacity };
  }

  /** MaxItemCount, with the overscan counted as used: a tiny MaxItemCount must not cause an endless load loop. */
  private getMaximumItemCapacity(): number {
    return Math.min(this.maxItemCount + this.effectiveOverscanCount * 2, Number.MAX_SAFE_INTEGER);
  }

  private getItemsProviderRequestCount(prefetchForPotentialPrepend: boolean): number {
    const isAtLoadedTail = this.itemCount > 0 && this.itemsBefore + this.visibleItemCapacity >= this.itemCount;
    const shouldPrefetchForPrepend =
      prefetchForPotentialPrepend && (this.anchorMode & VirtualizeAnchorMode.Start) !== 0 && this.canDetectPrepend;
    if (!this.usesItems && (shouldPrefetchForPrepend || ((this.anchorMode & VirtualizeAnchorMode.End) !== 0 && isAtLoadedTail))) {
      // A bounded look-ahead lets small prepends and appends shift the window from this result, without a
      // second request.
      return Math.min(this.getMaximumItemCapacity(), this.visibleItemCapacity + Math.max(1, this.effectiveOverscanCount));
    }
    return this.visibleItemCapacity;
  }

  private updateItemDistribution(itemsBefore: number, visibleItemCapacity: number, unusedItemCapacity: number): void {
    // The count just went down and the window is past the new end: clamp it.
    if (itemsBefore + visibleItemCapacity > this.itemCount) itemsBefore = Math.max(0, this.itemCount - visibleItemCapacity);
    if (itemsBefore === this.itemsBefore && visibleItemCapacity === this.visibleItemCapacity && unusedItemCapacity === this.unusedItemCapacity) {
      return;
    }
    this.itemsBefore = itemsBefore;
    this.visibleItemCapacity = visibleItemCapacity;
    this.unusedItemCapacity = unusedItemCapacity;
    // After a load the observers report again with refined measurements; this one-shot flag skips the
    // redundant provider call that follows. At the end of the list it doesn't: the refined capacity may need
    // more items.
    const skipRefresh =
      this.skipNextDistributionRefresh &&
      this.loadedItems !== undefined &&
      this.loadedItemsStartIndex === this.itemsBefore &&
      this.itemsBefore + visibleItemCapacity < this.itemCount;
    this.skipNextDistributionRefresh = false;
    if (skipRefresh) {
      this.stateHasChanged();
    } else {
      const pending = this.refreshDataCore(true);
      // Not done yet: render the placeholders of the new window meanwhile.
      if (pending !== undefined) this.stateHasChanged();
    }
  }

  /**
   * Blazor's RefreshDataCoreAsync. An `Items` list loads synchronously and returns undefined (Blazor's
   * completed ValueTask); an `ItemsProvider` returns the pending load.
   */
  private refreshDataCore(renderOnSuccess: boolean, owner?: AbortSignal, prefetchForPotentialPrepend = false): Promise<void> | undefined {
    this.refreshController?.abort();
    if (this.usesItems) {
      this.refreshController = undefined;
      this.refreshItems(renderOnSuccess, owner);
      return undefined;
    }
    const controller = linkedController(owner);
    this.refreshController = controller;
    this.loading = true;
    return this.track(this.refreshProvider(renderOnSuccess, controller, prefetchForPotentialPrepend));
  }

  /** The `Items` load (Blazor's DefaultItemsProvider path): synchronous, so nothing can supersede it midway. */
  private refreshItems(renderOnSuccess: boolean, owner: AbortSignal | undefined): void {
    try {
      const all = this.items ?? [];
      let result = this.sliceItems(this.itemsBefore, this.visibleItemCapacity);
      // InitialItemIndex beyond the end, or the list shrank: clamp and read again.
      if (result.totalItemCount > 0 && this.itemsBefore >= result.totalItemCount) {
        this.itemCount = result.totalItemCount;
        this.moveWindowToContain(this.itemsBefore);
        result = this.sliceItems(this.itemsBefore, this.visibleItemCapacity);
      }
      if (owner?.aborted) return;
      const previousItemCount = this.itemCount;
      const countDelta = result.totalItemCount - previousItemCount;
      if (countDelta !== 0 && previousItemCount > 0 && this.canDetectPrepend) {
        const previousFirst = this.previousFirstLoadedItem!.item;
        const previousIndex = this.previousFirstLoadedItemIndex;
        // Tsazor (A5, A6): compare at the index the item had (the window may have moved since), and shift by
        // where it went, else by the whole difference. Blazor compares with the item at the window's current
        // start, shifts only on growth, by the whole difference, and not at all when items were deleted.
        if (!Object.is(previousFirst, all[previousIndex])) {
          const movedTo = all.indexOf(previousFirst);
          const shift = movedTo >= 0 ? movedTo - previousIndex : countDelta > 0 ? countDelta : 0;
          if (shift !== 0) result = this.adjustItemsForShift(shift, result.totalItemCount);
        } else if (this.shouldAnchorForAppend(countDelta, previousItemCount)) {
          this.pendingAnchorRestore = true;
          this.deferAnchorRestoreClear = true;
        } else if (this.shouldScrollToBottomForAppend(countDelta, previousItemCount)) {
          this.pendingScrollToBottom = true;
        }
      }
      this.itemCount = result.totalItemCount;
      this.loadedItems = result.items;
      this.loadedItemsStartIndex = this.itemsBefore;
      // The item now first in the window, and where: a later load compares against it to see a shift.
      this.previousFirstLoadedItem = this.itemsBefore < all.length ? { item: all[this.itemsBefore] as TItem } : undefined;
      this.previousFirstLoadedItemIndex = this.itemsBefore;
      this.loading = false;
      this.skipNextDistributionRefresh = this.visibleItemCapacity > 0;
      if (renderOnSuccess) this.stateHasChanged();
    } catch (error) {
      this.failRefresh(error);
    }
  }

  private sliceItems(startIndex: number, count: number): LoadResult<TItem> {
    const all = this.items ?? [];
    return { items: all.slice(startIndex, startIndex + Math.max(0, count)), totalItemCount: all.length };
  }

  /** Blazor's AdjustForPrependAsync for `Items`: the window moves with the shift, the anchor is restored after. */
  private adjustItemsForShift(shift: number, newTotalCount: number): LoadResult<TItem> {
    const wasAtTop = this.itemsBefore === 0;
    const adjustedItemsBefore = Math.max(0, Math.min(this.itemsBefore + shift, Math.max(0, newTotalCount - this.visibleItemCapacity)));
    const result = this.sliceItems(adjustedItemsBefore, this.visibleItemCapacity);
    this.itemsBefore = adjustedItemsBefore;
    this.pendingAnchorRestore = true;
    this.deferAnchorRestoreClear = !wasAtTop;
    return result;
  }

  private async refreshProvider(renderOnSuccess: boolean, controller: AbortController, prefetchForPotentialPrepend: boolean): Promise<void> {
    const signal = controller.signal;
    const provider = this.itemsProvider!;
    try {
      let request: VirtualizeItemsProviderRequest = {
        startIndex: this.itemsBefore,
        count: this.getItemsProviderRequestCount(prefetchForPotentialPrepend),
        signal,
      };
      let result = this.normalize(await provider(request));
      // InitialItemIndex beyond the end, or the total shrank between loads: clamp and ask again.
      if (!signal.aborted && result.totalItemCount > 0 && this.itemsBefore >= result.totalItemCount) {
        this.itemCount = result.totalItemCount;
        this.moveWindowToContain(this.itemsBefore);
        request = { startIndex: this.itemsBefore, count: this.visibleItemCapacity, signal };
        result = this.normalize(await provider(request));
      }
      // A newer load superseded this one.
      if (signal.aborted) return;

      const previousItemCount = this.itemCount;
      const countDelta = result.totalItemCount - previousItemCount;
      const itemsChanged = countDelta !== 0 && previousItemCount > 0;
      if (itemsChanged && this.canDetectPrepend) {
        // Compare the same global index across windows; when scrolling moved past the previous first item,
        // use the previous last one where the windows overlap.
        let comparison = this.previousFirstLoadedItem;
        let comparisonOffset = this.previousFirstLoadedItemIndex - request.startIndex;
        if (comparisonOffset < 0 || comparisonOffset >= result.items.length) {
          comparison = this.previousLastLoadedItem;
          comparisonOffset = this.previousLastLoadedItemIndex - request.startIndex;
        }
        const hasComparableItem = comparison !== undefined && comparisonOffset >= 0 && comparisonOffset < result.items.length;
        if (hasComparableItem && !this.itemComparer(comparison!.item, result.items[comparisonOffset] as TItem)) {
          const shift = this.findShift(comparison!.item, request.startIndex + comparisonOffset, result, request.startIndex, countDelta);
          if (shift !== 0 && !(shift > 0 && this.shouldFollowPrependedHead())) {
            result = await this.adjustProviderForShift(shift, result, request, signal);
          }
        } else if (countDelta > 0 && this.shouldAnchorForAppend(countDelta, previousItemCount)) {
          this.pendingAnchorRestore = true;
          this.deferAnchorRestoreClear = true;
        } else if (countDelta > 0 && this.shouldFollowAppendedTail(previousItemCount)) {
          ({ result, request } = await this.advanceWindowToAppendedTail(result, request, signal));
        }
      } else if (countDelta > 0 && previousItemCount > 0 && this.shouldFollowAppendedTail(previousItemCount)) {
        ({ result, request } = await this.advanceWindowToAppendedTail(result, request, signal));
      }
      throwIfAborted(signal);

      this.itemCount = result.totalItemCount;
      this.loadedItems = result.items;
      this.loadedItemsStartIndex = this.itemsBefore;
      this.loading = false;
      this.skipNextDistributionRefresh = request.count > 0;
      if (renderOnSuccess) {
        if (this.replacesRenderedPlaceholders()) this.viewport?.holdFirstVisibleRow();
        this.stateHasChanged();
      }
    } catch (error) {
      if (!isAbortOf(error, signal)) this.failRefresh(error);
    } finally {
      if (this.refreshController === controller) {
        this.refreshController = undefined;
        if (signal.aborted) this.loading = false;
      }
    }
  }

  /**
   * How far the rows moved (Tsazor, A5/A6): where the comparer finds the item that was at `previousIndex` in
   * the new result (which starts at `startIndex`), else Blazor's rule (a growth is a prepend of the whole
   * difference).
   */
  private findShift(previous: TItem, previousIndex: number, result: LoadResult<TItem>, startIndex: number, countDelta: number): number {
    const found = this.indexInResult(previous, result);
    if (found >= 0) return startIndex + found - previousIndex;
    if (countDelta < 0) {
      // Rows deleted above: the item left the result upward. The first row shown before that is still in the
      // result tells how far (the `Items` path searches the whole list instead).
      const shown = this.loadedItems ?? [];
      const last = Math.min(shown.length - 1, this.previousLastLoadedItemIndex - this.loadedItemsStartIndex);
      for (let j = Math.max(0, this.previousFirstLoadedItemIndex - this.loadedItemsStartIndex); j <= last; j++) {
        const at = this.indexInResult(shown[j] as TItem, result);
        if (at >= 0) return startIndex + at - (this.loadedItemsStartIndex + j);
      }
    }
    return countDelta > 0 ? countDelta : 0;
  }

  private indexInResult(item: TItem, result: LoadResult<TItem>): number {
    for (let i = 0; i < result.items.length; i++) {
      if (this.itemComparer(item, result.items[i] as TItem)) return i;
    }
    return -1;
  }

  /** The provider's result as a materialized list (Blazor enumerates it once). */
  private normalize(result: VirtualizeItemsProviderResult<TItem>): LoadResult<TItem> {
    const items = result.items === undefined ? [] : Array.isArray(result.items) ? (result.items as TItem[]) : [...result.items];
    return { items, totalItemCount: result.totalItemCount ?? this.itemCount };
  }

  /** Blazor's AdjustProviderForPrependAsync: moves the window with the shift, from the look-ahead rows if they cover it. */
  private async adjustProviderForShift(
    shift: number,
    result: LoadResult<TItem>,
    request: VirtualizeItemsProviderRequest,
    signal: AbortSignal,
  ): Promise<LoadResult<TItem>> {
    const wasAtTop = this.itemsBefore === 0;
    const adjustedItemsBefore = Math.max(
      0,
      Math.min(this.itemsBefore + shift, Math.max(0, result.totalItemCount - this.visibleItemCapacity)),
    );
    const adjustedItemCount = Math.min(this.visibleItemCapacity, result.totalItemCount - adjustedItemsBefore);
    const prefetched =
      request.startIndex <= adjustedItemsBefore
        ? result.items.slice(adjustedItemsBefore - request.startIndex, adjustedItemsBefore - request.startIndex + adjustedItemCount)
        : [];
    const adjusted =
      prefetched.length === adjustedItemCount
        ? { items: prefetched, totalItemCount: result.totalItemCount }
        : this.normalize(await this.itemsProvider!({ startIndex: adjustedItemsBefore, count: this.visibleItemCapacity, signal }));
    throwIfAborted(signal);
    // Without native scroll anchoring, take the snapshot now: the restore runs after the shifted render.
    this.viewport?.prepareShift();
    this.itemsBefore = adjustedItemsBefore;
    this.pendingAnchorRestore = true;
    this.deferAnchorRestoreClear = !wasAtTop;
    return adjusted;
  }

  /**
   * Tsazor (A14): whether the coming render turns rendered placeholders into rows in place: the same window,
   * no shift, no scroll of our own, no edge to follow. Blazor leaves this to the browser's scroll anchoring,
   * which loses its anchor when that is a placeholder, so the top row jumped by the height difference above it.
   */
  private replacesRenderedPlaceholders(): boolean {
    const viewport = this.viewport;
    return (
      viewport !== undefined &&
      this.lastRenderedPlaceholderCount > 0 &&
      this.renderedItemsBefore === this.itemsBefore &&
      !this.pendingAnchorRestore &&
      !this.pendingScrollToBottom &&
      this.currentScrollController === undefined &&
      !this.initialIndex.isPositioning &&
      !viewport.isFollowingTop() &&
      !viewport.isFollowingBottom()
    );
  }

  /** Items appended near the end in a mode without End: restore the anchor, so the viewport doesn't chase them. */
  private shouldAnchorForAppend(countDelta: number, previousItemCount: number): boolean {
    return (
      countDelta > 0 &&
      countDelta < previousItemCount &&
      (this.anchorMode & VirtualizeAnchorMode.End) === 0 &&
      this.itemsBefore + this.visibleItemCapacity >= previousItemCount
    );
  }

  private shouldScrollToBottomForAppend(countDelta: number, previousItemCount: number): boolean {
    return countDelta > 0 && (this.anchorMode & VirtualizeAnchorMode.End) !== 0 && previousItemCount <= this.visibleItemCapacity;
  }

  private shouldFollowPrependedHead(): boolean {
    if ((this.anchorMode & VirtualizeAnchorMode.Start) === 0 || this.itemsBefore !== 0 || this.viewport === undefined) return false;
    return this.viewport.isFollowingTop();
  }

  private shouldFollowAppendedTail(previousItemCount: number): boolean {
    if (
      (this.anchorMode & VirtualizeAnchorMode.End) === 0 ||
      this.visibleItemCapacity <= 0 ||
      this.itemsBefore + this.visibleItemCapacity < previousItemCount ||
      this.viewport === undefined
    ) {
      return false;
    }
    return this.viewport.isFollowingBottom();
  }

  /**
   * Moves the window to the appended tail, from the look-ahead rows when they cover it (one more request for
   * a large burst). The new window is published only with its rows, so no render combines it with old data.
   */
  private async advanceWindowToAppendedTail(
    result: LoadResult<TItem>,
    request: VirtualizeItemsProviderRequest,
    signal: AbortSignal,
  ): Promise<{ result: LoadResult<TItem>; request: VirtualizeItemsProviderRequest }> {
    const tailItemsBefore = Math.max(0, result.totalItemCount - this.visibleItemCapacity);
    if (tailItemsBefore !== this.itemsBefore) {
      const tailItemCount = Math.min(this.visibleItemCapacity, result.totalItemCount - tailItemsBefore);
      const prefetchedTail =
        request.startIndex <= tailItemsBefore
          ? result.items.slice(tailItemsBefore - request.startIndex, tailItemsBefore - request.startIndex + tailItemCount)
          : [];
      request = { startIndex: tailItemsBefore, count: this.visibleItemCapacity, signal };
      result =
        prefetchedTail.length === tailItemCount
          ? { items: prefetchedTail, totalItemCount: result.totalItemCount }
          : this.normalize(await this.itemsProvider!(request));
      throwIfAborted(signal);
      this.itemsBefore = tailItemsBefore;
    }
    throwIfAborted(signal);
    this.pendingScrollToBottom = true;
    return { result, request };
  }

  /** A failed load: the next render throws it (to an error boundary); a waiting scrollToItemAsync rejects with it. */
  private failRefresh(error: unknown): void {
    this.refreshError = { error };
    this.nextRender?.reject(error);
    this.stateHasChanged();
  }

  /** Work waitUntilIdle (and a held navigation) waits for. */
  private track<T>(promise: Promise<T>): Promise<T> {
    componentInternals.renderHandle(this)?.track?.(promise);
    return promise;
  }

  /** Aborts the load and any scroll in flight, and stops observing the viewport. */
  dispose(): void {
    this.disposed = true;
    this.refreshController?.abort();
    this.currentScrollController?.abort();
    this.nextRender?.reject(abortError());
    this.viewport?.dispose();
    this.viewport = undefined;
  }
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
