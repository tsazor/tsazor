/**
 * @tsazor/worker in a real browser: the /worker page parses an order list
 * in a module Web Worker of the production build — progress reaches the
 * main thread, the page stays responsive meanwhile, Cancel aborts.
 *
 *   node scripts/verify-worker.mjs   (builds dist/ first when it is missing)
 */
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as playwright from "playwright-core";
import { BROWSER, launchBrowser } from "../../../scripts/browsers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PORT = 5397;
const APP = `http://localhost:${PORT}`;

if (!existsSync(path.join(DIST, "index.html"))) {
  const build = spawnSync("npx", ["vite", "build"], { cwd: ROOT, stdio: "inherit", shell: true });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml" };
const server = http
  .createServer((request, response) => {
    const url = new URL(request.url ?? "/", APP);
    let file = path.join(DIST, decodeURIComponent(url.pathname));
    if (!file.startsWith(DIST) || !existsSync(file) || !path.extname(file)) file = path.join(DIST, "index.html");
    response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
  })
  .listen(PORT);

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};

const browser = await launchBrowser(playwright);
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${APP}/worker`, { waitUntil: "networkidle" });
  const status = () => page.locator(".result").textContent();

  // Parse: the result arrives, progress reached the main thread.
  await page.locator(".parse").click();
  await page.waitForFunction(() => document.querySelector(".result")?.textContent?.startsWith("Parsed"), null, { timeout: 30000 });
  check((await status()) === "Parsed 1000000 rows, 3000000 loaves; first: customer 0 (in a worker).", `parse: result from the worker (${await status()})`);
  check(Number(await page.locator("progress").getAttribute("value")) === 1, "parse: progress reached 1 on the main thread");
  const workerScripts = await page.evaluate(() => performance.getEntriesByType("resource").filter((entry) => entry.name.includes("csv.worker")).length);
  check(workerScripts === 1, "parse: the worker chunk was loaded once");

  // Responsive meanwhile: the main thread keeps answering timers while the worker parses.
  await page.locator(".parse").click();
  const gaps = await page.evaluate(async () => {
    let last = performance.now();
    let longest = 0;
    let ticks = 0;
    while (document.querySelector(".result")?.textContent === "Parsing…" && ticks < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
      ticks++;
    }
    return { ticks, longest: Math.round(longest) };
  });
  check(gaps.ticks > 0 && gaps.longest < 150, `responsive: ${gaps.ticks} timer ticks during the parse, longest gap ${gaps.longest} ms`);

  // Cancel: the call rejects with an AbortError at once.
  await page.locator(".parse").click();
  await page.locator(".cancel").click();
  await page.waitForFunction(() => document.querySelector(".result")?.textContent !== "Parsing…", null, { timeout: 10000 });
  check((await status()) === "Cancelled.", `cancel: the call was aborted (${await status()})`);
  check(await page.locator(".parse").isEnabled(), "cancel: the page is ready again");

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
} catch (error) {
  console.error(error);
  failed++;
} finally {
  await browser.close();
  server.close();
}
console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
