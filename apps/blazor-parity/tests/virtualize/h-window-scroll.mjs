/**
 * Group H of Blazor's Virtualize E2E tests (docs/blazor-virtualize-net11.md §9): AnchorMode with window
 * (document) scrolling. VirtualizationAnchorModeWindowScroll has no scroll container: the list sits under a
 * fixed header and the document scrolls. Ported from VirtualizationTest.cs; line numbers refer to it.
 */
import { assert, exists, textOf, waitContains, waitTrue } from "../lib/harness.mjs";
import {
  assertWindowScrollViewportStaysStable,
  count,
  getItemPositionInViewport,
  mountWindowScrollAnchorModeComponent,
  statusText,
  windowBottomGap,
  windowScrollMidListAndWaitForRender,
  windowScrollToBottomAndWait,
  windowScrollY,
} from "./_helpers.mjs";

export const group = "H. AnchorMode with window (document) scrolling";

/** The 2 × 2 variants of the Theories with `(bool variableHeight, bool useItemsProvider)`. */
const HEIGHTS_AND_SOURCES = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
];

/** Mounts the window-scroll page in `anchorMode` (the provider always with Blazor's 500 ms delay). */
async function mountWith(t, anchorMode, { variableHeight = false, useItemsProvider = false } = {}) {
  await mountWindowScrollAnchorModeComponent(t, anchorMode, { variableHeight, useItemsProvider, delay: useItemsProvider });
  return exists(t.page, "#virtualize-root");
}

/** Clicks a mutation button on the page and waits for its status. */
async function mutate(page, buttonId, status) {
  await (await exists(page, `#${buttonId}`)).click();
  await waitContains(status, () => statusText(page));
}

/** A prepend at the top of the document: compensated (scrollY grows past 50), the item stays (:4914, :5055). */
async function prependAtTopStaysStable(t, anchorMode, variableHeight, useItemsProvider, message) {
  const { page } = t;
  const root = await mountWith(t, anchorMode, { variableHeight, useItemsProvider });

  const { index: indexBefore, top: topBefore } = await getItemPositionInViewport(root, ".item[data-index]");

  await mutate(page, "prepend-items", "Prepended 10 items");

  // Wait for anchor restore to compensate scrollY.
  await waitTrue(async () => (await windowScrollY(page)) > 50, { timeout: 10_000 });

  await assertWindowScrollViewportStaysStable(root, indexBefore, topBefore, message);
}

/** A mutation mid-list or at the bottom of the document; the first visible item stays (:4967, :5011, :5032, :5103). */
async function mutateAndStayStable(t, anchorMode, useItemsProvider, position, buttonId, status, message) {
  const { page } = t;
  const root = await mountWith(t, anchorMode, { useItemsProvider });

  if (position === "mid-list") await windowScrollMidListAndWaitForRender(page);
  else await windowScrollToBottomAndWait(page);

  const { index: indexBefore, top: topBefore } = await getItemPositionInViewport(root, ".item[data-index]");

  await mutate(page, buttonId, status);

  await assertWindowScrollViewportStaysStable(root, indexBefore, topBefore, message);
}

/** The document's scrollHeight. */
function documentScrollHeight(page) {
  return page.evaluate(() => document.documentElement.scrollHeight);
}

export const tests = [
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_WindowScroll_None_PrependAtTop_ViewportStaysStable (:4914)
    name: `AnchorMode_WindowScroll_None_PrependAtTop_ViewportStaysStable(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      prependAtTopStaysStable(t, "0", variableHeight, useItemsProvider, "Window None mode at top: same item should stay at same position after prepend"),
  })),
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_WindowScroll_None_LargeAppendAtBottom_DoesNotFollowToBottom (:4939)
    name: `AnchorMode_WindowScroll_None_LargeAppendAtBottom_DoesNotFollowToBottom(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const { page } = t;
      await mountWith(t, "0", { variableHeight, useItemsProvider });

      await windowScrollToBottomAndWait(page);

      const scrollHeightBefore = await documentScrollHeight(page);

      await mutate(page, "append-many-items", "Appended 100 items");

      await waitTrue(async () => (await documentScrollHeight(page)) > scrollHeightBefore + 2000, {
        timeout: 10_000,
        message: "Large append should grow the scrollable height before the viewport position is checked",
      });

      const scrollY = await windowScrollY(page);
      const gap = await windowBottomGap(page);
      assert(gap > 2000, `Window None mode: should not converge to bottom after large append. scrollY: ${scrollY}, gap: ${gap}`);
    },
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: AnchorMode_WindowScroll_None_MidList_ViewportStable (:4967)
    name: `AnchorMode_WindowScroll_None_MidList_ViewportStable(useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      mutateAndStayStable(t, "0", useItemsProvider, "mid-list", "prepend-items", "Prepended 10 items", "Window None mode mid-list: viewport should stay stable after prepend"),
  })),
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_WindowScroll_Start_PrependAtTop_NewItemsVisible (:4990)
    name: `AnchorMode_WindowScroll_Start_PrependAtTop_NewItemsVisible(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const { page } = t;
      const root = await mountWith(t, "1", { variableHeight, useItemsProvider });

      await mutate(page, "prepend-items", "Prepended 10 items");

      await waitTrue(
        async () => {
          const { index } = await getItemPositionInViewport(root, ".item[data-index]");
          const parsed = Number.parseInt(index, 10);
          return Number.isInteger(parsed) && parsed < 0;
        },
        { timeout: 10_000, message: "Window Beginning mode: prepended items should be visible at top" },
      );
    },
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: AnchorMode_WindowScroll_Start_AppendAtBottom_ViewportStable (:5011)
    name: `AnchorMode_WindowScroll_Start_AppendAtBottom_ViewportStable(useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      mutateAndStayStable(t, "1", useItemsProvider, "bottom", "append-items", "Appended 10 items", "Window Beginning mode at bottom: viewport should stay stable after append"),
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: AnchorMode_WindowScroll_Start_MidList_ViewportStable (:5032)
    name: `AnchorMode_WindowScroll_Start_MidList_ViewportStable(useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      mutateAndStayStable(t, "1", useItemsProvider, "mid-list", "prepend-items", "Prepended 10 items", "Window Beginning mode mid-list: viewport should stay stable after prepend"),
  })),
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_WindowScroll_End_PrependAtTop_ViewportStaysStable (:5055) — End mode as mounted
    name: `AnchorMode_WindowScroll_End_PrependAtTop_ViewportStaysStable(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      prependAtTopStaysStable(t, "2", variableHeight, useItemsProvider, "Window End mode at top: same item should stay at same position after prepend"),
  })),
  ...HEIGHTS_AND_SOURCES.map(([variableHeight, useItemsProvider]) => ({
    // Blazor: AnchorMode_WindowScroll_End_AppendAtBottom_ViewportFollows (:5079)
    name: `AnchorMode_WindowScroll_End_AppendAtBottom_ViewportFollows(variableHeight: ${variableHeight}, useItemsProvider: ${useItemsProvider})`,
    async run(t) {
      const { page } = t;
      await mountWith(t, "2", { variableHeight, useItemsProvider });

      await windowScrollToBottomAndWait(page);

      await mutate(page, "append-items", "Appended 10 items");

      await waitTrue(async () => (await windowBottomGap(page)) < 2, {
        timeout: 10_000,
        message: "Window End mode: viewport should follow new content to the bottom after append",
      });
    },
  })),
  ...[false, true].map((useItemsProvider) => ({
    // Blazor: AnchorMode_WindowScroll_End_MidList_ViewportStable (:5103)
    name: `AnchorMode_WindowScroll_End_MidList_ViewportStable(useItemsProvider: ${useItemsProvider})`,
    run: (t) =>
      mutateAndStayStable(t, "2", useItemsProvider, "mid-list", "prepend-items", "Prepended 10 items", "Window End mode mid-list: viewport should stay stable after prepend"),
  })),
  {
    // Blazor: WindowScroll_ScrollToItem_LandsAtTarget (:7034)
    name: "WindowScroll_ScrollToItem_LandsAtTarget",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationAnchorModeWindowScroll");
      const root = await exists(page, "#virtualize-root");
      await waitTrue(async () => (await count(root, ".item")) > 0);

      await (await exists(page, "#toggle-provider")).click();
      await waitTrue(async () => (await count(root, ".item")) > 0);

      const input = await exists(page, "#scroll-target-index");
      await input.press("ControlOrMeta+a");
      await input.press("Delete");
      await input.pressSequentially("100");
      await input.press("Tab");
      await (await exists(page, "#scroll-to-item")).click();
      await waitTrue(async () => (await textOf(await exists(page, "#scroll-status"))).startsWith("Completed: 100"), { timeout: 15_000 });

      const scrollY = await windowScrollY(page);
      assert(scrollY > 0, `Window scroll should have moved; scrollY=${scrollY}`);

      // Item 100 must be visible in the viewport.
      await waitTrue(
        () =>
          page.evaluate(() => {
            const el = document.querySelector('.item[data-index="100"]');
            if (!el) return false;
            const er = el.getBoundingClientRect();
            return er.top < window.innerHeight && er.bottom > 0;
          }),
        { message: "Item 100 must be visible in window viewport." },
      );
    },
  },
];
