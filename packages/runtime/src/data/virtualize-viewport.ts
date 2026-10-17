/**
 * The DOM half of Virtualize: Blazor 11's `Virtualize.ts` (the JS module its component calls through interop),
 * as one object the component calls directly. It observes the spacers, measures the rendered rows, keeps the
 * viewport anchored while rows change, follows an edge (AnchorMode), and tells the component which spacer
 * came into view and why. See docs/blazor-virtualize-net11.md §4 and §6.
 *
 * What Blazor needs only for the .NET↔JS boundary is left out: the spacer heights arrive with the render
 * (Tsazor's renderer writes `style` through the CSSOM under strictCsp), so there are no data attributes and
 * no MutationObserver; the "restore on the next mutation" runs in `afterRender`, right after the DOM patch.
 */

/** Blazor's SpacerVisibilityReason: why a spacer reports. */
export enum SpacerVisibilityReason {
  /** The user scrolled (scroll events, wheel, touch, a pointer drag, scroll keys). */
  UserScroll = 0,
  /** The component's own scroll (align to an item, restore an anchor): ignored by the window logic. */
  ProgrammaticScroll = 1,
  /** Nothing user-driven: the first fill, a spacer visible at rest, a resize. */
  ViewportFill = 2,
  /** A measurement of the rendered rows during InitialItemIndex positioning; moves nothing. */
  RenderedContentMeasurement = 3,
}

/** Blazor's ViewportFillDirection: which side of the viewport still shows a spacer after an alignment. */
export enum ViewportFillDirection {
  Covered = 0,
  Before = 1,
  After = 2,
}

/** What the viewport calls on the component (Blazor's IVirtualizeJsCallbacks). */
export interface VirtualizeViewportCallbacks {
  spacerBeforeVisible(spacerSize: number, spacerSeparation: number, containerSize: number, reason: SpacerVisibilityReason): void;
  spacerAfterVisible(spacerSize: number, spacerSeparation: number, containerSize: number, reason: SpacerVisibilityReason): void;
  /** Whether a scrollToItemAsync is in flight (Tsazor, A13: user input then makes the spacers report again). */
  isScrollToItemPending(): boolean;
}

/** What the component calls on the viewport (Blazor's VirtualizeJsInterop). */
export interface VirtualizeViewport {
  /** Spacer styles the viewport owns (`display: table-row`, `overflow-anchor: none`), so a render keeps them. */
  readonly spacerStyle: string;
  /** Right after each render's DOM patch, before the component's own after-render steps. */
  afterRender(): void;
  /** Scrolls to the bottom when following it. */
  scrollToBottom(): void;
  /** After a render: re-observes the rows, pins an edge, corrects drift, takes a new anchor snapshot. */
  refreshObservers(isLoading: boolean): void;
  setAnchorMode(mode: number): void;
  /** After a render that shifted the rows: keeps the anchor row where it was. */
  restoreAnchor(): void;
  /** Before a shift is committed: without native scroll anchoring, the snapshot to restore after the render. */
  prepareShift(): void;
  /** Before a render that turns placeholders into rows: keeps the row at the top where it is (Tsazor, A14). */
  holdFirstVisibleRow(): void;
  /** Scrolls the row at `localIndex` of the window to the top; null when it isn't rendered. */
  alignToItem(localIndex: number): ViewportFillDirection | null;
  beginProgrammaticScroll(): void;
  isFollowingTop(): boolean;
  isFollowingBottom(): boolean;
  dispose(): void;
}

const THROTTLE_MS = 50;
/** How far outside the scroll container a spacer counts as visible (Blazor's rootMargin). */
const ROOT_MARGIN = 50;

const enum ScrollSource {
  None = 0,
  UserScroll = 1,
  AlignToItem = 2,
  RestoreSnapshot = 3,
}

interface AnchorSnapshot {
  anchorItemIndex: number;
  anchorOffset: number;
  scrollTop: number;
}

/**
 * The element whose scrolling moves the list: the nearest ancestor (from the spacer itself) whose computed
 * `overflow-y` lets it scroll, whether or not it overflows yet; null at body or html, which means the window
 * (an IntersectionObserver on a tall body would never report).
 */
function findClosestScrollContainer(element: HTMLElement | null): HTMLElement | null {
  if (!element || element === document.body || element === document.documentElement) return null;
  const { overflowY } = getComputedStyle(element);
  if (overflowY !== "visible" && overflowY !== "hidden" && overflowY !== "clip") return element;
  return findClosestScrollContainer(element.parentElement);
}

/** CSS transform, zoom or scale on the list: lengths go to the component in unscaled CSS px. */
function getScaleFactor(spacerBefore: HTMLElement, spacerAfter: HTMLElement): number {
  const el = spacerBefore.offsetHeight > 0 ? spacerBefore : spacerAfter.offsetHeight > 0 ? spacerAfter : null;
  if (!el) return 1;
  const scale = el.getBoundingClientRect().height / el.offsetHeight;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function isValidTableElement(element: HTMLElement | null): boolean {
  if (element === null) return false;
  return (
    (element instanceof HTMLTableElement && element.style.display === "") ||
    element.style.display === "table" ||
    (element instanceof HTMLTableSectionElement && element.style.display === "") ||
    element.style.display === "table-row-group"
  );
}

/** Tsazor (A10): a key typed into an editable element is text editing, not scrolling (Blazor treats it as both). */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Blazor's `init`: starts observing the two spacers. Returns undefined when the browser can't
 * (no IntersectionObserver, e.g. a test DOM) or the spacers are gone.
 */
export function createVirtualizeViewport(
  callbacks: VirtualizeViewportCallbacks,
  spacerBefore: HTMLElement,
  spacerAfter: HTMLElement,
  initialAnchorMode: number,
): VirtualizeViewport | undefined {
  if (!spacerBefore.isConnected || !spacerAfter.isConnected) return undefined;
  if (typeof IntersectionObserver !== "function" || typeof ResizeObserver !== "function") return undefined;
  let anchorMode = initialAnchorMode;

  const scrollContainer = findClosestScrollContainer(spacerBefore);
  const scrollElement = scrollContainer ?? document.documentElement;
  const isTable = isValidTableElement(spacerAfter.parentElement);

  // The scroll container takes focus (not in the tab order) so Home and End work after a click.
  if (scrollContainer && !scrollContainer.hasAttribute("tabindex")) scrollContainer.setAttribute("tabindex", "-1");
  const supportsAnchor = typeof CSS !== "undefined" && CSS.supports("overflow-anchor", "auto");
  const useNativeAnchoring = !isTable && supportsAnchor;

  const rangeBetweenSpacers = document.createRange();

  if (isTable) {
    spacerBefore.style.display = "table-row";
    spacerAfter.style.display = "table-row";
  }
  if (useNativeAnchoring) {
    // Only rendered rows anchor, never a spacer whose height Virtualize itself changes.
    spacerBefore.style.overflowAnchor = "none";
    spacerAfter.style.overflowAnchor = "none";
  } else {
    // The manual path, for tables and browsers without native anchoring.
    scrollElement.style.overflowAnchor = "none";
  }
  const spacerStyle = [isTable ? "display: table-row;" : "", useNativeAnchoring ? "overflow-anchor: none;" : ""].filter(Boolean).join(" ");

  let anchorSnapshot: AnchorSnapshot | null = null;
  let restoreOnNextRender = false;
  /**
   * Tsazor (A11): the part of a restore's scroll the browser dropped. WebKit keeps an element's scrollTop in
   * whole pixels, so `scrollTop += 41.95` lands 0.95px short, and the next snapshot would start from there:
   * over many prepends the anchored row drifts. Until the user scrolls, snapshots record the offset the
   * restore aimed for.
   */
  let anchorResidual = 0;

  const intersectionObserver = new IntersectionObserver(intersectionCallback, {
    root: scrollContainer,
    rootMargin: `${ROOT_MARGIN}px`,
  });
  intersectionObserver.observe(spacerBefore);
  intersectionObserver.observe(spacerAfter);

  const convergence = {
    top: false,
    bottom: false,
    items: new Set<Element>(),
    isConverging(): boolean {
      return this.top || this.bottom;
    },
  };

  const nativeAnchoring = {
    suspendedFor: new Set<"convergence" | "slide">(),
    suspend(reason: "convergence" | "slide"): void {
      this.suspendedFor.add(reason);
      if (useNativeAnchoring) scrollElement.style.overflowAnchor = "none";
    },
    resume(reason: "convergence" | "slide"): void {
      if (!this.suspendedFor.delete(reason)) return;
      if (useNativeAnchoring && this.suspendedFor.size === 0) scrollElement.style.overflowAnchor = "";
    },
  };

  const anchoredItems = new Map<Element, number>();
  /** Where the viewport's own last write left scrollTop (Tsazor, A16: a scroll elsewhere during a convergence is foreign). */
  let ownScrollTop = scrollElement.scrollTop;
  function setScrollTop(top: number): void {
    scrollElement.scrollTop = top;
    ownScrollTop = scrollElement.scrollTop;
  }
  let scrollTriggeredRender = false;

  const scrollActivity = {
    source: ScrollSource.None as ScrollSource,
    ignoreNext: false,
    ignoreNextScroll(): void {
      this.ignoreNext = true;
    },
    consumeIgnoreScroll(): boolean {
      if (!this.ignoreNext) return false;
      this.ignoreNext = false;
      return true;
    },
    consumeScroll(): void {
      this.source = ScrollSource.None;
    },
    clear(): void {
      this.consumeScroll();
      reobserveSpacers();
    },
  };
  const isViewportAtBottom = (): boolean =>
    scrollElement.scrollHeight <= scrollElement.clientHeight ||
    Math.abs(scrollElement.scrollTop + scrollElement.clientHeight - scrollElement.scrollHeight) < 2;
  const bottomTracking = {
    /** Whether the viewport was at the bottom as of the last render: drives the re-pin on append. */
    wasAtBottomLastRender: false,
    /** Whether the viewport reached the bottom; not set at mount, sticky across appends. */
    reached: false,
    /** Follow intent: in End mode (or after the End key) until the user scrolls away. */
    following: (anchorMode & 2) !== 0,
  };
  const topTracking = { following: (anchorMode & 1) !== 0 };
  const clearTopFollow = (): void => {
    topTracking.following = false;
  };
  const clearBottomFollow = (): void => {
    bottomTracking.following = false;
    bottomTracking.reached = false;
    bottomTracking.wasAtBottomLastRender = false;
  };
  const anchorModeIs = {
    get beginning(): boolean {
      return (anchorMode & 1) !== 0;
    },
    get end(): boolean {
      return (anchorMode & 2) !== 0;
    },
  };
  const isAtScrollTop = (): boolean => scrollElement.scrollTop < 1;
  // A scroll correction pending after a redistribution changed spacer space into rows.
  let pendingScrollCorrection = false;
  let scrollCorrectionItemIndex = 0;
  let scrollCorrectionOffset = 0;

  function reobserveSpacers(): void {
    intersectionObserver.unobserve(spacerBefore);
    intersectionObserver.observe(spacerBefore);
    intersectionObserver.unobserve(spacerAfter);
    intersectionObserver.observe(spacerAfter);
  }

  function containerTop(): number {
    return scrollContainer ? scrollContainer.getBoundingClientRect().top : 0;
  }

  /** At the start of a scrollToItemAsync, before the alignment scroll. */
  function beginProgrammaticScroll(): void {
    stopConvergenceObserving();
    clearTopFollow();
    clearBottomFollow();
    scrollActivity.source = ScrollSource.AlignToItem;
    pendingCallbacks.delete(spacerBefore);
    pendingCallbacks.delete(spacerAfter);
  }

  function getObservedHeight(entry: ResizeObserverEntry): number {
    return entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
  }

  function compensateScrollForItemResizes(entries: ResizeObserverEntry[]): void {
    let scrollDelta = 0;
    const top = containerTop();
    for (const entry of entries) {
      if (entry.target === spacerBefore || entry.target === spacerAfter || entry.target === scrollContainer) continue;
      if (!entry.target.isConnected) continue;
      const el = entry.target as HTMLElement;
      const oldHeight = anchoredItems.get(el);
      const newHeight = getObservedHeight(entry);
      anchoredItems.set(el, newHeight);
      if (oldHeight !== undefined && oldHeight !== newHeight && el.getBoundingClientRect().top < top) {
        scrollDelta += newHeight - oldHeight;
      }
    }
    if (scrollDelta !== 0 && scrollElement.scrollTop > 0) setScrollTop(scrollElement.scrollTop + scrollDelta);
  }

  // The ResizeObserver's roles:
  //  1. a spacer resized: re-trigger the IntersectionObserver, which doesn't report an element again that is
  //     already visible;
  //  2. convergence: keep the scroll position pinned to the edge while rows load;
  //  3. the manual path: adjust scrollTop when rows above the viewport resize;
  //  4. Tsazor (A8): the scroll container resized, so the window may need more or fewer rows.
  const resizeObserver = new ResizeObserver((entries) => {
    // Pin before re-observing the spacers, so the IntersectionObserver sees the pinned position.
    if (convergence.isConverging() && pinToConvergingEdge()) {
      const spacer = convergence.bottom ? spacerAfter : spacerBefore;
      if (spacer.offsetHeight === 0) stopConvergenceObserving();
    }
    let spacerResized = false;
    let containerResized = false;
    for (const entry of entries) {
      if (entry.target === spacerBefore || entry.target === spacerAfter) {
        spacerResized = true;
        const spacer = entry.target as HTMLElement;
        if (spacer.isConnected) {
          intersectionObserver.unobserve(spacer);
          intersectionObserver.observe(spacer);
        }
      } else if (entry.target === scrollContainer) {
        containerResized = true;
      }
    }
    if (containerResized && !spacerResized) reobserveSpacers();
    if (!useNativeAnchoring) {
      compensateScrollForItemResizes(entries);
      return;
    }
    if (spacerResized) nativeAnchoring.resume("slide");
  });
  resizeObserver.observe(spacerBefore);
  resizeObserver.observe(spacerAfter);
  if (scrollContainer) resizeObserver.observe(scrollContainer);
  const onWindowResize = (): void => reobserveSpacers();
  if (!scrollContainer) window.addEventListener("resize", onWindowResize, { passive: true });

  function refreshObservedElements(isLoading: boolean): void {
    resizeObserver.observe(spacerBefore);
    resizeObserver.observe(spacerAfter);

    // While converging: keep the observed rows in sync and pin the position, so it doesn't bounce back.
    if (convergence.isConverging() && pinToConvergingEdge()) {
      const currentItems = new Set<Element>();
      for (let el = spacerBefore.nextElementSibling; el && el !== spacerAfter; el = el.nextElementSibling) {
        resizeObserver.observe(el);
        currentItems.add(el);
      }
      for (const el of convergence.items) {
        if (!currentItems.has(el)) resizeObserver.unobserve(el);
      }
      convergence.items = currentItems;
      return;
    }

    // The manual path observes the rows to compensate their resizes; not after a scroll-triggered render
    // (layout interference drifts).
    if (!useNativeAnchoring && !scrollTriggeredRender) {
      const currentItems = new Set<Element>();
      for (let el = spacerBefore.nextElementSibling; el && el !== spacerAfter; el = el.nextElementSibling) {
        resizeObserver.observe(el);
        currentItems.add(el);
      }
      for (const [el] of anchoredItems) {
        if (!currentItems.has(el)) {
          resizeObserver.unobserve(el);
          anchoredItems.delete(el);
        }
      }
    }
    const wasScrollTriggered = scrollTriggeredRender;
    scrollTriggeredRender = false;
    if (!wasScrollTriggered || isLoading) nativeAnchoring.resume("slide");

    // A16: the reader scrolled up since our last write, and its scroll event hasn't come yet: take it now, so the
    // pin below doesn't overwrite it.
    if (scrolledUpSinceOwnWrite()) noteUserScroll();
    // End mode: pin new rows into view when at the bottom now, or when it was and still follows.
    if (bottomTracking.following || (anchorModeIs.end && (bottomTracking.wasAtBottomLastRender || bottomTracking.reached))) {
      setScrollTop(scrollElement.scrollHeight);
      scrollActivity.ignoreNextScroll();
      // Converge only while there are more rows to load; when all fit, the assignment above is enough.
      if (!convergence.bottom && !convergence.top && spacerAfter.offsetHeight > 0) {
        scrollActivity.clear();
        startConvergenceObserving("bottom");
      }
    }

    // Correct the drift left by spacer space turned into rows of other heights.
    if (pendingScrollCorrection) {
      let el: Element | null = spacerBefore.nextElementSibling;
      for (let i = 0; i < scrollCorrectionItemIndex && el && el !== spacerAfter; i++) el = el.nextElementSibling;
      if (el && el !== spacerAfter) {
        pendingScrollCorrection = false;
        const delta = el.getBoundingClientRect().top - containerTop() - scrollCorrectionOffset;
        if (Math.abs(delta) > 1) {
          setScrollTop(scrollElement.scrollTop + delta);
          scrollActivity.ignoreNextScroll();
        }
      }
    }
    updateAnchorSnapshot();
  }

  /** After a render that shifted the rows: puts the snapshot's row back where it was. */
  function restoreAnchorForShift(): void {
    const snapshot = anchorSnapshot;
    if (!snapshot) return;
    anchorSnapshot = null;
    if (convergence.isConverging()) return;
    // A programmatic alignment whose row wasn't rendered yet: retry it instead.
    if (pendingAlignLocalIndex !== null) {
      const pending = pendingAlignLocalIndex;
      pendingAlignLocalIndex = null;
      alignToItemAt(pending);
      return;
    }
    // Start mode at the very top: show the new rows by converging to the top.
    if (anchorModeIs.beginning && snapshot.scrollTop < 1) {
      setScrollTop(0);
      startConvergenceObserving("top");
      reobserveSpacers();
      return;
    }
    const newOffset = measureLocalChildOffset(snapshot.anchorItemIndex);
    if (Number.isNaN(newOffset)) return;
    const delta = newOffset - snapshot.anchorOffset;
    scrollActivity.source = ScrollSource.RestoreSnapshot;
    scrollActivity.ignoreNextScroll();
    if (Math.abs(delta) > 1) {
      scrollCorrectionItemIndex = snapshot.anchorItemIndex;
      pendingScrollCorrection = true;
    }
    // End mode: carry the at-bottom state forward only if the viewport is at the bottom right now.
    const preserveWasAtBottom = anchorModeIs.end && isViewportAtBottom();
    if (Math.abs(delta) > 1) {
      const target = scrollElement.scrollTop + delta;
      setScrollTop(target);
      // Only what rounding dropped; a clamp at the scroll range's end is not carried.
      const residual = target - scrollElement.scrollTop;
      anchorResidual = Math.abs(residual) < 1 ? residual : 0;
    }
    // The offset after the adjustment, for the drift correction.
    if (pendingScrollCorrection) {
      const correctedOffset = measureLocalChildOffset(snapshot.anchorItemIndex);
      if (!Number.isNaN(correctedOffset)) scrollCorrectionOffset = correctedOffset;
    }
    if (preserveWasAtBottom) bottomTracking.wasAtBottomLastRender = true;
  }

  function startConvergenceObserving(direction: "top" | "bottom"): void {
    const alreadyConverging = convergence.isConverging();
    convergence[direction] = true;
    if (alreadyConverging) return;
    nativeAnchoring.suspend("convergence");
    for (let el = spacerBefore.nextElementSibling; el && el !== spacerAfter; el = el.nextElementSibling) {
      resizeObserver.observe(el);
      convergence.items.add(el);
    }
  }

  function stopConvergenceObserving(): void {
    if (!convergence.isConverging()) return;
    convergence.top = false;
    convergence.bottom = false;
    for (const el of convergence.items) resizeObserver.unobserve(el);
    convergence.items.clear();
    nativeAnchoring.resume("convergence");
    anchoredItems.clear();
    // A fresh snapshot, so the next restore has valid data.
    updateAnchorSnapshot();
  }

  let pendingJumpToEnd = false;
  let pendingJumpToStart = false;

  function handleUserScrollInput(): void {
    anchorResidual = 0;
    const selfScrollInProgress = scrollActivity.source === ScrollSource.AlignToItem || scrollActivity.source === ScrollSource.RestoreSnapshot;
    scrollActivity.consumeIgnoreScroll();
    scrollActivity.source = ScrollSource.UserScroll;
    // Tsazor (A13): also while a scrollToItemAsync waits for its rows. Its window renders as placeholders, and a
    // scroll inside the tall before spacer crosses no threshold, so without a fresh report the user's scroll
    // never cancels the fetch. Blazor re-observes only during the alignment scroll (its test is quarantined).
    if (selfScrollInProgress || callbacks.isScrollToItemPending()) reobserveSpacers();
  }

  function handleUserPointerMove(e: Event): void {
    if ((e as PointerEvent).buttons !== 0) handleUserScrollInput();
  }

  const userScrollKeys = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", " "]);
  const keydownTarget: EventTarget = scrollContainer ?? document;
  function handleJumpKeys(e: Event): void {
    const ke = e as KeyboardEvent;
    // Tsazor (A17): a key a widget already handled (a tab list's or a listbox's Home, through roving focus) is the
    // widget's, not a jump: the listener sits on the container, or on the document with window scrolling.
    if (ke.defaultPrevented || isEditable(ke.target)) return;
    if (ke.key === "End") {
      // Tsazor (A12): the jump is the convergence's, not the UA's: preventDefault, because the key's own
      // smooth scroll would be counted as a user scroll (A16) and end the convergence the key just started —
      // an End pressed over a Home's still-running animation included. The convergence does the jumping.
      ke.preventDefault();
      if (convergence.top) stopConvergenceObserving();
      scrollActivity.source = ScrollSource.UserScroll;
      reobserveSpacers();
      clearTopFollow();
      pendingJumpToEnd = true;
      pendingJumpToStart = false;
      if (!anchorModeIs.end) {
        bottomTracking.following = true;
        bottomTracking.reached = true;
      }
      startConvergenceObserving("bottom");
      if (spacerAfter.offsetHeight > 0) {
        scrollActivity.ignoreNextScroll();
        setScrollTop(scrollElement.scrollHeight);
      }
    } else if (ke.key === "Home") {
      // Same as the End branch: the key's smooth UA scroll is not asked for.
      ke.preventDefault();
      if (convergence.bottom) stopConvergenceObserving();
      scrollActivity.source = ScrollSource.UserScroll;
      reobserveSpacers();
      topTracking.following = true;
      pendingJumpToStart = true;
      pendingJumpToEnd = false;
      clearBottomFollow();
      // The jump moves on its own scroll: the spacers' IO reports follow from the scroll event.
      startConvergenceObserving("top");
      scrollActivity.ignoreNextScroll();
      setScrollTop(0);
    } else if (userScrollKeys.has(ke.key)) {
      handleUserScrollInput();
    }
  }

  const scrollEventTarget: EventTarget = scrollContainer ?? window;

  function handleScroll(): void {
    // Tsazor (A16): a scroll the viewport didn't make is never swallowed. Blazor ignores every scroll while
    // converging, and the next one after a write flagged "ignore next scroll"; a write that doesn't move scrollTop
    // (at the bottom already) fires no event, so the flag stayed and ate the reader's scroll. A live feed (End
    // mode, an append every few hundred ms) then pulled the reader back to the bottom in Firefox and Safari.
    if (convergence.isConverging()) {
      // A scroll away from the edge ends the convergence and counts as a user scroll.
      if (!scrolledAwayFromConvergingEdge()) return;
      stopConvergenceObserving();
      scrollActivity.consumeIgnoreScroll();
    } else if (scrollActivity.consumeIgnoreScroll() && Math.abs(scrollElement.scrollTop - ownScrollTop) <= 1) {
      // The scroll of our own last write.
      return;
    }
    const selfScrollInProgress = scrollActivity.source === ScrollSource.AlignToItem || scrollActivity.source === ScrollSource.RestoreSnapshot;
    if (selfScrollInProgress) return;
    noteUserScroll();
  }

  /** A user scroll: the only thing that sets the follow state. */
  function noteUserScroll(): void {
    scrollActivity.source = ScrollSource.UserScroll;
    anchorResidual = 0;
    if (anchorModeIs.beginning || topTracking.following) topTracking.following = isAtScrollTop();
    if (anchorModeIs.end || bottomTracking.following) {
      const atBottom = isViewportAtBottom();
      bottomTracking.following = atBottom;
      bottomTracking.reached = atBottom;
    }
    updateAnchorSnapshot();
  }

  /**
   * Whether scrollTop moved away from the converging edge since the viewport's own last write. Layout changes don't
   * do that: rows growing below leave scrollTop alone, a shrink clamps it to the bottom, and native anchoring is
   * suspended while converging.
   */
  function scrolledAwayFromConvergingEdge(): boolean {
    return convergence.bottom ? scrolledUpSinceOwnWrite() : scrollElement.scrollTop > ownScrollTop + 1;
  }

  function scrolledUpSinceOwnWrite(): boolean {
    return scrollElement.scrollTop < ownScrollTop - 1 && !isViewportAtBottom();
  }

  /**
   * While converging: pins the edge again, unless the reader or the app scrolled away from it since our last write
   * (A16). The scroll event may come only after this pin (in Chromium the ResizeObserver runs first), so the pin
   * checks too: it ends the convergence and takes the scroll as the user's. False when it ended the convergence.
   */
  function pinToConvergingEdge(): boolean {
    if (scrolledAwayFromConvergingEdge()) {
      stopConvergenceObserving();
      noteUserScroll();
      return false;
    }
    setScrollTop(convergence.bottom ? scrollElement.scrollHeight : 0);
    return true;
  }

  keydownTarget.addEventListener("keydown", handleJumpKeys);
  scrollEventTarget.addEventListener("wheel", handleUserScrollInput, { passive: true });
  scrollEventTarget.addEventListener("touchmove", handleUserScrollInput, { passive: true });
  scrollEventTarget.addEventListener("pointermove", handleUserPointerMove, { passive: true });
  scrollEventTarget.addEventListener("scroll", handleScroll, { passive: true });

  const pendingCallbacks = new Map<Element, IntersectionObserverEntry>();
  let callbackTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingAlignLocalIndex: number | null = null;
  let disposed = false;

  /** The top of the window's row at `localIndex`, relative to the scroll container; NaN when it isn't rendered. */
  function measureLocalChildOffset(localIndex: number): number {
    let el: Element | null = spacerBefore.nextElementSibling;
    for (let i = 0; i < localIndex && el && el !== spacerAfter; i++) el = el.nextElementSibling;
    if (!el || el === spacerAfter) return Number.NaN;
    const top = scrollElement === document.documentElement ? 0 : scrollElement.getBoundingClientRect().top;
    return el.getBoundingClientRect().top - top;
  }

  function reportRenderedContentMeasurement(): void {
    const scaleFactor = getScaleFactor(spacerBefore, spacerAfter);
    rangeBetweenSpacers.setStartAfter(spacerBefore);
    rangeBetweenSpacers.setEndBefore(spacerAfter);
    const spacerSeparation = rangeBetweenSpacers.getBoundingClientRect().height / scaleFactor;
    const containerSize = scrollElement.getBoundingClientRect().height / scaleFactor;
    callbacks.spacerBeforeVisible(0, spacerSeparation, containerSize, SpacerVisibilityReason.RenderedContentMeasurement);
  }

  /** Measures the row's top and scrolls it to the container's top. */
  function alignToItemAt(localIndex: number): ViewportFillDirection | null {
    function beginAlign(): void {
      anchorResidual = 0;
      scrollActivity.ignoreNextScroll();
      scrollActivity.source = ScrollSource.AlignToItem;
      anchorSnapshot = null;
      stopConvergenceObserving();
    }
    const delta = measureLocalChildOffset(localIndex);
    if (Number.isNaN(delta)) {
      // The row isn't in the rendered window (yet).
      pendingAlignLocalIndex = localIndex;
      beginAlign();
      return null;
    }
    pendingAlignLocalIndex = null;
    reportRenderedContentMeasurement();
    if (Math.abs(delta) > 0.5) {
      beginAlign();
      pendingJumpToStart = false;
      pendingJumpToEnd = false;
      scrollElement.scrollTo({ top: scrollElement.scrollTop + delta, behavior: "instant" });
      ownScrollTop = scrollElement.scrollTop;
    }
    return getViewportFillDirection();
  }

  function getViewportBounds(scaleFactor: number): { top: number; bottom: number } {
    let viewportTop = 0;
    let viewportBottom = document.documentElement.clientHeight;
    if (scrollContainer) {
      const rect = scrollContainer.getBoundingClientRect();
      viewportTop = rect.top + scrollContainer.clientTop * scaleFactor;
      viewportBottom = viewportTop + scrollContainer.clientHeight * scaleFactor;
    }
    return { top: viewportTop, bottom: viewportBottom };
  }

  function occupiesViewport(spacer: HTMLElement, viewport: { top: number; bottom: number }): boolean {
    const rect = spacer.getBoundingClientRect();
    return Math.min(rect.bottom, viewport.bottom) > Math.max(rect.top, viewport.top);
  }

  function getViewportFillDirection(): ViewportFillDirection {
    const viewport = getViewportBounds(getScaleFactor(spacerBefore, spacerAfter));
    if (occupiesViewport(spacerBefore, viewport)) return ViewportFillDirection.Before;
    if (occupiesViewport(spacerAfter, viewport)) return ViewportFillDirection.After;
    return ViewportFillDirection.Covered;
  }

  function flushPendingCallbacks(): void {
    if (pendingCallbacks.size === 0) return;
    const entries = [...pendingCallbacks.values()];
    pendingCallbacks.clear();
    processIntersectionEntries(entries);
  }

  /** Leading and trailing throttle: the latest entry per spacer, at most every 50 ms. */
  function intersectionCallback(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) pendingCallbacks.set(entry.target, entry);
    if (!callbackTimeout) {
      flushPendingCallbacks();
      callbackTimeout = setTimeout(() => {
        callbackTimeout = null;
        flushPendingCallbacks();
      }, THROTTLE_MS);
    }
  }

  function updateBottomConvergence(userScrolled: boolean): void {
    if (spacerAfter.offsetHeight === 0) {
      if (convergence.bottom) stopConvergenceObserving();
      return;
    }
    if (convergence.bottom) return;
    // The End key always converges; data-driven convergence only in End mode or after a user scroll.
    if (pendingJumpToEnd) {
      startConvergenceObserving("bottom");
      setScrollTop(scrollElement.scrollHeight);
      pendingJumpToEnd = false;
      return;
    }
    if (!anchorModeIs.end && !userScrolled) return;
    const atBottom = scrollElement.scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - 1;
    if (!atBottom) return;
    startConvergenceObserving("bottom");
  }

  function updateTopConvergence(): void {
    if (spacerBefore.offsetHeight === 0) {
      if (convergence.top) stopConvergenceObserving();
      return;
    }
    if (convergence.top) return;
    // The Home key always converges; data-driven convergence only in Start mode.
    if (pendingJumpToStart) {
      startConvergenceObserving("top");
      setScrollTop(0);
      pendingJumpToStart = false;
      return;
    }
    if (!anchorModeIs.beginning) return;
    if (!isAtScrollTop()) return;
    startConvergenceObserving("top");
  }

  /** Notes the first visible row: its index in the window and its offset from the container's top. */
  function updateAnchorSnapshot(): void {
    bottomTracking.wasAtBottomLastRender = isViewportAtBottom();
    const top = containerTop();
    let anchorItemIndex = 0;
    for (let el = spacerBefore.nextElementSibling; el && el !== spacerAfter; el = el.nextElementSibling) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > top) {
        const nativeAnchoringUnavailable = !useNativeAnchoring || (scrollContainer !== null && isAtScrollTop());
        // Keep the pre-shift snapshot where the browser doesn't anchor: the row already sits more than its
        // own height below the top, moved by a prepend not restored yet (not while converging to the top).
        const modePinsTopItem = !anchorModeIs.beginning || !convergence.top;
        const itemAlreadyShifted = rect.top - top > rect.height;
        if (nativeAnchoringUnavailable && modePinsTopItem && anchorSnapshot && itemAlreadyShifted) return;
        anchorSnapshot = { anchorItemIndex, anchorOffset: rect.top - top - anchorResidual, scrollTop: scrollElement.scrollTop };
        return;
      }
      anchorItemIndex++;
    }
    anchorSnapshot = null;
  }

  function processIntersectionEntries(entries: IntersectionObserverEntry[]): void {
    // The spacers are gone when the component was disposed.
    if (disposed || !spacerBefore.isConnected || !spacerAfter.isConnected) return;
    const source = scrollActivity.source;
    // An ongoing scroll sets UserScroll again on every tick; consuming it keeps the status from going stale.
    if (source === ScrollSource.UserScroll) scrollActivity.consumeScroll();
    // A fresh snapshot on every report, not while a self scroll settles (its reports carry stale data).
    const isSelfScroll = source === ScrollSource.AlignToItem || source === ScrollSource.RestoreSnapshot;
    if (!isSelfScroll) updateAnchorSnapshot();

    const bothSpacersIntersect =
      entries.some((entry) => entry.target === spacerBefore && entry.isIntersecting) &&
      entries.some((entry) => entry.target === spacerAfter && entry.isIntersecting);

    const intersectingEntries = entries.filter((entry) => {
      // Both visible: only the before spacer reports, so the reports don't conflict.
      if (bothSpacersIntersect && entry.target === spacerAfter) return false;
      if (entry.isIntersecting) {
        // Converging to an edge must not fight a self scroll.
        if (!isSelfScroll) {
          if (entry.target === spacerAfter) updateBottomConvergence(source === ScrollSource.UserScroll);
          else if (entry.target === spacerBefore) updateTopConvergence();
        }
        return true;
      }
      if (entry.target === spacerAfter && convergence.bottom && spacerAfter.offsetHeight > 0) {
        pinToConvergingEdge();
      } else if (entry.target === spacerBefore && convergence.top && spacerBefore.offsetHeight > 0) {
        pinToConvergingEdge();
      }
      return false;
    });

    if (intersectingEntries.length === 0) {
      if (source === ScrollSource.AlignToItem) scrollActivity.clear();
      return;
    }

    const scaleFactor = getScaleFactor(spacerBefore, spacerAfter);
    rangeBetweenSpacers.setStartAfter(spacerBefore);
    rangeBetweenSpacers.setEndBefore(spacerAfter);
    const spacerSeparation = rangeBetweenSpacers.getBoundingClientRect().height / scaleFactor;

    for (const entry of intersectingEntries) {
      const containerSize = (entry.rootBounds?.height ?? 0) / scaleFactor;
      const reason =
        source === ScrollSource.UserScroll
          ? SpacerVisibilityReason.UserScroll
          : isSelfScroll && (entry.target === spacerBefore || source === ScrollSource.RestoreSnapshot)
            ? SpacerVisibilityReason.ProgrammaticScroll
            : SpacerVisibilityReason.ViewportFill;
      const isBefore = entry.target === spacerBefore;
      const spacer = isBefore ? spacerBefore : spacerAfter;
      if (!isBefore && spacer.offsetHeight === 0) continue;
      // The component ignores programmatic reports: no redistribution, no render.
      if (reason !== SpacerVisibilityReason.ProgrammaticScroll) {
        // So refreshObservers can skip observing the rows (layout interference drifts).
        scrollTriggeredRender = true;
        if (spacer.offsetHeight > 0) nativeAnchoring.suspend("slide");
      }
      const spacerSize = isBefore
        ? (entry.intersectionRect.top - entry.boundingClientRect.top) / scaleFactor
        : (entry.boundingClientRect.bottom - entry.intersectionRect.bottom) / scaleFactor;
      if (isBefore) callbacks.spacerBeforeVisible(spacerSize, spacerSeparation, containerSize, reason);
      else callbacks.spacerAfterVisible(spacerSize, spacerSeparation, containerSize, reason);
      if (disposed) return;
    }
    if (source === ScrollSource.AlignToItem) scrollActivity.clear();
  }

  return {
    spacerStyle,
    afterRender(): void {
      if (restoreOnNextRender) {
        restoreOnNextRender = false;
        restoreAnchorForShift();
      }
    },
    scrollToBottom(): void {
      if (!bottomTracking.following) return;
      setScrollTop(scrollElement.scrollHeight);
      startConvergenceObserving("bottom");
    },
    refreshObservers: refreshObservedElements,
    setAnchorMode(mode: number): void {
      anchorMode = mode;
      topTracking.following = (mode & 1) !== 0 && isAtScrollTop();
      bottomTracking.following = (mode & 2) !== 0;
      bottomTracking.reached = isViewportAtBottom();
    },
    restoreAnchor(): void {
      restoreOnNextRender = false;
      restoreAnchorForShift();
    },
    holdFirstVisibleRow(): void {
      // Rows replacing placeholders above the viewport have their own heights. The browser's anchor was a
      // placeholder the render removes, so it compensates nothing: the drift correction after the render does.
      if (convergence.isConverging()) return;
      const top = containerTop();
      let localIndex = 0;
      for (let el = spacerBefore.nextElementSibling; el && el !== spacerAfter; el = el.nextElementSibling, localIndex++) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom > top) {
          scrollCorrectionItemIndex = localIndex;
          scrollCorrectionOffset = rect.top - top;
          pendingScrollCorrection = true;
          return;
        }
      }
    },
    prepareShift(): void {
      // With native anchoring the browser keeps the rows in place by itself.
      if (useNativeAnchoring) return;
      updateAnchorSnapshot();
      restoreOnNextRender = true;
    },
    alignToItem: alignToItemAt,
    beginProgrammaticScroll,
    isFollowingTop: () => topTracking.following,
    isFollowingBottom: () => bottomTracking.following,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      intersectionObserver.disconnect();
      stopConvergenceObserving();
      anchoredItems.clear();
      resizeObserver.disconnect();
      keydownTarget.removeEventListener("keydown", handleJumpKeys);
      scrollEventTarget.removeEventListener("wheel", handleUserScrollInput);
      scrollEventTarget.removeEventListener("touchmove", handleUserScrollInput);
      scrollEventTarget.removeEventListener("pointermove", handleUserPointerMove);
      scrollEventTarget.removeEventListener("scroll", handleScroll);
      if (!scrollContainer) window.removeEventListener("resize", onWindowResize);
      if (callbackTimeout) {
        clearTimeout(callbackTimeout);
        callbackTimeout = null;
      }
      pendingCallbacks.clear();
    },
  };
}
