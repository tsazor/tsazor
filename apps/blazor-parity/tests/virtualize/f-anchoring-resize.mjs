/**
 * Group F of Blazor's Virtualize E2E tests (docs/blazor-virtualize-net11.md §9): viewport anchoring when
 * items resize (native overflow-anchor or manual compensation). Ported from VirtualizationTest.cs; line
 * numbers refer to it.
 */
import { assert, exists, locationY, SELENIUM_POLL, waitContains, waitEqual, waitTrue, textOf } from "../lib/harness.mjs";
import {
  assertScrollTop,
  assertViewportStaysStable,
  count,
  getItemPositionInContainer,
  getScrollTop,
  metric,
  mountAnchorModeComponent,
  scrollContainer,
  scrollMidListAndWaitForRender,
  statusText,
  waitForRenderToSettle,
} from "./_helpers.mjs";

export const group = "F. Viewport anchoring for item resizes (overflow-anchor / manual compensation)";

/** AnchorMode_None_ItemExpansionAfterPrepend_NoGap (:3878). */
async function noneItemExpansionAfterPrependNoGap(t, variableHeight, useItemsProvider) {
  const { page } = t;
  const container = await mountAnchorModeComponent(t, "0", { variableHeight, useItemsProvider, delay: useItemsProvider });

  await scrollMidListAndWaitForRender(container);

  const { index: indexBefore, relTop: relTopBefore } = await getItemPositionInContainer(container, ".item");

  await (await exists(page, "#prepend-items")).click();
  await waitContains("Prepended 10 items", () => statusText(page));
  await waitForRenderToSettle(container);

  // Wait for anchor restore to settle before expanding an item.
  await assertViewportStaysStable(page, "#scroll-container", ".item", indexBefore, relTopBefore, "None mode: viewport should stay stable after prepend", {
    driftTolerance: 5,
  });

  await (await exists(page, "#expand-item")).click();
  await waitContains("Expanded item", () => statusText(page));
  await waitForRenderToSettle(container);

  await assertViewportStaysStable(page, "#scroll-container", ".item", indexBefore, relTopBefore, "None mode: viewport should stay stable after prepend + item expansion", {
    driftTolerance: 5,
  });

  // No visible gaps between rendered items
  const hasGap = await container.evaluate((c) => {
    const items = c.querySelectorAll(".item[data-index]");
    const cr = c.getBoundingClientRect();
    for (let i = 0; i < items.length - 1; i++) {
      const bottom = items[i].getBoundingClientRect().bottom;
      const nextTop = items[i + 1].getBoundingClientRect().top;
      if (nextTop - bottom > 2 && bottom > cr.top && nextTop < cr.bottom) return true;
    }
    return false;
  });
  assert(!hasGap, "No visible gaps should exist between rendered items");
}

export const tests = [
  {
    // Blazor: DynamicContent_ExpandingOffScreenItemDoesNotAffectVisibleItems (:1167)
    name: "DynamicContent_ExpandingOffScreenItemDoesNotAffectVisibleItems",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDynamicContent");

      const container = await exists(page, "#scroll-container");
      const status = await exists(page, "#status");
      await waitTrue(async () => (await count(container, ".item")) > 0);

      // Scroll to the very bottom so item 2 is virtualized out of the DOM.
      // Retry since spacer recalculation may shift scrollTop as items are measured.
      await waitTrue(
        async () => {
          const sh = await metric(container, "scrollHeight");
          await scrollContainer(container, sh);
          const scrollTop = await metric(container, "scrollTop");
          const clientHeight = await metric(container, "clientHeight");
          return scrollTop >= sh - clientHeight - 1;
        },
        { timeout: 10_000, interval: SELENIUM_POLL },
      );

      // Wait for virtualization to converge after scrolling to bottom
      await waitTrue(async () => (await count(container, "[data-index='2']")) === 0, { timeout: 10_000 });

      // Get the position of a visible item before expanding the off-screen item
      const firstVisibleItem = container.locator(".item").first();
      const firstVisibleTopBefore = await locationY(firstVisibleItem);
      const firstVisibleIndex = await firstVisibleItem.getAttribute("data-index");

      // Expand item 2 (which should be above the visible area)
      await (await exists(page, "#expand-item-2")).click();
      await waitEqual("Item 2 expanded via button", () => textOf(status));

      // Verify the visible item position didn't change
      const firstVisibleTopAfter = await locationY(container.locator(`[data-index='${firstVisibleIndex}']`));

      // The visible items should stay in place (or very close, allowing for minor reflow)
      assert(
        Math.abs(firstVisibleTopAfter - firstVisibleTopBefore) < 5,
        `Visible item should not have moved when off-screen item expanded. Before: ${firstVisibleTopBefore}, After: ${firstVisibleTopAfter}`,
      );
    },
  },
  {
    // Blazor: ViewportAnchoring_ExpandAboveViewport_VisibleItemStaysInPlace (:2885)
    name: "ViewportAnchoring_ExpandAboveViewport_VisibleItemStaysInPlace",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDynamicContent");

      const container = await exists(page, "#scroll-container");
      await waitTrue(async () => (await count(container, ".item")) > 0);

      // Scroll down so item 5 is above the viewport but still in DOM and verify its position
      await container.evaluate((el) => { el.scrollTop = 500; });
      await assertScrollTop(container, (st) => st >= 500, "scrollTop >= 500");
      await waitTrue(async () => (await count(container, "[data-index='5']")) > 0);

      // Record the first visible item and its position relative to the container.
      const { index: indexBefore, relTop: relTopBefore } = await getItemPositionInContainer(container, ".item");

      const scrollTopBefore = await getScrollTop(container);

      await (await exists(page, "#expand-item-5")).click();
      await waitContains("Item 5 expanded via button", () => statusText(page));

      // Wait for the expanded content for item 5 to appear in the DOM
      await waitTrue(async () => (await count(container, "[data-index='5'] .expanded-content")) > 0);

      const { relTop: relTopAfter, scrollTop: scrollTopAfter } = await getItemPositionInContainer(container, ".item", indexBefore);

      assert(
        Math.abs(relTopAfter - relTopBefore) < 5,
        `Visible item '${indexBefore}' should not have moved when off-screen item expanded. RelTop Before: ${relTopBefore.toFixed(1)}, After: ${relTopAfter.toFixed(1)}, ` +
          `Delta: ${(relTopAfter - relTopBefore).toFixed(1)}px. scrollTop: ${scrollTopBefore}->${scrollTopAfter}.`,
      );
    },
  },
  {
    // Blazor: ViewportAnchoring_CollapseAboveViewport_VisibleItemStaysInPlace (:2918)
    name: "ViewportAnchoring_CollapseAboveViewport_VisibleItemStaysInPlace",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDynamicContent");

      const container = await exists(page, "#scroll-container");
      await waitTrue(async () => (await count(container, ".item")) > 0);

      // Expand item 5 while it's visible (at the top)
      await (await exists(page, "#expand-item-5")).click();
      await waitContains("Item 5 expanded via button", () => statusText(page));

      // Scroll down past item 5 so it's in overscan above viewport
      await container.evaluate((el) => { el.scrollTop = 600; });
      await assertScrollTop(container, (st) => st >= 600, "scrollTop >= 600");

      // Record first visible item position relative to container
      const { index: indexBefore, relTop: relTopBefore } = await getItemPositionInContainer(container, ".item");

      await (await exists(page, "#collapse-all")).click();
      await waitContains("All items collapsed", () => statusText(page));

      const { relTop: relTopAfter } = await getItemPositionInContainer(container, ".item", indexBefore);

      assert(
        Math.abs(relTopAfter - relTopBefore) < 5,
        `Visible item '${indexBefore}' should not have moved when off-screen item collapsed. RelTop Before: ${relTopBefore.toFixed(1)}, ` +
          `After: ${relTopAfter.toFixed(1)}, Delta: ${(relTopAfter - relTopBefore).toFixed(1)}px`,
      );
    },
  },
  {
    // Blazor: ViewportAnchoring_RenderlessAboveViewportResize_AfterScroll_VisibleItemStaysInPlace (:2948)
    name: "ViewportAnchoring_RenderlessAboveViewportResize_AfterScroll_VisibleItemStaysInPlace",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationComponent");

      const container = await exists(page, "#incorrect-size-container");
      await waitTrue(async () => (await count(container, ".incorrect-size-item")) > 0);

      // Scroll down in increments so spacer redistribution runs, then let it settle.
      // No further interaction happens after this, so there is no trailing render
      // and the scroll-triggered suppression of overflow-anchor is the last state written.
      for (let pos = 0; pos <= 1000; pos += 100) {
        await scrollContainer(container, pos);
      }
      await assertScrollTop(container, (st) => st >= 1000, "scrollTop >= 1000");

      await waitTrue(async () => (await container.evaluate((el) => getComputedStyle(el).overflowAnchor)) !== "none", {
        timeout: 5_000,
        message: "overflow-anchor was not restored after scrolling settled",
      });

      await waitForRenderToSettle(container, ".incorrect-size-item");

      const { index: indexBefore, relTop: relTopBefore } = await getItemPositionInContainer(container, ".incorrect-size-item");

      // Grow the item immediately ABOVE the viewport by mutating its style directly.
      // This is a browser-only reflow: it does NOT trigger a render, so the only
      // thing that can keep the visible content stable is native scroll anchoring.
      const growResult = await container.evaluate((c, grow) => {
        const cRect = c.getBoundingClientRect();
        const items = c.querySelectorAll(".incorrect-size-item");
        for (let i = items.length - 1; i >= 0; i--) {
          const r = items[i].getBoundingClientRect();
          if (r.bottom <= cRect.top + 1) {
            items[i].style.height = `${r.height + grow}px`;
            return { grew: true, text: items[i].textContent, anchor: getComputedStyle(c).overflowAnchor };
          }
        }
        return { grew: false, anchor: getComputedStyle(c).overflowAnchor };
      }, 200);

      assert(growResult.grew, "Expected at least one rendered item above the viewport to grow.");

      // Poll until the tracked item's position stops changing, so we measure the
      // browser's settled response to the reflow (with or without scroll anchoring).
      let relTopAfter = relTopBefore;
      let lastRelTop = Number.NaN;
      let stableReads = 0;
      await waitTrue(
        async () => {
          const { relTop } = await getItemPositionInContainer(container, ".incorrect-size-item", indexBefore);
          stableReads = Math.abs(relTop - lastRelTop) < 0.5 ? stableReads + 1 : 0;
          lastRelTop = relTop;
          relTopAfter = relTop;

          // Require a few consecutive stable reads to be sure the reflow has settled.
          return stableReads >= 3;
        },
        { timeout: 10_000, interval: SELENIUM_POLL, message: "Tracked item position did not settle after the render-less resize" },
      );

      assert(
        Math.abs(relTopAfter - relTopBefore) < 5,
        `Item '${indexBefore}' should not have moved when an off-screen item grew via a render-less browser reflow ` +
          `(overflow-anchor='${growResult.anchor}', grew item '${growResult.text}'). RelTop Before: ${relTopBefore.toFixed(1)}, ` +
          `After: ${relTopAfter.toFixed(1)}, Delta: ${(relTopAfter - relTopBefore).toFixed(1)}px`,
      );
    },
  },
  ...[
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ].map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_None_ItemExpansionAfterPrepend_NoGap (:3878)
    name: `AnchorMode_None_ItemExpansionAfterPrepend_NoGap(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => noneItemExpansionAfterPrependNoGap(t, variableHeight, useItemsProvider),
  })),
];
