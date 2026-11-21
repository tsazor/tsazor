/**
 * Group A of Blazor's Virtualize E2E tests (docs/blazor-virtualize-net11.md §9): basic rendering and the
 * fill loop. Ported from VirtualizationTest.cs; line numbers refer to it.
 */
import { assert, assertEqual, byId, exists, SELENIUM_POLL, waitEqual, waitNotEqual, waitTrue } from "../lib/harness.mjs";
import { count, reservedHeight, waitForScrollStabilization } from "./_helpers.mjs";

export const group = "A. Basic rendering, parameter validation and the fill loop";

/** The spacer is hidden from assistive technology, as Blazor asserts with `Assert.Contains("true", aria-hidden)`. */
async function assertAriaHidden(spacer) {
  assert(((await spacer.getAttribute("aria-hidden")) ?? "").includes("true"), "the spacer should be aria-hidden");
}

/** InitialRender_DispatchesSingleSpacerCallback (:130). */
async function initialRenderDispatchesSingleSpacerCallback(t, useItemsProvider) {
  const { page } = t;
  const viewportFillReason = 2;

  // Blazor wraps IntersectionObserver to number its callback batches and patches
  // DotNet.DotNetObject.prototype.invokeMethodAsync to record OnSpacerBeforeVisible/OnSpacerAfterVisible.
  // Tsazor's viewport calls the component's spacerBeforeVisible/spacerAfterVisible directly, so the
  // recorder patches those on the component class (window.blazorParity, src/test-hooks.ts).
  await page.evaluate(() => {
    const nativeIntersectionObserver = window.IntersectionObserver;
    const prototype = window.blazorParity.Virtualize.prototype;
    const originalBefore = prototype.spacerBeforeVisible;
    const originalAfter = prototype.spacerAfterVisible;
    let currentBatch = 0;
    let nextBatch = 0;
    window.__virtualizeSpacerCalls = [];

    window.IntersectionObserver = class extends nativeIntersectionObserver {
      constructor(callback, options) {
        super((entries, observer) => {
          currentBatch = ++nextBatch;
          try {
            callback(entries, observer);
          } finally {
            currentBatch = 0;
          }
        }, options);
      }
    };

    const record = (methodName, original) =>
      function (...args) {
        window.__virtualizeSpacerCalls.push({ batch: currentBatch, methodName, args });
        return original.apply(this, args);
      };
    prototype.spacerBeforeVisible = record("spacerBeforeVisible", originalBefore);
    prototype.spacerAfterVisible = record("spacerAfterVisible", originalAfter);

    window.__restoreVirtualizeSpacerRecorder = () => {
      window.IntersectionObserver = nativeIntersectionObserver;
      prototype.spacerBeforeVisible = originalBefore;
      prototype.spacerAfterVisible = originalAfter;
      delete window.__restoreVirtualizeSpacerRecorder;
      delete window.__virtualizeSpacerCalls;
    };
  });

  try {
    await t.mount("VirtualizationAnchorMode");

    if (useItemsProvider) {
      await (await exists(page, "#unload-list")).click();
      await exists(page, "#list-not-loaded");
      await (await exists(page, "#toggle-provider")).click();
      await page.evaluate(() => { window.__virtualizeSpacerCalls = []; });
      await (await exists(page, "#reload-with-initial-index")).click();
    }

    await exists(page, "#scroll-container .item");
    await waitTrue(() => page.evaluate(() => window.__virtualizeSpacerCalls.length > 0));

    const firstBatch = await page.evaluate(() => {
      const calls = window.__virtualizeSpacerCalls;
      const first = Math.min(...calls.map((call) => call.batch));
      const batch = calls.filter((call) => call.batch === first);
      return { count: batch.length, call: batch[0] };
    });

    assertEqual(1, firstBatch.count, "calls in the first IntersectionObserver batch");
    // Blazor's OnSpacerBeforeVisible.
    assertEqual("spacerBeforeVisible", firstBatch.call.methodName, "the first batch's call");
    assertEqual(0, firstBatch.call.args[0], "spacerSize");
    assertEqual(400, firstBatch.call.args[2], "containerSize (300px + 2 × 50px rootMargin)");
    assertEqual(viewportFillReason, firstBatch.call.args[3], "reason (ViewportFill)");
  } finally {
    await page.evaluate(() => window.__restoreVirtualizeSpacerRecorder?.());
  }
}

export const tests = [
  {
    // Blazor: AlwaysFillsVisibleCapacity_Sync (:43)
    name: "AlwaysFillsVisibleCapacity_Sync",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationComponent");
      const topSpacer = (await exists(page, "#sync-container")).locator("div").first();
      const expectedInitialSpacerHeight = 0;
      const getItemCount = () => page.locator(byId("sync-item")).count();

      let initialItemCount = 0;

      // Wait until items have been rendered.
      await waitTrue(async () => (initialItemCount = await getItemCount()) > 0, { interval: SELENIUM_POLL });
      await waitEqual(expectedInitialSpacerHeight, () => reservedHeight(topSpacer));
      await assertAriaHidden(topSpacer);

      // Scroll halfway.
      await page.evaluate(() => {
        const container = document.getElementById("sync-container");
        container.scrollTop = container.scrollHeight * 0.5;
      });

      // Validate that we get the same item count after scrolling halfway.
      await waitEqual(initialItemCount, getItemCount);
      await waitNotEqual(expectedInitialSpacerHeight, () => reservedHeight(topSpacer));
      await assertAriaHidden(topSpacer);

      // Scroll to the bottom.
      await page.evaluate(() => {
        const container = document.getElementById("sync-container");
        container.scrollTop = container.scrollHeight;
      });

      // Validate that we get the same item count after scrolling to the bottom.
      await waitEqual(initialItemCount, getItemCount);
      await waitNotEqual(expectedInitialSpacerHeight, () => reservedHeight(topSpacer));
      await assertAriaHidden(topSpacer);
    },
  },
  {
    // Blazor: AlwaysFillsVisibleCapacity_Async (:76)
    name: "AlwaysFillsVisibleCapacity_Async",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationComponent");
      const finishLoadingButton = await exists(page, "#finish-loading-button");
      const getItemCount = () => page.locator(byId("async-item")).count();
      const getPlaceholderCount = () => page.locator(byId("async-placeholder")).count();

      // Check that no items or placeholders are visible.
      // No data fetches have happened so we don't know how many items there are.
      await waitEqual(0, getItemCount);
      await waitEqual(0, getPlaceholderCount);

      // Load the initial set of items.
      await finishLoadingButton.click();

      let initialItemCount = 0;

      // Validate that items appear and placeholders aren't rendered.
      await waitTrue(async () => (initialItemCount = await getItemCount()) > 0, { interval: SELENIUM_POLL });
      await waitEqual(0, getPlaceholderCount);

      // Scroll halfway.
      await page.evaluate(() => {
        const container = document.getElementById("async-container");
        container.scrollTop = container.scrollHeight * 0.5;
      });

      // Validate that items are replaced by the same number of placeholders.
      await waitEqual(0, getItemCount);
      await waitEqual(initialItemCount, getPlaceholderCount);

      // Load the new set of items.
      await finishLoadingButton.click();

      // Validate that the placeholders are replaced by the same number of items.
      await waitEqual(initialItemCount, getItemCount);
      await waitEqual(0, getPlaceholderCount);

      // Scroll to the bottom.
      await page.evaluate(() => {
        const container = document.getElementById("async-container");
        container.scrollTop = container.scrollHeight;
      });

      // Validate that items are replaced by the same number of placeholders.
      await waitEqual(0, getItemCount);
      await waitEqual(initialItemCount, getPlaceholderCount);

      // Load the new set of items.
      await finishLoadingButton.click();

      // Validate that the placeholders are replaced by the same number of items.
      await waitEqual(initialItemCount, getItemCount);
      await waitEqual(0, getPlaceholderCount);
    },
  },
  {
    // Blazor: InitialRender_DispatchesSingleSpacerCallback(false) (:130)
    name: "InitialRender_DispatchesSingleSpacerCallback(useItemsProvider: false)",
    run: (t) => initialRenderDispatchesSingleSpacerCallback(t, false),
  },
  {
    // Blazor: InitialRender_DispatchesSingleSpacerCallback(true) (:130)
    name: "InitialRender_DispatchesSingleSpacerCallback(useItemsProvider: true)",
    run: (t) => initialRenderDispatchesSingleSpacerCallback(t, true),
  },
  {
    // Blazor: CanUseViewportAsContainer (:321)
    name: "CanUseViewportAsContainer",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationComponent");
      const expectedInitialSpacerHeight = 0;
      const topSpacer = (await exists(page, "#viewport-as-root")).locator("div").first();

      await page.evaluate(() => document.getElementById("viewport-as-root").scrollIntoView());

      // Validate that the top spacer has a height of zero.
      await waitEqual(expectedInitialSpacerHeight, () => reservedHeight(topSpacer));
      await assertAriaHidden(topSpacer);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      // Validate that the scroll event completed successfully
      await waitTrue(async () => (await exists(page, byId("999"))).isVisible());

      // Validate that the top spacer has expanded.
      await waitNotEqual(expectedInitialSpacerHeight, () => reservedHeight(topSpacer));
      await assertAriaHidden(topSpacer);
    },
  },
  {
    // Blazor: ProgrammaticScrollToBottom_ReachesLastItems (:1793)
    name: "ProgrammaticScrollToBottom_ReachesLastItems",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationScrollBehavior");

      const container = await exists(page, "#scroll-behavior-container");
      await waitTrue(async () => (await count(container, ".scroll-behavior-item")) > 0);
      await waitTrue(async () => (await count(container, byId("scroll-item-0"))) > 0);

      await container.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await waitForScrollStabilization(container);

      await waitTrue(async () => {
        const texts = await container.locator(".scroll-behavior-item .item-index").allInnerTexts();
        return texts.some((text) => Number.parseInt(text, 10) > 480);
      });
    },
  },
];
