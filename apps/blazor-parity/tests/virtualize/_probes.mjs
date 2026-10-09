/**
 * The in-page probes of Blazor's VirtualizationTest.cs (its `Execute…Script` helpers and frame samplers),
 * ported: the same scripts, run with `page.evaluate` instead of Selenium's ExecuteAsyncScript. Line numbers
 * refer to VirtualizationTest.cs.
 */
import { exists, SELENIUM_POLL, textOf, waitContains, waitEqual, waitTrue } from "../lib/harness.mjs";
import { getScrollTop, scrollContainer, waitForRenderToSettle } from "./_helpers.mjs";

/**
 * ExecuteDetectFlashingScript (:5326): scrolls the container by 100px per step (at most 300 steps), waits a
 * frame and an IntersectionObserver tick, and fails when the top visible item's index goes down ("flashing").
 */
export function detectFlashing(page, containerId, itemSelector) {
  const itemIdPrefix = `${itemSelector.replace(/^\./, "")}-`;
  return page.evaluate(
    async ({ containerId, itemSelector, itemIdPrefix }) => {
      const SCROLL_INCREMENT = 100;
      const MAX_ITERATIONS = 300;
      const VISIBILITY_TOLERANCE = 2;
      const container = document.querySelector(`#${containerId}`);
      if (!container) return { success: false, error: "Container not found" };
      const idPattern = new RegExp(`${itemIdPrefix}(\\d+)`);

      const getTopVisibleItemIndex = () => {
        const items = container.querySelectorAll(itemSelector);
        if (items.length === 0) return null;
        const containerRect = container.getBoundingClientRect();
        for (const item of items) {
          const itemRect = item.getBoundingClientRect();
          if (itemRect.bottom > containerRect.top + VISIBILITY_TOLERANCE && itemRect.top < containerRect.bottom - VISIBILITY_TOLERANCE) {
            const match = item.id.match(idPattern);
            return match ? Number.parseInt(match[1], 10) : null;
          }
        }
        return null;
      };

      const indices = () =>
        Array.from(container.querySelectorAll(itemSelector))
          .map((item) => item.id.match(idPattern))
          .filter((match) => match !== null)
          .map((match) => Number.parseInt(match[1], 10));
      const getMaxIndex = () => Math.max(-1, ...indices());
      const getMinIndex = () => {
        const all = indices();
        return all.length === 0 ? -1 : Math.min(...all);
      };

      const waitForSettledFrame = () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => {
            const target = container.querySelector(itemSelector) || container;
            const io = new IntersectionObserver(
              () => {
                io.disconnect();
                resolve();
              },
              { root: container, threshold: [0, 1] },
            );
            io.observe(target);
          });
        });

      const getSnapshot = () => {
        const spacerBefore = container.querySelector('[aria-hidden="true"]:first-child');
        const spacerAfter = container.querySelector('[aria-hidden="true"]:last-child');
        return {
          st: container.scrollTop,
          sh: container.scrollHeight,
          min: getMinIndex(),
          max: getMaxIndex(),
          cnt: container.querySelectorAll(itemSelector).length,
          sbH: spacerBefore ? spacerBefore.style.height : "?",
          saH: spacerAfter ? spacerAfter.style.height : "?",
        };
      };

      let previousTopItemIndex = null;
      let maxIndexSeen = -1;
      const history = [];
      const HISTORY_SIZE = 10;

      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const beforeScroll = { ...getSnapshot(), phase: "pre", iter: iteration };
        const previousScrollTop = container.scrollTop;
        container.scrollTop += SCROLL_INCREMENT;
        if (container.scrollTop === previousScrollTop) break;
        const afterAssign = { st: container.scrollTop, phase: "post-assign", iter: iteration };

        await waitForSettledFrame();

        const afterSettle = { ...getSnapshot(), phase: "settled", iter: iteration };
        const currentTopItemIndex = getTopVisibleItemIndex();
        afterSettle.topIdx = currentTopItemIndex;

        history.push({ beforeScroll, afterAssign, afterSettle });
        if (history.length > HISTORY_SIZE) history.shift();

        if (previousTopItemIndex !== null && currentTopItemIndex !== null && currentTopItemIndex < previousTopItemIndex) {
          const histStr = history
            .map((h) => {
              const b = h.beforeScroll;
              const a = h.afterSettle;
              return `i${b.iter}:[st:${b.st}->${h.afterAssign.st}->${a.st}, items:${b.min}..${b.max}(${b.cnt})->${a.min}..${a.max}(${a.cnt}), sb:${b.sbH}->${a.sbH}, sa:${b.saH}->${a.saH}, top:${a.topIdx}]`;
            })
            .join(" | ");
          const scale = container.offsetHeight === 0 ? 1 : Math.round((container.getBoundingClientRect().height / container.offsetHeight) * 1000) / 1000;
          return {
            success: false,
            error: `Flashing at iter ${iteration}: ${previousTopItemIndex}->${currentTopItemIndex}. scale=${scale}, offsetH=${container.offsetHeight}. HISTORY: ${histStr}`,
          };
        }

        if (currentTopItemIndex !== null) previousTopItemIndex = currentTopItemIndex;
        maxIndexSeen = Math.max(maxIndexSeen, getMaxIndex());
      }

      return { success: true, maxIndexSeen };
    },
    { containerId, itemSelector, itemIdPrefix },
  );
}

/**
 * ExecuteViewportScrollJumpDetectionScript (:5596): `window.scrollBy(0, 300)` 15 times, each followed by the
 * render-settle wait of :5552 (mutations, then 3 quiet animation frames; 30 frames at most), and the jumps.
 */
export function viewportScrollJumpDetection(page, tableId, scrollCount = 15, scrollDelta = 300) {
  return page.evaluate(
    async ({ tableId, scrollCount, scrollDelta }) => {
      const tbody = document.querySelector(`#${tableId} > tbody`);
      // Event-driven wait: watches for DOM mutations from re-renders, then waits 3 animation frames with
      // no new mutations (layout settled). Falls back after 30 frames if no mutations occur.
      const waitForRenderSettle = (observed) =>
        new Promise((resolve) => {
          let mutationSeen = false;
          let framesSinceLastMutation = 0;
          let totalFrames = 0;
          const mo = new MutationObserver(() => {
            mutationSeen = true;
            framesSinceLastMutation = 0;
          });
          mo.observe(observed, { childList: true, subtree: true, attributes: true });
          const checkSettle = () => {
            totalFrames++;
            framesSinceLastMutation++;
            if ((mutationSeen && framesSinceLastMutation >= 3) || totalFrames >= 30) {
              mo.disconnect();
              resolve();
            } else {
              requestAnimationFrame(checkSettle);
            }
          };
          requestAnimationFrame(checkSettle);
        });

      const runScrollPass = async (observed, readPos, doScroll, count) => {
        const jumps = [];
        let maxJump = 0;
        for (let i = 0; i < count; i++) {
          const before = readPos();
          doScroll();
          await waitForRenderSettle(observed);
          const after = readPos();
          const jump = after - before;
          jumps.push(jump);
          if (Math.abs(jump) > Math.abs(maxJump)) maxJump = jump;
        }
        return { jumps, maxJump };
      };

      const startY = Math.round(window.scrollY);
      const pass = await runScrollPass(tbody, () => Math.round(window.scrollY), () => window.scrollBy(0, scrollDelta), scrollCount);
      return {
        startY,
        endY: Math.round(window.scrollY),
        totalDelta: Math.round(window.scrollY) - startY,
        expected: scrollCount * scrollDelta,
        maxJump: pass.maxJump,
        jumps: pass.jumps.join(","),
      };
    },
    { tableId, scrollCount, scrollDelta },
  );
}

/**
 * ExecuteRapidUpwardScrollWithConcurrentAppends (:5651): samples scrollTop every animation frame while 8 real
 * wheel scrolls of -500px (20 ms apart) race appends at 300, 900 and 1500 ms; a backward jump is scrollTop
 * growing by more than 5px between frames.
 */
export async function rapidUpwardScrollWithConcurrentAppends(page, container) {
  const scrollCount = 8;
  const scrollDelta = 500;

  await container.evaluate((c) => {
    window.__tableScrollSamples = [];
    window.__tableScrollSample = () => {
      window.__tableScrollSamples.push({
        scrollTop: c.scrollTop,
        scrollHeight: c.scrollHeight,
        placeholders: c.querySelectorAll(".table-scroll-placeholder").length,
      });
      window.__tableScrollAnimationFrame = requestAnimationFrame(window.__tableScrollSample);
    };
    window.__tableScrollAnimationFrame = requestAnimationFrame(window.__tableScrollSample);
  });

  await page.evaluate(() => {
    const appendButton = document.getElementById("table-scroll-append");
    [300, 900, 1500].forEach((delay) => setTimeout(() => appendButton.click(), delay));
  });

  // Selenium's Actions: ScrollFromOrigin(container, 0, -500) then Pause(20 ms), eight times, as one sequence.
  const box = await container.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < scrollCount; i++) {
    await page.mouse.wheel(0, -scrollDelta);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  await waitContains("Appended item 502", async () => textOf(await exists(page, "#table-scroll-status")));
  await waitForRenderToSettle(container, ".table-scroll-item", true);

  return page.evaluate(() => {
    cancelAnimationFrame(window.__tableScrollAnimationFrame);
    const samples = window.__tableScrollSamples;
    let backwardJumps = 0;
    let maxBackwardJump = 0;
    let minScrollHeight = samples.length > 0 ? samples[0].scrollHeight : 0;
    let placeholderFrames = 0;
    const backwardJumpSamples = [];
    for (let i = 0; i < samples.length; i++) {
      minScrollHeight = Math.min(minScrollHeight, samples[i].scrollHeight);
      if (samples[i].placeholders > 0) placeholderFrames++;
      if (i === 0) continue;
      const delta = samples[i].scrollTop - samples[i - 1].scrollTop;
      if (delta > 5) {
        backwardJumps++;
        maxBackwardJump = Math.max(maxBackwardJump, delta);
        if (backwardJumpSamples.length < 20) backwardJumpSamples.push(delta);
      }
    }
    return {
      backwardJumps,
      maxBackwardJump,
      minScrollHeight,
      placeholderFrames,
      sampleCount: samples.length,
      backwardJumpSamples: backwardJumpSamples.join(","),
    };
  });
}

/**
 * The first and last visible table-scroll item per animation frame while 10 updates (`buttonId` clicked
 * every 600 ms) run, until the page counted 10 completed updates; shared by the two continuous probes.
 */
function sampleVisibleRowsDuringUpdates(container, buttonId) {
  return container.evaluate(
    (c, id) =>
      new Promise((resolve) => {
        const button = document.getElementById(id);
        const total = () => Number(document.getElementById("table-scroll-total-items").textContent.match(/\d+/)[0]);
        const samples = [];
        let animationFrame;
        const sample = () => {
          const viewport = c.getBoundingClientRect();
          const visibleIndices = Array.from(c.querySelectorAll(".table-scroll-item td[data-index]"))
            .filter((cell) => {
              const rect = cell.parentElement.getBoundingClientRect();
              return rect.bottom > viewport.top && rect.top < viewport.bottom;
            })
            .map((cell) => Number(cell.dataset.index));
          samples.push({
            totalItems: total(),
            firstVisibleIndex: visibleIndices.length > 0 ? Math.min(...visibleIndices) : -1,
            lastVisibleIndex: visibleIndices.length > 0 ? Math.max(...visibleIndices) : -1,
            bottomGap: Math.round(c.scrollHeight - c.scrollTop - c.clientHeight),
            topGap: Math.round(c.scrollTop),
          });
          animationFrame = requestAnimationFrame(sample);
        };
        animationFrame = requestAnimationFrame(sample);
        let scheduledUpdates = 0;
        const updateTimer = setInterval(() => {
          button.click();
          if (++scheduledUpdates === 10) clearInterval(updateTimer);
        }, 600);

        const completionTimer = setInterval(() => {
          const completedUpdates = Number(document.getElementById("table-scroll-completed-updates").textContent.match(/\d+/)[0]);
          if (completedUpdates >= 10) {
            clearInterval(completionTimer);
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                clearInterval(updateTimer);
                cancelAnimationFrame(animationFrame);
                resolve(samples);
              }),
            );
          }
        }, 50);
      }),
    buttonId,
  );
}

/**
 * ExecuteContinuousTailAppendProbe (:5731): 10 appends 600 ms apart at the bottom (End mode). Over the frames
 * after the first append: how often the first/last visible index went down, the largest per-frame advance
 * of the last visible index; and the final total, last visible index and bottom gap.
 */
export async function continuousTailAppendProbe(container) {
  const samples = await sampleVisibleRowsDuringUpdates(container, "table-scroll-append");
  let firstVisibleBackwardJumps = 0;
  let lastVisibleBackwardJumps = 0;
  let maximumLastVisibleAdvance = 0;
  const activeSamples = samples.filter((sample) => sample.totalItems > 500);
  for (let i = 1; i < activeSamples.length; i++) {
    if (activeSamples[i].firstVisibleIndex < activeSamples[i - 1].firstVisibleIndex) firstVisibleBackwardJumps++;
    if (activeSamples[i].lastVisibleIndex < activeSamples[i - 1].lastVisibleIndex) lastVisibleBackwardJumps++;
    maximumLastVisibleAdvance = Math.max(maximumLastVisibleAdvance, activeSamples[i].lastVisibleIndex - activeSamples[i - 1].lastVisibleIndex);
  }
  const finalSample = samples[samples.length - 1];
  return {
    totalItems: finalSample.totalItems,
    lastVisibleIndex: finalSample.lastVisibleIndex,
    bottomGap: finalSample.bottomGap,
    firstVisibleBackwardJumps,
    lastVisibleBackwardJumps,
    maximumLastVisibleAdvance,
  };
}

/**
 * ExecuteContinuousHeadPrependProbe (:5824): 10 prepends 600 ms apart at the top (Start mode). Over the frames
 * after the first prepend: how often the first/last visible index went up, the largest per-frame advance of
 * the first visible index toward the head; and the final total, first visible index and top gap.
 */
export async function continuousHeadPrependProbe(container) {
  const samples = await sampleVisibleRowsDuringUpdates(container, "table-scroll-prepend");
  let firstVisibleBackwardJumps = 0;
  let lastVisibleBackwardJumps = 0;
  let maximumFirstVisibleAdvance = 0;
  const activeSamples = samples.filter((sample) => sample.totalItems > 500);
  for (let i = 1; i < activeSamples.length; i++) {
    if (activeSamples[i].firstVisibleIndex > activeSamples[i - 1].firstVisibleIndex) firstVisibleBackwardJumps++;
    if (activeSamples[i].lastVisibleIndex > activeSamples[i - 1].lastVisibleIndex) lastVisibleBackwardJumps++;
    maximumFirstVisibleAdvance = Math.max(maximumFirstVisibleAdvance, activeSamples[i - 1].firstVisibleIndex - activeSamples[i].firstVisibleIndex);
  }
  const finalSample = samples[samples.length - 1];
  return {
    totalItems: finalSample.totalItems,
    firstVisibleIndex: finalSample.firstVisibleIndex,
    topGap: finalSample.topGap,
    firstVisibleBackwardJumps,
    lastVisibleBackwardJumps,
    maximumFirstVisibleAdvance,
  };
}

/**
 * ExecuteContinuousPrependAnchorStabilityProbe (:5901): during 10 prepends 600 ms apart, every animation
 * frame checks that the anchor row exists and how far its top drifted from `expectedOffset`.
 */
export function continuousPrependAnchorStabilityProbe(container, anchorIndex, expectedOffset) {
  return container.evaluate(
    (c, [index, offsetBefore]) =>
      new Promise((resolve) => {
        const prependButton = document.getElementById("table-scroll-prepend");
        let missingAnchorFrames = 0;
        let maximumAnchorDrift = 0;
        let animationFrame;
        const sample = () => {
          const anchor = c.querySelector(`.table-scroll-item td[data-index="${index}"]`);
          if (!anchor) {
            missingAnchorFrames++;
          } else {
            const offset = anchor.parentElement.getBoundingClientRect().top - c.getBoundingClientRect().top;
            maximumAnchorDrift = Math.max(maximumAnchorDrift, Math.abs(offset - offsetBefore));
          }
          animationFrame = requestAnimationFrame(sample);
        };
        animationFrame = requestAnimationFrame(sample);
        let scheduledUpdates = 0;
        const prependTimer = setInterval(() => {
          prependButton.click();
          if (++scheduledUpdates === 10) clearInterval(prependTimer);
        }, 600);

        const completionTimer = setInterval(() => {
          const completedUpdates = Number(document.getElementById("table-scroll-completed-updates").textContent.match(/\d+/)[0]);
          if (completedUpdates >= 10) {
            clearInterval(completionTimer);
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                clearInterval(prependTimer);
                cancelAnimationFrame(animationFrame);
                const totalItems = Number(document.getElementById("table-scroll-total-items").textContent.match(/\d+/)[0]);
                resolve({ totalItems, missingAnchorFrames, maximumAnchorDrift });
              }),
            );
          }
        }, 50);
      }),
    [anchorIndex, expectedOffset],
  );
}

/** EnableTableStartAnchor (:5808): switches VirtualizationTableScrollWithAppend to Start and settles at the top. */
export async function enableTableStartAnchor(page) {
  await (await exists(page, "#table-scroll-use-start")).click();
  await waitEqual("Start", async () => textOf(await exists(page, "#table-scroll-anchor-mode")));

  const container = await exists(page, "#table-scroll-container");
  await waitTrue(
    async () => {
      await scrollContainer(container, 0);
      const firstItem = await container.locator(".table-scroll-item td[data-index='0']").count();
      return firstItem > 0 && (await getScrollTop(container)) <= 1;
    },
    { interval: SELENIUM_POLL },
  );
  await waitForRenderToSettle(container, ".table-scroll-item", true);
}

