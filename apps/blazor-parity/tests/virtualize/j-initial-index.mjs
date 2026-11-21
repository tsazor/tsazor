/**
 * Group J of Blazor's Virtualize E2E tests (docs/blazor-virtualize-net11.md §9): InitialItemIndex. Ported
 * from VirtualizationTest.cs; line numbers refer to it. Blazor's `Browser.SetWindowSize(w, h)` is the test's
 * `viewport`.
 */
import { assert, exists, sendKey, waitContains, waitTrue, wheel } from "../lib/harness.mjs";
import {
  count,
  getBottomRenderedIndex,
  getScrollTop,
  getTopRenderedIndex,
  mountAnchorModeForScrollToItem,
  setManualInitialIndex,
  statusText,
  viewportEdgeCoveredByRealItem,
  waitForRenderToSettle,
} from "./_helpers.mjs";

export const group = "J. InitialItemIndex";

/** Sets #scroll-container's height, as the tests do through JavaScript. */
function setContainerHeight(page, px) {
  return page.evaluate((height) => { document.getElementById("scroll-container").style.height = `${height}px`; }, px);
}

/** Unloads the list, then reloads it at InitialItemIndex `index` (the tests' common sequence). */
async function reloadAt(page, index, { resetScroll = false } = {}) {
  await (await exists(page, "#unload-list")).click();
  await exists(page, "#list-not-loaded");
  if (resetScroll) await page.evaluate(() => { document.getElementById("scroll-container").scrollTop = 0; });
  await setManualInitialIndex(page, index);
  await (await exists(page, "#reload-with-initial-index")).click();
}

/** InitialIndex_TallContainer_FillsViewportWithoutUserScroll (:6244) and …_NearEnd_… (:6308). */
async function tallContainerFillsViewport(t, useProvider, initialIndex, coverTop) {
  const { page } = t;
  await t.mount("VirtualizationAnchorMode");
  const container = await exists(page, "#scroll-container");
  await waitTrue(async () => (await count(container, ".item")) > 0);

  await setContainerHeight(page, 2000);
  await (await exists(page, "#toggle-height")).click();
  await waitContains("Switched to variable heights", () => statusText(page));
  if (useProvider) {
    await (await exists(page, "#toggle-provider")).click();
    await (await exists(page, "#toggle-delay")).click();
  }
  await reloadAt(page, initialIndex);

  await waitTrue(async () => (await getTopRenderedIndex(page)) === initialIndex, {
    message: async () =>
      `Item ${initialIndex} should remain aligned with the viewport top once the last item has loaded, but top rendered index was ` +
      `${await getTopRenderedIndex(page)}, scrollTop=${await getScrollTop(container)}.`,
  });
  if (coverTop) {
    await waitTrue(() => viewportEdgeCoveredByRealItem(page, "top"), {
      message: async () =>
        `Viewport top should be covered by a real item, but a gap was found (bottom=${await getBottomRenderedIndex(page)}, scrollTop=${await getScrollTop(container)}).`,
    });
  }
  await waitTrue(() => viewportEdgeCoveredByRealItem(page, "bottom"), {
    message: async () =>
      `Viewport bottom should be covered by a real item, but a gap was found (top=${await getTopRenderedIndex(page)}, scrollTop=${await getScrollTop(container)}).`,
  });
}

/** InitialIndex_OpensAtTargetWithRealContent (:6688). */
async function opensAtTargetWithRealContent(t, initialIndex, variableHeight, useProvider) {
  const { page } = t;
  await mountAnchorModeForScrollToItem(t, useProvider, { variableHeight, delay: useProvider });

  await reloadAt(page, initialIndex, { resetScroll: true });

  // The target item must sit at the top of the viewport even for small indices and with a delayed provider.
  await waitTrue(async () => (await getTopRenderedIndex(page)) === initialIndex, {
    message: async () => `top rendered index ${await getTopRenderedIndex(page)}, expected ${initialIndex}`,
  });
}

/** The top of item `index` relative to #scroll-container. */
function offsetOf(page, index) {
  return page.evaluate((i) => {
    const target = document.querySelector(`#scroll-container .item[data-index="${i}"]`);
    return target.getBoundingClientRect().top - document.getElementById("scroll-container").getBoundingClientRect().top;
  }, index);
}

/** InitialIndex_RetainsTargetWhenPreviousItemExpandsThenHomeEndTakeOver (:6732). */
async function retainsTargetThenHomeEndTakeOver(t, useProvider) {
  const { page } = t;
  const initialIndex = 500;
  const previousIndex = initialIndex - 1;

  await mountAnchorModeForScrollToItem(t, useProvider, { variableHeight: true, delay: useProvider });

  await reloadAt(page, initialIndex, { resetScroll: true });

  await waitTrue(async () => (await getTopRenderedIndex(page)) === initialIndex);

  const container = await exists(page, "#scroll-container");
  const targetOffset = await offsetOf(page, initialIndex);

  await page.evaluate((i) => {
    const item = document.querySelector(`#scroll-container .item[data-index="${i}"]`);
    item.style.minHeight = `${item.getBoundingClientRect().height + 200}px`;
  }, previousIndex);

  await waitTrue(async () => Math.abs((await offsetOf(page, initialIndex)) - targetOffset) <= 2, {
    message: `Item ${initialIndex} should remain pinned when item ${previousIndex} expands.`,
  });

  await sendKey(container, "End");
  await waitTrue(async () => (await count(container, ".item[data-index='999']")) > 0, {
    timeout: 10_000,
    message: `After End from InitialItemIndex=${initialIndex} (useProvider=${useProvider}), the last item (999) should be rendered.`,
  });

  await sendKey(container, "Home");
  await waitTrue(async () => (await count(container, ".item[data-index='0']")) > 0, {
    timeout: 10_000,
    message: `After Home from InitialItemIndex=${initialIndex} (useProvider=${useProvider}), item 0 should be rendered.`,
  });
}

/** InitialIndex_BeyondCount_ClampsToEnd (:6852). */
async function beyondCountClampsToEnd(t, useProvider) {
  const { page } = t;
  await mountAnchorModeForScrollToItem(t, useProvider, { delay: useProvider });

  await reloadAt(page, 100000, { resetScroll: true });

  // After clamping, the last item (999) must be rendered and the scroller pinned to the end
  // (the browser clamps scrollTop to its maximum since 999 cannot be aligned to the top of the viewport).
  await waitTrue(
    () =>
      page.evaluate(() => {
        const c = document.getElementById("scroll-container");
        const last = c.querySelector('.item[data-index="999"]');
        if (!last) return false;
        // Scroller must be pinned at max (within 2px) — proves the clamp targeted the end.
        return Math.abs(c.scrollTop + c.clientHeight - c.scrollHeight) <= 2;
      }),
    { message: "Expected last item (999) rendered and scroller pinned at end after clamping InitialItemIndex=100000." },
  );
}

export const tests = [
  {
    // Blazor: InitialIndex_PendingGrowth_DoesNotExceedMaxItemCount (:6176)
    name: "InitialIndex_PendingGrowth_DoesNotExceedMaxItemCount",
    viewport: { width: 1024, height: 2900 },
    async run(t) {
      const { page } = t;
      const maxItemCount = 20;
      const overscanCount = 3;
      const maximumRenderedItemCount = maxItemCount + 2 * overscanCount;

      await t.mount("VirtualizationAnchorMode");
      const container = await exists(page, "#scroll-container");

      await setContainerHeight(page, 2500);
      await (await exists(page, "#set-low-max-item-count")).click();
      await waitContains("MaxItemCount 20, overscan 3", () => statusText(page));
      await (await exists(page, "#toggle-provider")).click();
      await reloadAt(page, 100);

      await waitForRenderToSettle(container);
      const renderedItemCount = await count(container, ".item");

      assert(
        renderedItemCount <= maximumRenderedItemCount,
        `Expected at most ${maximumRenderedItemCount} rendered items (MaxItemCount=${maxItemCount} + 2*OverscanCount=${2 * overscanCount}), but found ${renderedItemCount}.`,
      );
    },
  },
  {
    // Blazor: InitialIndex_PendingGrowth_TallItemsBeforeTarget_KeepsTargetAligned (:6205)
    name: "InitialIndex_PendingGrowth_TallItemsBeforeTarget_KeepsTargetAligned",
    viewport: { width: 1024, height: 2400 },
    async run(t) {
      const { page } = t;
      const initialItemIndex = 100;

      await t.mount("VirtualizationAnchorMode");
      const container = await exists(page, "#scroll-container");

      await setContainerHeight(page, 2000);
      await (await exists(page, "#set-average-height-trap")).click();
      await waitContains("Tall rows before index 100", () => statusText(page));
      await (await exists(page, "#toggle-provider")).click();
      await reloadAt(page, initialItemIndex);

      await waitForRenderToSettle(container);

      assert(
        await viewportEdgeCoveredByRealItem(page, "bottom"),
        `Viewport bottom should be covered by a real item, but a gap was found (top=${await getTopRenderedIndex(page)}, scrollTop=${await getScrollTop(container)}).`,
      );

      await exists(page, `.item[data-index='${initialItemIndex}']`);
      const targetTopOffset = await offsetOf(page, initialItemIndex);

      assert(
        Math.abs(targetTopOffset) <= 2,
        `Item ${initialItemIndex} should remain aligned with the viewport top, but its offset was ${targetTopOffset}px (scrollTop=${await getScrollTop(container)}).`,
      );
    },
  },
  ...[false, true].map((useProvider) => ({
    // Blazor: InitialIndex_TallContainer_FillsViewportWithoutUserScroll (:6244)
    name: `InitialIndex_TallContainer_FillsViewportWithoutUserScroll(useProvider: ${useProvider})`,
    viewport: { width: 1024, height: 2400 },
    run: (t) => tallContainerFillsViewport(t, useProvider, 10, false),
  })),
  ...[false, true].map((useProvider) => ({
    // Blazor: InitialIndex_TallContainer_NearEnd_FillsViewportWithoutUserScroll (:6308)
    name: `InitialIndex_TallContainer_NearEnd_FillsViewportWithoutUserScroll(useProvider: ${useProvider})`,
    viewport: { width: 1024, height: 2400 },
    run: (t) => tallContainerFillsViewport(t, useProvider, 950, true),
  })),
  {
    // Blazor: InitialIndex_TallContainer_ClampedNearEnd_FillsViewportWithoutUserScroll (:6341)
    name: "InitialIndex_TallContainer_ClampedNearEnd_FillsViewportWithoutUserScroll",
    viewport: { width: 1024, height: 5400 },
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationAnchorMode");
      const container = await exists(page, "#scroll-container");

      await setContainerHeight(page, 5000);
      await (await exists(page, "#set-double-size")).click();
      await waitContains("Item size 100", () => statusText(page));
      await (await exists(page, "#toggle-provider")).click();
      await reloadAt(page, 990);

      await waitForRenderToSettle(container);

      assert(
        await viewportEdgeCoveredByRealItem(page, "top"),
        `Viewport top should be covered by a real item, but a gap was found (bottom=${await getBottomRenderedIndex(page)}, scrollTop=${await getScrollTop(container)}).`,
      );
      assert(
        await viewportEdgeCoveredByRealItem(page, "bottom"),
        `Viewport bottom should be covered by a real item, but a gap was found (top=${await getTopRenderedIndex(page)}, scrollTop=${await getScrollTop(container)}).`,
      );
    },
  },
  ...[
    [1, false, false],
    [500, false, false],
    [1, true, false],
    [500, true, false],
    [1, false, true],
    [500, false, true],
    [1, true, true],
    [500, true, true],
  ].map(([initialIndex, variableHeight, useProvider]) => ({
    // Blazor: InitialIndex_OpensAtTargetWithRealContent (:6688)
    name: `InitialIndex_OpensAtTargetWithRealContent(initialIndex: ${initialIndex}, variableHeight: ${variableHeight}, useProvider: ${useProvider})`,
    run: (t) => opensAtTargetWithRealContent(t, initialIndex, variableHeight, useProvider),
  })),
  ...[false, true].map((useProvider) => ({
    // Blazor: InitialIndex_RetainsTargetWhenPreviousItemExpandsThenHomeEndTakeOver (:6732)
    name: `InitialIndex_RetainsTargetWhenPreviousItemExpandsThenHomeEndTakeOver(useProvider: ${useProvider})`,
    run: (t) => retainsTargetThenHomeEndTakeOver(t, useProvider),
  })),
  {
    // Blazor: InitialIndex_FirstDownwardRedistributionDoesNotMoveBackward (:6777)
    name: "InitialIndex_FirstDownwardRedistributionDoesNotMoveBackward",
    async run(t) {
      const { page } = t;
      const initialIndex = 500;
      const lastIndexBeforeRedistribution = 514;
      const wheelTick = 50;

      await mountAnchorModeForScrollToItem(t, false);

      await reloadAt(page, initialIndex, { resetScroll: true });

      await waitTrue(async () => (await getTopRenderedIndex(page)) === initialIndex);

      const container = await exists(page, "#scroll-container");

      const isVisible = (index) =>
        container.evaluate((c, i) => {
          const item = c.querySelector(`.item[data-index="${i}"]`);
          if (!item) return false;
          const containerRect = c.getBoundingClientRect();
          const itemRect = item.getBoundingClientRect();
          return itemRect.bottom > containerRect.top && itemRect.top < containerRect.bottom;
        }, index);

      const getTopVisibleIndex = () =>
        container.evaluate((c) => {
          const containerRect = c.getBoundingClientRect();
          const item = Array.from(c.querySelectorAll(".item[data-index]")).find((element) => {
            const rect = element.getBoundingClientRect();
            return rect.bottom > containerRect.top && rect.top < containerRect.bottom;
          });
          return item ? Number(item.getAttribute("data-index")) : -1;
        });

      const getFirstRenderedIndex = () => container.evaluate((c) => Number(c.querySelector(".item[data-index]").getAttribute("data-index")));

      for (let tick = 0; tick < 20 && !(await isVisible(lastIndexBeforeRedistribution)); tick++) {
        const previousScrollTop = await getScrollTop(container);
        await wheel(page, container, wheelTick);
        await waitTrue(async () => (await getScrollTop(container)) > previousScrollTop);
      }

      assert(await isVisible(lastIndexBeforeRedistribution), `Item ${lastIndexBeforeRedistribution} should be visible before triggering the first downward redistribution.`);

      const topVisibleBeforeRedistribution = await getTopVisibleIndex();
      const firstRenderedBeforeRedistribution = await getFirstRenderedIndex();

      await wheel(page, container, wheelTick);

      await waitTrue(async () => (await getFirstRenderedIndex()) !== firstRenderedBeforeRedistribution && (await getTopVisibleIndex()) >= 0, {
        timeout: 10_000,
        message: "The first downward spacer callback should finish redistributing the rendered window.",
      });

      const topVisibleAfterRedistribution = await getTopVisibleIndex();
      assert(
        topVisibleAfterRedistribution >= topVisibleBeforeRedistribution,
        `The first downward redistribution moved backward from item ${topVisibleBeforeRedistribution} to item ${topVisibleAfterRedistribution}.`,
      );
    },
  },
  ...[false, true].map((useProvider) => ({
    // Blazor: InitialIndex_BeyondCount_ClampsToEnd (:6852)
    name: `InitialIndex_BeyondCount_ClampsToEnd(useProvider: ${useProvider})`,
    run: (t) => beyondCountClampsToEnd(t, useProvider),
  })),
];
