/**
 * Group C of Blazor's Virtualize E2E tests (docs/blazor-virtualize-net11.md §9): MaxItemCount and
 * OverscanCount. Ported from VirtualizationTest.cs; line numbers refer to it.
 */
import { assert, exists, textOf, waitEqual, waitNotEqual, waitTrue } from "../lib/harness.mjs";

export const group = "C. MaxItemCount and OverscanCount";

/** CanLimitMaxItemsRendered (:432), the parameter variant. */
async function canLimitMaxItemsRendered(t) {
  const { page } = t;
  await t.mount("VirtualizationMaxItemCount");

  // Despite having a 600px tall scroll area and 30px high items (600/30=20),
  // we only render 10 items due to the MaxItemCount setting
  const scrollArea = await exists(page, "#virtualize-scroll-area");
  const items = scrollArea.locator(".my-item");
  await waitEqual(16, () => items.count());
  await waitEqual("Id: 0; Name: Thing 0", () => textOf(items.first()));

  // Scrolling still works and loads new data, though there's no guarantee about
  // exactly how many items will show up at any one time
  await page.evaluate(() => { document.getElementById("virtualize-scroll-area").scrollTop = 300; });
  await waitNotEqual("Id: 0; Name: Thing 0", () => textOf(items.first()));
  await waitTrue(async () => {
    const count = await items.count();
    return count > 3 && count <= 16;
  });
}

/** The rendered `.large-overscan-item` indices, in DOM order (GetVisibleItemIndices, :817). */
function getVisibleItemIndices(container) {
  return container.evaluate((c) =>
    Array.from(c.querySelectorAll(".large-overscan-item"))
      .map((el) => el.textContent.trim())
      .filter((text) => text.startsWith("Item "))
      .map((text) => Number.parseInt(text.slice(5), 10))
      .filter((value) => !Number.isNaN(value)),
  );
}

/** IsCurrentViewContiguous (:795): the indices form one run without holes. */
function isContiguous(indices) {
  if (indices.length === 0) return false;
  if (indices[indices.length - 1] - indices[0] !== indices.length - 1) return false;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] - indices[i - 1] !== 1) return false;
  }
  return true;
}

export const tests = [
  {
    // Blazor: CanLimitMaxItemsRendered(true) (:432)
    name: "CanLimitMaxItemsRendered(useAppContext: true)",
    skip: "the .NET 8 AppContext switch has no Tsazor counterpart (MaxItemCount is only the parameter); the page is ported without it",
  },
  {
    // Blazor: CanLimitMaxItemsRendered(false) (:432)
    name: "CanLimitMaxItemsRendered(useAppContext: false)",
    run: canLimitMaxItemsRendered,
  },
  {
    // Blazor: CanElevateEffectiveMaxItemCount_WhenOverscanExceedsMax (:732)
    name: "CanElevateEffectiveMaxItemCount_WhenOverscanExceedsMax",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationLargeOverscan");
      const container = await exists(page, "#virtualize-large-overscan");
      // Wait for the elevated effective max to kick in (>= OverscanCount).
      let indices = [];
      await waitTrue(async () => {
        indices = await getVisibleItemIndices(container);
        return indices.length >= 200;
      });

      // Give focus so PageDown works
      await container.click();

      let lastMaxIndex = -1;
      const metrics = () => container.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollTop: el.scrollTop }));

      // Check if we've reached (or effectively reached) the bottom
      let { scrollHeight, clientHeight, scrollTop } = await metrics();
      while (scrollTop + clientHeight < scrollHeight) {
        // Re-query visible items after each scroll so contiguity and
        // progress checks reflect the current DOM state.
        await waitTrue(async () => {
          indices = await getVisibleItemIndices(container);
          return isContiguous(indices);
        });

        // Track progress in indices
        const currentMax = Math.max(...indices);
        assert(currentMax >= lastMaxIndex, `Unexpected backward movement: previous max ${lastMaxIndex}, current max ${currentMax}.`);
        lastMaxIndex = currentMax;

        // Send PageDown
        await container.press("PageDown");

        // Wait for scrollTop to change (progress) to avoid infinite loop
        const prevScrollTop = scrollTop;
        await waitTrue(async () => (await container.evaluate((el) => el.scrollTop)) > prevScrollTop);
        ({ scrollHeight, clientHeight, scrollTop } = await metrics());
      }

      // Final contiguous assertion at bottom
      await waitTrue(async () => isContiguous(await getVisibleItemIndices(container)));
    },
  },
];
