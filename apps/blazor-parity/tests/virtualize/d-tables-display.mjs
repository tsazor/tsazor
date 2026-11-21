/**
 * Group D of Blazor's Virtualize E2E tests (docs/blazor-virtualize-net11.md §9): tables, display modes,
 * horizontal overflow, RTL and CSS scaling. Ported from VirtualizationTest.cs; line numbers refer to it.
 */
import {
  assert,
  assertEqual,
  AssertionError,
  byId,
  doesNotExist,
  exists,
  SELENIUM_POLL,
  textOf,
  waitEqual,
  waitTrue,
} from "../lib/harness.mjs";
import {
  count,
  getItemPositionInContainer,
  getPeopleNames,
  jumpToEndWithStabilization,
  jumpToStartWithStabilization,
  reservedHeight,
  scrollContainerWithWheelTo,
  scrollLeftToEnd,
  scrollToBottomAndWait,
  scrollTopToBeginning,
  scrollTopToEnd,
  scrollUntil,
  waitForRenderToSettle,
} from "./_helpers.mjs";
import {
  continuousHeadPrependProbe,
  continuousPrependAnchorStabilityProbe,
  continuousTailAppendProbe,
  detectFlashing,
  enableTableStartAnchor,
  rapidUpwardScrollWithConcurrentAppends,
  viewportScrollJumpDetection,
} from "./_probes.mjs";

export const group = "D. Tables, display modes, horizontal overflow, RTL, CSS scaling";

const HORIZONTAL_CONTAINERS = [
  "simple-scroll-horizontal",
  "complex-scroll-horizontal",
  "simple-scroll-horizontal-on-parent",
  "complex-scroll-horizontal-on-parent",
  "complex-scroll-horizontal-on-tbody",
  "simple-display-table-scroll-horizontal",
  "complex-display-table-scroll-horizontal",
];

/** The InlineData of VariableHeightAsync_CanScrollWithoutFlashing (:1557): transform scale, CSS zoom, CSS scale in %. */
const SCALE_COMBINATIONS = [
  [100, 100, 100], // baseline - no scaling
  [50, 100, 100], // transform: scale(0.5)
  [100, 50, 100], // CSS zoom: 0.5
  [100, 100, 50], // CSS scale: 0.5
  [200, 100, 100], // transform: scale(2)
  [100, 200, 100], // CSS zoom: 2
  [100, 100, 200], // CSS scale: 2
  [75, 75, 75], // combined downscale: 0.75^3 ≈ 0.42x
  [150, 150, 150], // combined upscale: 1.5^3 = 3.375x
];

const isDisplayed = async (page, id) => {
  const element = page.locator(byId(id));
  return (await element.count()) > 0 && element.first().isVisible();
};

const tagName = (locator) => locator.evaluate((el) => el.tagName.toLowerCase());

/** CanLoadNewDataWithHorizontalScrollToRight (:592). */
async function canLoadNewDataWithHorizontalScrollToRight(t, containerId) {
  const { page } = t;
  await t.mount("VirtualizationDataChanges");
  const dataSetLengthSelector = await exists(page, "#large-dataset-length");
  const dataSetLengthLastRendered = async () => Number.parseInt(await textOf(page.locator("#large-dataset-length-lastrendered")), 10);
  const container = await exists(page, byId(containerId));

  // Scroll to the end of a medium list
  await dataSetLengthSelector.selectOption({ label: "1000" });
  await waitEqual(1000, dataSetLengthLastRendered);
  await waitTrue(
    async () => {
      await scrollLeftToEnd(container);
      await scrollTopToEnd(container);
      return (await getPeopleNames(container)).includes("Person 1000");
    },
    { interval: SELENIUM_POLL },
  );

  await waitTrue(
    async () => {
      await scrollLeftToEnd(container);
      await scrollTopToBeginning(container);
      return (await getPeopleNames(container)).includes("Person 1");
    },
    { interval: SELENIUM_POLL },
  );
}

/** VariableHeightAsync_CanScrollWithoutFlashing (:1566). */
async function canScrollWithoutFlashing(t, [transformScalePercent, cssZoomPercent, cssScalePercent]) {
  const { page } = t;
  await t.mount("VirtualizationVariableHeightAsync");

  const container = await exists(page, "#async-variable-container");
  await (await exists(page, "#toggle-autoload")).click();

  if (transformScalePercent !== 100) await (await exists(page, `#scale-${transformScalePercent}`)).click();
  if (cssZoomPercent !== 100) await (await exists(page, `#zoom-${cssZoomPercent}`)).click();
  if (cssScalePercent !== 100) await (await exists(page, `#cssscale-${cssScalePercent}`)).click();
  await waitEqual(
    `Transform Scale: ${transformScalePercent}%, CSS Zoom: ${cssZoomPercent}%, CSS Scale: ${cssScalePercent}%`,
    async () => textOf(await exists(page, "#zoom-status")),
  );

  await (await exists(page, "#set-count-200")).click();
  await (await exists(page, "#refresh-data")).click();

  await waitTrue(async () => (await count(container, ".async-variable-item")) > 0);

  const result = await detectFlashing(page, "async-variable-container", ".async-variable-item");
  if (!result.success) throw new AssertionError(result.error);
  assert(result.maxIndexSeen >= 199, `Should have scrolled to the last item (saw up to index ${result.maxIndexSeen})`);
}

/** DisplayModes_*_SupportsVariableHeights (:1606-1662): the first item's inline height. */
async function assertItemHeight(container, id, px) {
  const style = (await container.locator(byId(id)).getAttribute("style")) ?? "";
  assert(style.includes(`height: ${px}px`), `${id} should be ${px}px tall (style: ${style})`);
}

export const tests = [
  {
    // Blazor: CanRenderHtmlTable (:373)
    name: "CanRenderHtmlTable",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationTable");
      const expectedInitialSpacerHeight = 0;
      const topSpacer = await exists(page, "#virtualized-table > tbody > :first-child");
      const bottomSpacer = await exists(page, "#virtualized-table > tbody > :last-child");

      // We can override the tag name of the spacer
      assertEqual("tr", await tagName(topSpacer), "top spacer tag");
      assertEqual("tr", await tagName(bottomSpacer), "bottom spacer tag");
      await waitTrue(async () => (await reservedHeight(topSpacer)) === expectedInitialSpacerHeight);
      assert(((await topSpacer.getAttribute("aria-hidden")) ?? "").includes("true"), "top spacer aria-hidden");
      assert(((await bottomSpacer.getAttribute("aria-hidden")) ?? "").includes("true"), "bottom spacer aria-hidden");

      // Check scrolling document element works
      await doesNotExist(page, "#row-999");
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await waitTrue(() => isDisplayed(page, "row-999"));

      // Validate that the top spacer has expanded, and bottom one has collapsed
      await waitTrue(async () => (await reservedHeight(topSpacer)) !== expectedInitialSpacerHeight);
      assertEqual(expectedInitialSpacerHeight, await reservedHeight(bottomSpacer), "bottom spacer reserved height");
    },
  },
  {
    // Blazor: VariableHeight_HtmlTable_DoesNotProduceNestedTrElements (:398)
    name: "VariableHeight_HtmlTable_DoesNotProduceNestedTrElements",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationVariableHeightTable");

      await waitEqual("Total items: 500", async () => textOf(await exists(page, "#vht-total-items")));
      await waitTrue(() => isDisplayed(page, "vht-row-0"));

      const topSpacer = await exists(page, "#variable-height-table > tbody > :first-child");
      assertEqual("tr", await tagName(topSpacer), "top spacer tag");

      // The template provides <tr> directly — no wrapper elements.
      // Verify no nested <tr> inside <tr> (which would indicate invalid table structure).
      assertEqual(0, await page.locator("#variable-height-table tr > tr").count(), "nested <tr>");

      // Verify rendered item rows exist (user template <tr> containing <td>)
      assert((await page.locator("#variable-height-table tbody tr td").count()) > 0, "Should have <tr> elements containing <td> cells");

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await waitTrue(() => isDisplayed(page, "vht-row-499"));

      assertEqual(0, await page.locator("#variable-height-table tr > tr").count(), "nested <tr> after scrolling");
    },
  },
  ...HORIZONTAL_CONTAINERS.map((containerId) => ({
    // Blazor: CanLoadNewDataWithHorizontalScrollToRight (:592)
    name: `CanLoadNewDataWithHorizontalScrollToRight(containerId: ${containerId})`,
    run: (t) => canLoadNewDataWithHorizontalScrollToRight(t, containerId),
  })),
  {
    // Blazor: VariableHeightAsync_RtlLayoutWorks (:1418)
    name: "VariableHeightAsync_RtlLayoutWorks",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationVariableHeightAsync");

      const container = await exists(page, "#async-variable-container");
      const finishLoadingButton = await exists(page, "#finish-loading");
      const hasPlaceholders = async () => (await count(container, ".async-variable-placeholder")) > 0;
      const loadData = () => finishLoadingButton.click();

      await (await exists(page, "#toggle-rtl")).click();
      await waitEqual("Direction: RTL", async () => textOf(await exists(page, "#direction-status")));

      await finishLoadingButton.click();
      await waitTrue(async () => (await count(container, ".async-variable-item")) > 0);
      await jumpToEndWithStabilization(container, hasPlaceholders, loadData);
      await waitTrue(async () => (await count(container, byId("async-variable-item-999"))) > 0, { message: "#async-variable-item-999 should be rendered" });
      await jumpToStartWithStabilization(container, hasPlaceholders, loadData);
      await waitTrue(async () => (await count(container, byId("async-variable-item-0"))) > 0, { message: "#async-variable-item-0 should be rendered" });
    },
  },
  ...SCALE_COMBINATIONS.map((scales) => ({
    // Blazor: VariableHeightAsync_CanScrollWithoutFlashing (:1566)
    name: `VariableHeightAsync_CanScrollWithoutFlashing(transformScalePercent: ${scales[0]}, cssZoomPercent: ${scales[1]}, cssScalePercent: ${scales[2]})`,
    run: (t) => canScrollWithoutFlashing(t, scales),
  })),
  {
    // Blazor: DisplayModes_BlockLayout_SupportsVariableHeights (:1606)
    name: "DisplayModes_BlockLayout_SupportsVariableHeights",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDisplayModes");

      const container = await exists(page, "#block-container");
      const itemCount = await exists(page, "#block-count");

      await waitEqual("50", () => textOf(itemCount));
      await waitTrue(async () => (await count(container, ".block-item")) > 0);
      await assertItemHeight(container, "block-item-0", 30); // 30 + 0*17%51 = 30
      await assertItemHeight(container, "block-item-1", 47); // 30 + 1*17%51 = 47

      await page.evaluate(() => {
        const c = document.getElementById("block-container");
        c.scrollTop = c.scrollHeight;
      });
      await waitTrue(async () => (await count(container, ".block-item")) > 0);
    },
  },
  {
    // Blazor: DisplayModes_GridLayout_SupportsVariableHeights (:1626)
    name: "DisplayModes_GridLayout_SupportsVariableHeights",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDisplayModes");

      const container = await exists(page, "#grid-container");
      const itemCount = await exists(page, "#grid-count");

      await waitEqual("50", () => textOf(itemCount));
      await waitTrue(async () => (await count(container, ".grid-item")) > 0);
      await assertItemHeight(container, "grid-item-0", 30);

      await page.evaluate(() => {
        const c = document.getElementById("grid-container");
        c.scrollTop = c.scrollHeight * 0.5;
      });
      await waitTrue(async () => (await count(container, ".grid-item")) > 0);

      await page.evaluate(() => {
        const c = document.getElementById("grid-container");
        c.scrollTop = c.scrollHeight;
      });
      await waitTrue(async () => (await count(container, ".grid-item")) > 0);
    },
  },
  {
    // Blazor: DisplayModes_SubgridLayout_SupportsVariableHeights (:1647)
    name: "DisplayModes_SubgridLayout_SupportsVariableHeights",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDisplayModes");

      const container = await exists(page, "#subgrid-container");
      const itemCount = await exists(page, "#subgrid-count");

      await waitEqual("50", () => textOf(itemCount));
      await waitTrue(async () => (await count(container, ".subgrid-item")) > 0);
      await assertItemHeight(container, "subgrid-item-0", 30);

      await page.evaluate(() => {
        const c = document.getElementById("subgrid-container");
        c.scrollTop = c.scrollHeight;
      });
      await waitTrue(async () => (await count(container, ".subgrid-item")) > 0);
    },
  },
  {
    // Blazor: VirtualizeWorksInsideHorizontalOverflowContainer (:2871)
    name: "VirtualizeWorksInsideHorizontalOverflowContainer",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationHorizontalOverflow");

      await waitTrue(async () => (await page.locator("#horizontal-overflow-table tbody tr[id^='horizontal-overflow-row-']").count()) > 0);
      await doesNotExist(page, byId("horizontal-overflow-row-999"));

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      const lastElement = await exists(page, byId("horizontal-overflow-row-999"));
      await waitTrue(() => lastElement.isVisible());
    },
  },
  {
    // Blazor: Table_VariableHeight_IncrementalScrollDoesNotCauseWildJumps (:3020)
    name: "Table_VariableHeight_IncrementalScrollDoesNotCauseWildJumps",
    async run(t) {
      // Guards against a browser-level CSS Scroll Anchoring bug with <table> layout: anchoring on <tr>
      // miscalculates row positions (3000-8000px jumps per 300px scroll); tables use manual compensation.
      const { page } = t;
      await t.mount("VirtualizationVariableHeightTable");

      await waitEqual("Total items: 500", async () => textOf(await exists(page, "#vht-total-items")));
      await waitTrue(() => isDisplayed(page, "vht-row-0"));

      // Scroll to initial offset and wait deterministically for re-render
      await page.evaluate(() => window.scrollTo(0, 1000));
      await waitTrue(async () => (await page.locator(byId("vht-row-10")).count()) > 0);

      const result = await viewportScrollJumpDetection(page, "variable-height-table");

      // Without the fix: individual jumps of 3000-8000px, total drift 30,000+.
      // With the fix: ~300px per step, total ~4500px.
      assert(
        result.maxJump < 1500,
        `Table scroll should not produce wild jumps. Max single jump was ${result.maxJump}px (expected ~300px each). ` +
          `Total: ${result.startY}->${result.endY} = ${result.totalDelta}px (expected ~${result.expected}px). Jumps: [${result.jumps}].`,
      );
    },
  },
  {
    // Blazor: Table_EndAnchor_AsyncProvider_AppendDuringRapidUserScroll_DoesNotReverseScrollDirection (:3053)
    name: "Table_EndAnchor_AsyncProvider_AppendDuringRapidUserScroll_DoesNotReverseScrollDirection",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationTableScrollWithAppend");

      const container = await exists(page, "#table-scroll-container");
      await waitEqual("Total items: 500", async () => textOf(await exists(page, "#table-scroll-total-items")));
      await waitTrue(async () => (await count(container, ".table-scroll-item")) > 0);

      await scrollToBottomAndWait(container, ".table-scroll-item");

      const initialScrollHeight = await container.evaluate((el) => el.scrollHeight);
      const result = await rapidUpwardScrollWithConcurrentAppends(page, container);

      assert(result.placeholderFrames > 0, "Precondition failed: rapid scrolling should overlap an async provider request and render placeholders.");
      assert(
        result.backwardJumps === 0,
        `Upward wheel scrolling must not jump backward. Backward jumps: ${result.backwardJumps}, maximum: ${result.maxBackwardJump}px. ` +
          `Samples: [${result.backwardJumpSamples}]. Frames: ${result.sampleCount}, placeholders: ${result.placeholderFrames}, ` +
          `initial scroll height: ${initialScrollHeight}px, minimum scroll height: ${result.minScrollHeight}px.`,
      );
    },
  },
  {
    // Blazor: Table_EndAnchor_AsyncProvider_ContinuousAppend_MaterializesNewTailBeforeUpdatesStop (:3082)
    name: "Table_EndAnchor_AsyncProvider_ContinuousAppend_MaterializesNewTailBeforeUpdatesStop",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationTableScrollWithAppend");

      const container = await exists(page, "#table-scroll-container");
      await waitEqual("Total items: 500", async () => textOf(await exists(page, "#table-scroll-total-items")));
      await waitTrue(async () => (await count(container, ".table-scroll-item")) > 0);

      await scrollToBottomAndWait(container, ".table-scroll-item");
      await waitForRenderToSettle(container, ".table-scroll-item", true);

      const result = await continuousTailAppendProbe(container);

      await waitForRenderToSettle(container, ".table-scroll-item", true);

      assertEqual(510, result.totalItems, "total items");
      assert(
        result.lastVisibleIndex > 499,
        `End anchoring should materialize appended tail items while updates are still arriving. Total items: ${result.totalItems}, last visible index: ${result.lastVisibleIndex}, bottom gap: ${result.bottomGap}px.`,
      );
      assert(
        result.firstVisibleBackwardJumps === 0,
        `The first visible item index must not move backward while following appended items. Backward index changes: ${result.firstVisibleBackwardJumps}.`,
      );
      assert(
        result.lastVisibleBackwardJumps === 0,
        `The last visible item index must not move backward while following appended items. Backward index changes: ${result.lastVisibleBackwardJumps}.`,
      );
      assert(
        result.maximumLastVisibleAdvance <= 1,
        `Following the tail should display each appended item instead of skipping intermediate indexes. Maximum last-visible index advance: ${result.maximumLastVisibleAdvance}.`,
      );
      assert(result.bottomGap <= 1, `End anchoring should remain at the bottom while appending. Bottom gap: ${result.bottomGap}px.`);
    },
  },
  {
    // Blazor: Table_StartAnchor_AsyncProvider_ContinuousPrepend_MaterializesNewHeadWithoutIndexReversal (:3122)
    name: "Table_StartAnchor_AsyncProvider_ContinuousPrepend_MaterializesNewHeadWithoutIndexReversal",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationTableScrollWithAppend");

      const container = await exists(page, "#table-scroll-container");
      await enableTableStartAnchor(page);

      const result = await continuousHeadPrependProbe(container);

      await waitForRenderToSettle(container, ".table-scroll-item", true);

      assertEqual(510, result.totalItems, "total items");
      assert(
        result.firstVisibleIndex < 0,
        `Start anchoring should materialize prepended head items while updates are still arriving. Total items: ${result.totalItems}, first visible index: ${result.firstVisibleIndex}, top gap: ${result.topGap}px.`,
      );
      assert(
        result.firstVisibleBackwardJumps === 0,
        `The first visible item index must not move backward toward older items while following prepends. Backward index changes: ${result.firstVisibleBackwardJumps}.`,
      );
      assert(
        result.lastVisibleBackwardJumps === 0,
        `The last visible item index must not move backward toward older items while following prepends. Backward index changes: ${result.lastVisibleBackwardJumps}.`,
      );
      assert(
        result.maximumFirstVisibleAdvance <= 1,
        `Following the head should display each prepended item instead of skipping intermediate indexes. Maximum first-visible index advance: ${result.maximumFirstVisibleAdvance}.`,
      );
      assert(result.topGap <= 1, `Start anchoring should remain at the top while prepending. Top gap: ${result.topGap}px.`);
    },
  },
  {
    // Blazor: Table_StartAnchor_AsyncProvider_ContinuousPrependAfterLeavingHead_KeepsViewportStable (:3158)
    name: "Table_StartAnchor_AsyncProvider_ContinuousPrependAfterLeavingHead_KeepsViewportStable",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationTableScrollWithAppend");

      const container = await exists(page, "#table-scroll-container");
      await enableTableStartAnchor(page);

      await scrollUntil(container, () => scrollContainerWithWheelTo(page, container, 300), (scrollTop) => scrollTop > 200, "scrollTop > 200 after leaving the head");
      await waitForRenderToSettle(container, ".table-scroll-item", true);

      const { index: anchorIndex, relTop: anchorOffset } = await getItemPositionInContainer(container, ".table-scroll-item td[data-index]");
      const result = await continuousPrependAnchorStabilityProbe(container, anchorIndex, anchorOffset);

      await waitForRenderToSettle(container, ".table-scroll-item", true);

      assertEqual(510, result.totalItems, "total items");
      assert(result.missingAnchorFrames === 0, `The anchored item ${anchorIndex} disappeared for ${result.missingAnchorFrames} frames during continuous prepends.`);
      assert(
        result.maximumAnchorDrift <= 2,
        `The anchored item ${anchorIndex} moved by up to ${result.maximumAnchorDrift}px during continuous prepends. Expected viewport offset: ${anchorOffset}px.`,
      );
    },
  },
];
