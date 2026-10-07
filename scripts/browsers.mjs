/**
 * The browser the gate scripts run in: `TSAZOR_BROWSER=edge` (default —
 * Chromium, the installed Edge), `firefox` or `webkit` (Playwright's builds:
 * `npx playwright-core install firefox webkit`). WebKit on Windows and Linux
 * is close to Safari, not Safari itself.
 *
 *   TSAZOR_BROWSER=firefox node scripts/verify.mjs
 */

/** The selected browser's name, for log lines. */
export const BROWSER = process.env.TSAZOR_BROWSER ?? "edge";

/** Launches the selected browser headless; `playwright` is the caller's `playwright-core` module. */
export function launchBrowser(playwright, options = {}) {
  switch (BROWSER) {
    case "firefox":
      return playwright.firefox.launch({ headless: true, ...options });
    case "webkit":
      return playwright.webkit.launch({ headless: true, ...options });
    case "edge":
      return playwright.chromium.launch({ channel: "msedge", headless: true, ...options });
    default:
      throw new Error(`TSAZOR_BROWSER=${BROWSER}: expected edge, firefox or webkit.`);
  }
}
