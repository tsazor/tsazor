/**
 * Selenium's vocabulary in Blazor's E2E tests, on Playwright, so the ported tests read line by line like the
 * originals: `Browser.True` / `Browser.Equal` / `Browser.Contains` are polls with a timeout (Blazor's
 * WaitAssert), `Browser.Exists` waits for an element, `Assert.*` checks once.
 */

/** How long a wait polls when the test names no timeout (WaitAssert's default in Blazor's E2E settings). */
export const DEFAULT_TIMEOUT = 10_000;

/**
 * Selenium's WebDriverWait polls every 500 ms. A wait whose check compares one poll with the previous one
 * ("scrollTop stopped changing", "three identical reads") or acts on every poll (scrolls, clicks) uses this
 * interval, so it means what it means in Blazor's tests. A plain "until true" polls faster: that only ends
 * it sooner.
 */
export const SELENIUM_POLL = 500;
const FAST_POLL = 100;

export class AssertionError extends Error {}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `Assert.True(condition, message)`. */
export function assert(condition, message = "assertion failed") {
  if (!condition) throw new AssertionError(message);
}

/** `Assert.Equal(expected, actual)`. */
export function assertEqual(expected, actual, message = "") {
  if (!Object.is(expected, actual)) {
    throw new AssertionError(`${message ? `${message}: ` : ""}expected ${format(expected)}, got ${format(actual)}`);
  }
}

/**
 * `Browser.True(() => …, timeout, message)`: polls `condition` until it returns true. An exception in the
 * check counts as false (as in WaitAssert) and is reported if the wait times out.
 */
export async function waitTrue(condition, { timeout = DEFAULT_TIMEOUT, interval = FAST_POLL, message } = {}) {
  const deadline = Date.now() + timeout;
  let lastError;
  for (;;) {
    try {
      if (await condition()) return;
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) break;
    await sleep(interval);
  }
  const reason = typeof message === "function" ? await safely(message) : message;
  throw new AssertionError(
    `${reason ?? "condition not met"} (waited ${timeout} ms)${lastError ? ` — last error: ${lastError.message ?? lastError}` : ""}`,
  );
}

/** `Browser.Equal(expected, () => …)`: polls until the value equals `expected`. */
export async function waitEqual(expected, read, options = {}) {
  let last;
  await waitTrue(
    async () => {
      last = await read();
      return Object.is(last, expected);
    },
    { ...options, message: options.message ?? (() => `expected ${format(expected)}, last value ${format(last)}`) },
  );
}

/** `Browser.NotEqual(expected, () => …)`. */
export async function waitNotEqual(unexpected, read, options = {}) {
  let last;
  await waitTrue(
    async () => {
      last = await read();
      return !Object.is(last, unexpected);
    },
    { ...options, message: options.message ?? (() => `expected anything but ${format(unexpected)}`) },
  );
}

/** `Browser.Contains(expected, () => text)`: polls until the text contains `expected`. */
export async function waitContains(expected, read, options = {}) {
  let last;
  await waitTrue(
    async () => {
      last = await read();
      return typeof last === "string" && last.includes(expected);
    },
    { ...options, message: options.message ?? (() => `expected text containing ${format(expected)}, last text ${format(last)}`) },
  );
}

/** `Browser.Collection(() => values, …)`: polls until the values equal `expected`, element by element. */
export async function waitCollection(expected, read, options = {}) {
  let last;
  await waitTrue(
    async () => {
      last = await read();
      return last.length === expected.length && last.every((value, i) => Object.is(value, expected[i]));
    },
    { ...options, message: options.message ?? (() => `expected ${format(expected)}, last ${format(last)}`) },
  );
}

/** A CSS selector for an element id (ids like "999" are not valid `#…` selectors). */
export const byId = (id) => `[id="${id}"]`;

/** `Browser.Exists(By…)`: waits until the element is in the DOM and returns its locator. */
export async function exists(page, selector, { timeout = DEFAULT_TIMEOUT } = {}) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "attached", timeout });
  return locator;
}

/** `Browser.DoesNotExist(By…)`: waits until no element matches. */
export async function doesNotExist(page, selector, options = {}) {
  await waitTrue(async () => (await page.locator(selector).count()) === 0, {
    ...options,
    message: options.message ?? `expected no element for ${selector}`,
  });
}

/**
 * Selenium's `IWebElement.Text`: the rendered text, trimmed. Like Selenium (and unlike Playwright's
 * `innerText()`), it doesn't wait for the element: a missing one throws, which a wait counts as "not yet".
 */
export async function textOf(locator) {
  const texts = await locator.evaluateAll((elements) => elements.slice(0, 1).map((el) => el.innerText.trim()));
  if (texts.length === 0) throw new AssertionError(`no element for ${locator}`);
  return texts[0];
}

/** Selenium's `IWebElement.Location.Y`: the element's top in document coordinates, in whole pixels. */
export function locationY(locator) {
  return locator.evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
}

/** Selenium's `SendKeys(Keys.X)` to an element: focuses it and presses the key. */
export async function sendKey(locator, key) {
  await locator.press(key);
}

/**
 * Selenium's `Actions.ScrollFromOrigin(element, 0, deltaY)`: real wheel input at the element's in-view
 * centre, so the browser scrolls whatever is under the pointer (classified as a user scroll).
 */
export async function wheel(page, locator, deltaY) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box === null) throw new AssertionError("wheel: the element has no box");
  const viewport = page.viewportSize();
  const x = box.x + box.width / 2;
  const top = Math.max(box.y, 0);
  const bottom = Math.min(box.y + box.height, viewport?.height ?? box.y + box.height);
  await page.mouse.move(x, (top + bottom) / 2);
  await page.mouse.wheel(0, deltaY);
}

function format(value) {
  return typeof value === "string" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(format).join(", ")}]` : String(value);
}

async function safely(message) {
  try {
    return await message();
  } catch (error) {
    return `(the failure message itself failed: ${error.message})`;
  }
}
