/**
 * Group L of Blazor's Virtualize E2E tests (docs/blazor-virtualize-net11.md §9): Virtualize hosted in QuickGrid.
 * Tsazor's QuickGrid is the DataGrid of its two component libraries, so each test runs once per skin (`skins`,
 * scripts/verify.mjs). The pages are Blazor's BasicTestApp.QuickGridTest pages, ported to src/Pages/QuickGrid/.
 * Group I's two QuickGrid tests (Home/End) are here too. Ported from VirtualizationTest.cs; line numbers refer
 * to it.
 *
 * QuickGrid's DOM is not the DataGrid's; the ported tests use what both have. The rows' content comes from the
 * pages' templates (`.item[data-index]`), the spacers are the rows with `aria-hidden="true"`, and a placeholder
 * row is a row without data (QuickGrid marks its cells `td.grid-cell-placeholder`, a skin renders one empty
 * cell). Blazor's QuickGrid has no `.loading-placeholder` rows: where a test looks for them (the flash loop,
 * GetTopRenderedIndex), it finds none in either grid, as in Blazor.
 *
 * Blazor disables three InlineData pending dotnet/aspnetcore#67865 (its grid misbehaves there); they run here
 * as further cases, marked so.
 */
import { assert, assertEqual, exists, sendKey, SELENIUM_POLL, waitNotEqual, waitTrue, waitContains } from "../lib/harness.mjs";
import {
  assertScrollTop,
  assertViewportStaysStable,
  checkQuickGridFirstRow,
  count,
  enableQuickGridDefaultComparer,
  getBottomRenderedIndex,
  getItemPositionInContainer,
  getScrollTop,
  getTopRenderedIndex,
  jumpToEndWithStabilization,
  jumpToStartWithStabilization,
  metric,
  mountQuickGridAnchorModeComponent,
  mountQuickGridForScrollToItem,
  quickGridMutate,
  quickGridStatusText,
  reservedHeight,
  scrollContainerWithWheelTo,
  scrollMidListAndWaitForRender,
  scrollNearTopAndWaitForRender,
  scrollToBottomAndWait,
  scrollToTopAndWaitForRender,
  scrollUntil,
  setManualInitialIndex,
  setScrollTargetIndex,
  verifyInitialPosition,
  viewportEdgeCoveredByRealItem,
  waitForQuickGridDataRows,
  waitForRenderToSettle,
  waitForScrollStatus,
} from "./_helpers.mjs";
import { asyncProviderScrollFlashes, fastScroll, viewportCenterShowsRealData } from "./_probes.mjs";

export const group = "L. Virtualize hosted in QuickGrid (the DataGrid of both skins)";
export const skins = ["fluent", "bootstrap"];

const CONTAINER = "#qg-anchor-container";

/** The 3 × 2 variants of the Theories with `(string anchorMode, bool useItemsProvider)`. */
const MODES_AND_SOURCES = [
  ["0", false],
  ["1", false],
  ["2", false],
  ["0", true],
  ["1", true],
  ["2", true],
];

/** The container's scrollHeight − scrollTop − clientHeight, read once. */
async function bottomGap(container) {
  return (await metric(container, "scrollHeight")) - (await metric(container, "scrollTop")) - (await metric(container, "clientHeight"));
}

/** Clicks a mutation button on QuickGridAnchorModeComponent (ungated) and waits for its status. */
async function click(page, buttonId, status) {
  await (await exists(page, `#${buttonId}`)).click();
  await waitContains(status, () => quickGridStatusText(page));
}

/** Where a test puts the grid before its mutation. */
async function moveTo(container, anchorMode, position) {
  switch (position) {
    case "near-top":
      return scrollNearTopAndWaitForRender(container);
    case "top":
      await verifyInitialPosition(anchorMode, container, "QuickGrid");
      if (anchorMode === "2") await scrollToTopAndWaitForRender(container);
      return;
    case "bottom":
      return scrollToBottomAndWait(container);
    case "mid-list":
      return scrollMidListAndWaitForRender(container);
  }
}

/**
 * The stability Theories: mount, move, mutate, settle, and the first visible item stays within 2px. A gated
 * mutation (`gated`) goes through QuickGridMutate (:2085): with the provider, the mutation's provider call parks
 * at the gate first, so the round trip is deterministic.
 */
async function stableAfterMutation(t, anchorMode, useItemsProvider, { delay, position, buttonId, status, gated, message }) {
  const { page } = t;
  const container = await mountQuickGridAnchorModeComponent(t, anchorMode, useItemsProvider, { delay });

  await moveTo(container, anchorMode, position);

  const { index: indexBefore, relTop: relTopBefore } = await getItemPositionInContainer(container, ".item");

  if (gated) await quickGridMutate(page, buttonId, status, useItemsProvider);
  else await click(page, buttonId, status);
  await waitForRenderToSettle(container);

  await assertViewportStaysStable(page, CONTAINER, ".item", indexBefore, relTopBefore, message, { driftTolerance: 2 });
}

/** Mid-list prepend (:2577, :2605, :2633): the first visible item stays within 2px. */
const midListPrepend = (t, anchorMode, useItemsProvider, message) =>
  stableAfterMutation(t, anchorMode, useItemsProvider, {
    delay: useItemsProvider,
    position: "mid-list",
    buttonId: "qg-prepend-items",
    status: "Prepended 10 items",
    gated: false,
    message,
  });

/** QuickGrid_AnchorMode_Start_LargeAppendAtBottom_DoesNotFollowToBottom (:2686). */
async function startLargeAppendDoesNotFollow(t, useItemsProvider) {
  const { page } = t;
  const container = await mountQuickGridAnchorModeComponent(t, "1", useItemsProvider);

  await scrollToBottomAndWait(container);

  await quickGridMutate(page, "qg-append-many-items", "Appended 100 items", useItemsProvider);
  // Start mode: no convergence to chase the new bottom.
  const st = await metric(container, "scrollTop");
  const sh = await metric(container, "scrollHeight");
  const gap = await bottomGap(container);
  assert(gap > 2000, `QuickGrid Start mode: should not converge to bottom after large append. scrollTop: ${st}, scrollHeight: ${sh}, gap: ${gap}`);
}

/** QuickGrid_AnchorMode_EndKeyJumpsToBottom (:2799). */
async function endKeyJumpsToBottom(t, anchorMode, useItemsProvider) {
  const container = await mountQuickGridAnchorModeComponent(t, anchorMode, useItemsProvider, { delay: useItemsProvider });

  await verifyInitialPosition(anchorMode, container, "QuickGrid");
  if (anchorMode === "2") {
    await scrollToTopAndWaitForRender(container);
  }

  await sendKey(container, "End");

  await waitTrue(async () => (await bottomGap(container)) < 2, {
    timeout: 10_000,
    message: `QuickGrid AnchorMode ${anchorMode}: End key should jump to the bottom of the list`,
  });
}

/** QuickGrid_InitialIndex_TallContainer_FillsViewportWithoutUserScroll (:6276) and …_NearEnd_… (:6370). */
async function tallContainerFillsViewport(t, useProvider, initialIndex, coverTop) {
  const { page } = t;
  await t.mount("QuickGridScrollComponent");
  const container = await exists(page, "#scroll-container");
  await waitTrue(async () => (await count(container, ".item")) > 0);

  await page.evaluate(() => { document.getElementById("scroll-container").style.height = "2000px"; });
  await (await exists(page, "#toggle-height")).click();
  await waitContains("Switched to variable heights", async () => (await exists(page, "#status")).innerText());
  if (useProvider) {
    await (await exists(page, "#toggle-provider")).click();
    await (await exists(page, "#toggle-delay")).click();
  }
  await (await exists(page, "#unload-list")).click();
  await exists(page, "#list-not-loaded");
  await setManualInitialIndex(page, initialIndex);
  await (await exists(page, "#reload-with-initial-index")).click();

  await waitTrue(async () => (await getTopRenderedIndex(page)) === initialIndex, {
    message: async () =>
      `Item ${initialIndex} should remain aligned with the viewport top once the last item has loaded, but top rendered index was ` +
      `${await getTopRenderedIndex(page)}, scrollTop=${await getScrollTop(container)}.`,
  });
  // The edges are covered by a real row (see viewportEdgeCoveredByRealItem: the skins pad their cells).
  if (coverTop) {
    await waitTrue(() => viewportEdgeCoveredByRealItem(page, "top", { inGridRow: true }), {
      message: async () =>
        `Viewport top should be covered by a real item, but a gap was found (bottom=${await getBottomRenderedIndex(page)}, scrollTop=${await getScrollTop(container)}).`,
    });
  }
  await waitTrue(() => viewportEdgeCoveredByRealItem(page, "bottom", { inGridRow: true }), {
    message: async () =>
      `Viewport bottom should be covered by a real item, but a gap was found (top=${await getTopRenderedIndex(page)}, scrollTop=${await getScrollTop(container)}).`,
  });
}

/** Sets the target and clicks "Scroll To Item" on QuickGridScrollComponent. */
async function scrollToItem(page, index) {
  await setScrollTargetIndex(page, index);
  await (await exists(page, "#scroll-to-item")).click();
}

/** Until the top rendered item is `index` (GetTopRenderedIndex, :6103); `what` starts the failure message. */
async function waitTopRenderedIndex(page, index, what = "Top rendered item") {
  await waitTrue(async () => (await getTopRenderedIndex(page)) === index, {
    message: async () =>
      `${what} should be ${index} but was ${await getTopRenderedIndex(page)}, scrollTop=${await page.evaluate(() => Math.round(document.getElementById("scroll-container").scrollTop))}`,
  });
}

/** Unloads the grid and reloads it at InitialItemIndex `index`, from scrollTop 0. */
async function reloadAt(page, index) {
  await (await exists(page, "#unload-list")).click();
  await exists(page, "#list-not-loaded");
  await page.evaluate(() => { document.getElementById("scroll-container").scrollTop = 0; });
  await setManualInitialIndex(page, index);
  await (await exists(page, "#reload-with-initial-index")).click();
}

export const tests = [
  {
    // Blazor: QuickGrid_CanJumpToEndAndStart (:1917)
    name: "QuickGrid_CanJumpToEndAndStart",
    async run(t) {
      const { page } = t;
      await t.mount("QuickGridVariableHeightComponent");

      await (await exists(page, "#qg-vh-toggle-delay")).click();
      await waitContains("Provider delay for QuickGrid: 150ms", async () => (await exists(page, "#qg-vh-status")).innerText());

      const container = await exists(page, "#grid-variable-height");
      const totalItems = await exists(page, "#total-items");
      const providerCallCount = await exists(page, "#items-provider-call-count");
      const dataLoaded = await exists(page, "#data-loaded");

      await waitTrue(async () => (await totalItems.innerText()) === "Total items: 1000");
      await waitTrue(async () => (await dataLoaded.innerText()) === "Data loaded: True");
      await waitTrue(async () => Number.parseInt((await providerCallCount.innerText()).replace("ItemsProvider calls: ", ""), 10) > 0);

      await waitForQuickGridDataRows(container);
      const isFirstRowId1 = () => checkQuickGridFirstRow(container, (text) => text === "1");

      await jumpToStartWithStabilization(container, null, null);
      await waitTrue(isFirstRowId1);

      await jumpToEndWithStabilization(container, null, null);
      await waitForQuickGridDataRows(container);

      await waitTrue(() => checkQuickGridFirstRow(container, (text) => /^\d+$/.test(text) && Number.parseInt(text, 10) > 950));

      await jumpToStartWithStabilization(container, null, null);
      await waitTrue(isFirstRowId1);
    },
  },
  ...[
    ["qg-mode-fixed", "qg-capacity"],
    ["qg-mode-variable", "qg-variable-capacity"],
  ].map(([modeButtonId, containerId]) => ({
    // Blazor: QuickGrid_Virtualize_ToleratesIncorrectItemSize_UnderFastScroll (:1959)
    name: `QuickGrid_Virtualize_ToleratesIncorrectItemSize_UnderFastScroll(modeButtonId: "${modeButtonId}", containerId: "${containerId}")`,
    async run(t) {
      const { page } = t;
      const scrollStep = 1500;

      await t.mount("QuickGridVirtualizeCapacityComponent");
      await (await exists(page, `#${modeButtonId}`)).click();

      const container = await exists(page, `#${containerId}`);

      await waitForQuickGridDataRows(container);
      // Blazor reads the before spacer's data-blazor-virtualize-reserved-height; Tsazor's spacer carries its
      // height inline (reservedHeight).
      const topSpacer = container.locator('tbody > tr[aria-hidden="true"]').first();
      assertEqual(0, await reservedHeight(topSpacer), "the top spacer's reserved height");

      const positions = Array.from({ length: 40 }, (_, k) => (k + 1) * scrollStep);
      // Jitter around a deep offset to provoke placeholder oscillation.
      positions.push(58000, 57700, 58200, 57900);
      await fastScroll(page, containerId, positions, scrollStep);

      await waitNotEqual(0, () => reservedHeight(topSpacer));
      await waitTrue(() => viewportCenterShowsRealData(page, containerId));
    },
  })),
  ...MODES_AND_SOURCES.map(([anchorMode, useItemsProvider]) => ({
    // Blazor: QuickGrid_AnchorMode_NearTop_PrependKeepsViewportStable (:2126)
    name: `QuickGrid_AnchorMode_NearTop_PrependKeepsViewportStable(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      stableAfterMutation(t, anchorMode, useItemsProvider, {
        delay: useItemsProvider,
        position: "near-top",
        buttonId: "qg-prepend-items",
        status: "Prepended 10 items",
        gated: false,
        message: `QuickGrid AnchorMode ${anchorMode} near top: viewport should stay stable after prepend`,
      }),
  })),
  {
    // Blazor: QuickGrid_AnchorMode_DefaultComparer_Items_PrependKeepsViewportStable (:2155)
    name: "QuickGrid_AnchorMode_DefaultComparer_Items_PrependKeepsViewportStable",
    async run(t) {
      const { page } = t;
      const container = await mountQuickGridAnchorModeComponent(t, "1", false);

      await enableQuickGridDefaultComparer(page);

      await scrollNearTopAndWaitForRender(container);

      const { index: indexBefore, relTop: relTopBefore } = await getItemPositionInContainer(container, ".item");

      await click(page, "qg-prepend-items", "Prepended 10 items");
      await waitForRenderToSettle(container);

      await assertViewportStaysStable(page, CONTAINER, ".item", indexBefore, relTopBefore, "QuickGrid default comparer (Items): viewport should stay stable after prepend", {
        driftTolerance: 2,
      });
    },
  },
  ...MODES_AND_SOURCES.map(([anchorMode, useItemsProvider]) => ({
    // Blazor: QuickGrid_AnchorMode_NearTop_AppendKeepsViewportStable (:2189)
    name: `QuickGrid_AnchorMode_NearTop_AppendKeepsViewportStable(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      stableAfterMutation(t, anchorMode, useItemsProvider, {
        delay: false,
        position: "near-top",
        buttonId: "qg-append-items",
        status: "Appended 10 items",
        gated: true,
        message: `QuickGrid AnchorMode ${anchorMode} near top: viewport should stay stable after append`,
      }),
  })),
  ...MODES_AND_SOURCES.map(([anchorMode, useItemsProvider]) => ({
    // Blazor: QuickGrid_AnchorMode_Top_AppendKeepsViewportStable (:2221); ("2", true) is disabled in Blazor (#67865)
    name: `QuickGrid_AnchorMode_Top_AppendKeepsViewportStable(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})${anchorMode === "2" && useItemsProvider ? " — disabled in Blazor (#67865)" : ""}`,
    run: (t) =>
      stableAfterMutation(t, anchorMode, useItemsProvider, {
        delay: false,
        position: "top",
        buttonId: "qg-append-items",
        status: "Appended 10 items",
        gated: true,
        message: `QuickGrid AnchorMode ${anchorMode} at top: viewport should stay stable after append`,
      }),
  })),
  ...MODES_AND_SOURCES.map(([anchorMode, useItemsProvider]) => ({
    // Blazor: QuickGrid_AnchorMode_Bottom_PrependKeepsViewportStable (:2256)
    name: `QuickGrid_AnchorMode_Bottom_PrependKeepsViewportStable(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      stableAfterMutation(t, anchorMode, useItemsProvider, {
        delay: useItemsProvider,
        position: "bottom",
        buttonId: "qg-prepend-items",
        status: "Prepended 10 items",
        gated: false,
        message: `QuickGrid AnchorMode ${anchorMode} at bottom: viewport should stay stable after prepend`,
      }),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: QuickGrid_AnchorMode_None_PrependAtTop_ViewportStaysStable (:2284)
    name: `QuickGrid_AnchorMode_None_PrependAtTop_ViewportStaysStable(useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const { page } = t;
      const container = await mountQuickGridAnchorModeComponent(t, "0", useItemsProvider, { delay: useItemsProvider });

      await assertScrollTop(container, (st) => st < 2, "QuickGrid should start at the top");

      const { index: indexBefore, relTop: relTopBefore } = await getItemPositionInContainer(container, ".item");

      await click(page, "qg-prepend-items", "Prepended 10 items");
      await waitForRenderToSettle(container);

      await assertViewportStaysStable(page, CONTAINER, ".item", indexBefore, relTopBefore, "QuickGrid None mode at top: same item should stay at same position after prepend", {
        driftTolerance: 2,
      });

      // Scroll up and verify prepended items are actually reachable.
      await scrollUntil(container, () => scrollContainerWithWheelTo(page, container, 0), (st) => st === 0, "scrollTop == 0 after wheel scroll");
      await waitTrue(async () => (await count(container, "[data-index='-10']")) > 0, {
        timeout: 5_000,
        message: "QuickGrid None mode: prepended items should be reachable after scrolling up",
      });
    },
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: QuickGrid_AnchorMode_Start_PrependAtTop_NewItemsVisible (:2318)
    name: `QuickGrid_AnchorMode_Start_PrependAtTop_NewItemsVisible(useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const { page } = t;
      const container = await mountQuickGridAnchorModeComponent(t, "1", useItemsProvider, { delay: useItemsProvider });

      await assertScrollTop(container, (st) => st < 2, "QuickGrid should start at the top");

      await click(page, "qg-prepend-items", "Prepended 10 items");

      await waitForRenderToSettle(container);
      const scrollTopAfter = await getScrollTop(container);
      assert(scrollTopAfter < 50, `QuickGrid Start mode: should stay near top after prepend, but scrollTop was ${scrollTopAfter}`);

      await waitTrue(async () => (await count(container, "[data-index='-10']")) > 0);
    },
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: QuickGrid_AnchorMode_End_PrependAtTop_ViewportStaysStable (:2341)
    name: `QuickGrid_AnchorMode_End_PrependAtTop_ViewportStaysStable(useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      stableAfterMutation(t, "2", useItemsProvider, {
        delay: useItemsProvider,
        position: "top",
        buttonId: "qg-prepend-items",
        status: "Prepended 10 items",
        gated: false,
        message: "QuickGrid End mode at top: viewport should stay stable after prepend",
      }),
  })),
  {
    // Blazor: QuickGrid_AnchorMode_None_AsyncProvider_PrependKeepsViewportStable (:2368)
    name: "QuickGrid_AnchorMode_None_AsyncProvider_PrependKeepsViewportStable",
    async run(t) {
      const { page } = t;
      const container = await mountQuickGridAnchorModeComponent(t, "0", true);

      // Enable provider delay to simulate network latency.
      await click(page, "qg-toggle-delay", "Provider delay for QuickGrid on");

      await scrollMidListAndWaitForRender(container);
      await waitForRenderToSettle(container);

      const { index: indexBefore, relTop: relTopBefore } = await getItemPositionInContainer(container, ".item");

      await click(page, "qg-prepend-items", "Prepended 10 items");
      await waitForRenderToSettle(container);

      await assertViewportStaysStable(
        page,
        CONTAINER,
        ".item",
        indexBefore,
        relTopBefore,
        "QuickGrid async provider: viewport should stay stable after prepend despite placeholder transition",
        { driftTolerance: 5 },
      );
    },
  },
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: QuickGrid_AnchorMode_Start_PrependAfterLeavingTop_DoesNotReengage (:2401)
    name: `QuickGrid_AnchorMode_Start_PrependAfterLeavingTop_DoesNotReengage(useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const { page } = t;
      const container = await mountQuickGridAnchorModeComponent(t, "1", useItemsProvider, { delay: useItemsProvider });

      await assertScrollTop(container, (st) => st < 2, "QuickGrid should start at the top");

      await click(page, "qg-prepend-items", "Prepended 10 items");
      await waitTrue(async () => (await count(container, "[data-index='-10']")) > 0);
      await waitForRenderToSettle(container);

      await scrollUntil(container, () => scrollContainerWithWheelTo(page, container, 500), (st) => st > 200, "scrollTop > 200 after wheel scroll");
      await waitForRenderToSettle(container);

      const scrollTopBefore = await getScrollTop(container);

      await click(page, "qg-prepend-items", "Prepended 10 items");

      await waitForRenderToSettle(container);
      const scrollTopAfter = await getScrollTop(container);
      assert(
        scrollTopAfter > 200,
        `QuickGrid Start mode: should not pull user back to top after leaving. scrollTop before: ${scrollTopBefore}, after: ${scrollTopAfter} (expected >200, not near 0)`,
      );
    },
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: QuickGrid_AnchorMode_End_AppendAfterLeavingBottom_DoesNotReengage (:2435)
    name: `QuickGrid_AnchorMode_End_AppendAfterLeavingBottom_DoesNotReengage(useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const { page } = t;
      const container = await mountQuickGridAnchorModeComponent(t, "2", useItemsProvider);

      await scrollToBottomAndWait(container);

      await quickGridMutate(page, "qg-append-items", "Appended 10 items", useItemsProvider);
      await waitTrue(async () => (await bottomGap(container)) < 2, { message: "QuickGrid End mode: first append should follow to bottom" });

      const currentScrollTop = await getScrollTop(container);
      const targetScrollTop = currentScrollTop - 500;
      await scrollUntil(
        container,
        () => scrollContainerWithWheelTo(page, container, targetScrollTop),
        (st) => st < currentScrollTop - 100,
        `scrollTop < ${currentScrollTop - 100} after scrolling away from bottom`,
      );
      await waitForRenderToSettle(container);

      const scrollTopBeforeSecondAppend = await getScrollTop(container);

      await quickGridMutate(page, "qg-append-items", "Appended 10 items", useItemsProvider);
      await waitForRenderToSettle(container);

      const scrollTopAfterSecondAppend = await getScrollTop(container);
      assert(
        Math.abs(scrollTopAfterSecondAppend - scrollTopBeforeSecondAppend) < 2,
        `QuickGrid End mode: should not re-engage after leaving bottom. scrollTop before: ${scrollTopBeforeSecondAppend}, after: ${scrollTopAfterSecondAppend}`,
      );
    },
  })),
  {
    // Blazor: QuickGrid_AnchorMode_None_AsyncProvider_ScrollDoesNotFlash (:2472)
    name: "QuickGrid_AnchorMode_None_AsyncProvider_ScrollDoesNotFlash",
    async run(t) {
      const { page } = t;
      const container = await mountQuickGridAnchorModeComponent(t, "0", true);

      // Enable provider delay to simulate network latency.
      await click(page, "qg-toggle-delay", "Provider delay for QuickGrid on");

      // Scroll through items incrementally, checking for backward index jumps (flashing).
      const { flashCount, maxIndexSeen, steps } = await asyncProviderScrollFlashes(container);

      assert(flashCount === 0, `QuickGrid async provider: scrolling should not flash/jump backward. Detected ${flashCount} backward jumps, max index seen: ${maxIndexSeen}. Steps (scrollTop:top index): ${steps}`);
      assert(maxIndexSeen >= 50, `QuickGrid: should have scrolled through some items but only reached index ${maxIndexSeen}.`);
    },
  },
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: QuickGrid_AnchorMode_None_MidList_ViewportStable (:2577)
    name: `QuickGrid_AnchorMode_None_MidList_ViewportStable(useItemsProvider: ${useItemsProvider})`,
    run: (t) => midListPrepend(t, "0", useItemsProvider, "QuickGrid None mode mid-list: viewport should stay visually stable after prepend"),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: QuickGrid_AnchorMode_Start_MidList_ViewportStable (:2605)
    name: `QuickGrid_AnchorMode_Start_MidList_ViewportStable(useItemsProvider: ${useItemsProvider})`,
    run: (t) => midListPrepend(t, "1", useItemsProvider, "QuickGrid Start mode mid-list: viewport should stay stable after prepend"),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: QuickGrid_AnchorMode_End_MidList_ViewportStable (:2633)
    name: `QuickGrid_AnchorMode_End_MidList_ViewportStable(useItemsProvider: ${useItemsProvider})`,
    run: (t) => midListPrepend(t, "2", useItemsProvider, "QuickGrid End mode mid-list: viewport should stay stable after prepend"),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: QuickGrid_AnchorMode_End_LargeAppendAtBottom_StillFollows (:2661)
    name: `QuickGrid_AnchorMode_End_LargeAppendAtBottom_StillFollows(useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const { page } = t;
      const container = await mountQuickGridAnchorModeComponent(t, "2", useItemsProvider);

      await scrollToBottomAndWait(container);

      await quickGridMutate(page, "qg-append-many-items", "Appended 100 items", useItemsProvider);

      // The poll scrolls to the bottom itself, as Blazor's does: the bottom is reachable and converges.
      await waitTrue(
        async () => {
          await container.evaluate((el) => { el.scrollTop = el.scrollHeight; });
          return (await bottomGap(container)) < 2;
        },
        { timeout: 30_000, interval: SELENIUM_POLL, message: "QuickGrid End mode: large append should still follow to bottom" },
      );
    },
  })),
  ...[true, false].map((useItemsProvider) => ({
    // Blazor: QuickGrid_AnchorMode_Start_LargeAppendAtBottom_DoesNotFollowToBottom (:2686); (false) is disabled in Blazor (#67865)
    name: `QuickGrid_AnchorMode_Start_LargeAppendAtBottom_DoesNotFollowToBottom(useItemsProvider: ${useItemsProvider})${useItemsProvider ? "" : " — disabled in Blazor (#67865)"}`,
    run: (t) => startLargeAppendDoesNotFollow(t, useItemsProvider),
  })),
  ...[
    ["0", false],
    ["1", false],
    ["0", true],
    ["1", true],
  ].map(([anchorMode, useItemsProvider]) => ({
    // Blazor: QuickGrid_AnchorMode_MidList_AppendKeepsViewportStable (:2711)
    name: `QuickGrid_AnchorMode_MidList_AppendKeepsViewportStable(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      stableAfterMutation(t, anchorMode, useItemsProvider, {
        delay: false,
        position: "mid-list",
        buttonId: "qg-append-items",
        status: "Appended 10 items",
        gated: true,
        message: `QuickGrid AnchorMode ${anchorMode} mid-list: viewport should stay stable after append`,
      }),
  })),
  ...[
    ["0", false],
    ["1", false],
    ["0", true],
    ["1", true],
  ].map(([anchorMode, useItemsProvider]) => ({
    // Blazor: QuickGrid_AnchorMode_Bottom_AppendKeepsViewportStable (:2740)
    name: `QuickGrid_AnchorMode_Bottom_AppendKeepsViewportStable(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      stableAfterMutation(t, anchorMode, useItemsProvider, {
        delay: false,
        position: "bottom",
        buttonId: "qg-append-items",
        status: "Appended 10 items",
        gated: true,
        message: `QuickGrid AnchorMode ${anchorMode} at bottom: viewport should stay stable after append`,
      }),
  })),
  ...MODES_AND_SOURCES.map(([anchorMode, useItemsProvider]) => ({
    // Blazor: QuickGrid_AnchorMode_HomeKeyJumpsToTop (:2771) — group I in the catalog
    name: `QuickGrid_AnchorMode_HomeKeyJumpsToTop(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const container = await mountQuickGridAnchorModeComponent(t, anchorMode, useItemsProvider, { delay: useItemsProvider });

      await scrollMidListAndWaitForRender(container);

      await sendKey(container, "Home");

      await waitTrue(async () => (await getScrollTop(container)) < 2, {
        timeout: 10_000,
        message: `QuickGrid AnchorMode ${anchorMode}: Home key should jump to the top of the list`,
      });

      await waitTrue(async () => (await count(container, "[data-index='0']")) > 0, {
        message: `QuickGrid AnchorMode ${anchorMode}: item 0 should be visible after Home key`,
      });
    },
  })),
  ...MODES_AND_SOURCES.map(([anchorMode, useItemsProvider]) => ({
    // Blazor: QuickGrid_AnchorMode_EndKeyJumpsToBottom (:2799) — group I in the catalog; ("2", true) is disabled in Blazor (#67865)
    name: `QuickGrid_AnchorMode_EndKeyJumpsToBottom(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})${anchorMode === "2" && useItemsProvider ? " — disabled in Blazor (#67865)" : ""}`,
    run: (t) => endKeyJumpsToBottom(t, anchorMode, useItemsProvider),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: QuickGrid_AnchorMode_None_LargeAppendAtBottom_DoesNotFollowToBottom (:2827)
    name: `QuickGrid_AnchorMode_None_LargeAppendAtBottom_DoesNotFollowToBottom(useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const { page } = t;
      const container = await mountQuickGridAnchorModeComponent(t, "0", useItemsProvider, { delay: useItemsProvider });

      await scrollToBottomAndWait(container);

      await click(page, "qg-append-many-items", "Appended 100 items");
      await waitForRenderToSettle(container);

      const st = await metric(container, "scrollTop");
      const sh = await metric(container, "scrollHeight");
      const gap = await bottomGap(container);
      assert(gap > 2000, `QuickGrid None mode: viewport should not converge to bottom after large append. scrollTop: ${st}, scrollHeight: ${sh}, gap: ${gap}`);
    },
  })),
  ...[false, true].map((useProvider) => ({
    // Blazor: QuickGrid_InitialIndex_TallContainer_FillsViewportWithoutUserScroll (:6276)
    name: `QuickGrid_InitialIndex_TallContainer_FillsViewportWithoutUserScroll(useProvider: ${useProvider})`,
    viewport: { width: 1024, height: 2400 },
    run: (t) => tallContainerFillsViewport(t, useProvider, 10, false),
  })),
  ...[false, true].map((useProvider) => ({
    // Blazor: QuickGrid_InitialIndex_TallContainer_NearEnd_FillsViewportWithoutUserScroll (:6370)
    name: `QuickGrid_InitialIndex_TallContainer_NearEnd_FillsViewportWithoutUserScroll(useProvider: ${useProvider})`,
    viewport: { width: 1024, height: 2400 },
    run: (t) => tallContainerFillsViewport(t, useProvider, 950, true),
  })),
  ...[
    [true, false],
    [false, false],
    [true, true],
    [false, true],
  ].map(([useItemsProvider, variableHeight]) => ({
    // Blazor: QuickGrid_ScrollToItem_LandsAtTop (:7092)
    name: `QuickGrid_ScrollToItem_LandsAtTop(useItemsProvider: ${useItemsProvider}, variableHeight: ${variableHeight})`,
    async run(t) {
      const { page } = t;
      await mountQuickGridForScrollToItem(t, { useItemsProvider, variableHeight });

      await scrollToItem(page, 200);
      await waitForScrollStatus(page, "Completed: 200");

      await waitTopRenderedIndex(page, 200);
    },
  })),
  ...[true, false].map((useItemsProvider) => ({
    // Blazor: QuickGrid_ScrollToItem_NegativeIndex_ScrollsToTop (:7109)
    name: `QuickGrid_ScrollToItem_NegativeIndex_ScrollsToTop(useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const { page } = t;
      await mountQuickGridForScrollToItem(t, { useItemsProvider });

      await scrollToItem(page, 150);
      await waitForScrollStatus(page, "Completed: 150");

      await scrollToItem(page, -1);
      await waitForScrollStatus(page, "Completed: -1");

      await waitTopRenderedIndex(page, 0, "Negative index should clamp to the first row; top rendered item");
    },
  })),
  ...[true, false].map((useItemsProvider) => ({
    // Blazor: QuickGrid_ScrollToItem_MaxIntIndex_ScrollsToLast (:7130)
    name: `QuickGrid_ScrollToItem_MaxIntIndex_ScrollsToLast(useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const { page } = t;
      const container = await mountQuickGridForScrollToItem(t, { useItemsProvider });

      // int.MaxValue
      await scrollToItem(page, 2147483647);
      await waitForScrollStatus(page, "Completed: 2147483647");

      await waitTrue(
        () => container.evaluate((c) => Math.round(c.scrollTop) > 0 && Math.round(c.scrollTop) >= Math.round(c.scrollHeight) - Math.round(c.clientHeight) - 2),
        { message: "Scroll should be at the bottom (last item region) after clamp to MaxValue." },
      );

      await waitTrue(() =>
        page.evaluate(() => {
          const el = document.querySelector('#scroll-container .item[data-index="999"]');
          if (!el) return false;
          const cr = document.getElementById("scroll-container").getBoundingClientRect();
          const er = el.getBoundingClientRect();
          return er.top < cr.bottom && er.bottom > cr.top;
        }),
      );
    },
  })),
  ...[false, true].map((variableHeight) => ({
    // Blazor: QuickGrid_ScrollToItem_WithProviderDelay_LandsAtTargetWithRealContent (:7161)
    name: `QuickGrid_ScrollToItem_WithProviderDelay_LandsAtTargetWithRealContent(variableHeight: ${variableHeight})`,
    async run(t) {
      const { page } = t;
      await mountQuickGridForScrollToItem(t, { variableHeight });

      await scrollToItem(page, 300);
      await waitForScrollStatus(page, "Completed: 300", 30);

      await waitTopRenderedIndex(page, 300, "Top rendered (a real item, not a placeholder)");
    },
  })),
  ...[
    [1, false, false],
    [5, false, false],
    [500, false, false],
    [1, false, true],
    [500, false, true],
    [1, true, false],
    [500, true, false],
    [1, true, true],
    [500, true, true],
  ].map(([initialIndex, variableHeight, useItemsProvider]) => ({
    // Blazor: QuickGrid_InitialIndex_OpensAtTargetWithRealContent (:7184)
    name: `QuickGrid_InitialIndex_OpensAtTargetWithRealContent(initialIndex: ${initialIndex}, variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const { page } = t;
      await mountQuickGridForScrollToItem(t, { useItemsProvider, variableHeight });

      await reloadAt(page, initialIndex);

      await waitTopRenderedIndex(page, initialIndex);
    },
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: QuickGrid_InitialIndex_BeyondCount_ClampsToEnd (:7201)
    name: `QuickGrid_InitialIndex_BeyondCount_ClampsToEnd(useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const { page } = t;
      await mountQuickGridForScrollToItem(t, { useItemsProvider });

      await reloadAt(page, 100000);

      await waitTrue(
        () =>
          page.evaluate(() => {
            const c = document.getElementById("scroll-container");
            const last = c.querySelector('.item[data-index="999"]');
            if (!last) return false;
            return Math.abs(c.scrollTop + c.clientHeight - c.scrollHeight) <= 2;
          }),
        { message: "Expected last item (999) rendered and scroller pinned at end after clamping InitialItemIndex=100000." },
      );
    },
  })),
  {
    // Blazor: QuickGrid_ScrollToItem_RapidCalls_OnlyLastTargetReached (:7221)
    name: "QuickGrid_ScrollToItem_RapidCalls_OnlyLastTargetReached",
    async run(t) {
      const { page } = t;
      await mountQuickGridForScrollToItem(t);

      await (await exists(page, "#scroll-to-item-rapid")).click();
      await waitForScrollStatus(page, "Completed: 250 (canceled=0, completed=5, faulted=0)", 30);

      await waitTopRenderedIndex(page, 250, "After rapid-fire scroll, top");
    },
  },
  {
    // Blazor: QuickGrid_ScrollToItem_ExternalCancellation_TaskCancels (:7234)
    name: "QuickGrid_ScrollToItem_ExternalCancellation_TaskCancels",
    async run(t) {
      const { page } = t;
      await mountQuickGridForScrollToItem(t);

      await setScrollTargetIndex(page, 450);
      await (await exists(page, "#scroll-to-item-cancellable")).click();
      await (await exists(page, "#cancel-scroll")).click();
      await waitForScrollStatus(page, "Canceled");

      await scrollToItem(page, 120);
      await waitForScrollStatus(page, "Completed: 120", 30);
      await waitTopRenderedIndex(page, 120);
    },
  },
  ...[true, false].map((useItemsProvider) => ({
    // Blazor: QuickGrid_ScrollToItem_AnchorStart_AtTop_LandsAtTarget (:7253)
    name: `QuickGrid_ScrollToItem_AnchorStart_AtTop_LandsAtTarget(useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const { page } = t;
      const container = await mountQuickGridForScrollToItem(t, { useItemsProvider });

      await waitTrue(async () => (await getScrollTop(container)) === 0);

      await scrollToItem(page, 2);
      await waitForScrollStatus(page, "Completed: 2");

      await waitTopRenderedIndex(page, 2, "Top");
    },
  })),
];
