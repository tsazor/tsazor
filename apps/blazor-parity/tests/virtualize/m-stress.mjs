/**
 * Group M of Blazor's Virtualize E2E tests (docs/blazor-virtualize-net11.md §9): stress and stability — rapid
 * scrolling, a large data set, flashing and backward jumps. Ported from VirtualizationTest.cs; line numbers
 * refer to it. The in-page scripts are in _probes.mjs.
 */
import { assert, exists, textOf, waitEqual, waitTrue } from "../lib/harness.mjs";
import { count, jumpToEndWithStabilization, jumpToStartWithStabilization, mountAnchorModeComponent } from "./_helpers.mjs";
import { asyncProviderScrollFlashes, containerScrollJumpDetection, rapidScrollReversal, scrollStability } from "./_probes.mjs";

export const group = "M. Stress and stability (rapid scroll, large data, flashing, backward jumps)";

export const tests = [
  {
    // Blazor: LargeDataset_CanScrollWithoutErrors (:1731)
    name: "LargeDataset_CanScrollWithoutErrors",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationBimodal");

      await (await exists(page, "#load-large")).click();
      await waitEqual("Loaded 100000 items", async () => textOf(await exists(page, "#large-dataset-status")));

      const container = await exists(page, "#large-dataset-container");
      const hasItems = async () => (await count(container, ".large-dataset-item")) > 0;

      await waitTrue(hasItems);

      for (const fraction of [0.01, 0.5, 0.99]) {
        await container.evaluate((el, f) => { el.scrollTop = el.scrollHeight * f; }, fraction);
        await waitTrue(hasItems);
      }

      await jumpToEndWithStabilization(container, null, null);
      await waitTrue(hasItems);

      await waitTrue(async () => {
        const texts = await container.locator(".large-dataset-item .item-index").allInnerTexts();
        return texts.some((text) => /^\d+$/.test(text.trim()) && Number.parseInt(text, 10) > 99900);
      });

      await jumpToStartWithStabilization(container, null, null);
      await waitTrue(async () => (await count(container, "#large-item-0")) > 0);
    },
  },
  {
    // Blazor: RapidScrollReversals_DoNotCauseErrors (:1778)
    name: "RapidScrollReversals_DoNotCauseErrors",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationScrollBehavior");

      const container = await exists(page, "#scroll-behavior-container");
      await waitTrue(async () => (await count(container, ".scroll-behavior-item")) > 0);

      const { itemCount } = await rapidScrollReversal(page, "scroll-behavior-container", ".scroll-behavior-item");

      assert(itemCount > 0, "Items should still be visible after rapid scroll reversals");
    },
  },
  {
    // Blazor: VariableHeight_VisualStability_NoBackwardJumps (:1866)
    name: "VariableHeight_VisualStability_NoBackwardJumps",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationVariableHeightAsync");

      const container = await exists(page, "#async-variable-container");
      await (await exists(page, "#toggle-autoload")).click();

      await (await exists(page, "#set-count-200")).click();
      await (await exists(page, "#refresh-data")).click();
      await waitTrue(async () => (await count(container, ".async-variable-item")) > 0);

      const result = await scrollStability(page, "async-variable-container", ".async-variable-item");

      assert(result.finalItemCount > 0, "Should have items after scrolling");
      assert(result.totalEvents > 0, "Should have recorded scroll events");
      assert(
        result.backwardJumps <= 3,
        `Too many backward scroll jumps detected: ${result.backwardJumps} out of ${result.totalEvents} events (max jump: ${result.maxBackwardJump}px). ` +
          "This indicates visual instability.",
      );
    },
  },
  {
    // Blazor: ItemsIncrementalScroll_DoesNotJumpToStartOrEnd (:3191)
    name: "ItemsIncrementalScroll_DoesNotJumpToStartOrEnd",
    async run(t) {
      const { page } = t;
      // Before Blazor's fix (#67729), each ~100px scroll produced large jumps in both directions.
      await t.mount("VirtualizationComponent");

      await waitTrue(async () => (await page.locator(".incorrect-size-item").count()) > 0);

      const { maxJump, scrollDelta, downJumps, upJumps } = await containerScrollJumpDetection(page, "incorrect-size-container");

      // Healthy behaviour: every step moves ~scrollDelta (100px)
      assert(
        maxJump < scrollDelta * 4,
        "Incremental scrolling should not cause the viewport to jump to the start/end of the list. " +
          `Largest single-step jump was ${maxJump}px (each step requested ${scrollDelta}px). Down jumps: [${downJumps}]. Up jumps: [${upJumps}]. ` +
          "Large jumps indicate the Virtualize reserved-height compensation is over-shifting (issue #67729).",
      );
    },
  },
  {
    // Blazor: AnchorMode_None_AsyncProvider_ScrollDoesNotFlash (:3967). Tsazor deviation A14: rows replacing
    // placeholders above the viewport keep the top row in place (the browser anchored on a removed placeholder).
    name: "AnchorMode_None_AsyncProvider_ScrollDoesNotFlash",
    async run(t) {
      const container = await mountAnchorModeComponent(t, "0", { variableHeight: true, useItemsProvider: true, delay: true });

      // Scroll through items incrementally, checking for backward index jumps (flashing).
      const { flashCount, maxIndexSeen, steps } = await asyncProviderScrollFlashes(container);

      assert(flashCount === 0, `Async provider: scrolling should not flash/jump backward. Detected ${flashCount} backward jumps, max index seen: ${maxIndexSeen}. Steps (scrollTop:top index): ${steps}`);
      assert(maxIndexSeen >= 50, `Should have scrolled through some items but only reached index ${maxIndexSeen}.`);
    },
  },
];
