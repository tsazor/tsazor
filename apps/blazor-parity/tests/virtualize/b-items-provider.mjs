/**
 * Group B of Blazor's Virtualize E2E tests (docs/blazor-virtualize-net11.md §9): ItemsProvider,
 * cancellation, refresh, data changes and EmptyContent. Ported from VirtualizationTest.cs; line numbers
 * refer to it.
 */
import {
  assert,
  byId,
  doesNotExist,
  exists,
  textOf,
  waitCollection,
  waitContains,
  waitEqual,
  waitTrue,
} from "../lib/harness.mjs";
import {
  count,
  getBottomRenderedIndex,
  getMaximumScrollTop,
  getPeopleNames,
  getProviderCallIndex,
  getProviderEvents,
  getScrollTop,
  isScrolledToBottom,
  jumpToEndWithStabilization,
  jumpToStartWithStabilization,
  scrollTopToEnd,
  statusText,
} from "./_helpers.mjs";

export const group = "B. ItemsProvider, cancellation, refresh, data changes, EmptyContent";

/** The containers of VirtualizationDataChanges' large data set (the InlineData of :617 and :651). */
const LARGE_DATA_SET_CONTAINERS = [
  "simple-scroll-horizontal",
  "complex-scroll-horizontal",
  "simple-scroll-horizontal-on-parent",
  "complex-scroll-horizontal-on-parent",
  "complex-scroll-horizontal-on-tbody",
  "simple-display-table-scroll-horizontal",
  "complex-display-table-scroll-horizontal",
  "removing-many",
];

/** The data set length the page last handed to the providers (`large-dataset-length-lastrendered`). */
async function dataSetLengthLastRendered(page) {
  return Number.parseInt(await textOf(page.locator("#large-dataset-length-lastrendered")), 10);
}

/** CanExpandDataSetAndRetainScrollPosition (:626). */
async function canExpandDataSetAndRetainScrollPosition(t, containerId) {
  const { page } = t;
  await t.mount("VirtualizationDataChanges");
  const dataSetLengthSelector = await exists(page, "#large-dataset-length");
  const container = await exists(page, byId(containerId));

  // Scroll to the end of a medium list
  // Temporary diagnostics: sample the scroll over the whole expansion (the drift happens between the waits).
  await dataSetLengthSelector.selectOption({ label: "1000" });
  const trajectory = [];
  const sample = setInterval(() => {
    page.evaluate((containerId) => {
      const element = document.getElementById(containerId) ?? document.querySelector(containerId);
      if (!element) return null;
      const styled = [...element.querySelectorAll("[aria-hidden]")].filter((hidden) => hidden instanceof HTMLElement && hidden.hasAttribute("style"));
      return { top: Math.round(element.scrollTop), h: element.scrollHeight, ch: element.clientHeight, before: styled[0]?.style.height, after: styled[1]?.style.height, beforeOff: Math.round(styled[0]?.offsetTop ?? -1), afterOff: Math.round(styled[1]?.offsetTop ?? -1), rows: element.querySelectorAll(".person").length };
    }, containerId)
      .then((m) => {
        if (m === null) {
          trajectory.push(`${Date.now() % 1000000} no element`);
          return;
        }
        trajectory.push(`${Date.now() % 1000000} top=${m.top}/h=${m.h} ch=${m.ch} before=${m.before}@${m.beforeOff} after=${m.after}@${m.afterOff} rows=${m.rows}`);
      })
      .catch((error) => trajectory.push(`${Date.now() % 1000000} eval failed: ${error.message?.split("\n")[0]}`));
  }, 250);
  const diagnostic = async () => {
    const scrollTop = await getScrollTop(container);
    const names = await getPeopleNames(container);
    const spacers = await container.evaluate((element) => {
      const styled = [...element.querySelectorAll("[aria-hidden]")].filter((hidden) => hidden instanceof HTMLElement && hidden.hasAttribute("style"));
      return `${styled.length} spacers@${styled.map((s) => s.style.height).join("+")}; scrollHeight=${element.scrollHeight}`;
    });
    return `Person 1000 should be visible after scrolling to the end of the 1000-item list (scrollTop=${scrollTop}, ${spacers}, first/last=${names[0] ?? "none"}/${names[names.length - 1] ?? "none"}, ${names.length} rows)`;
  };
  await waitEqual(1000, () => dataSetLengthLastRendered(page));
  await waitTrue(async () => {
    await scrollTopToEnd(container);
    return (await getPeopleNames(container)).includes("Person 1000");
  }, { message: diagnostic });

  // Expand the data set
  await dataSetLengthSelector.selectOption({ label: "100000" });
  await waitEqual(100000, () => dataSetLengthLastRendered(page));

  // See that the old data is still visible, because the scroll position is preserved as a pixel count,
  // not a scroll percentage — sampled: the scroll's trajectory while the data changes (temporary diagnostics)
  const deadline = Date.now() + 10_000;
  let reached = false;
  while (!reached && Date.now() < deadline) {
    reached = (await getPeopleNames(container)).includes("Person 1000");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!reached) {
    clearInterval(sample);
    throw new Error(`Person 1000 should stay visible while the data expands (pixel scroll is preserved); trajectory:\n  ${trajectory.join("\n  ")}`);
  }
  clearInterval(sample);
}

/** CanHandleDataSetShrinkingWithExistingOffsetAlreadyBeyondNewListEnd (:660). */
async function canHandleDataSetShrinking(t, containerId) {
  // Represents https://github.com/dotnet/aspnetcore/issues/37245
  const { page } = t;
  await t.mount("VirtualizationDataChanges");
  const dataSetLengthSelector = await exists(page, "#large-dataset-length");
  const container = await exists(page, byId(containerId));

  // Scroll to the end of a very long list
  await dataSetLengthSelector.selectOption({ label: "100000" });
  await waitEqual(100000, () => dataSetLengthLastRendered(page));
  await waitTrue(async () => {
    await scrollTopToEnd(container);
    return (await getPeopleNames(container)).includes("Person 100000");
  });

  // Now make the dataset much shorter
  // We should automatically have the scroll position reduced to the new maximum
  // Because the new data set is *so much* shorter than the previous one, if bug #37245 were still here,
  // this would take over 30 minutes so the test would fail
  await dataSetLengthSelector.selectOption({ label: "25" });
  await waitEqual(25, () => dataSetLengthLastRendered(page));
  await waitTrue(async () => (await getPeopleNames(container)).includes("Person 25"));
}

export const tests = [
  {
    // Blazor: CancelsOutdatedRefreshes_Async (:291)
    name: "CancelsOutdatedRefreshes_Async",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationComponent");
      const finishLoadingButton = await exists(page, "#finish-loading-button");
      const asyncContainer = page.locator("#async-container");

      await finishLoadingButton.click();

      await waitEqual("0", async () => textOf(page.locator("#cancellation-count")));

      for (let y = 1000; y <= 5000; y += 1000) {
        await asyncContainer.evaluate((el, top) => el.scrollTo({ top }), y);
        const targetY = y;
        await waitTrue(async () => (await getScrollTop(asyncContainer)) === targetY);
      }

      await waitTrue(async () => {
        const text = await textOf(page.locator("#cancellation-count"));
        const value = Number.parseInt(text, 10);
        return !Number.isNaN(value) && value > 0;
      });
    },
  },
  {
    // Blazor: CanMutateDataInPlace_Sync (:460)
    name: "CanMutateDataInPlace_Sync",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDataChanges");

      // Initial data
      const container = await exists(page, "#using-items");
      await waitCollection(["Person 1", "Person 2", "Person 3"], () => getPeopleNames(container));

      // Mutate one of them
      const itemToMutate = container.locator(".person").nth(1);
      await itemToMutate.locator("button").click();

      // See changes
      await waitCollection(["Person 1", "Person 2 MUTATED", "Person 3"], () => getPeopleNames(container));
    },
  },
  {
    // Blazor: CanMutateDataInPlace_Async (:483)
    name: "CanMutateDataInPlace_Async",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDataChanges");

      // Initial data
      const container = await exists(page, "#using-itemsprovider");
      await waitCollection(["Person 1", "Person 2", "Person 3"], () => getPeopleNames(container));

      // Mutate one of them
      const itemToMutate = container.locator(".person").nth(1);
      await itemToMutate.locator("button").click();

      // See changes
      await waitCollection(["Person 1", "Person 2 MUTATED", "Person 3"], () => getPeopleNames(container));
    },
  },
  {
    // Blazor: CanChangeDataCount_Sync (:506)
    name: "CanChangeDataCount_Sync",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDataChanges");

      // Initial data
      const container = await exists(page, "#using-items");
      await waitCollection(["Person 1", "Person 2", "Person 3"], () => getPeopleNames(container));

      // Add another item
      await (await exists(page, "#add-person-to-fixed-list")).click();

      // See changes
      await waitCollection(["Person 1", "Person 2", "Person 3", "Person 4"], () => getPeopleNames(container));
    },
  },
  {
    // Blazor: CanChangeDataCount_Async (:529)
    name: "CanChangeDataCount_Async",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDataChanges");

      // Initial data
      const container = await exists(page, "#using-itemsprovider");
      await waitCollection(["Person 1", "Person 2", "Person 3"], () => getPeopleNames(container));

      // Add another item
      await (await exists(page, "#add-person-to-itemsprovider")).click();

      // Initially this has no effect because we don't re-query the provider until told to do so
      await waitCollection(["Person 1", "Person 2", "Person 3"], () => getPeopleNames(container));

      // Request refresh
      await (await exists(page, "#refresh-itemsprovider")).click();

      // See changes
      await waitCollection(["Person 1", "Person 2", "Person 3", "Person 4"], () => getPeopleNames(container));
    },
  },
  {
    // Blazor: CanRefreshItemsProviderResultsInPlace (:561)
    name: "CanRefreshItemsProviderResultsInPlace",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationDataChanges");

      // Mutate the data (Playwright's click waits for the provider's first rows; Selenium's FindElements doesn't)
      const container = await exists(page, "#using-itemsprovider");
      const itemToMutate = container.locator(".person").nth(1);
      await itemToMutate.locator("button").click();

      // Verify the mutation was applied
      await waitCollection(["Person 1", "Person 2 MUTATED", "Person 3"], () => getPeopleNames(container));

      // Refresh and verify the mutation was reverted
      await (await exists(page, "#refresh-itemsprovider")).click();
      await waitCollection(["Person 1", "Person 2", "Person 3"], () => getPeopleNames(container));
    },
  },
  ...LARGE_DATA_SET_CONTAINERS.map((containerId) => ({
    // Blazor: CanExpandDataSetAndRetainScrollPosition (:626)
    name: `CanExpandDataSetAndRetainScrollPosition(containerId: ${containerId})`,
    run: (t) => canExpandDataSetAndRetainScrollPosition(t, containerId),
  })),
  ...LARGE_DATA_SET_CONTAINERS.map((containerId) => ({
    // Blazor: CanHandleDataSetShrinkingWithExistingOffsetAlreadyBeyondNewListEnd (:660)
    name: `CanHandleDataSetShrinkingWithExistingOffsetAlreadyBeyondNewListEnd(containerId: ${containerId})`,
    run: (t) => canHandleDataSetShrinking(t, containerId),
  })),
  {
    // Blazor: EmptyContentRendered_Sync (:687)
    name: "EmptyContentRendered_Sync",
    async run(t) {
      await t.mount("VirtualizationComponent");
      await exists(t.page, "#no-data-sync");
    },
  },
  {
    // Blazor: EmptyContentRendered_Async (:694)
    name: "EmptyContentRendered_Async",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationComponent");
      const finishLoadingWithItemsButton = await exists(page, "#finish-loading-button");
      const finishLoadingWithoutItemsButton = await exists(page, "#finish-loading-button-empty");
      const refreshDataAsync = await exists(page, "#refresh-data-async");
      const getItemCount = () => page.locator(byId("async-item")).count();
      const getPlaceholderCount = () => page.locator(byId("async-placeholder")).count();

      // Check that no items or placeholders are visible.
      // No data fetches have happened so we don't know how many items there are.
      await waitEqual(0, getItemCount);
      await waitEqual(0, getPlaceholderCount);

      // Check that <EmptyContent> is not shown while loading
      await doesNotExist(page, "#no-data-async");

      // Load the initial set of items.
      await finishLoadingWithItemsButton.click();

      // Check that <EmptyContent> is still not shown (because there are items loaded)
      await doesNotExist(page, "#no-data-async");

      // Start loading
      await refreshDataAsync.click();

      // Check that <EmptyContent> is not shown
      await doesNotExist(page, "#no-data-async");

      // Simulate 0 items
      await finishLoadingWithoutItemsButton.click();

      // Check that <EmptyContent> is shown
      await exists(page, "#no-data-async");
    },
  },
  {
    // Blazor: VariableHeightAsync_CollectionMutationWorks (:1445)
    name: "VariableHeightAsync_CollectionMutationWorks",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationVariableHeightAsync");

      const container = await exists(page, "#async-variable-container");
      const finishLoadingButton = await exists(page, "#finish-loading");
      const addItemStartButton = await exists(page, "#add-item-start");
      const removeItemMiddleButton = await exists(page, "#remove-item-middle");
      const refreshButton = await exists(page, "#refresh-data");
      const totalItemCount = await exists(page, "#total-item-count");
      const hasPlaceholders = async () => (await count(container, ".async-variable-placeholder")) > 0;
      const loadData = () => finishLoadingButton.click();
      const styleOf = (id) => container.locator(byId(id)).getAttribute("style");

      await finishLoadingButton.click();
      await waitTrue(async () => (await count(container, ".async-variable-item")) > 0);
      await waitEqual("Total: 1000", () => textOf(totalItemCount));
      assert((await styleOf("async-variable-item-0")).includes("height: 25px"), "item 0 should be 25px"); // 25 + 0*11%31 = 25px

      // Add item at START with distinctive 100px height
      await addItemStartButton.click();
      await waitEqual("Total: 1001", () => textOf(totalItemCount));

      await refreshButton.click();
      await waitTrue(
        async () => {
          await finishLoadingButton.click();
          return (await count(container, byId("async-variable-item-0"))) > 0;
        },
        { timeout: 5_000, interval: 500, message: "New item-0 should render at top after prepend" },
      );

      assert((await styleOf("async-variable-item-0")).includes("height: 100px"), "the new item 0 should be 100px");
      assert((await styleOf("async-variable-item-1")).includes("height: 25px"), "item 1 should be 25px");

      await removeItemMiddleButton.click();
      await waitEqual("Total: 1000", () => textOf(totalItemCount));

      await refreshButton.click();
      await finishLoadingButton.click();
      await jumpToEndWithStabilization(container, hasPlaceholders, loadData);
      await waitTrue(async () => (await count(container, byId("async-variable-item-999"))) > 0, { message: "#async-variable-item-999 should be rendered" });

      await jumpToStartWithStabilization(container, hasPlaceholders, loadData);

      assert((await styleOf("async-variable-item-0")).includes("height: 100px"), "item 0 should still be the 100px item");
    },
  },
  {
    // Blazor: VariableHeightAsync_SmallItemCountsWork (:1501)
    name: "VariableHeightAsync_SmallItemCountsWork",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationVariableHeightAsync");

      const container = await exists(page, "#async-variable-container");
      const finishLoadingButton = await exists(page, "#finish-loading");
      const setCount0Button = await exists(page, "#set-count-0");
      const setCount1Button = await exists(page, "#set-count-1");
      const setCount5Button = await exists(page, "#set-count-5");
      const refreshButton = await exists(page, "#refresh-data");
      const totalItemCount = await exists(page, "#total-item-count");
      const styleOf = (id) => container.locator(byId(id)).getAttribute("style");

      await finishLoadingButton.click();
      await waitTrue(async () => (await count(container, ".async-variable-item")) > 0);
      await waitEqual("Total: 1000", () => textOf(totalItemCount));

      // Empty list (0 items) - should show EmptyContent
      await setCount0Button.click();
      await waitEqual("Total: 0", () => textOf(totalItemCount));
      await refreshButton.click();
      await finishLoadingButton.click();
      await waitEqual(0, () => count(container, ".async-variable-item"));
      await exists(page, "#no-data");

      // Single item
      await setCount1Button.click();
      await waitEqual("Total: 1", () => textOf(totalItemCount));
      await refreshButton.click();
      await finishLoadingButton.click();
      await waitEqual(1, () => count(container, ".async-variable-item"));
      await doesNotExist(page, "#no-data");
      assert((await styleOf("async-variable-item-0")).includes("height: 30px"), "the single item should be 30px"); // 30 + 0*17%41 = 30px

      // 5 items
      await setCount5Button.click();
      await waitEqual("Total: 5", () => textOf(totalItemCount));
      await refreshButton.click();
      await finishLoadingButton.click();
      await waitEqual(5, () => count(container, ".async-variable-item"));
      await doesNotExist(page, "#no-data");

      const expectedHeights = [30, 47, 64, 40, 57]; // 30 + (i * 17 % 41)
      for (let i = 0; i < expectedHeights.length; i++) {
        assert((await styleOf(`async-variable-item-${i}`)).includes(`height: ${expectedHeights[i]}px`), `item ${i} should be ${expectedHeights[i]}px`);
      }
    },
  },
  {
    // Blazor: AnchorMode_End_InitialItemsProviderLoad_PinsToBottom (:5981). Blazor emulates 400 ms latency over
    // CDP in Server mode only (a SignalR round trip); like its WebAssembly run, this port has no network to slow.
    name: "AnchorMode_End_InitialItemsProviderLoad_PinsToBottom",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationAnchorMode");
      const container = await exists(page, "#scroll-container");
      await waitTrue(async () => (await count(container, ".item")) > 0);

      await (await exists(page, "#unload-list")).click();
      await exists(page, "#list-not-loaded");
      await (await exists(page, "#toggle-provider")).click();
      await waitContains("Switched to ItemsProvider", () => statusText(page));
      await (await exists(page, "#anchor-mode-select")).selectOption("2");
      await waitEqual("2", async () => textOf(page.locator("#current-mode")));
      await (await exists(page, "#toggle-provider-gate")).click();
      await waitContains("Provider gate: On", () => statusText(page));

      await (await exists(page, "#reload-with-initial-index")).click();
      await waitTrue(async () => (await getProviderCallIndex(page)) === 1);
      await waitContains("p1-enter", () => getProviderEvents(page));

      await (await exists(page, "#release-provider-gate")).click();
      await waitContains("p1-return", () => getProviderEvents(page));
      await waitTrue(async () => (await getMaximumScrollTop(container)) > 0);

      await waitTrue(() => isScrolledToBottom(container), {
        timeout: 10_000,
        message: async () =>
          `Expected the initial provider result to pin to the bottom, but scrollTop was ${await getScrollTop(container)} of ${await getMaximumScrollTop(container)}.`,
      });

      await waitTrue(async () => (await getProviderCallIndex(page)) === 2);
      await (await exists(page, "#release-provider-gate")).click();
      await waitContains("p2-return", () => getProviderEvents(page));
      await waitTrue(async () => (await getBottomRenderedIndex(page)) === 999 && (await isScrolledToBottom(container)), {
        timeout: 10_000,
        message: async () =>
          `Expected item 999 at the pinned tail, but the bottom rendered item was ${await getBottomRenderedIndex(page)} and scrollTop was ${await getScrollTop(container)}.`,
      });
    },
  },
];
