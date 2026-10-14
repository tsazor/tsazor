/**
 * Group G of Blazor's Virtualize E2E tests (docs/blazor-virtualize-net11.md §9): AnchorMode with an element
 * scroll container — the viewport when rows are prepended, appended or deleted at the top, near the top,
 * mid-list and at the bottom. Ported from VirtualizationTest.cs; line numbers refer to it.
 */
import { assert, assertEqual, exists, locationY, SELENIUM_POLL, waitContains, waitTrue } from "../lib/harness.mjs";
import {
  assertScrollTop,
  assertViewportStaysStable,
  count,
  getItemPositionInContainer,
  getScrollTop,
  metric,
  mountAnchorModeComponent,
  scrollContainer,
  scrollContainerWithWheelTo,
  scrollMidListAndWaitForRender,
  scrollNearTopAndWaitForRender,
  scrollToBottomAndWait,
  scrollToOffsetWithStabilization,
  scrollToTopAndWaitForRender,
  scrollUntil,
  statusText,
  verifyInitialPosition,
  waitForRenderToSettle,
} from "./_helpers.mjs";

export const group = "G. AnchorMode with an element scroll container (prepend/append/delete stability)";

/** The container's scrollHeight − scrollTop − clientHeight, read once. */
async function bottomGap(container) {
  return (await metric(container, "scrollHeight")) - (await metric(container, "scrollTop")) - (await metric(container, "clientHeight"));
}

/** Clicks a mutation button on the AnchorMode page and waits for its status. */
async function mutate(page, buttonId, status) {
  await (await exists(page, `#${buttonId}`)).click();
  await waitContains(status, () => statusText(page));
}

/** The 2 × 2 variants of the Theories with `(bool variableHeight, bool useItemsProvider)`. */
const HEIGHTS_AND_SOURCES = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
];

/** The 3 × 2 variants of the Theories with `(string anchorMode, bool useItemsProvider)`. */
const MODES_AND_SOURCES = [
  ["0", false],
  ["1", false],
  ["2", false],
  ["0", true],
  ["1", true],
  ["2", true],
];

/** Mounts AnchorMode `anchorMode` with the test's variants (the provider always with Blazor's 500 ms delay). */
const mountWith = (t, anchorMode, { variableHeight = false, useItemsProvider = false, useDefaultComparer = false } = {}) =>
  mountAnchorModeComponent(t, anchorMode, { variableHeight, useItemsProvider, useDefaultComparer, delay: useItemsProvider });

/** A mutation, a settle, and the first visible item where it was (the shape of most tests here). */
async function mutateAndAssertStable(page, container, buttonId, status, indexBefore, relTopBefore, message, tolerance) {
  await mutate(page, buttonId, status);
  await waitForRenderToSettle(container);
  await assertViewportStaysStable(page, "#scroll-container", ".item", indexBefore, relTopBefore, message, tolerance);
}

/** AnchorMode_None_PrependAtTop_ViewportStaysStable (:3454), and its large twin (:4533) with 100 items. */
async function nonePrependAtTop(t, variableHeight, useItemsProvider, { many = false } = {}) {
  const { page } = t;
  const container = await mountWith(t, "0", { variableHeight, useItemsProvider });

  assertEqual(0, await getScrollTop(container), "scrollTop");

  const { index: indexBefore, relTop: relTopBefore } = await getItemPositionInContainer(container, ".item");

  const prepended = many ? 100 : 10;
  await mutateAndAssertStable(
    page,
    container,
    many ? "prepend-many-items" : "prepend-items",
    `Prepended ${prepended} items`,
    indexBefore,
    relTopBefore,
    many ? "None mode at top: viewport should stay stable after large prepend" : "None mode at top: same item should stay at same position after prepend",
    { driftTolerance: many && variableHeight ? 5 : 2 },
  );

  // Scroll up and verify prepended items are actually reachable.
  await scrollUntil(container, () => scrollContainerWithWheelTo(page, container, 0), (st) => st === 0, "scrollTop == 0 after wheel scroll");
  await waitTrue(async () => (await count(container, `[data-index='-${prepended}']`)) > 0, {
    timeout: 5_000,
    message: "None mode: prepended items should be reachable after scrolling up",
  });
}

/** The "no convergence to the new bottom" check right after a large append (:3492, :4096, :4775). */
async function largeAppendAtBottomDoesNotFollow(t, anchorMode, variableHeight, useItemsProvider, message) {
  const { page } = t;
  const container = await mountWith(t, anchorMode, { variableHeight, useItemsProvider });

  await scrollToBottomAndWait(container);

  await mutate(page, "append-many-items", "Appended 100 items");
  // The viewport should NOT end up at the very bottom of the grown list.
  const st = await metric(container, "scrollTop");
  const sh = await metric(container, "scrollHeight");
  const gap = await bottomGap(container);
  assert(gap > 2000, `${message} scrollTop: ${st}, scrollHeight: ${sh}, gap: ${gap}`);
}

/** The near-top / top / bottom / mid-list stability Theories (:3565, :3597, :3628, :3663, :3694). */
async function positionThenMutate(t, anchorMode, useItemsProvider, position, buttonId, status, message, { useDefaultComparer = false } = {}) {
  const { page } = t;
  const container = await mountWith(t, anchorMode, { useItemsProvider, useDefaultComparer });

  switch (position) {
    case "near-top":
      await scrollNearTopAndWaitForRender(container);
      break;
    case "top":
      await verifyInitialPosition(anchorMode, container, "list");
      if (anchorMode === "2") await scrollToTopAndWaitForRender(container);
      break;
    case "bottom":
      await scrollToBottomAndWait(container);
      break;
    case "mid-list":
      await scrollMidListAndWaitForRender(container);
      break;
  }

  const { index: indexBefore, relTop: relTopBefore } = await getItemPositionInContainer(container, ".item");
  await mutateAndAssertStable(page, container, buttonId, status, indexBefore, relTopBefore, message, { driftTolerance: 2 });
}

/** A mid-list prepend whose item must stay exactly (Start :4149, End :4235) or to the whole pixel (None :3848). */
async function midListPrepend(t, anchorMode, useItemsProvider, message, tolerance) {
  const { page } = t;
  const container = await mountWith(t, anchorMode, { useItemsProvider });

  await scrollMidListAndWaitForRender(container);

  const { index: indexBefore, relTop: relTopBefore } = await getItemPositionInContainer(container, ".item");
  await mutateAndAssertStable(page, container, "prepend-items", "Prepended 10 items", indexBefore, relTopBefore, message, tolerance);
}

/** AnchorMode_Start_PrependAtTop_NewItemsVisible (:4070) and AnchorMode_Start_LargePrependAtTop_StillShowsNewItems (:4508). */
async function startPrependAtTopShowsNewItems(t, variableHeight, useItemsProvider, { many = false } = {}) {
  const { page } = t;
  const container = await mountWith(t, "1", { variableHeight, useItemsProvider });

  assertEqual(0, await getScrollTop(container), "scrollTop");

  const prepended = many ? 100 : 10;
  await mutate(page, many ? "prepend-many-items" : "prepend-items", `Prepended ${prepended} items`);

  await waitForRenderToSettle(container);
  const scrollTopAfter = await getScrollTop(container);
  assert(
    scrollTopAfter < 50,
    many
      ? `Beginning mode: large prepend should still pin to top, but scrollTop was ${scrollTopAfter}`
      : `Beginning mode: should stay near top after prepend, but scrollTop was ${scrollTopAfter}`,
  );

  await waitTrue(async () => (await count(container, `[data-index='-${prepended}']`)) > 0);
}

/** AnchorMode_End_PrependAtTop_ViewportStaysStable (:4178) and AnchorMode_End_LargePrependAtTop_ViewportStaysStable (:4573). */
async function endPrependAtTop(t, variableHeight, useItemsProvider, { many = false } = {}) {
  const { page } = t;
  const container = await mountWith(t, "2", { variableHeight, useItemsProvider });

  await verifyInitialPosition("2", container, "list");
  await scrollToTopAndWaitForRender(container);

  const { index: indexBefore, relTop: relTopBefore } = await getItemPositionInContainer(container, ".item");

  // End mode at the top: viewport should stay stable — the same items stay visible. scrollTop may
  // increase to compensate for prepended items.
  await mutateAndAssertStable(
    page,
    container,
    many ? "prepend-many-items" : "prepend-items",
    many ? "Prepended 100 items" : "Prepended 10 items",
    indexBefore,
    relTopBefore,
    many ? "End mode at top: viewport should stay stable after large prepend" : "End mode at top: viewport should stay stable after prepend",
    { driftTolerance: variableHeight ? 5 : 2 },
  );
}

/** AnchorMode_End_AppendAtBottom_ViewportFollows (:4211). */
async function endAppendAtBottomFollows(t, variableHeight, useItemsProvider) {
  const { page } = t;
  const container = await mountWith(t, "2", { variableHeight, useItemsProvider });

  await scrollToBottomAndWait(container);

  await mutate(page, "append-items", "Appended 10 items");

  await waitTrue(async () => (await bottomGap(container)) < 2, {
    message: "End mode: viewport should follow new content to the bottom after append",
  });
}

/** AnchorMode_End_AppendAtMidList_DoesNotAutoScroll (:4262). */
async function endAppendAtMidList(t, useItemsProvider) {
  const { page } = t;
  const container = await mountWith(t, "2", { useItemsProvider });

  await scrollMidListAndWaitForRender(container);

  const { index: indexBefore, relTop: relTopBefore, scrollTop: scrollTopBefore } = await getItemPositionInContainer(container, ".item");

  await mutate(page, "append-items", "Appended 10 items");

  await waitForRenderToSettle(container);
  const { relTop: relTopAfter, scrollTop: scrollTopAfter } = await getItemPositionInContainer(container, ".item", indexBefore);
  assert(
    Math.abs(scrollTopAfter - scrollTopBefore) < 2,
    `End mode mid-list: scrollTop should not change on append. Before: ${scrollTopBefore}, After: ${scrollTopAfter}`,
  );
  assert(
    Math.abs(relTopAfter - relTopBefore) < 2,
    `End mode mid-list: visible item should not shift on append. relTop before: ${relTopBefore}, after: ${relTopAfter}`,
  );
}

/** AnchorMode_End_LargeAppendAtBottom_StillFollows (:4290): polls 500 ms apart for 30 s, as Blazor's loop. */
async function endLargeAppendStillFollows(t, variableHeight, useItemsProvider) {
  const { page } = t;
  const container = await mountWith(t, "2", { variableHeight, useItemsProvider });

  await scrollToBottomAndWait(container);

  await mutate(page, "append-many-items", "Appended 100 items");

  const read = () =>
    container.evaluate((c) => {
      let maxIndex = -1;
      for (const el of c.querySelectorAll(".item[data-index]")) maxIndex = Math.max(maxIndex, Number.parseInt(el.getAttribute("data-index"), 10));
      return { st: Math.round(c.scrollTop), sh: Math.round(c.scrollHeight), ch: Math.round(c.clientHeight), maxIndex };
    });

  let m = { st: 0, sh: 0, ch: 0, maxIndex: -1 };
  let pinnedToBottom = false;
  let tailMaterialized = false;
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    m = await read();
    pinnedToBottom = m.sh - m.st - m.ch < 2;
    tailMaterialized = m.maxIndex >= 1099;
    if (pinnedToBottom && tailMaterialized) break;
    await new Promise((resolve) => setTimeout(resolve, SELENIUM_POLL));
  }

  assert(
    pinnedToBottom,
    `End mode: large append should auto-follow to the new bottom without manual scrolling. Final: scrollTop=${m.st}, scrollHeight=${m.sh}, ` +
      `clientHeight=${m.ch}, gap=${m.sh - m.st - m.ch} (want <2), maxRenderedIndex=${m.maxIndex} (want 1099). variableHeight=${variableHeight}, ` +
      `useItemsProvider=${useItemsProvider}. A gap far above 0 with scrollTop near the OLD bottom means the viewport was stranded (auto-follow pin skipped).`,
  );

  // The rows at the new bottom must materialize as real items (not async placeholders)
  assert(
    tailMaterialized,
    `End mode: the last real row (index 1099) must be visible at the bottom. maxRenderedIndex=${m.maxIndex}, scrollTop=${m.st}, scrollHeight=${m.sh}, ` +
      `clientHeight=${m.ch}, gap=${m.sh - m.st - m.ch}.`,
  );
}

/** The two 5-item End tests (:4341, :4371): after the appends, the list follows to a real bottom. */
async function assertFollowedToBottom(container, message) {
  await waitTrue(async () => (await metric(container, "scrollTop")) > 0 && (await bottomGap(container)) < 2, { timeout: 10_000, message });
}

/** AnchorMode_DeleteAboveViewport_ViewportStaysStable (:4410) and …_DeleteBelowViewport_… (:4443). */
async function deleteMidList(t, anchorMode, useItemsProvider, where) {
  const { page } = t;
  const container = await mountWith(t, anchorMode, { useItemsProvider });

  await scrollMidListAndWaitForRender(container);
  await waitForRenderToSettle(container);

  const { index: indexBefore, relTop: relTopBefore, scrollTop: scrollTopBefore } = await getItemPositionInContainer(container, ".item");

  if (where === "above") {
    // Tsazor deviation A6: Blazor skips this test (#66509) — its deletion above the viewport isn't
    // compensated. Tsazor compensates it as a prepend's shift, so the test runs and asserts the fix.
    await mutateAndAssertStable(
      page,
      container,
      "delete-above",
      "Deleted 10 items from above",
      indexBefore,
      relTopBefore,
      `AnchorMode ${anchorMode} (provider=${useItemsProvider}): viewport should stay stable after deleting items above`,
      { driftTolerance: 5 },
    );
    return;
  }

  await mutate(page, "delete-below", "Deleted 10 items from below");
  await waitForRenderToSettle(container);

  const { index: indexAfter, scrollTop: scrollTopAfter } = await getItemPositionInContainer(container, ".item");
  assertEqual(indexBefore, indexAfter, "first visible item");
  assert(
    Math.abs(scrollTopAfter - scrollTopBefore) < 5,
    `AnchorMode ${anchorMode} (provider=${useItemsProvider}): scrollTop should not change after deleting items below. Before: ${scrollTopBefore}, After: ${scrollTopAfter}`,
  );
}

/** AnchorMode_DeleteAtViewportTop_FirstSurvivingItemJumpsToTheTop (:4473). */
async function deleteAtViewportTop(t, anchorMode, useItemsProvider) {
  const { page } = t;
  const container = await mountWith(t, anchorMode, { useItemsProvider });

  // Scroll down a small amount so the anchor item (around index 4-5) is within the range of
  // "Delete 10 from top" (items 0-9).
  await scrollUntil(container, () => scrollContainer(container, 200), (st) => st > 100, "scrollTop > 100 after ScrollContainer(200)");
  await waitForRenderToSettle(container);

  // Delete 10 from the top — this removes items 0-9, including the anchor.
  await mutate(page, "delete-above", "Deleted 10 items from above");
  await waitForRenderToSettle(container);

  // Items should still be rendered.
  await waitTrue(async () => (await count(container, ".item")) > 0, { message: "Items should still be rendered after deletion at viewport" });

  // The first visible item should be the first surviving item (index 10), since items 0-9 were deleted
  // and the viewport shifts up naturally.
  const { index: firstVisibleIndex } = await getItemPositionInContainer(container, ".item");
  const firstVisibleIdx = Number.parseInt(firstVisibleIndex, 10);
  assert(firstVisibleIdx >= 10, `After deleting items 0-9, the first visible item should be >= 10, but was ${firstVisibleIdx}`);
}

/** AnchorMode_End_AppendAfterLeavingBottom_DoesNotReengage (:4606). */
async function endAppendAfterLeavingBottom(t, variableHeight, useItemsProvider) {
  const { page } = t;
  const container = await mountWith(t, "2", { variableHeight, useItemsProvider });

  await scrollToBottomAndWait(container);

  await mutate(page, "append-items", "Appended 10 items");
  await waitTrue(async () => (await bottomGap(container)) < 2, { message: "End mode: first append should follow to bottom" });

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
  const scrollHeightBeforeSecondAppend = await metric(container, "scrollHeight");
  const clientHeightBeforeSecondAppend = await metric(container, "clientHeight");

  await mutate(page, "append-items", "Appended 10 items");

  await waitForRenderToSettle(container);
  const scrollTopAfterSecondAppend = await getScrollTop(container);
  const scrollHeightAfterSecondAppend = await metric(container, "scrollHeight");
  assert(
    Math.abs(scrollTopAfterSecondAppend - scrollTopBeforeSecondAppend) < 2,
    `End mode: should not re-engage after leaving bottom. scrollTop before: ${scrollTopBeforeSecondAppend}, after: ${scrollTopAfterSecondAppend}, ` +
      `scrollHeight before: ${scrollHeightBeforeSecondAppend}, after: ${scrollHeightAfterSecondAppend}, clientHeight: ${clientHeightBeforeSecondAppend}`,
  );
}

/** Enters the page's "console scenario": 40 items, OverscanCount 100, all of them in the DOM. */
async function enterConsoleScenario(page, container) {
  await mutate(page, "set-console-scenario", "Console scenario");
  await waitTrue(async () => (await count(container, ".item")) > 6);
  await waitForRenderToSettle(container);
}

/** AnchorMode_End_SmallDataset_AppendAfterScrollingUpAFewRows_DoesNotReengage (:4652). */
async function endSmallDatasetAppendAfterScrollingUp(t, useItemsProvider) {
  const { page } = t;
  const container = await mountWith(t, "2", { useItemsProvider });

  // Enter the console-logs regime: large overscan + dataset taller than the viewport but with fewer
  // total items than the visible capacity.
  await enterConsoleScenario(page, container);

  // Start pinned at the bottom (End mode), then scroll UP just a few rows (~3 * 50px).
  await scrollToBottomAndWait(container);
  const bottomScrollTop = await getScrollTop(container);
  const targetScrollTop = bottomScrollTop - 150;
  await scrollUntil(
    container,
    () => scrollContainerWithWheelTo(page, container, targetScrollTop),
    (st) => st <= bottomScrollTop - 100,
    `scrolled up a few rows from the bottom (target ${targetScrollTop})`,
  );
  await waitForRenderToSettle(container);

  const scrollTopBefore = await getScrollTop(container);
  const scrollHeightBefore = await metric(container, "scrollHeight");
  const clientHeight = await metric(container, "clientHeight");
  assert(scrollHeightBefore - scrollTopBefore - clientHeight > 50, "Precondition: the user should be scrolled up away from the bottom before the append.");

  await mutate(page, "append-items", "Appended 10 items");
  await waitForRenderToSettle(container);

  const scrollTopAfter = await getScrollTop(container);
  const scrollHeightAfter = await metric(container, "scrollHeight");
  assert(
    Math.abs(scrollTopAfter - scrollTopBefore) < 5,
    `End mode (small dataset): after the user scrolled up only a few rows, an append must NOT re-engage and pull the viewport back to the bottom. ` +
      `scrollTop before: ${scrollTopBefore}, after: ${scrollTopAfter}, scrollHeight before: ${scrollHeightBefore}, after: ${scrollHeightAfter}, clientHeight: ${clientHeight}`,
  );
}

/** AnchorMode_Start_PrependAfterLeavingTop_DoesNotReengage (:4699). */
async function startPrependAfterLeavingTop(t, variableHeight, useItemsProvider) {
  const { page } = t;
  const container = await mountWith(t, "1", { variableHeight, useItemsProvider });

  assertEqual(0, await getScrollTop(container), "scrollTop");

  await mutate(page, "prepend-items", "Prepended 10 items");
  await waitTrue(async () => (await count(container, "[data-index='-10']")) > 0);
  await waitForRenderToSettle(container);

  await scrollUntil(container, () => scrollContainerWithWheelTo(page, container, 500), (st) => st > 200, "scrollTop > 200 after wheel scroll");
  await waitForRenderToSettle(container);

  const scrollTopBefore = await getScrollTop(container);

  await mutate(page, "prepend-items", "Prepended 10 items");

  await waitForRenderToSettle(container);
  const scrollTopAfter = await getScrollTop(container);
  assert(
    scrollTopAfter > 200,
    `Beginning mode: should not pull user back to top after leaving. scrollTop before: ${scrollTopBefore}, after: ${scrollTopAfter} (expected >200, not near 0)`,
  );
}

/** AnchorMode_Start_SmallDataset_PrependAfterScrollingDownAFewRows_DoesNotReengage (:4732). */
async function startSmallDatasetPrependAfterScrollingDown(t, useItemsProvider) {
  const { page } = t;
  const container = await mountWith(t, "1", { useItemsProvider });

  await enterConsoleScenario(page, container);

  // Start pinned at the top (Start mode), then scroll DOWN just a few rows (~3 * 50px).
  assertEqual(0, await getScrollTop(container), "scrollTop");
  await scrollUntil(container, () => scrollContainerWithWheelTo(page, container, 150), (st) => st >= 100, "scrolled down a few rows from the top (target 150)");
  await waitForRenderToSettle(container);

  const scrollTopBefore = await getScrollTop(container);
  assert(scrollTopBefore >= 100, "Precondition: the user should be scrolled down away from the top before the prepend.");

  await mutate(page, "prepend-items", "Prepended 10 items");
  await waitForRenderToSettle(container);

  // A stable viewport keeps scrollTop at (or below, once the prepended rows push content down) where the
  // user left it. The bug would instead snap scrollTop back toward 0.
  const scrollTopAfter = await getScrollTop(container);
  assert(
    scrollTopAfter >= 100,
    `Start mode (small dataset): after the user scrolled down a few rows, a prepend must NOT re-engage and pull the viewport back to the top. ` +
      `scrollTop before: ${scrollTopBefore}, after: ${scrollTopAfter} (expected >=100, not near 0)`,
  );
}

export const tests = [
  {
    // Blazor: DynamicContent_PrependItemsWhileScrolledToMiddle_VisibleItemsStayInPlace (:1211)
    name: "DynamicContent_PrependItemsWhileScrolledToMiddle_VisibleItemsStayInPlace",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDynamicContent");

      const container = await exists(page, "#scroll-container");
      await waitTrue(async () => (await count(container, ".item")) > 0);

      // Scroll past the overscan window to force true virtualization.
      await scrollToOffsetWithStabilization(container, 5000, 10);

      // Record the first visible item and its Y position.
      const first = await container.evaluate((c) => {
        const containerRect = c.getBoundingClientRect();
        const containerTop = Math.round(containerRect.top + window.scrollY);
        for (const item of c.querySelectorAll(".item")) {
          const itemTop = Math.round(item.getBoundingClientRect().top + window.scrollY);
          const relativeY = itemTop - containerTop;
          if (relativeY >= 0 && relativeY < containerRect.height) return { index: item.getAttribute("data-index"), top: itemTop };
        }
        return null;
      });
      assert(first !== null && first.index !== null, "a visible item with a data-index");

      await (await exists(page, "#prepend-items")).click();
      await waitContains("Prepended 10 items", () => statusText(page));

      // The visible item should stay in place after prepend.
      const firstVisibleTopAfter = await locationY(container.locator(`[data-index='${first.index}']`));

      assert(
        Math.abs(firstVisibleTopAfter - first.top) < 5,
        `Visible item ${first.index} should not move when items are prepended above. Before Y: ${first.top}, After Y: ${firstVisibleTopAfter}`,
      );

      await waitTrue(async () => (await count(container, ".item")) > 0);

      // Verify prepended items are reachable at the top.
      await scrollUntil(container, () => scrollContainerWithWheelTo(page, container, 0), (st) => st === 0, "scrollTop == 0 after wheel scroll");
      await assertScrollTop(container, (st) => st === 0, "scrollTop == 0");
      await waitTrue(async () => (await count(container, "[data-index='-10']")) > 0);
      assert((await count(container, ".item")) > 0, "Should render items after scrolling back to top.");
    },
  },
  {
    // Blazor: DynamicContent_AppendItemsWhileScrolledToMiddle_VisibleItemsStayInPlace (:1263)
    name: "DynamicContent_AppendItemsWhileScrolledToMiddle_VisibleItemsStayInPlace",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDynamicContent");

      const container = await exists(page, "#scroll-container");
      await waitTrue(async () => (await count(container, ".item")) > 0);

      // Scroll past the overscan window to force true virtualization.
      await scrollToOffsetWithStabilization(container, 5000, 10);
      const firstVisible = container.locator(".item").first();
      const firstVisibleIndex = await firstVisible.getAttribute("data-index");
      const firstVisibleTopBefore = await locationY(firstVisible);
      const scrollTopBefore = await getScrollTop(container);

      await (await exists(page, "#append-items")).click();
      await waitContains("Appended 10 items", () => statusText(page));

      // Appending below the viewport should not affect visible items.
      const firstVisibleTopAfter = await locationY(container.locator(`[data-index='${firstVisibleIndex}']`));
      const scrollTopAfter = await getScrollTop(container);

      assert(
        Math.abs(firstVisibleTopAfter - firstVisibleTopBefore) < 5,
        `Visible item ${firstVisibleIndex} should not move when items are appended below. Before: ${firstVisibleTopBefore}, After: ${firstVisibleTopAfter}`,
      );
      assert(
        Math.abs(scrollTopAfter - scrollTopBefore) < 5,
        `scrollTop should not change when appending below viewport. Before: ${scrollTopBefore}, After: ${scrollTopAfter}`,
      );
    },
  },
  {
    // Blazor: DynamicContent_PrependItemsWhileAtTop_NewItemsAppearAtTop (:1296)
    name: "DynamicContent_PrependItemsWhileAtTop_NewItemsAppearAtTop",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDynamicContent");

      const container = await exists(page, "#scroll-container");
      await waitTrue(async () => (await count(container, ".item")) > 0);

      // Verify we're at the top.
      assertEqual(0, await getScrollTop(container), "scrollTop");

      await (await exists(page, "#prepend-items")).click();
      await waitContains("Prepended 10 items", () => statusText(page));

      // At scrollTop=0, the natural floor prevents native anchoring from compensating — new items appear
      // at the top and old items shift down. This is the default AnchorMode.Start behavior.
      const scrollTopAfter = await getScrollTop(container);
      assert(scrollTopAfter < 50, `scrollTop should stay near 0 at the natural floor, but was ${scrollTopAfter}`);

      // The prepended items should become visible after the IO callback triggers re-render.
      await waitTrue(async () => (await count(container, "[data-index='-10']")) > 0);
    },
  },
  {
    // Blazor: DynamicContent_AppendItemsWhileAtBottom_ViewportStaysStable (:1322)
    name: "DynamicContent_AppendItemsWhileAtBottom_ViewportStaysStable",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDynamicContent");

      const container = await exists(page, "#scroll-container");
      await waitTrue(async () => (await count(container, ".item")) > 0);

      // Scroll to the bottom edge.
      await container.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      // Blazor waits for the gap only. Right after the jump the gap is already 0 while the spacers still hold the
      // ItemSize estimate (50px; the rows measure 62px) and the tail isn't rendered: the jump is still in flight.
      // Selenium's round trips let it land before the click; Playwright's don't, and an append that overtakes the
      // jump lands at the new bottom (half the runs in Edge). So the bottom edge here is the last row rendered.
      await waitTrue(async () => (await count(container, "[data-index='499']")) > 0 && (await bottomGap(container)) < 2);

      const scrollTopBefore = await getScrollTop(container);

      await (await exists(page, "#append-items")).click();
      await waitContains("Appended 10 items", () => statusText(page));

      // Default AnchorMode is Beginning, which only pins the top edge. The viewport should NOT converge to
      // the new bottom: the 500px of new items leave a gap.
      const scrollTopAfter = await getScrollTop(container);
      const scrollHeightAfter = await metric(container, "scrollHeight");
      const gapAfter = await bottomGap(container);
      assert(
        gapAfter > 50,
        `Default Beginning mode: should not converge to bottom after small append. scrollTop before: ${scrollTopBefore}, after: ${scrollTopAfter}, ` +
          `scrollHeight: ${scrollHeightAfter}, gap: ${gapAfter}`,
      );
    },
  },
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_None_PrependAtTop_ViewportStaysStable (:3454)
    name: `AnchorMode_None_PrependAtTop_ViewportStaysStable(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => nonePrependAtTop(t, variableHeight, useItemsProvider),
  })),
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_None_LargeAppendAtBottom_DoesNotFollowToBottom (:3492)
    name: `AnchorMode_None_LargeAppendAtBottom_DoesNotFollowToBottom(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => largeAppendAtBottomDoesNotFollow(t, "0", variableHeight, useItemsProvider, "None mode: should not converge to bottom after large append."),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: AnchorMode_None_AppendAtBottom_NoAutoScroll (:3519)
    name: `AnchorMode_None_AppendAtBottom_NoAutoScroll(useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      positionThenMutate(t, "0", useItemsProvider, "bottom", "append-items", "Appended 10 items", "None mode at bottom: same item should stay at same position after small append"),
  })),
  ...[...MODES_AND_SOURCES, ["0", true, true], ["1", true, true]].map(([anchorMode, useItemsProvider, useDefaultComparer = false]) => ({
    // Blazor: AnchorMode_NearTop_PrependKeepsViewportStable (:3565)
    name: `AnchorMode_NearTop_PrependKeepsViewportStable(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider}${useDefaultComparer ? ", useDefaultComparer: true" : ""})`,
    run: (t) =>
      positionThenMutate(
        t,
        anchorMode,
        useItemsProvider,
        "near-top",
        "prepend-items",
        "Prepended 10 items",
        `AnchorMode ${anchorMode} near top (defaultComparer=${useDefaultComparer}): viewport should stay stable after prepend`,
        { useDefaultComparer },
      ),
  })),
  ...MODES_AND_SOURCES.map(([anchorMode, useItemsProvider]) => ({
    // Blazor: AnchorMode_NearTop_AppendKeepsViewportStable (:3597)
    name: `AnchorMode_NearTop_AppendKeepsViewportStable(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      positionThenMutate(t, anchorMode, useItemsProvider, "near-top", "append-items", "Appended 10 items", `AnchorMode ${anchorMode} near top: viewport should stay stable after append`),
  })),
  ...MODES_AND_SOURCES.map(([anchorMode, useItemsProvider]) => ({
    // Blazor: AnchorMode_Top_AppendKeepsViewportStable (:3628)
    name: `AnchorMode_Top_AppendKeepsViewportStable(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => positionThenMutate(t, anchorMode, useItemsProvider, "top", "append-items", "Appended 10 items", `AnchorMode ${anchorMode} at top: viewport should stay stable after append`),
  })),
  ...MODES_AND_SOURCES.map(([anchorMode, useItemsProvider]) => ({
    // Blazor: AnchorMode_Bottom_PrependKeepsViewportStable (:3663)
    name: `AnchorMode_Bottom_PrependKeepsViewportStable(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      positionThenMutate(t, anchorMode, useItemsProvider, "bottom", "prepend-items", "Prepended 10 items", `AnchorMode ${anchorMode} at bottom: viewport should stay stable after prepend`),
  })),
  ...[
    ["0", false],
    ["1", false],
    ["0", true],
    ["1", true],
    ["0", true, true],
    ["1", true, true],
  ].map(([anchorMode, useItemsProvider, useDefaultComparer = false]) => ({
    // Blazor: AnchorMode_MidList_AppendKeepsViewportStable (:3694)
    name: `AnchorMode_MidList_AppendKeepsViewportStable(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider}${useDefaultComparer ? ", useDefaultComparer: true" : ""})`,
    run: (t) =>
      positionThenMutate(
        t,
        anchorMode,
        useItemsProvider,
        "mid-list",
        "append-items",
        "Appended 10 items",
        `AnchorMode ${anchorMode} mid-list (defaultComparer=${useDefaultComparer}): viewport should stay stable after append`,
        { useDefaultComparer },
      ),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: AnchorMode_None_MidList_ViewportStable (:3848)
    name: `AnchorMode_None_MidList_ViewportStable(useItemsProvider: ${useItemsProvider})`,
    run: (t) => midListPrepend(t, "0", useItemsProvider, "None mode mid-list: viewport should stay visually stable after prepend", { compareWholePixels: true }),
  })),
  {
    // Blazor: AnchorMode_None_AsyncProvider_PrependKeepsViewportStable (:3936)
    name: "AnchorMode_None_AsyncProvider_PrependKeepsViewportStable",
    async run(t) {
      const { page } = t;
      const container = await mountAnchorModeComponent(t, "0", { variableHeight: true, useItemsProvider: true, delay: true });

      await scrollMidListAndWaitForRender(container);
      // With provider delay, wait for the visible items to fully settle (provider round-trips complete
      // and the window stabilizes).
      await waitForRenderToSettle(container);

      const { index: indexBefore, relTop: relTopBefore } = await getItemPositionInContainer(container, ".item");

      // Wait for all provider calls to complete (refreshDataAsync finishes), then for the final render and restore.
      await mutateAndAssertStable(
        page,
        container,
        "prepend-items",
        "Prepended 10 items",
        indexBefore,
        relTopBefore,
        "Async provider: viewport should stay stable after prepend despite placeholder transition",
        { driftTolerance: 5 },
      );
    },
  },
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_Start_PrependAtTop_NewItemsVisible (:4070)
    name: `AnchorMode_Start_PrependAtTop_NewItemsVisible(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => startPrependAtTopShowsNewItems(t, variableHeight, useItemsProvider),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: AnchorMode_Start_AppendAtBottom_ViewportStable (:4096) — appends 100 despite its name
    name: `AnchorMode_Start_AppendAtBottom_ViewportStable(useItemsProvider: ${useItemsProvider})`,
    run: (t) => largeAppendAtBottomDoesNotFollow(t, "1", false, useItemsProvider, "Beginning mode: should not follow to bottom after append."),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: AnchorMode_Start_SmallAppendAtBottom_ViewportStable (:4121)
    name: `AnchorMode_Start_SmallAppendAtBottom_ViewportStable(useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      positionThenMutate(t, "1", useItemsProvider, "bottom", "append-items", "Appended 10 items", "Beginning mode at bottom: same item should stay at same position after small append"),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: AnchorMode_Start_MidList_ViewportStable (:4149)
    name: `AnchorMode_Start_MidList_ViewportStable(useItemsProvider: ${useItemsProvider})`,
    run: (t) => midListPrepend(t, "1", useItemsProvider, "Beginning mode mid-list: viewport should stay stable after prepend", {}),
  })),
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_End_PrependAtTop_ViewportStaysStable (:4178)
    name: `AnchorMode_End_PrependAtTop_ViewportStaysStable(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => endPrependAtTop(t, variableHeight, useItemsProvider),
  })),
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_End_AppendAtBottom_ViewportFollows (:4211)
    name: `AnchorMode_End_AppendAtBottom_ViewportFollows(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => endAppendAtBottomFollows(t, variableHeight, useItemsProvider),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: AnchorMode_End_MidList_ViewportStable (:4235)
    name: `AnchorMode_End_MidList_ViewportStable(useItemsProvider: ${useItemsProvider})`,
    run: (t) => midListPrepend(t, "2", useItemsProvider, "End mode mid-list: viewport should stay stable after prepend", {}),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: AnchorMode_End_AppendAtMidList_DoesNotAutoScroll (:4262)
    name: `AnchorMode_End_AppendAtMidList_DoesNotAutoScroll(useItemsProvider: ${useItemsProvider})`,
    run: (t) => endAppendAtMidList(t, useItemsProvider),
  })),
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_End_LargeAppendAtBottom_StillFollows (:4290)
    name: `AnchorMode_End_LargeAppendAtBottom_StillFollows(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => endLargeAppendStillFollows(t, variableHeight, useItemsProvider),
  })),
  {
    // Blazor: AnchorMode_End_SmallDataset_AppendFollowsToBottom (:4341)
    name: "AnchorMode_End_SmallDataset_AppendFollowsToBottom",
    async run(t) {
      const { page } = t;
      const container = await mountAnchorModeComponent(t, "2");

      // Reduce to 5 items — all fit in viewport, spacerAfter height should be 0.
      await mutate(page, "set-small-count", "Set to 5 items");
      await waitTrue(async () => (await count(container, ".item")) > 0);

      // Scroll to bottom (may already be there if content fits).
      await scrollToBottomAndWait(container);

      // Append 10 items — now there's more content than viewport.
      await mutate(page, "append-items", "Appended 10 items");

      // End mode should auto-follow to bottom even though spacerAfter was 0 before append.
      await assertFollowedToBottom(container, "End mode: small dataset append should follow to bottom");
    },
  },
  {
    // Blazor: AnchorMode_End_GrowingDataset_AppendFollowsToBottom (:4371)
    name: "AnchorMode_End_GrowingDataset_AppendFollowsToBottom",
    async run(t) {
      const { page } = t;
      const container = await mountAnchorModeComponent(t, "2");

      // Reduce to 5 items — all fit in viewport, no scrollbar needed.
      await mutate(page, "set-small-count", "Set to 5 items");
      await waitTrue(async () => (await count(container, ".item")) > 0);

      // Add items one at a time. End mode should keep following to bottom even before a scrollbar
      // appears (spacerAfter is 0).
      for (let i = 0; i < 20; i++) {
        await mutate(page, "append-one-item", "Appended 1 item");
      }

      // After adding 20 items (total 25), a scrollbar should exist and End mode should have followed to
      // the bottom.
      await assertFollowedToBottom(container, "End mode: growing dataset (one at a time) should follow to bottom");
    },
  },
  ...MODES_AND_SOURCES.map(([anchorMode, useItemsProvider]) => ({
    // Blazor: AnchorMode_DeleteAboveViewport_ViewportStaysStable (:4410) — skipped in Blazor (#66509).
    // Tsazor deviation A6: deletions above the viewport are compensated, so the test runs.
    name: `AnchorMode_DeleteAboveViewport_ViewportStaysStable(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => deleteMidList(t, anchorMode, useItemsProvider, "above"),
  })),
  ...MODES_AND_SOURCES.map(([anchorMode, useItemsProvider]) => ({
    // Blazor: AnchorMode_DeleteBelowViewport_ViewportStaysStable (:4443)
    name: `AnchorMode_DeleteBelowViewport_ViewportStaysStable(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => deleteMidList(t, anchorMode, useItemsProvider, "below"),
  })),
  ...MODES_AND_SOURCES.map(([anchorMode, useItemsProvider]) => ({
    // Blazor: AnchorMode_DeleteAtViewportTop_FirstSurvivingItemJumpsToTheTop (:4473)
    name: `AnchorMode_DeleteAtViewportTop_FirstSurvivingItemJumpsToTheTop(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => deleteAtViewportTop(t, anchorMode, useItemsProvider),
  })),
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_Start_LargePrependAtTop_StillShowsNewItems (:4508)
    name: `AnchorMode_Start_LargePrependAtTop_StillShowsNewItems(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => startPrependAtTopShowsNewItems(t, variableHeight, useItemsProvider, { many: true }),
  })),
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_None_LargePrependAtTop_ViewportStaysStable (:4533)
    name: `AnchorMode_None_LargePrependAtTop_ViewportStaysStable(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => nonePrependAtTop(t, variableHeight, useItemsProvider, { many: true }),
  })),
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_End_LargePrependAtTop_ViewportStaysStable (:4573)
    name: `AnchorMode_End_LargePrependAtTop_ViewportStaysStable(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => endPrependAtTop(t, variableHeight, useItemsProvider, { many: true }),
  })),
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_End_AppendAfterLeavingBottom_DoesNotReengage (:4606)
    name: `AnchorMode_End_AppendAfterLeavingBottom_DoesNotReengage(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => endAppendAfterLeavingBottom(t, variableHeight, useItemsProvider),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: AnchorMode_End_SmallDataset_AppendAfterScrollingUpAFewRows_DoesNotReengage (:4652)
    name: `AnchorMode_End_SmallDataset_AppendAfterScrollingUpAFewRows_DoesNotReengage(useItemsProvider: ${useItemsProvider})`,
    run: (t) => endSmallDatasetAppendAfterScrollingUp(t, useItemsProvider),
  })),
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_Start_PrependAfterLeavingTop_DoesNotReengage (:4699)
    name: `AnchorMode_Start_PrependAfterLeavingTop_DoesNotReengage(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => startPrependAfterLeavingTop(t, variableHeight, useItemsProvider),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: AnchorMode_Start_SmallDataset_PrependAfterScrollingDownAFewRows_DoesNotReengage (:4732)
    name: `AnchorMode_Start_SmallDataset_PrependAfterScrollingDownAFewRows_DoesNotReengage(useItemsProvider: ${useItemsProvider})`,
    run: (t) => startSmallDatasetPrependAfterScrollingDown(t, useItemsProvider),
  })),
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_Start_LargeAppendAtBottom_DoesNotFollowToBottom (:4775)
    name: `AnchorMode_Start_LargeAppendAtBottom_DoesNotFollowToBottom(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => largeAppendAtBottomDoesNotFollow(t, "1", variableHeight, useItemsProvider, "Beginning mode: should not converge to bottom after large append."),
  })),
  {
    // Tsazor deviation A16: in End mode at the bottom, a render that changes nothing still pins to the bottom and
    // flags "ignore the next scroll", but the pin doesn't move scrollTop, so no scroll event consumes the flag.
    // In Blazor the reader's next scroll was swallowed: the list kept following and the next append pulled it
    // back to the bottom (a live feed did that in Firefox and Safari). Tsazor ignores only a scroll to the
    // position of its own last write.
    name: "Tsazor_EndMode_ScrollAfterAPinThatDidNotMove_StaysWhereScrolled",
    async run(t) {
      const { page } = t;
      const container = await mountAnchorModeComponent(t, "2");
      await waitForRenderToSettle(container);
      // A render without a change (the comparer is unused with Items): the pin at the bottom doesn't move.
      await mutate(page, "toggle-comparer", "Using default ItemComparer");
      await waitForRenderToSettle(container);

      await container.evaluate((c) => {
        c.scrollTop = 400;
      });
      await page.waitForTimeout(300);
      await mutate(page, "append-one-item", "Appended 1 item");
      await waitForRenderToSettle(container);

      const scrollTop = await getScrollTop(container);
      assert(Math.abs(scrollTop - 400) < 5, `End mode: the reader scrolled up to 400 and an append should not pull the list back (scrollTop=${scrollTop}).`);
    },
  },
];
