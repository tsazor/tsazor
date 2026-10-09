/**
 * The Blazor parity gate: Blazor's own E2E suites, ported, run against Tsazor's components. The app (src/)
 * holds Blazor's test pages as .tsazor; tests/<suite>/ holds the ported tests. Builds the app, serves dist/
 * on port 5360 and runs every test in a fresh browser context.
 *
 *   node scripts/verify.mjs                      build, then all suites
 *   node scripts/verify.mjs --skip-build         dist/ is built already
 *   node scripts/verify.mjs --suite virtualize   one suite (a folder under tests/)
 *   node scripts/verify.mjs --group a,f          only these modules (by file name prefix: a-basic.mjs is "a")
 *   node scripts/verify.mjs --grep EndKey        only tests whose name contains the text
 *   TSAZOR_BROWSER=firefox node scripts/verify.mjs   (edge, firefox or webkit; scripts/browsers.mjs)
 *
 * Prints PASS / FAIL / SKIP per test and exits 1 when one fails.
 *
 * Layout and the module contract
 * ------------------------------
 * tests/<suite>/ is one Blazor E2E suite (virtualize: Blazor's VirtualizationTest.cs). Each module in it is
 * one group of the suite's catalog (for Virtualize, docs/blazor-virtualize-net11.md §9): a-basic.mjs,
 * b-items-provider.mjs, …, run in file name order. Files whose name starts with "_" are the suite's helpers,
 * tests/lib/ holds what all suites share; neither is a test module. A new group is a new file; a new suite
 * a new folder (and its pages in src/Pages/<Suite>/, listed in src/test-pages.ts). The runner needn't change.
 *
 * A test module exports:
 *
 *   export const group = "A. Basic rendering, parameter validation and the fill loop";
 *   export const tests = [
 *     {
 *       // Blazor's test name. A Theory is one entry per InlineData, its arguments in the name:
 *       // "AnchorMode_EndKeyJumpsToBottom(anchorMode: 2, useItemsProvider: true)".
 *       name: "AlwaysFillsVisibleCapacity_Sync",
 *       run: async (t) => { … },             // throws to fail (tests/lib/harness.mjs has the asserts)
 *       viewport: { width: 1024, height: 2400 },   // optional: Blazor's Browser.SetWindowSize
 *       skip: "why it doesn't apply",        // optional: listed as SKIP, not run
 *     },
 *   ];
 *
 * `t` is the test's context:
 *   t.page      a fresh Playwright page in a fresh browser context, with the app's index loaded;
 *   t.mount(n)  Blazor's MountTestComponent: mounts the test page ported from the Razor component `n`
 *               (chosen in the index's test selector, as Blazor's BasicTestApp does);
 *   t.browser   "edge", "firefox" or "webkit".
 * An uncaught error in the page fails the test too.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as playwright from "playwright-core";
import { BROWSER, launchBrowser } from "../../../scripts/browsers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTS = path.join(ROOT, "tests");
const DIST = path.join(ROOT, "dist");
const PORT = 5360;
const BASE = `http://localhost:${PORT}`;
/** A desktop window. Blazor's tests size the window only where they call SetWindowSize; those say so (`viewport`). */
const DEFAULT_VIEWPORT = { width: 1024, height: 768 };
/** A test that hangs is a failure, not a stuck gate. */
const TEST_TIMEOUT = 180_000;

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const onlySuite = option("--suite");
const onlyGroups = option("--group")?.split(",");
const grep = option("--grep");

if (!args.includes("--skip-build")) {
  const build = spawnSync("npx vite build --logLevel warn", { cwd: ROOT, stdio: "inherit", shell: true });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml" };
const server = http
  .createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", BASE);
    let file = path.join(DIST, decodeURIComponent(requestUrl.pathname));
    // Every route is the app (history routing): a path without a file is index.html.
    if (!file.startsWith(DIST) || !existsSync(file) || !path.extname(file)) file = path.join(DIST, "index.html");
    response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
  })
  .listen(PORT);

/** The test modules: tests/<suite>/<group>.mjs, suites and groups in name order. */
async function discover() {
  const modules = [];
  const suites = readdirSync(TESTS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "lib")
    .map((entry) => entry.name)
    .sort();
  for (const suite of suites) {
    if (onlySuite && suite !== onlySuite) continue;
    const files = readdirSync(path.join(TESTS, suite))
      .filter((file) => file.endsWith(".mjs") && !file.startsWith("_"))
      .sort();
    for (const file of files) {
      const prefix = file.split("-")[0];
      if (onlyGroups && !onlyGroups.includes(prefix)) continue;
      const module = await import(pathToFileURL(path.join(TESTS, suite, file)).href);
      modules.push({ suite, file, group: module.group ?? file, tests: module.tests ?? [] });
    }
  }
  return modules;
}

/** Blazor's MountTestComponent: chooses the page in the index's test selector and waits until it replaced the index. */
async function mount(page, name) {
  await page.locator("#test-selector").selectOption({ label: name });
  await page.waitForFunction(() => document.querySelector("#test-selector") === null, undefined, { timeout: 10_000 });
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`the test did not finish within ${ms / 1000} s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function runTest(browser, test) {
  const context = await browser.newContext({ viewport: test.viewport ?? DEFAULT_VIEWPORT });
  // Playwright's actions wait for their element; as long as a Selenium wait at most, not its default 30 s.
  context.setDefaultTimeout(10_000);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await page.goto(`${BASE}/`, { waitUntil: "load" });
    await page.waitForSelector("#test-selector", { timeout: 15_000 });
    await withTimeout(test.run({ page, mount: (name) => mount(page, name), browser: BROWSER }), TEST_TIMEOUT);
    if (pageErrors.length > 0) throw new Error(`page error: ${pageErrors.join(" | ")}`);
  } finally {
    await context.close();
  }
}

const modules = await discover();
const results = [];
const browser = await launchBrowser(playwright);
console.log(`blazor-parity in ${BROWSER}`);
try {
  for (const module of modules) {
    console.log(`\n${module.suite} — ${module.group}`);
    for (const test of module.tests) {
      if (grep && !test.name.includes(grep)) continue;
      if (test.skip) {
        console.log(`SKIP  ${test.name} — ${test.skip}`);
        results.push({ module, test, status: "skip" });
        continue;
      }
      const started = Date.now();
      try {
        await runTest(browser, test);
        console.log(`PASS  ${test.name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
        results.push({ module, test, status: "pass" });
      } catch (error) {
        console.log(`FAIL  ${test.name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
        console.log(`      ${String(error?.message ?? error).split("\n").join("\n      ")}`);
        results.push({ module, test, status: "fail" });
      }
    }
  }
} finally {
  await browser.close();
  server.close();
}

const count = (status) => results.filter((result) => result.status === status).length;
const failed = count("fail");
console.log(`\n${count("pass")} passed, ${failed} failed, ${count("skip")} skipped`);
for (const result of results.filter((r) => r.status === "fail")) console.log(`  FAIL  ${result.module.suite}/${result.module.file}  ${result.test.name}`);
console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
