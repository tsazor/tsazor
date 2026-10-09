/**
 * Group I of Blazor's Virtualize E2E tests (docs/blazor-virtualize-net11.md §9): Home/End keyboard jumps.
 * Ported from VirtualizationTest.cs; line numbers refer to it. The group's two QuickGrid tests
 * (QuickGrid_AnchorMode_HomeKeyJumpsToTop, :2771, and …_EndKeyJumpsToBottom, :2799) run in l-quickgrid.mjs,
 * against the DataGrid of both skins.
 */
import { assert, byId, exists, SELENIUM_POLL, sendKey, waitTrue } from "../lib/harness.mjs";
import {
  assertScrollTop,
  count,
  jumpToEndWithStabilization,
  jumpToStartWithStabilization,
  metric,
  mountAnchorModeComponent,
  mountWindowScrollAnchorModeComponent,
  scrollMidListAndWaitForRender,
  scrollToBottomAndWait,
  scrollToTopAndWaitForRender,
  verifyInitialPosition,
  windowBottomGap,
  windowScrollMidListAndWaitForRender,
} from "./_helpers.mjs";

export const group = "I. Home/End keyboard jumps";

const MODES_AND_SOURCES = [
  ["0", false],
  ["1", false],
  ["2", false],
  ["0", true],
  ["1", true],
  ["2", true],
];

async function bottomGap(container) {
  return (await metric(container, "scrollHeight")) - (await metric(container, "scrollTop")) - (await metric(container, "clientHeight"));
}

/** VariableHeight_CanJumpToEndAndStart (:1062). */
async function variableHeightCanJumpToEndAndStart(t, useAsync) {
  const { page } = t;
  let container;
  let finishLoadingButton = null;
  let itemClass;
  let placeholderClass = null;
  let firstItemId;
  let lastItemId;

  if (useAsync) {
    await t.mount("VirtualizationVariableHeightAsync");
    container = await exists(page, "#async-variable-container");
    finishLoadingButton = await exists(page, "#finish-loading");
    itemClass = ".async-variable-item";
    placeholderClass = ".async-variable-placeholder";
    firstItemId = "async-variable-item-0";
    lastItemId = "async-variable-item-999";

    await finishLoadingButton.click();
  } else {
    await t.mount("VirtualizationVariableHeight");
    container = await exists(page, "#variable-height-container");
    itemClass = ".variable-height-item";
    firstItemId = "variable-item-0";
    lastItemId = "variable-item-999";
  }

  await waitTrue(async () => (await count(container, itemClass)) > 0);

  // Jump to end
  const hasPlaceholders = useAsync ? async () => (await count(container, placeholderClass)) > 0 : null;
  const loadData = useAsync ? () => finishLoadingButton.click() : null;
  await jumpToEndWithStabilization(container, hasPlaceholders, loadData);
  await waitTrue(async () => (await count(container, itemClass)) > 0);
  await waitTrue(async () => (await count(container, byId(lastItemId))) > 0, { message: `#${lastItemId} should be rendered` });

  // Jump back to start using shared helper
  await jumpToStartWithStabilization(container, hasPlaceholders, loadData);
  await waitTrue(async () => (await count(container, itemClass)) > 0);
  await waitTrue(async () => (await count(container, byId(firstItemId))) > 0, { message: `#${firstItemId} should be rendered` });
}

/** AnchorMode_EndKeyJumpsToBottom (:3725). */
async function endKeyJumpsToBottom(t, anchorMode, useItemsProvider) {
  const container = await mountAnchorModeComponent(t, anchorMode, { useItemsProvider, delay: useItemsProvider });

  await verifyInitialPosition(anchorMode, container, "list");
  if (anchorMode === "2") {
    await scrollToTopAndWaitForRender(container);
  }

  // End key should always work regardless of anchor mode.
  await sendKey(container, "End");

  await waitTrue(async () => (await bottomGap(container)) < 2, {
    timeout: 10_000,
    message: `AnchorMode ${anchorMode}: End key should jump to the bottom of the list`,
  });
}

/** AnchorMode_VariableHeight_EndKeyFromTop_JumpsToBottom (:3753). */
async function variableHeightEndKeyFromTop(t, anchorMode) {
  const container = await mountAnchorModeComponent(t, anchorMode, { variableHeight: true, useItemsProvider: true, delay: true });

  await assertScrollTop(container, (st) => st < 50, "list should start near the top");

  await sendKey(container, "End");

  let lastSh = -1;
  await waitTrue(
    async () => {
      const placeholdersInViewport = await container.evaluate((c) => {
        const cr = c.getBoundingClientRect();
        let n = 0;
        for (const el of c.querySelectorAll(".loading-placeholder")) {
          const r = el.getBoundingClientRect();
          if (r.bottom > cr.top + 1 && r.top < cr.bottom - 1) n++;
        }
        return n;
      });
      const sh = await metric(container, "scrollHeight");
      const settled = placeholdersInViewport === 0 && sh === lastSh;
      lastSh = sh;
      return settled;
    },
    { timeout: 10_000, interval: SELENIUM_POLL, message: `AnchorMode ${anchorMode}: list should settle with real (non-placeholder) rows after End` },
  );

  const stEnd = await metric(container, "scrollTop");
  const shEnd = await metric(container, "scrollHeight");
  const chEnd = await metric(container, "clientHeight");
  const gap = shEnd - stEnd - chEnd;
  assert(
    gap <= 1,
    `AnchorMode ${anchorMode}: after a single End press and the provider resolving real rows, the viewport should rest at the very bottom, ` +
      `but it is ${gap}px short (scrollTop=${stEnd}, scrollHeight=${shEnd}, clientHeight=${chEnd}).`,
  );
}

/** AnchorMode_HomeKeyJumpsToTop (:3797). */
async function homeKeyJumpsToTop(t, anchorMode, useItemsProvider) {
  const container = await mountAnchorModeComponent(t, anchorMode, { useItemsProvider, delay: useItemsProvider });

  // Scroll to mid-list first.
  await scrollMidListAndWaitForRender(container);

  // Home key should always work regardless of anchor mode.
  await sendKey(container, "Home");

  await waitTrue(async () => (await metric(container, "scrollTop")) < 2, {
    timeout: 10_000,
    message: `AnchorMode ${anchorMode}: Home key should jump to the top of the list`,
  });

  await waitTrue(async () => (await count(container, "[data-index='0']")) > 0, {
    message: `AnchorMode ${anchorMode}: item 0 should be visible after Home key`,
  });
}

/** AnchorMode_End_HomeKeyFromBottom_JumpsToTop (:3823). */
async function endModeHomeKeyFromBottom(t, variableHeight) {
  const container = await mountAnchorModeComponent(t, "2", { variableHeight, useItemsProvider: true, delay: true });

  await scrollToBottomAndWait(container);

  await sendKey(container, "Home");

  let stHome = 0;
  await waitTrue(
    async () => {
      stHome = await metric(container, "scrollTop");
      return stHome < 2;
    },
    {
      timeout: 10_000,
      message: () => `End mode (variableHeight=${variableHeight}): Home key from the bottom should jump to the top of the list (scrollTop=${stHome})`,
    },
  );

  await waitTrue(async () => (await count(container, "[data-index='0']")) > 0, {
    message: "End mode: item 0 should be visible after Home key from the bottom",
  });
}

/** AnchorMode_WindowScroll_EndKeyJumpsToBottom (:5125). */
async function windowScrollEndKey(t, anchorMode) {
  const { page } = t;
  await mountWindowScrollAnchorModeComponent(t, anchorMode);

  // Press End via keyboard — window scroll uses document keydown
  const body = await exists(page, "body");
  await sendKey(body, "End");

  await waitTrue(async () => (await windowBottomGap(page)) < 2, {
    timeout: 10_000,
    message: `Window AnchorMode ${anchorMode}: End key should jump to the bottom`,
  });
}

/** AnchorMode_WindowScroll_HomeKeyJumpsToTop (:5149). */
async function windowScrollHomeKey(t, anchorMode) {
  const { page } = t;
  await mountWindowScrollAnchorModeComponent(t, anchorMode);

  // Scroll to mid-list first.
  await windowScrollMidListAndWaitForRender(page);

  const body = await exists(page, "body");
  await sendKey(body, "Home");

  await waitTrue(async () => (await page.evaluate(() => Math.round(window.scrollY))) < 2, {
    timeout: 10_000,
    message: `Window AnchorMode ${anchorMode}: Home key should jump to the top`,
  });
}

export const tests = [
  ...[false, true].map((useAsync) => ({
    // Blazor: VariableHeight_CanJumpToEndAndStart (:1062)
    name: `VariableHeight_CanJumpToEndAndStart(useAsync: ${useAsync})`,
    run: (t) => variableHeightCanJumpToEndAndStart(t, useAsync),
  })),
  {
    // Blazor: ChatList_CanJumpToHomeFromEnd (:1893)
    name: "ChatList_CanJumpToHomeFromEnd",
    async run(t) {
      const { page } = t;
      await t.mount("VirtualizationChatListAsync");

      const container = await exists(page, "#async-chat-container");
      const finishLoadingButton = await exists(page, "#async-chat-finish-loading");
      const hasPlaceholders = async () => (await count(container, ".async-chat-placeholder")) > 0;
      const loadData = () => finishLoadingButton.click();

      await finishLoadingButton.click();
      await waitTrue(async () => (await count(container, ".async-chat-message")) > 0);

      await jumpToEndWithStabilization(container, hasPlaceholders, loadData);
      await waitTrue(async () => (await count(container, byId("async-chat-msg-499"))) > 0, { message: "#async-chat-msg-499 should be rendered" });

      await jumpToStartWithStabilization(container, hasPlaceholders, loadData);
      await waitTrue(async () => (await count(container, byId("async-chat-msg-0"))) > 0, { message: "#async-chat-msg-0 should be rendered" });
    },
  },
  ...MODES_AND_SOURCES.map(([anchorMode, useItemsProvider]) => ({
    // Blazor: AnchorMode_EndKeyJumpsToBottom (:3725)
    name: `AnchorMode_EndKeyJumpsToBottom(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => endKeyJumpsToBottom(t, anchorMode, useItemsProvider),
  })),
  ...["0", "1"].map((anchorMode) => ({
    // Blazor: AnchorMode_VariableHeight_EndKeyFromTop_JumpsToBottom (:3753)
    name: `AnchorMode_VariableHeight_EndKeyFromTop_JumpsToBottom(anchorMode: ${anchorMode})`,
    run: (t) => variableHeightEndKeyFromTop(t, anchorMode),
  })),
  ...MODES_AND_SOURCES.map(([anchorMode, useItemsProvider]) => ({
    // Blazor: AnchorMode_HomeKeyJumpsToTop (:3797)
    name: `AnchorMode_HomeKeyJumpsToTop(anchorMode: ${anchorMode}, useItemsProvider: ${useItemsProvider})`,
    run: (t) => homeKeyJumpsToTop(t, anchorMode, useItemsProvider),
  })),
  ...[false, true].map((variableHeight) => ({
    // Blazor: AnchorMode_End_HomeKeyFromBottom_JumpsToTop (:3823)
    name: `AnchorMode_End_HomeKeyFromBottom_JumpsToTop(variableHeight: ${variableHeight})`,
    run: (t) => endModeHomeKeyFromBottom(t, variableHeight),
  })),
  ...["0", "1", "2"].map((anchorMode) => ({
    // Blazor: AnchorMode_WindowScroll_EndKeyJumpsToBottom (:5125)
    name: `AnchorMode_WindowScroll_EndKeyJumpsToBottom(anchorMode: ${anchorMode})`,
    run: (t) => windowScrollEndKey(t, anchorMode),
  })),
  ...["0", "1", "2"].map((anchorMode) => ({
    // Blazor: AnchorMode_WindowScroll_HomeKeyJumpsToTop (:5149)
    name: `AnchorMode_WindowScroll_HomeKeyJumpsToTop(anchorMode: ${anchorMode})`,
    run: (t) => windowScrollHomeKey(t, anchorMode),
  })),
  {
    // Tsazor deviation A12 (no Blazor test): Home while End's convergence to the bottom still runs. Blazor
    // keeps both convergences running and the bottom one wins, so the list was pulled back to the bottom
    // (a flaky WebKit failure of InitialIndex_RetainsTargetWhenPreviousItemExpandsThenHomeEndTakeOver).
    // To hit that moment every time, the page presses Home itself (and scrolls to the top, as the browser's
    // Home does) in the microtask after the render that shows the last item: the convergence ends only at
    // the ResizeObserver callback after it.
    name: "Tsazor_HomeWhileEndStillConverges_ReachesTheTop",
    async run(t) {
      const { page } = t;
      const container = await mountAnchorModeComponent(t, "0", { variableHeight: true });
      await waitTrue(async () => (await count(container, ".item[data-index='0']")) > 0);
      await page.evaluate(() => {
        const c = document.getElementById("scroll-container");
        const observer = new MutationObserver(() => {
          if (!c.querySelector('.item[data-index="999"]')) return;
          observer.disconnect();
          c.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
          c.scrollTop = 0;
        });
        observer.observe(c, { childList: true, subtree: true });
      });
      await sendKey(container, "End");
      await waitTrue(async () => (await count(container, ".item[data-index='0']")) > 0 && (await metric(container, "scrollTop")) < 1, {
        message: async () => `Home while End still converged should reach item 0 at the top (scrollTop=${await metric(container, "scrollTop")}).`,
      });
    },
  },
];
