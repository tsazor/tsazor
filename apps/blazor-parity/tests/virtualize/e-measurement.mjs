/**
 * Group E of Blazor's Virtualize E2E tests (docs/blazor-virtualize-net11.md §9): measurement, variable
 * heights and dynamic content. Ported from VirtualizationTest.cs; line numbers refer to it.
 */
import { assert, assertEqual, byId, exists, locationY, SELENIUM_POLL, sleep, textOf, waitEqual, waitNotEqual, waitTrue } from "../lib/harness.mjs";
import {
  assertScrollTop,
  count,
  jumpToEndWithStabilization,
  jumpToStartWithStabilization,
  reservedHeight,
  waitForScrollStabilization,
} from "./_helpers.mjs";

export const group = "E. Measurement, variable heights, dynamic content";

/**
 * Selenium's `itemSizeInput.SendKeys("\b\b\b10\n")`: replaces the input's "100" with "10" and presses Enter,
 * which commits the value (the change event @bind-value listens to).
 */
async function typeItemSize(input, value) {
  await input.press("ControlOrMeta+a");
  await input.pressSequentially(value);
  await input.press("Enter");
}

async function assertStyleHeight(container, id, px) {
  const style = (await container.locator(byId(id)).getAttribute("style")) ?? "";
  assert(style.includes(`height: ${px}px`), `${id} should have height: ${px}px (style: ${style})`);
}

export const tests = [
  {
    // Blazor: RerendersWhenItemSizeShrinks_Sync (:236)
    name: "RerendersWhenItemSizeShrinks_Sync",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationComponent");
      const getItemCount = () => page.locator(byId("sync-item")).count();
      let initialItemCount = 0;

      // Wait until items have been rendered.
      await waitTrue(async () => (initialItemCount = await getItemCount()) > 0, { interval: SELENIUM_POLL });

      const itemSizeInput = await exists(page, "#item-size-input");

      // Change the item size.
      await typeItemSize(itemSizeInput, "10");

      // Validate that the list has been re-rendered to show more items.
      await waitTrue(async () => (await getItemCount()) > initialItemCount);
    },
  },
  {
    // Blazor: RerendersWhenItemSizeShrinks_Async (:256)
    name: "RerendersWhenItemSizeShrinks_Async",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationComponent");
      const finishLoadingButton = await exists(page, "#finish-loading-button");
      const getItemCount = () => page.locator(byId("async-item")).count();
      const getPlaceholderCount = () => page.locator(byId("async-placeholder")).count();

      // Load the initial set of items.
      await finishLoadingButton.click();

      let initialItemCount = 0;

      // Validate that items appear and placeholders aren't rendered.
      await waitTrue(async () => (initialItemCount = await getItemCount()) > 0, { interval: SELENIUM_POLL });
      await waitEqual(0, getPlaceholderCount);

      const itemSizeInput = await exists(page, "#item-size-input");

      // Change the item size.
      await typeItemSize(itemSizeInput, "10");

      // Validate that the same number of loaded items is rendered.
      await waitEqual(initialItemCount, getItemCount);
      await waitTrue(async () => (await getPlaceholderCount()) > 0);

      // Load the new set of items.
      await finishLoadingButton.click();

      // Validate that the placeholders have been replaced with more loaded items.
      await waitTrue(async () => (await getItemCount()) > initialItemCount);
      await waitEqual(0, getPlaceholderCount);
    },
  },
  {
    // Blazor: ToleratesIncorrectItemSize (:344)
    name: "ToleratesIncorrectItemSize",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationComponent");
      const topSpacer = (await exists(page, "#incorrect-size-container")).locator("div").first();
      const expectedInitialSpacerHeight = 0;

      // Wait until items have been rendered.
      await waitTrue(async () => (await page.locator(".incorrect-size-item").count()) > 0);
      await waitEqual(expectedInitialSpacerHeight, () => reservedHeight(topSpacer));
      assert(((await topSpacer.getAttribute("aria-hidden")) ?? "").includes("true"), "the spacer should be aria-hidden");

      // Scroll slowly, in increments of 50px at a time. At one point this would trigger a bug
      // due to the incorrect item size, whereby it would not realise it's necessary to show more
      // items because the first time the spacer became visible, the size calculation said that
      // we're already showing all the items we need to show.
      for (let pos = 0; pos < 1000; pos += 50) {
        await page.evaluate((top) => { document.getElementById("incorrect-size-container").scrollTop = top; }, pos);
        await sleep(200);
      }

      // Validate that the top spacer did change
      await waitNotEqual(expectedInitialSpacerHeight, () => reservedHeight(topSpacer));
      assert(((await topSpacer.getAttribute("aria-hidden")) ?? "").includes("true"), "the spacer should be aria-hidden");
    },
  },
  {
    // Blazor: VariableHeight_ItemsRenderWithCorrectHeights (:1110)
    name: "VariableHeight_ItemsRenderWithCorrectHeights",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationVariableHeight");

      const container = await exists(page, "#variable-height-container");
      await waitTrue(async () => (await count(container, ".variable-height-item")) > 0);

      // Item 0 is 20px (20 + (0*37%1981) = 20), item 1 is 57px (20 + (1*37%1981) = 57).
      await assertStyleHeight(container, "variable-item-0", 20);
      await assertStyleHeight(container, "variable-item-1", 57);
    },
  },
  {
    // Blazor: DynamicContent_ItemHeightChangesUpdateLayout (:1129)
    name: "DynamicContent_ItemHeightChangesUpdateLayout",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDynamicContent");

      const container = await exists(page, "#scroll-container");
      const status = await exists(page, "#status");

      // Wait for items to render
      await waitTrue(async () => (await count(container, ".item")) > 0);

      // Get position of item 3 before expansion
      const item3TopBefore = await locationY(container.locator("[data-index='3']"));

      // Expand item 2
      await (await exists(page, "#expand-item-2")).click();
      await waitEqual("Item 2 expanded via button", () => textOf(status));

      // Verify item 2 now has expanded content
      assertEqual(1, await container.locator("[data-index='2'] .expanded-content").count(), "expanded content of item 2");

      // Verify item 3 moved down (not overlapping with expanded item 2)
      const item3TopAfter = await locationY(container.locator("[data-index='3']"));
      assert(item3TopAfter > item3TopBefore, `Item 3 should have moved down after item 2 expanded. Before: ${item3TopBefore}, After: ${item3TopAfter}`);

      await container.evaluate((el) => { el.scrollTop = 200; });
      await assertScrollTop(container, (st) => st >= 200, "scrollTop >= 200");
      await container.evaluate((el) => { el.scrollTop = 0; });
      await assertScrollTop(container, (st) => st === 0, "scrollTop == 0");

      // Item 2 should still be expanded after scrolling
      assertEqual(1, await container.locator("[data-index='2'] .expanded-content").count(), "expanded content of item 2 after scrolling");
    },
  },
  {
    // Blazor: VariableHeight_ContainerResizeWorks (:1363)
    name: "VariableHeight_ContainerResizeWorks",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationVariableHeight");

      const container = await exists(page, "#variable-height-container");
      const resizeStatus = await exists(page, "#resize-status");
      await waitTrue(async () => (await count(container, ".variable-height-item")) > 0);

      await (await exists(page, "#resize-large")).click();
      await waitEqual("Container resized to 400px", () => textOf(resizeStatus));
      assertEqual(400, await container.evaluate((el) => el.clientHeight), "clientHeight");

      // Scroll to end and verify last item
      await jumpToEndWithStabilization(container, null, null);
      await waitTrue(async () => (await count(container, byId("variable-item-999"))) > 0, { message: "#variable-item-999 should be rendered" });

      await (await exists(page, "#resize-small")).click();
      await waitEqual("Container resized to 100px", () => textOf(resizeStatus));
      assertEqual(100, await container.evaluate((el) => el.clientHeight), "clientHeight");

      await jumpToStartWithStabilization(container, null, null);
      await waitTrue(async () => (await count(container, byId("variable-item-0"))) > 0, { message: "#variable-item-0 should be rendered" });
    },
  },
  {
    // Blazor: VariableHeightAsync_LoadsItemsWithCorrectHeights (:1395)
    name: "VariableHeightAsync_LoadsItemsWithCorrectHeights",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationVariableHeightAsync");

      const container = await exists(page, "#async-variable-container");
      const finishLoadingButton = await exists(page, "#finish-loading");

      await waitEqual(0, () => count(container, ".async-variable-item"));
      await waitEqual(0, () => count(container, ".async-variable-placeholder"));

      await finishLoadingButton.click();
      await waitTrue(async () => (await count(container, ".async-variable-item")) > 0);

      // Item 0 is 25px (25 + (0 * 11 % 31)), item 1 is 36px (25 + (1 * 11 % 31)).
      await assertStyleHeight(container, "async-variable-item-0", 25);
      await assertStyleHeight(container, "async-variable-item-1", 36);
    },
  },
  {
    // Blazor: BimodalHeightDistribution_CanScrollThroughItems (:1665)
    name: "BimodalHeightDistribution_CanScrollThroughItems",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationBimodal");

      const container = await exists(page, "#bimodal-container");
      await waitEqual("200", async () => textOf(await exists(page, "#bimodal-count")));
      await waitTrue(async () => (await count(container, ".bimodal-item")) > 0);

      await assertStyleHeight(container, "bimodal-item-0", 30);
      await assertStyleHeight(container, "bimodal-item-1", 300);

      await jumpToEndWithStabilization(container, null, null);
      await waitTrue(async () => (await count(container, byId("bimodal-item-199"))) > 0, { message: "#bimodal-item-199 should be rendered" });

      await jumpToStartWithStabilization(container, null, null);
      await waitTrue(async () => (await count(container, byId("bimodal-item-0"))) > 0, { message: "#bimodal-item-0 should be rendered" });
    },
  },
  {
    // Blazor: NestedVirtualize_BothRenderIndependently (:1690)
    name: "NestedVirtualize_BothRenderIndependently",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationBimodal");

      const outerContainer = await exists(page, "#nested-outer-container");
      await waitEqual("50", async () => textOf(await exists(page, "#nested-outer-count")));
      await waitEqual("100", async () => textOf(await exists(page, "#nested-inner-count")));

      await waitTrue(async () => (await count(outerContainer, ".nested-outer-item")) > 0);

      const outerItemCount = await count(outerContainer, ".nested-outer-item");
      assert(outerItemCount < 50, `Outer rendered all ${outerItemCount}/50 items — measurement may be polluted by inner item heights`);

      const innerContainer = await exists(page, "#nested-inner-container");
      await waitTrue(async () => (await count(innerContainer, ".nested-inner-item")) > 0);

      await assertStyleHeight(outerContainer, "nested-outer-item-0", 120);
      await assertStyleHeight(innerContainer, "nested-inner-item-0", 15);

      await page.evaluate(() => { document.getElementById("nested-outer-container").scrollTop = 500; });
      await waitTrue(async () => (await count(outerContainer, ".nested-outer-item")) > 0);

      await page.evaluate(() => { document.getElementById("nested-outer-container").scrollTop = 0; });
      await waitTrue(async () => (await page.locator("#nested-inner-container .nested-inner-item").count()) > 0);
    },
  },
  {
    // Blazor: NonZeroStartIndex_ScrollToMiddleThenMeasure (:1820)
    name: "NonZeroStartIndex_ScrollToMiddleThenMeasure",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationScrollBehavior");

      const container = await exists(page, "#scroll-behavior-container");
      await waitTrue(async () => (await count(container, ".scroll-behavior-item")) > 0);

      // Scroll to middle once and wait for the DOM update to land (mutations quiet for 200 ms),
      // rather than retrying the scroll, which could mask bugs.
      await container.evaluate(
        (el) =>
          new Promise((resolve) => {
            el.scrollTop = el.scrollHeight / 2;
            let timer;
            const observer = new MutationObserver(() => {
              clearTimeout(timer);
              timer = setTimeout(() => {
                observer.disconnect();
                resolve();
              }, 200);
            });
            observer.observe(el, { childList: true, subtree: true });
            // Fallback in case scroll didn't trigger any DOM mutations (e.g., already at target)
            timer = setTimeout(() => {
              observer.disconnect();
              resolve();
            }, 2000);
          }),
      );

      await waitForScrollStabilization(container);

      // Verify that scrolling to the middle actually rendered middle items
      const indices = (await container.locator(".scroll-behavior-item .item-index").allInnerTexts()).map((text) => Number.parseInt(text, 10));
      assert(indices.some((idx) => idx > 50), "After scrolling to middle, expected items with index > 50 to be visible");

      const styles = await container.locator(".scroll-behavior-item").evaluateAll((items) => items.map((item) => item.getAttribute("style") ?? ""));
      assert(styles.length > 0, "Should have visible items at non-zero start");
      for (const style of styles) {
        assert(style.includes("height:"), `an item has no height (style: ${style})`);
        assert(!style.includes("height: 0px"), `an item is 0px tall (style: ${style})`);
      }
    },
  },
  {
    // Blazor: NestedVariableHeight_OuterMeasurementsNotPollutedByInner (:2850)
    name: "NestedVariableHeight_OuterMeasurementsNotPollutedByInner",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationNestedVariableHeight");

      const outerContainer = await exists(page, "#nested-vh-outer-container");
      await waitEqual("Outer: 40", async () => textOf(await exists(page, "#nested-vh-outer-count")));

      await waitTrue(async () => (await count(outerContainer, ".nested-vh-outer")) > 0);

      // Outer container is 400px with 100-300px items (~200px average).
      // Should render a small subset of 40 total items.
      // If outer measurement is polluted by inner items (15-45px), the average
      // drops dramatically, causing it to think it can fit many more items.
      const outerItemCount = await count(outerContainer, ".nested-vh-outer");
      assert(
        outerItemCount < 40,
        `Outer rendered all ${outerItemCount}/40 items — measurement likely polluted by inner item heights (15-45px vs 100-300px outer)`,
      );

      await waitTrue(async () => (await count(outerContainer, ".nested-vh-inner")) > 0);
    },
  },
];
