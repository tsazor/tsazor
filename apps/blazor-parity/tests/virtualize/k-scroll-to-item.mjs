/**
 * Group K of Blazor's Virtualize E2E tests (docs/blazor-virtualize-net11.md §9): ScrollToItemAsync, which is
 * Tsazor's `scrollToItemAsync(index, signal?)`. Ported from VirtualizationTest.cs; line numbers refer to it. The
 * page's "Completed"/"Canceled"/"Faulted" status mirrors the Task's outcome: a rejection with an AbortError is
 * Blazor's OperationCanceledException.
 */
import { assert, assertEqual, exists, sendKey, waitContains, waitTrue } from "../lib/harness.mjs";
import {
  count,
  getBottomRenderedIndex,
  getProviderCallIndex,
  getProviderEvents,
  getScrollTop,
  getTopRenderedIndex,
  mountAnchorModeForScrollToItem,
  scrollContainerWithWheelTo,
  setManualInitialIndex,
  setScrollTargetIndex,
  statusText,
  viewportEdgeCoveredByRealItem,
  waitForRenderToSettle,
  waitForScrollStatus,
} from "./_helpers.mjs";

export const group = "K. ScrollToItemAsync";

/** Sets the target and clicks "Scroll To Item". */
async function scrollToItem(page, index) {
  await setScrollTargetIndex(page, index);
  await (await exists(page, "#scroll-to-item")).click();
}

/** Until the top rendered item is `index` (GetTopRenderedIndex, :6103); `what` starts the failure message. */
async function waitTopRenderedIndex(page, index, what = "Top rendered item") {
  await waitTrue(async () => (await getTopRenderedIndex(page)) === index, {
    message: async () =>
      `${what} should be ${index} but was ${await getTopRenderedIndex(page)}, scrollTop=${await page.evaluate(() => Math.round(document.getElementById("scroll-container").scrollTop))}`,
  });
}

/** The top of item `index` relative to #scroll-container (Blazor's script throws when it isn't rendered). */
async function offsetOf(page, index) {
  const result = await page.evaluate((i) => {
    const container = document.getElementById("scroll-container");
    const target = container.querySelector(`.item[data-index="${i}"]`);
    if (target) return { offset: target.getBoundingClientRect().top - container.getBoundingClientRect().top };
    const rendered = [...container.querySelectorAll(".item[data-index]")].map((item) => item.getAttribute("data-index"));
    return { rendered: `${rendered[0]}..${rendered[rendered.length - 1]}`, scrollTop: Math.round(container.scrollTop) };
  }, index);
  if (result.offset === undefined) throw new Error(`item ${index} is not rendered (rendered ${result.rendered}, scrollTop=${result.scrollTop})`);
  return result.offset;
}

/** Whether item `index` is in the DOM and intersects #scroll-container's box. */
function intersectsContainer(page, index) {
  return page.evaluate((i) => {
    const container = document.getElementById("scroll-container");
    const target = container.querySelector(`.item[data-index="${i}"]`);
    if (!target) return false;
    const viewport = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return targetRect.bottom > viewport.top && targetRect.top < viewport.bottom;
  }, index);
}

/** Sets #scroll-container's height, as the tests do through JavaScript. */
function setContainerHeight(page, px) {
  return page.evaluate((height) => { document.getElementById("scroll-container").style.height = `${height}px`; }, px);
}

/** ScrollToItem_FixedHeight_LandsAtTop (:6405) and ScrollToItem_VariableHeight_LandsAtTop (:6442). */
async function landsAtTop(t, useProvider, variableHeight) {
  const { page } = t;
  await mountAnchorModeForScrollToItem(t, useProvider, { variableHeight, delay: useProvider });

  await scrollToItem(page, 200);
  await waitForScrollStatus(page, "Completed: 200");

  await waitTopRenderedIndex(page, 200, variableHeight ? "Variable-height: top rendered item" : "Top rendered item");
}

/**
 * ScrollToItem_NegativeIndex_ScrollsToTop (:6532). Blazor wraps `Element.prototype.scrollTo` to dispatch two
 * extra `scroll` events per call, and patches `DotNet.DotNetObject.prototype.invokeMethodAsync` to see whether a
 * spacer callback reports SpacerVisibilityReason.UserScroll (0). Tsazor's viewport calls the component's
 * spacerBeforeVisible/spacerAfterVisible directly, so the recorder patches those (window.blazorParity).
 * Tsazor scrolls with `scrollTop` as well as `scrollTo`, so the recorder wraps the `scrollTop` setter of
 * Element.prototype the same way: every programmatic scroll of the component comes with extra scroll events.
 */
async function negativeIndexScrollsToTop(t, useProvider) {
  const { page } = t;
  await mountAnchorModeForScrollToItem(t, useProvider, { delay: useProvider });
  const container = await exists(page, "#scroll-container");

  // First scroll forward so we have somewhere to come back from.
  await scrollToItem(page, 150);
  await waitForScrollStatus(page, "Completed: 150");

  await page.evaluate(() => {
    const originalScrollTo = Element.prototype.scrollTo;
    const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
    const prototype = window.blazorParity.Virtualize.prototype;
    const originalBefore = prototype.spacerBeforeVisible;
    const originalAfter = prototype.spacerAfterVisible;
    window.__extraScrollEventDispatched = false;
    window.__programmaticScrollWasUserScroll = false;

    const dispatchExtraScrollEvents = (element) => {
      element.dispatchEvent(new Event("scroll"));
      element.dispatchEvent(new Event("scroll"));
      window.__extraScrollEventDispatched = true;
    };
    Element.prototype.scrollTo = function (...args) {
      const result = originalScrollTo.apply(this, args);
      dispatchExtraScrollEvents(this);
      return result;
    };
    Object.defineProperty(Element.prototype, "scrollTop", {
      ...scrollTop,
      set(value) {
        scrollTop.set.call(this, value);
        dispatchExtraScrollEvents(this);
      },
    });

    const record = (original) =>
      function (...args) {
        if (args[3] === 0) window.__programmaticScrollWasUserScroll = true;
        return original.apply(this, args);
      };
    prototype.spacerBeforeVisible = record(originalBefore);
    prototype.spacerAfterVisible = record(originalAfter);

    window.__restoreExtraScrollEventRecorder = () => {
      Element.prototype.scrollTo = originalScrollTo;
      Object.defineProperty(Element.prototype, "scrollTop", scrollTop);
      prototype.spacerBeforeVisible = originalBefore;
      prototype.spacerAfterVisible = originalAfter;
      delete window.__restoreExtraScrollEventRecorder;
      delete window.__extraScrollEventDispatched;
      delete window.__programmaticScrollWasUserScroll;
    };
  });
  try {
    await scrollToItem(page, -1);
    await waitForScrollStatus(page, "Completed: -1");

    await waitTrue(() => page.evaluate(() => window.__extraScrollEventDispatched));
    assert(!(await page.evaluate(() => window.__programmaticScrollWasUserScroll)), "a spacer callback of the component's own scroll reported UserScroll");
    await waitTrue(async () => (await getScrollTop(container)) <= 1, {
      message: async () => `Negative index should clamp to top; scrollTop=${await getScrollTop(container)}`,
    });
    await waitTopRenderedIndex(page, 0);
  } finally {
    await page.evaluate(() => window.__restoreExtraScrollEventRecorder?.());
  }
}

export const tests = [
  ...[false, true].map((useProvider) => ({
    // Blazor: ScrollToItem_FixedHeight_LandsAtTop (:6405)
    name: `ScrollToItem_FixedHeight_LandsAtTop(useProvider: ${useProvider})`,
    run: (t) => landsAtTop(t, useProvider, false),
  })),
  {
    // Blazor: ScrollToItem_AfterEndJump_LandsAtTarget (:6421) — quarantined in Blazor (#68644)
    name: "ScrollToItem_AfterEndJump_LandsAtTarget",
    async run(t) {
      const { page } = t;
      const targetIndex = 200;

      await mountAnchorModeForScrollToItem(t, true, { delay: true });
      const container = await exists(page, "#scroll-container");

      await sendKey(container, "End");
      await waitTrue(async () => (await count(container, ".item[data-index='999']")) > 0);

      await scrollToItem(page, targetIndex);
      await waitForScrollStatus(page, `Completed: ${targetIndex}`);

      await waitTopRenderedIndex(page, targetIndex);
    },
  },
  ...[false, true].map((useProvider) => ({
    // Blazor: ScrollToItem_VariableHeight_LandsAtTop (:6442)
    name: `ScrollToItem_VariableHeight_LandsAtTop(useProvider: ${useProvider})`,
    run: (t) => landsAtTop(t, useProvider, true),
  })),
  ...[false, true].map((useProvider) => ({
    // Blazor: ScrollToItem_TallItemsBeforeTarget_FillsViewportAndKeepsTargetAligned (:6459). Tsazor deviation A15:
    // the call fills the viewport before it completes (with one growth, Edge raced away from the target).
    name: `ScrollToItem_TallItemsBeforeTarget_FillsViewportAndKeepsTargetAligned(useProvider: ${useProvider})`,
    viewport: { width: 1024, height: 2400 },
    async run(t) {
      const { page } = t;
      const targetIndex = 100;

      await mountAnchorModeForScrollToItem(t, useProvider, { delay: useProvider });
      const container = await exists(page, "#scroll-container");

      await setContainerHeight(page, 2000);
      await (await exists(page, "#set-average-height-trap")).click();
      await waitContains("Tall rows before index 100", () => statusText(page));

      await scrollToItem(page, targetIndex);
      await waitForScrollStatus(page, `Completed: ${targetIndex}`);
      await waitForRenderToSettle(container);

      assert(
        await viewportEdgeCoveredByRealItem(page, "bottom"),
        `Viewport bottom should be covered by a real item, but a gap was found (top=${await getTopRenderedIndex(page)}, scrollTop=${await getScrollTop(container)}).`,
      );

      const targetTopOffset = await offsetOf(page, targetIndex);
      assert(
        Math.abs(targetTopOffset) <= 2,
        `Item ${targetIndex} should remain aligned with the viewport top, but its offset was ${targetTopOffset}px (scrollTop=${await getScrollTop(container)}).`,
      );
    },
  })),
  ...[false, true].map((useProvider) => ({
    // Blazor: ScrollToItem_TallContainer_ClampedNearEnd_FillsViewport (:6495)
    name: `ScrollToItem_TallContainer_ClampedNearEnd_FillsViewport(useProvider: ${useProvider})`,
    viewport: { width: 1024, height: 5400 },
    async run(t) {
      const { page } = t;
      const targetIndex = 990;

      await mountAnchorModeForScrollToItem(t, useProvider, { delay: useProvider });
      const container = await exists(page, "#scroll-container");

      await setContainerHeight(page, 5000);
      await (await exists(page, "#set-double-size")).click();
      await waitContains("Item size 100", () => statusText(page));

      await scrollToItem(page, targetIndex);
      await waitForScrollStatus(page, `Completed: ${targetIndex}`);
      await waitForRenderToSettle(container);

      assert(
        await viewportEdgeCoveredByRealItem(page, "top"),
        `Viewport top should be covered by a real item, but a gap was found (bottom=${await getBottomRenderedIndex(page)}, scrollTop=${await getScrollTop(container)}).`,
      );
      assert(
        await viewportEdgeCoveredByRealItem(page, "bottom"),
        `Viewport bottom should be covered by a real item, but a gap was found (top=${await getTopRenderedIndex(page)}, scrollTop=${await getScrollTop(container)}).`,
      );
      assert(await intersectsContainer(page, targetIndex), `Item ${targetIndex} should remain visible after the viewport fills.`);
    },
  })),
  ...[false, true].map((useProvider) => ({
    // Blazor: ScrollToItem_NegativeIndex_ScrollsToTop (:6532)
    name: `ScrollToItem_NegativeIndex_ScrollsToTop(useProvider: ${useProvider})`,
    run: (t) => negativeIndexScrollsToTop(t, useProvider),
  })),
  ...[false, true].map((useProvider) => ({
    // Blazor: ScrollToItem_MaxIntIndex_ScrollsToLast (:6598)
    name: `ScrollToItem_MaxIntIndex_ScrollsToLast(useProvider: ${useProvider})`,
    async run(t) {
      const { page } = t;
      await mountAnchorModeForScrollToItem(t, useProvider, { delay: useProvider });
      const container = await exists(page, "#scroll-container");

      // int.MaxValue
      await scrollToItem(page, 2147483647);
      await waitForScrollStatus(page, "Completed: 2147483647");

      // 1000 items total; last is index 999. After clamp it should be visible at the top of the viewport
      // (or as close as possible — at the very end the page can't scroll further).
      await waitTrue(
        () => container.evaluate((c) => Math.round(c.scrollTop) > 0 && Math.round(c.scrollTop) >= Math.round(c.scrollHeight) - Math.round(c.clientHeight) - 2),
        { message: "Scroll should be at the bottom (last item region) after clamp to MaxValue." },
      );

      // The last item must be present in the DOM and inside the viewport.
      await waitTrue(() => intersectsContainer(page, 999));
    },
  })),
  ...[false, true].map((useProvider) => ({
    // Blazor: ScrollToItem_ForwardThenBackward (:6632)
    name: `ScrollToItem_ForwardThenBackward(useProvider: ${useProvider})`,
    async run(t) {
      const { page } = t;
      await mountAnchorModeForScrollToItem(t, useProvider, { delay: useProvider });

      await scrollToItem(page, 300);
      await waitForScrollStatus(page, "Completed: 300");

      await scrollToItem(page, 50);
      await waitForScrollStatus(page, "Completed: 50");

      await waitTopRenderedIndex(page, 50, "Top rendered item after backward scroll");
    },
  })),
  {
    // Blazor: ScrollToItem_WithProviderDelay_NoPlaceholderAtTarget (:6650)
    name: "ScrollToItem_WithProviderDelay_NoPlaceholderAtTarget",
    async run(t) {
      const { page } = t;
      // When ScrollToItemAsync completes, the target row must show content, not placeholder.
      await mountAnchorModeForScrollToItem(t, true, { delay: true });

      await scrollToItem(page, 300);
      await waitForScrollStatus(page, "Completed: 300", 30);

      await waitTopRenderedIndex(page, 300, "Top rendered (a real item, not a placeholder)");

      // Sanity: the .loading-placeholder template must be wired.
      const topIsPlaceholder = await page.evaluate(() => {
        const container = document.getElementById("scroll-container");
        const rect = container.getBoundingClientRect();
        for (const el of container.querySelectorAll(".item, .loading-placeholder")) {
          const er = el.getBoundingClientRect();
          if (er.bottom > rect.top && er.top < rect.top + 5) return el.classList.contains("loading-placeholder");
        }
        return false;
      });
      assert(!topIsPlaceholder, "Topmost element at viewport top must not be a loading placeholder.");
    },
  },
  ...[505, 700].map((target) => ({
    // Blazor: ScrollToItem_AfterInitialIndex_LandsAtTarget (:6706) — 505 is in the DOM, 700 not
    name: `ScrollToItem_AfterInitialIndex_LandsAtTarget(target: ${target})`,
    async run(t) {
      const { page } = t;
      const initialIndex = 500;

      await mountAnchorModeForScrollToItem(t, true, { variableHeight: true });
      const container = await exists(page, "#scroll-container");

      await (await exists(page, "#unload-list")).click();
      await exists(page, "#list-not-loaded");
      await page.evaluate(() => { document.getElementById("scroll-container").scrollTop = 0; });
      await setManualInitialIndex(page, initialIndex);
      await (await exists(page, "#reload-with-initial-index")).click();
      await waitTopRenderedIndex(page, initialIndex);

      await scrollToItem(page, target);
      await waitForScrollStatus(page, `Completed: ${target}`);
      await waitForRenderToSettle(container);

      assertEqual(target, await getTopRenderedIndex(page), "top rendered index");
    },
  })),
  ...[120, 300].map((target) => ({
    // Blazor: ScrollToItem_AsyncProvider_VariableHeight_WithDelay_ReachesTarget (:6877)
    name: `ScrollToItem_AsyncProvider_VariableHeight_WithDelay_ReachesTarget(target: ${target})`,
    async run(t) {
      const { page } = t;
      // Combines the two hardest dimensions: variable-height measurement and a delayed ItemsProvider.
      await mountAnchorModeForScrollToItem(t, true, { variableHeight: true, delay: true });

      await scrollToItem(page, target);
      await waitForScrollStatus(page, `Completed: ${target}`, 30);

      await waitTopRenderedIndex(page, target, "Top rendered (a real item)");
    },
  })),
  {
    // Blazor: ScrollToItem_RapidCalls_OnlyLastTargetReached (:6892)
    name: "ScrollToItem_RapidCalls_OnlyLastTargetReached",
    async run(t) {
      const { page } = t;
      // Cancel-and-switch — even with 5 calls back-to-back, the final target wins.
      await mountAnchorModeForScrollToItem(t, true, { delay: true });

      await (await exists(page, "#scroll-to-item-rapid")).click();
      // 5 calls fired back-to-back: supersession completes normally, so all 5 tasks finish.
      await waitForScrollStatus(page, "Completed: 250 (canceled=0, completed=5, faulted=0)", 30);

      await waitTopRenderedIndex(page, 250, "After rapid-fire scroll, top");
    },
  },
  {
    // Blazor: ScrollToItem_ExternalCancellation_TaskCancels (:6907)
    name: "ScrollToItem_ExternalCancellation_TaskCancels",
    async run(t) {
      const { page } = t;
      // Provider-only: external cancellation is meaningful during the 500ms provider fetch window.
      await mountAnchorModeForScrollToItem(t, true, { delay: true });

      await setScrollTargetIndex(page, 450);
      await (await exists(page, "#scroll-to-item-cancellable")).click();
      // Cancel before the 500ms provider delay completes.
      await (await exists(page, "#cancel-scroll")).click();
      await waitForScrollStatus(page, "Canceled");

      // Component should still respond to a fresh scroll.
      await scrollToItem(page, 120);
      await waitForScrollStatus(page, "Completed: 120", 30);
      await waitTopRenderedIndex(page, 120);
    },
  },
  {
    // Blazor: ScrollToItem_UserScrollDuringProviderFetch_UserScrollWins (:6928) — quarantined in Blazor (#68777).
    // Tsazor deviation A13: user input re-observes the spacers while the scroll is pending, so the test runs.
    name: "ScrollToItem_UserScrollDuringProviderFetch_UserScrollWins",
    async run(t) {
      const { page } = t;
      // While the provider is fetching for scrollToItem, a real user scroll must win. Provider-only, and
      // with no fetch delay: this test gates the provider explicitly instead.
      await mountAnchorModeForScrollToItem(t, true, { delay: false });
      const container = await exists(page, "#scroll-container");

      // Arm the gate. The initial load already finished above, so the *next* provider call will be the
      // first gated one (counter starts at 0 -> becomes 1 on entry).
      await (await exists(page, "#toggle-provider-gate")).click();

      // Trigger a scroll to row 800. This fires call #1 through the gate.
      await scrollToItem(page, 800);
      const events = async () => `events: ${await getProviderEvents(page)}`;
      await waitTrue(async () => (await getProviderCallIndex(page)) >= 1, { message: events });
      await waitTrue(async () => (await getProviderEvents(page)).includes("p1-enter"), { message: events });
      await waitTrue(async () => (await getProviderEvents(page)).includes("scroll-start"), { message: events });

      // While call #1 is still blocked, perform a real user scroll far from row 800. The scroll cancels the
      // scroll's request (call #1 aborts), and a call #2 for the user's window follows.
      await scrollContainerWithWheelTo(page, container, 5000);

      await waitTrue(async () => (await getProviderEvents(page)).includes("p1-cancel"), {
        message: async () => `${await events()}, scrollTop=${await getScrollTop(container)}`,
      });
      await waitTrue(async () => (await getProviderCallIndex(page)) >= 2, { message: events });
      await waitTrue(async () => (await getProviderEvents(page)).includes("p2-enter"), { message: events });
      // The caller's promise resolves (a user scroll doesn't reject it).
      await waitForScrollStatus(page, "Completed: 800");

      // Release the gate: some later provider call returns so the final user-window items render.
      await (await exists(page, "#release-provider-gate")).click();
      await waitTrue(
        async () => {
          const parts = (await getProviderEvents(page)).split("|");
          const cancelIdx = parts.indexOf("p1-cancel");
          if (cancelIdx < 0) return false;
          return parts.slice(cancelIdx + 1).some((e) => e.startsWith("p") && e.endsWith("-return"));
        },
        { message: async () => `Expected some pN-return after p1-cancel. Events: ${await getProviderEvents(page)}` },
      );

      // Causal-order assertions. The scroll-target fetch (call #1) must never have returned successfully —
      // that's the real proof the user scroll won.
      const log = await getProviderEvents(page);
      const indexOf = (token) => {
        const i = log.indexOf(token);
        return i < 0 ? Number.MAX_SAFE_INTEGER : i;
      };
      assert(!log.includes("p1-return"), `p1-return should not appear; events=${log}`);
      assert(indexOf("scroll-start") < indexOf("p1-enter"), `scroll-start should precede p1-enter; events=${log}`);
      assert(indexOf("p1-enter") < indexOf("p1-cancel"), `p1-enter should precede p1-cancel; events=${log}`);

      // Final viewport: the user scrolled near the top (~row 100), NOT row 800.
      await waitTrue(
        async () => {
          const top = await getTopRenderedIndex(page);
          return top >= 0 && top < 250;
        },
        { message: async () => `Top rendered should reflect the user scroll (< 250), but was ${await getTopRenderedIndex(page)}` },
      );
    },
  },
  ...[false, true].map((useProvider) => ({
    // Blazor: ScrollToItem_AnchorStart_AtTop_LandsAtTarget (:7015)
    name: `ScrollToItem_AnchorStart_AtTop_LandsAtTarget(useProvider: ${useProvider})`,
    async run(t) {
      const { page } = t;
      // Anchor restore must NOT fight an active scroll.
      await mountAnchorModeForScrollToItem(t, useProvider, { delay: useProvider });
      const container = await exists(page, "#scroll-container");

      // AnchorMode is Start by default; verify we're at the top.
      await waitTrue(async () => (await getScrollTop(container)) === 0);

      await scrollToItem(page, 2);
      await waitForScrollStatus(page, "Completed: 2");

      await waitTopRenderedIndex(page, 2, "With AnchorMode=Beginning, top");
    },
  })),
];
