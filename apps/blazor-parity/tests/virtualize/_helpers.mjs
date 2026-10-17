/**
 * The private helpers of Blazor's VirtualizationTest.cs, ported one by one (same names in camelCase, same
 * waits and tolerances). Where a helper takes Selenium's `IWebElement container`, it takes a Playwright
 * locator. Line numbers refer to VirtualizationTest.cs.
 *
 * Scroll metrics: Selenium hands Chrome's whole-pixel scroll positions to `(long)` casts; other engines may
 * report fractions, so the ported reads round them, as Blazor's own GetScrollTop (:6125) does.
 */
import {
  assert,
  AssertionError,
  byId,
  DEFAULT_TIMEOUT,
  exists,
  SELENIUM_POLL,
  sendKey,
  textOf,
  waitContains,
  waitTrue,
  wheel,
} from "../lib/harness.mjs";

/** GetElementCount(container, cssSelector) (:39). */
export function count(container, selector) {
  return container.locator(selector).count();
}

/** Reads one scroll metric of an element, rounded (see the module comment). */
export function metric(container, name) {
  return container.evaluate((el, key) => Math.round(el[key]), name);
}

/** GetScrollTop (:6125). */
export const getScrollTop = (container) => metric(container, "scrollTop");

/** The spacer's reserved height. Blazor reads `data-blazor-virtualize-reserved-height`; Tsazor's spacers carry only their inline height. */
export function reservedHeight(spacer) {
  return spacer.evaluate((el) => Number.parseFloat(el.style.height));
}

/** GetPeopleNames (:846). */
export async function getPeopleNames(container) {
  const spans = container.locator(".person span");
  return (await spans.allInnerTexts()).map((text) => text.trim());
}

/** ScrollTopToEnd / ScrollTopToBeginning / ScrollLeftToEnd (:852-868). */
export const scrollTopToEnd = (container) => container.evaluate((el) => { el.scrollTop = el.scrollHeight; });
export const scrollTopToBeginning = (container) => container.evaluate((el) => { el.scrollTop = 0; });
export const scrollLeftToEnd = (container) => container.evaluate((el) => { el.scrollLeft = el.scrollWidth; });

/** ScrollContainer (:3254): a scrollTop assignment plus a dispatched `scroll` event (a user scroll for Virtualize). */
export function scrollContainer(container, scrollTop) {
  return container.evaluate((el, top) => {
    el.scrollTop = top;
    el.dispatchEvent(new Event("scroll"));
  }, scrollTop);
}

/** ScrollContainerWithWheelTo (:3263): real wheel input by the distance to `scrollTop`. */
export async function scrollContainerWithWheelTo(page, container, scrollTop) {
  const deltaY = scrollTop - (await getScrollTop(container));
  await wheel(page, container, deltaY);
}

async function scrollMetrics(container) {
  return container.evaluate((el) => ({
    st: Math.round(el.scrollTop),
    sh: Math.round(el.scrollHeight),
    ch: Math.round(el.clientHeight),
  }));
}

function describe(m) {
  return `scrollTop=${m.st}, scrollHeight=${m.sh}, clientHeight=${m.ch}, maxScrollTop=${m.sh - m.ch}`;
}

/** AssertScrollTop (:3270): waits until `condition(scrollTop)`. */
export async function assertScrollTop(container, condition, expectation) {
  let m = { st: 0, sh: 0, ch: 0 };
  await waitTrue(
    async () => {
      m = await scrollMetrics(container);
      return condition(m.st);
    },
    { message: () => `Scroll assertion failed: expected ${expectation}, but ${describe(m)}` },
  );
}

/** AssertAtBottom (:3307). */
export async function assertAtBottom(container, expectation) {
  let m = { st: 0, sh: 0, ch: 0 };
  await waitTrue(
    async () => {
      m = await scrollMetrics(container);
      return m.sh - m.st - m.ch < 2;
    },
    { timeout: 10_000, message: () => `Scroll assertion failed: expected ${expectation}, but ${describe(m)}` },
  );
}

/**
 * Tsazor pins End mode to the bottom in the same task as the render that switches the mode, before the window
 * has moved to the tail: "at the bottom" already holds while Virtualize still converges there, and a scroll
 * during convergence is ignored (Blazor's JS ignores it too, Virtualize.ts:615). In Blazor the pin comes later,
 * through the after-render interop, and Selenium's round trips are slower than Playwright's: its tests scroll
 * away only after the convergence ended. The mount helpers let it end too (a settled render), or the tail
 * load pulls the list back to the bottom after the test scrolled to the top.
 */
async function letEndModeConvergenceFinish(anchorMode, container) {
  if (anchorMode === "2") await waitForRenderToSettle(container);
}

/** VerifyInitialPosition (:3291): End mode starts at the bottom, the others at the top. */
export async function verifyInitialPosition(anchorMode, container, listDescription) {
  if (anchorMode === "2") {
    await assertAtBottom(container, `${listDescription} should initially start at the bottom in End mode`);
  } else {
    await assertScrollTop(container, (st) => st < 2, `${listDescription} should initially start at the top`);
  }
}

/** ScrollUntil (:3333): repeats `scroll` until `condition(scrollTop)` (each poll scrolls, so Selenium's interval). */
export async function scrollUntil(container, scroll, condition, expectation) {
  let m = { st: 0, sh: 0, ch: 0 };
  await waitTrue(
    async () => {
      await scroll();
      m = await scrollMetrics(container);
      return condition(m.st);
    },
    { interval: SELENIUM_POLL, message: () => `Scroll assertion failed: expected ${expectation}, but ${describe(m)}` },
  );
}

/** Whether an element matching `selector` overlaps the container's box by more than 1px. */
function anyVisibleIn(container, selector) {
  return container.evaluate((c, sel) => {
    const cr = c.getBoundingClientRect();
    for (const item of c.querySelectorAll(sel)) {
      const ir = item.getBoundingClientRect();
      if (ir.bottom > cr.top + 1 && ir.top < cr.bottom - 1) return true;
    }
    return false;
  }, selector);
}

/** ScrollToBottomAndWait (:3355). */
export async function scrollToBottomAndWait(container, visibleItemSelector = ".item[data-index]") {
  await waitTrue(
    async () => {
      const sh = await metric(container, "scrollHeight");
      await scrollContainer(container, sh);
      const st = await metric(container, "scrollTop");
      const ch = await metric(container, "clientHeight");
      return sh - st - ch < 2;
    },
    { timeout: 10_000, interval: SELENIUM_POLL },
  );

  // Wait for Virtualize to render actual items visible in the viewport.
  await waitTrue(() => anyVisibleIn(container, visibleItemSelector), {
    timeout: 5_000,
    message: "Visible items should be rendered after scrolling to bottom",
  });
}

/** ScrollToTopAndWaitForRender (:3388). */
export async function scrollToTopAndWaitForRender(container) {
  await scrollUntil(container, () => scrollContainer(container, 0), (st) => st < 2, "scrollTop < 2 after ScrollContainer(0)");

  await waitTrue(
    async () => {
      await scrollContainer(container, 0);
      return container.evaluate((c) => {
        const item = c.querySelector('.item[data-index="0"]');
        if (!item || c.scrollTop >= 2) return false;
        const cr = c.getBoundingClientRect();
        const ir = item.getBoundingClientRect();
        return ir.bottom > cr.top + 1 && ir.top < cr.bottom - 1;
      });
    },
    { timeout: 10_000, interval: SELENIUM_POLL, message: "Item 0 should be visible after scrolling to the top" },
  );

  await waitForRenderToSettle(container);
  await assertScrollTop(container, (st) => st < 2, "list should remain at the top after rendering settles");
}

/** ScrollMidListAndWaitForRender (:3411): scrollTop between 4000 and 6000, an item with index > 20 visible. */
export async function scrollMidListAndWaitForRender(container) {
  await scrollUntil(container, () => scrollContainer(container, 5000), (st) => st > 4000 && st < 6000, "4000 < scrollTop < 6000 after ScrollContainer(5000)");
  // Wait for Virtualize to render items at the new scroll position.
  await waitTrue(
    async () => {
      const scrollTop = await getScrollTop(container);
      if (scrollTop <= 4000 || scrollTop >= 6000) {
        await scrollContainer(container, 5000);
        return false;
      }
      return container.evaluate((c) => {
        const containerRect = c.getBoundingClientRect();
        for (const item of c.querySelectorAll(".item[data-index]")) {
          const idx = Number.parseInt(item.getAttribute("data-index"), 10);
          const itemRect = item.getBoundingClientRect();
          if (!Number.isNaN(idx) && idx > 20 && itemRect.bottom > containerRect.top + 1 && itemRect.top < containerRect.bottom - 1) {
            return true;
          }
        }
        return false;
      });
    },
    { interval: SELENIUM_POLL },
  );
}

/** ScrollNearTopAndWaitForRender (:3544). */
export async function scrollNearTopAndWaitForRender(container) {
  await scrollToTopAndWaitForRender(container);
  await scrollContainer(container, 200);
  await assertScrollTop(container, (st) => st >= 150, "scrollTop >= 150 after ScrollContainer(200)");
  await waitTrue(async () => (await count(container, ".item[data-index]")) > 0);
}

/**
 * GetItemPositionInContainer (:5168): the item with `dataIndex`, or else the first one overlapping the
 * container by more than 1px; its index, top relative to the container and the container's scrollTop.
 */
export async function getItemPositionInContainer(container, itemSelector, dataIndex = null) {
  const result = await container.evaluate(
    (c, [selector, targetIndex]) => {
      const containerRect = c.getBoundingClientRect();
      for (const item of c.querySelectorAll(selector)) {
        const itemRect = item.getBoundingClientRect();
        if (targetIndex !== null) {
          if (item.getAttribute("data-index") === targetIndex) {
            return { index: targetIndex, relTop: itemRect.top - containerRect.top, scrollTop: c.scrollTop };
          }
        } else if (itemRect.bottom > containerRect.top + 1 && itemRect.top < containerRect.bottom - 1) {
          return { index: item.getAttribute("data-index"), relTop: itemRect.top - containerRect.top, scrollTop: c.scrollTop };
        }
      }
      return null;
    },
    [itemSelector, dataIndex],
  );
  if (result === null) throw new AssertionError(`GetItemPositionInContainer: no ${dataIndex === null ? "visible item" : `item ${dataIndex}`} for ${itemSelector}`);
  return { index: String(result.index), relTop: result.relTop, scrollTop: Math.round(result.scrollTop) };
}

/**
 * AssertViewportStaysStable (:5198): the first visible item is still `indexBefore`, and its top moved at
 * most `driftTolerance` px (exactly, or in whole pixels).
 */
export async function assertViewportStaysStable(page, containerSelector, itemSelector, indexBefore, relTopBefore, message, { driftTolerance = 0, compareWholePixels = false } = {}) {
  const container = await exists(page, containerSelector);
  const lastPos = await getItemPositionInContainer(container, itemSelector);
  const indexMatch = lastPos.index === indexBefore;
  const drift = compareWholePixels ? Math.abs(Math.round(lastPos.relTop) - Math.round(relTopBefore)) : Math.abs(lastPos.relTop - relTopBefore);
  assert(
    indexMatch && drift <= driftTolerance,
    `${message} (index before: ${indexBefore}, after: ${lastPos.index}, relTop before: ${relTopBefore}, after: ${lastPos.relTop}, scrollTop: ${lastPos.scrollTop}, tolerance: ${driftTolerance})`,
  );
}

/**
 * WaitForRenderToSettle (:5229): three consecutive identical polls (Selenium's 500 ms apart) of the rounded
 * scrollTop, the item count and the first visible item (and the scrollHeight); a blank viewport resets.
 */
export async function waitForRenderToSettle(container, itemSelector = ".item[data-index]", trackScrollHeight = false) {
  let last = { scrollTop: -1, scrollHeight: -1, itemCount: -1, firstIndex: "" };
  let stableCount = 0;
  await waitTrue(
    async () => {
      const result = await container.evaluate((c, selector) => {
        const items = c.querySelectorAll(selector);
        const cr = c.getBoundingClientRect();
        let firstIdx = "";
        for (const item of items) {
          const r = item.getBoundingClientRect();
          if (r.bottom > cr.top + 2 && r.top < cr.bottom - 2) {
            firstIdx = item.getAttribute("data-index") || item.textContent;
            break;
          }
        }
        return { scrollTop: Math.round(c.scrollTop), scrollHeight: c.scrollHeight, itemCount: items.length, firstIndex: firstIdx };
      }, itemSelector);

      if (!result.firstIndex) {
        // A blank viewport (only spacers visible) is a transient state while the anchor restore is in
        // flight, not a settled render.
        stableCount = 0;
      } else if (
        result.scrollTop === last.scrollTop &&
        (!trackScrollHeight || result.scrollHeight === last.scrollHeight) &&
        result.itemCount === last.itemCount &&
        result.firstIndex === last.firstIndex
      ) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      last = result;
      return stableCount >= 3;
    },
    { timeout: 15_000, interval: SELENIUM_POLL, message: "Render cycle did not settle in time" },
  );
}

/** WaitForScrollStabilization (:1042): scrollTop changed by less than 1px between two polls. */
export async function waitForScrollStabilization(container) {
  let lastScrollTop = -1;
  await waitTrue(
    async () => {
      const current = await container.evaluate((el) => el.scrollTop);
      if (Math.abs(current - lastScrollTop) < 1 && lastScrollTop >= 0) return true;
      lastScrollTop = current;
      return false;
    },
    { interval: SELENIUM_POLL, message: "scrollTop did not stabilize" },
  );
}

/** ScrollToOffsetWithStabilization (:870, :890). */
export async function scrollToOffsetWithStabilization(container, targetScrollTop, itemCheck) {
  const predicate =
    typeof itemCheck === "number"
      ? async () => {
          const indexText = await container.evaluate((c) => c.querySelector(".item")?.getAttribute("data-index") ?? null);
          return indexText !== null && Number.parseInt(indexText, 10) > itemCheck;
        }
      : itemCheck;

  await container.click();
  await waitTrue(
    async () => {
      await container.evaluate((el, top) => { el.scrollTop = top; }, targetScrollTop);
      const currentScrollTop = await container.evaluate((el) => el.scrollTop);
      if (currentScrollTop + 1 < targetScrollTop) return false;
      return predicate();
    },
    { interval: SELENIUM_POLL },
  );

  await waitForScrollStabilization(container);
}

function spacerMetrics(container) {
  return container.evaluate((c) => {
    // Virtualize's spacers are the styled aria-hidden elements (spacerBefore/After carry the height in a style).
    // A bare [aria-hidden] would now also catch the grid header's decorative svgs and the sort indicator,
    // whose offsetHeight is undefined/wrong (the first QuickGrid jump to start read one of them, not a spacer).
    const isSpacerStyle = (hidden) => hidden instanceof HTMLElement && hidden.hasAttribute("style");
    const spacers = [...c.querySelectorAll("[aria-hidden]")].filter(isSpacerStyle);
    return {
      spacerAfterHeight: spacers.length >= 2 ? spacers[spacers.length - 1].offsetHeight : 999,
      spacerBeforeHeight: spacers.length >= 1 ? spacers[0].offsetHeight : 999,
      overflowAnchor: getComputedStyle(c).overflowAnchor || "N/A",
      scrollTop: c.scrollTop,
      scrollHeight: c.scrollHeight,
      clientHeight: c.clientHeight,
    };
  });
}

/**
 * The jump helpers read "placeholders?" and the spacer heights in two round trips, as Blazor's do. A render
 * can land in between: the first read still sees the old rows, the second the new window's spacer, whose
 * rows are placeholders waiting for `loadData`. Blazor's slower round trips rarely hit that window; here the
 * jump's own render often does (in WebKit especially). So a converged edge counts only if no placeholders
 * appeared meanwhile; otherwise the next poll loads them.
 */
async function placeholdersAppeared(hasPlaceholders) {
  return hasPlaceholders !== null && (await hasPlaceholders());
}

/**
 * JumpToEndWithStabilization (:921): one End press converges to the true bottom (the after spacer's height
 * goes under 1px); while placeholders show, `loadData` releases the provider.
 */
export async function jumpToEndWithStabilization(container, hasPlaceholders, loadData) {
  // Ensure container has focus for keyboard input
  await container.click();

  // Single End key press — the scroll compensation in Virtualize should converge to the bottom
  await sendKey(container, "End");

  const diagnostics = [];
  try {
    await waitTrue(
      async () => {
        if (hasPlaceholders !== null && (await hasPlaceholders())) {
          diagnostics.push(`poll #${diagnostics.length + 1}: placeholders visible, loading data...`);
          await loadData?.();
          return false;
        }
        const m = await spacerMetrics(container);
        diagnostics.push(
          `poll #${diagnostics.length + 1}: spacerAfter=${m.spacerAfterHeight}, spacerBefore=${m.spacerBeforeHeight}, scrollTop=${m.scrollTop}, scrollHeight=${m.scrollHeight}, clientHeight=${m.clientHeight}, remaining=${m.scrollHeight - m.scrollTop - m.clientHeight}, overflowAnchor=${m.overflowAnchor}`,
        );
        return m.spacerAfterHeight < 1 && !(await placeholdersAppeared(hasPlaceholders));
      },
      { interval: SELENIUM_POLL },
    );
  } catch (error) {
    throw new AssertionError(`JumpToEnd convergence failed after ${diagnostics.length} polls.\n  ${diagnostics.slice(-8).join("\n  ")}\n${error.message}`);
  }

  // Wait for scroll position to stabilize (compensation convergence)
  await waitForScrollStabilization(container);
}

/** JumpToStartWithStabilization (:983): one Home press converges to the top (the before spacer goes under 1px). */
export async function jumpToStartWithStabilization(container, hasPlaceholders, loadData) {
  await container.click();
  await sendKey(container, "Home");

  const diagnostics = [];
  try {
    await waitTrue(
      async () => {
        if (hasPlaceholders !== null && (await hasPlaceholders())) {
          diagnostics.push(`poll #${diagnostics.length + 1}: placeholders visible, loading data...`);
          await loadData?.();
          return false;
        }
        const m = await spacerMetrics(container);
        diagnostics.push(
          `poll #${diagnostics.length + 1}: spacerBefore=${m.spacerBeforeHeight}, scrollTop=${m.scrollTop}, scrollHeight=${m.scrollHeight}, clientHeight=${m.clientHeight}`,
        );
        return m.spacerBeforeHeight < 1 && !(await placeholdersAppeared(hasPlaceholders));
      },
      { interval: SELENIUM_POLL },
    );
  } catch (error) {
    throw new AssertionError(`JumpToStart convergence failed after ${diagnostics.length} polls.\n  ${diagnostics.slice(-8).join("\n  ")}\n${error.message}`);
  }

  await waitForScrollStabilization(container);
}

/** MountAnchorModeComponent (:3211). `anchorMode` is the select's value: "0" None, "1" Start, "2" End. */
export async function mountAnchorModeComponent(t, anchorMode, { variableHeight = false, useItemsProvider = false, useDefaultComparer = false, delay = false } = {}) {
  if (delay && !useItemsProvider) throw new Error("delay only applies to the ItemsProvider path");
  const { page } = t;
  await t.mount("VirtualizationAnchorMode");
  const container = await exists(page, "#scroll-container");
  await waitTrue(async () => (await count(container, ".item")) > 0);

  if (useDefaultComparer) {
    await (await exists(page, "#toggle-comparer")).click();
    await waitTrue(async () => (await count(container, ".item")) > 0);
  }

  if (useItemsProvider) {
    await (await exists(page, "#toggle-provider")).click();
    await waitTrue(async () => (await count(container, ".item")) > 0);

    if (delay) {
      await (await exists(page, "#toggle-delay")).click();
      await waitContains("Provider delay for Virtualize: 500ms", () => statusText(page));
    }
  }

  if (variableHeight) {
    await (await exists(page, "#toggle-height")).click();
    await waitTrue(async () => (await count(container, ".item")) > 0);
  }

  await (await exists(page, "#anchor-mode-select")).selectOption(anchorMode);

  await waitTrue(async () => (await textOf(await exists(page, "#current-mode"))) === anchorMode);
  await waitTrue(async () => (await count(container, ".item")) > 0);
  await letEndModeConvergenceFinish(anchorMode, container);
  return container;
}

/** MountAnchorModeForScrollToItem (:5952). */
export async function mountAnchorModeForScrollToItem(t, useProvider, { variableHeight = false, delay = false } = {}) {
  const { page } = t;
  await t.mount("VirtualizationAnchorMode");
  const container = await exists(page, "#scroll-container");
  await waitTrue(async () => (await count(container, ".item")) > 0);

  if (useProvider) {
    await (await exists(page, "#toggle-provider")).click();
    await waitTrue(async () => (await count(container, ".item")) > 0);
  }

  if (variableHeight) {
    await (await exists(page, "#toggle-height")).click();
    await waitTrue(async () => (await count(container, ".item")) > 0);
  }

  if (delay) {
    await (await exists(page, "#toggle-delay")).click();
  }
  return container;
}

/** MountWindowScrollAnchorModeComponent (:4796). */
export async function mountWindowScrollAnchorModeComponent(t, anchorMode, { variableHeight = false, useItemsProvider = false, delay = false } = {}) {
  if (delay && !useItemsProvider) throw new Error("delay only applies to the ItemsProvider path");
  const { page } = t;
  await t.mount("VirtualizationAnchorModeWindowScroll");
  const root = await exists(page, "#virtualize-root");
  await waitTrue(async () => (await count(root, ".item")) > 0);

  if (useItemsProvider) {
    await (await exists(page, "#toggle-provider")).click();
    await waitTrue(async () => (await count(root, ".item")) > 0);

    if (delay) {
      await (await exists(page, "#toggle-delay")).click();
      await waitContains("Provider delay for Virtualize: 500ms", () => statusText(page));
    }
  }

  if (variableHeight) {
    await (await exists(page, "#toggle-height")).click();
    await waitTrue(async () => (await count(root, ".item")) > 0);
  }

  await (await exists(page, "#anchor-mode-select")).selectOption(anchorMode);

  await waitTrue(async () => (await textOf(await exists(page, "#current-mode"))) === anchorMode);
  await waitTrue(async () => (await count(root, ".item")) > 0);
  // As letEndModeConvergenceFinish, for the document as the scroller.
  if (anchorMode === "2") await waitForWindowRenderToSettle(page);
  return root;
}

/**
 * WaitForRenderToSettle (:5229) with the document as the scroller: three consecutive identical polls of the
 * rounded scrollY, the item count and the first item in the window's viewport; a blank viewport resets.
 */
export async function waitForWindowRenderToSettle(page) {
  let last = { scrollY: -1, itemCount: -1, firstIndex: "" };
  let stableCount = 0;
  await waitTrue(
    async () => {
      const result = await page.evaluate(() => {
        const items = document.querySelectorAll(".item[data-index]");
        let firstIndex = "";
        for (const item of items) {
          const r = item.getBoundingClientRect();
          if (r.bottom > 2 && r.top < window.innerHeight - 2) {
            firstIndex = item.getAttribute("data-index");
            break;
          }
        }
        return { scrollY: Math.round(window.scrollY), itemCount: items.length, firstIndex };
      });
      if (!result.firstIndex) {
        stableCount = 0;
      } else if (result.scrollY === last.scrollY && result.itemCount === last.itemCount && result.firstIndex === last.firstIndex) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      last = result;
      return stableCount >= 3;
    },
    { timeout: 15_000, interval: SELENIUM_POLL, message: "Render cycle did not settle in time" },
  );
}

/** WindowScrollMidListAndWaitForRender (:4858). */
export async function windowScrollMidListAndWaitForRender(page) {
  await waitTrue(
    async () => {
      await page.evaluate(() => window.scrollTo(0, 5000));
      return page.evaluate(() => Math.round(window.scrollY) > 4000);
    },
    { timeout: 5_000, interval: SELENIUM_POLL },
  );

  // Wait for Virtualize to render items visible in the viewport.
  await waitTrue(
    () =>
      page.evaluate(() => {
        for (const item of document.querySelectorAll(".item[data-index]")) {
          const ir = item.getBoundingClientRect();
          if (ir.bottom > 1 && ir.top < window.innerHeight - 1) return true;
        }
        return false;
      }),
    { timeout: 10_000 },
  );
}

/** The `#status` text. */
export async function statusText(page) {
  return textOf(await exists(page, "#status"));
}

/** GetProviderCallIndex (:6993). */
export async function getProviderCallIndex(page) {
  const raw = await page.evaluate(() => document.getElementById("provider-call-index")?.getAttribute("data-value") ?? null);
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isNaN(value) ? 0 : value;
}

/** GetProviderEvents (:7000). */
export function getProviderEvents(page) {
  return page.evaluate(() => document.getElementById("provider-events")?.getAttribute("data-value") ?? "");
}

/** GetMaximumScrollTop (:6055). */
export function getMaximumScrollTop(container) {
  return container.evaluate((el) => Math.round(el.scrollHeight - el.clientHeight));
}

/** IsScrolledToBottom (:6052). */
export async function isScrolledToBottom(container) {
  return Math.abs((await getScrollTop(container)) - (await getMaximumScrollTop(container))) < 2;
}

/** SetNumberInputAndWaitForBind (:6060): types into the number input and waits for the bound value. */
export async function setNumberInputAndWaitForBind(page, elementId, value) {
  const expected = String(value);
  const input = await exists(page, byId(elementId));
  // Clear() on <input type=number> is unreliable across drivers; Ctrl+A + Delete works.
  await input.press("ControlOrMeta+a");
  await input.press("Delete");
  await input.pressSequentially(expected);
  await input.press("Tab");
  await waitTrue(async () => (await page.evaluate((id) => document.getElementById(`${id}-bound`)?.getAttribute("data-value") ?? null, elementId)) === expected);
}

/** SetManualInitialIndex (:5978). */
export const setManualInitialIndex = (page, index) => setNumberInputAndWaitForBind(page, "manual-initial-index", index);

/**
 * GetTopRenderedIndex (:6103): the data-index of the topmost item or placeholder not entirely above
 * #scroll-container's top (+1px); a placeholder (or nothing) is -1.
 */
export function getTopRenderedIndex(page) {
  return page.evaluate(() => {
    const container = document.getElementById("scroll-container");
    const rect = container.getBoundingClientRect();
    let best = null;
    let bestTop = Number.POSITIVE_INFINITY;
    for (const item of container.querySelectorAll(".item, .loading-placeholder")) {
      const ir = item.getBoundingClientRect();
      // 1px tolerance: a sub-pixel sliver of the previous item just above the boundary
      // (from variable-height browser rounding) shouldn't count as 'topmost visible'.
      if (ir.bottom <= rect.top + 1) continue;
      if (ir.top < bestTop) {
        bestTop = ir.top;
        best = item;
      }
    }
    if (!best || best.classList.contains("loading-placeholder")) return -1;
    const idx = best.getAttribute("data-index");
    return idx === null ? -1 : Number.parseInt(idx, 10);
  });
}

/** GetBottomRenderedIndex (:6128). */
export function getBottomRenderedIndex(page) {
  return page.evaluate(() => {
    const container = document.getElementById("scroll-container");
    const rect = container.getBoundingClientRect();
    let best = null;
    let bestBottom = Number.NEGATIVE_INFINITY;
    for (const item of container.querySelectorAll(".item, .loading-placeholder")) {
      const ir = item.getBoundingClientRect();
      if (ir.top >= rect.bottom - 1) continue;
      if (ir.bottom > bestBottom) {
        bestBottom = ir.bottom;
        best = item;
      }
    }
    if (!best || best.classList.contains("loading-placeholder")) return -1;
    const idx = best.getAttribute("data-index");
    return idx === null ? -1 : Number.parseInt(idx, 10);
  });
}

/**
 * ViewportEdgeCoveredByRealItem (:6150): a real `.item` reaches the edge ("top"/"bottom") of #scroll-container
 * within 2px. `inGridRow` measures the table row that holds the `.item` instead (the QuickGrid pages): a
 * skin pads its cells by 8–12px where QuickGrid's default theme pads by about 2, so a row aligned with the edge
 * leaves its `.item` more than 2px inside it.
 */
export function viewportEdgeCoveredByRealItem(page, edge, { inGridRow = false } = {}) {
  return page.evaluate(([which, rows]) => {
    const c = document.getElementById("scroll-container");
    const rect = c.getBoundingClientRect();
    const scale = c.offsetHeight > 0 ? rect.height / c.offsetHeight : 1;
    const viewportTop = rect.top + c.clientTop * scale;
    const viewportBottom = viewportTop + c.clientHeight * scale;
    let best = which === "top" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    for (const item of c.querySelectorAll(".item")) {
      const r = (rows ? item.closest("tr") : item).getBoundingClientRect();
      if (r.bottom <= viewportTop + 1) continue;
      if (r.top >= viewportBottom - 1) continue;
      if (which === "top") {
        if (r.top < best) best = r.top;
      } else if (r.bottom > best) {
        best = r.bottom;
      }
    }
    return which === "top" ? best <= viewportTop + 2 : best >= viewportBottom - 2;
  }, [edge, inGridRow]);
}

/* Window scrolling (group H) ---------------------------------------------------------------------------- */

/** WindowScrollToBottomAndWait (:4833): the window at the document's bottom, and an item in view. */
export async function windowScrollToBottomAndWait(page) {
  await waitTrue(
    () =>
      page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        return document.documentElement.scrollHeight - Math.round(window.scrollY) - window.innerHeight < 2;
      }),
    { timeout: 10_000, interval: SELENIUM_POLL },
  );

  await waitTrue(() =>
    page.evaluate(() => {
      for (const item of document.querySelectorAll(".item[data-index]")) {
        const ir = item.getBoundingClientRect();
        if (ir.bottom > 1 && ir.top < window.innerHeight - 1) return true;
      }
      return false;
    }),
  );
}

/**
 * GetItemPositionInViewport (:5293): the item with `dataIndex`, or else the first one in the window's
 * viewport (by more than 1px); its index and its top in viewport coordinates.
 */
export async function getItemPositionInViewport(root, itemSelector, dataIndex = null) {
  const result = await root.evaluate(
    (r, [selector, targetIndex]) => {
      for (const item of r.querySelectorAll(selector)) {
        const itemRect = item.getBoundingClientRect();
        if (targetIndex !== null) {
          if (item.getAttribute("data-index") === targetIndex) return { index: targetIndex, top: itemRect.top };
        } else if (itemRect.bottom > 1 && itemRect.top < window.innerHeight - 1) {
          return { index: item.getAttribute("data-index"), top: itemRect.top };
        }
      }
      return null;
    },
    [itemSelector, dataIndex],
  );
  if (result === null) throw new AssertionError(`GetItemPositionInViewport: no ${dataIndex === null ? "visible item" : `item ${dataIndex}`} for ${itemSelector}`);
  return { index: String(result.index), top: result.top };
}

/** AssertWindowScrollViewportStaysStable (:4883): item `indexBefore` comes back within `driftTolerance` px of its top. */
export async function assertWindowScrollViewportStaysStable(root, indexBefore, topBefore, message, driftTolerance = 5) {
  await waitTrue(
    async () => {
      const { top } = await getItemPositionInViewport(root, ".item[data-index]", indexBefore);
      return Math.abs(top - topBefore) <= driftTolerance;
    },
    { timeout: 10_000, message },
  );

  const { top: topAfter } = await getItemPositionInViewport(root, ".item[data-index]", indexBefore);
  assert(Math.abs(topAfter - topBefore) <= driftTolerance, `${message} (item ${indexBefore} moved from ${topBefore} to ${topAfter})`);
}

/** The window's scroll position, rounded as Blazor's tests read it. */
export function windowScrollY(page) {
  return page.evaluate(() => Math.round(window.scrollY));
}

/** The window's distance to the bottom of the document. */
export function windowBottomGap(page) {
  return page.evaluate(() => document.documentElement.scrollHeight - Math.round(window.scrollY) - window.innerHeight);
}

/* ScrollToItem (group K) -------------------------------------------------------------------------------- */

/** SetScrollTargetIndex (:5976). */
export const setScrollTargetIndex = (page, index) => setNumberInputAndWaitForBind(page, "scroll-target-index", index);

/** WaitForScrollStatus (:6075): until #scroll-status starts with `expected`. */
export async function waitForScrollStatus(page, expected, timeoutSeconds = 30) {
  let actual = "<unable to read>";
  await waitTrue(
    async () => {
      actual = await textOf(await exists(page, "#scroll-status"));
      return actual.startsWith(expected);
    },
    {
      timeout: timeoutSeconds * 1000,
      message: async () => {
        const targetInputValue = await page.evaluate(() => document.getElementById("scroll-target-index")?.value ?? "<missing>");
        return `WaitForScrollStatus timeout: expected status to start with '${expected}', actual='${actual}', scroll-target-index value='${targetInputValue}'`;
      },
    },
  );
}

/* QuickGrid (group L) ----------------------------------------------------------------------------------- */

/** The #qg-status text. */
export async function quickGridStatusText(page) {
  return textOf(await exists(page, "#qg-status"));
}

/** MountQuickGridAnchorModeComponent (:2047). */
export async function mountQuickGridAnchorModeComponent(t, anchorMode, useItemsProvider, { delay = false } = {}) {
  if (delay && !useItemsProvider) throw new Error("delay only applies to the ItemsProvider path");
  const { page } = t;
  await t.mount("QuickGridAnchorModeComponent");
  const container = await exists(page, "#qg-anchor-container");
  await waitTrue(async () => (await count(container, ".item[data-index]")) > 0);

  if (useItemsProvider) {
    await (await exists(page, "#qg-toggle-provider")).click();
    await waitTrue(async () => (await count(container, ".item[data-index]")) > 0);

    if (delay) {
      // Real life providers come with at least a small delay
      await (await exists(page, "#qg-toggle-delay")).click();
      await waitContains("Provider delay for QuickGrid on", () => quickGridStatusText(page));
    }

    await waitForRenderToSettle(container);
  }

  await (await exists(page, "#qg-anchor-mode-select")).selectOption(anchorMode);
  await waitTrue(async () => (await textOf(await exists(page, "#qg-current-mode"))) === anchorMode);
  await waitTrue(async () => (await count(container, ".item[data-index]")) > 0);
  await letEndModeConvergenceFinish(anchorMode, container);
  return container;
}

/** EnableQuickGridDefaultComparer (:2079). */
export async function enableQuickGridDefaultComparer(page) {
  await (await exists(page, "#qg-toggle-comparer")).click();
  await waitContains("Comparer: Default", () => quickGridStatusText(page));
}

/** CountProviderEnters (:2112). */
async function countProviderEnters(page) {
  const events = await page.evaluate(() => document.getElementById("qg-provider-events")?.getAttribute("data-value") ?? "");
  return events.split("-enter").length - 1;
}

/**
 * GatedQuickGridProviderMutation (:2099): arms the gate, clicks the mutation, waits until its provider call
 * parks at the gate, disarms the gate and releases it.
 */
async function gatedQuickGridProviderMutation(page, mutationButtonId) {
  const entersBefore = await countProviderEnters(page);

  await (await exists(page, "#qg-toggle-provider-gate")).click();
  await (await exists(page, byId(mutationButtonId))).click();
  await waitTrue(async () => (await countProviderEnters(page)) > entersBefore, {
    timeout: 10_000,
    message: "Gated provider call did not park at the gate",
  });

  await (await exists(page, "#qg-toggle-provider-gate")).click();
  await (await exists(page, "#qg-release-provider-gate")).click();
}

/** QuickGridMutate (:2085): a gated mutation with the provider, a plain click with Items; then its status. */
export async function quickGridMutate(page, mutationButtonId, statusText, useItemsProvider) {
  if (useItemsProvider) {
    await gatedQuickGridProviderMutation(page, mutationButtonId);
  } else {
    await (await exists(page, byId(mutationButtonId))).click();
  }

  await waitContains(statusText, () => quickGridStatusText(page));
}

/**
 * CheckQuickGridFirstRow (:2029): `predicate` on the text of the first data row's first cell. The spacers are
 * the rows with `aria-hidden`. Blazor skips QuickGrid's placeholder cells (`td.grid-cell-placeholder`); a
 * skin's placeholder row is one empty cell, so its text is "" and fails the predicate the same way.
 */
export async function checkQuickGridFirstRow(container, predicate) {
  const text = await container.evaluate((c) => c.querySelector("tbody tr:not([aria-hidden]) td")?.innerText.trim() ?? null);
  return text !== null && predicate(text);
}

/** WaitForQuickGridDataRows (:2026): the first row is a data row (its first cell a number). */
export async function waitForQuickGridDataRows(container) {
  await waitTrue(() => checkQuickGridFirstRow(container, (text) => /^-?\d+$/.test(text)));
}

/** MountQuickGridForScrollToItem (:7067). */
export async function mountQuickGridForScrollToItem(t, { useItemsProvider = true, variableHeight = false } = {}) {
  const { page } = t;
  await t.mount("QuickGridScrollComponent");
  const container = await exists(page, "#scroll-container");
  await waitTrue(async () => (await count(container, ".item")) > 0);

  if (useItemsProvider) {
    await (await exists(page, "#toggle-provider")).click();
    await waitTrue(async () => (await count(container, ".item")) > 0);
    await (await exists(page, "#toggle-delay")).click();
  }

  if (variableHeight) {
    await (await exists(page, "#toggle-height")).click();
    await waitTrue(async () => (await count(container, ".item")) > 0);
  }
  return container;
}

export { DEFAULT_TIMEOUT };
