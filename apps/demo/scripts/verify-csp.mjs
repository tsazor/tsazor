/**
 * E1 — the demo's production build under a strict Content Security Policy,
 * in a real browser: no 'unsafe-inline', no 'unsafe-eval', and Trusted Types
 * enforced (`require-trusted-types-for 'script'`, the runtime's `tsazor`
 * policy allowed). Fails on any CSP violation or page error.
 *
 *   node scripts/verify-csp.mjs        (builds dist/ first when it is missing)
 */
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PORT = 5398;

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "require-trusted-types-for 'script'",
  // 'default': @tsazor/worker's policy, same-origin worker scripts only (docs/csp.md).
  "trusted-types tsazor default",
].join("; ");

if (!existsSync(path.join(DIST, "index.html"))) {
  const build = spawnSync("npx", ["vite", "build"], { cwd: ROOT, stdio: "inherit", shell: true });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http
  .createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);
    let file = path.join(DIST, decodeURIComponent(url.pathname));
    if (!file.startsWith(DIST) || !existsSync(file) || !path.extname(file)) file = path.join(DIST, "index.html"); // SPA fallback
    response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "content-security-policy": CSP });
    response.end(readFileSync(file));
  })
  .listen(PORT);

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  // Every document reports its violations to Node (page.goto starts a new
  // one); the init script comes through devtools, so the CSP doesn't apply to it.
  const violations = [];
  await page.exposeFunction("__reportViolation", (text) => violations.push(text));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__reportViolation(`${location.pathname}: ${event.violatedDirective} ${event.blockedURI} ${event.sample ?? ""}`.trim());
    });
  });

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector("h1");
  check((await page.textContent("h1"))?.length > 0, "the app starts (module scripts from 'self')");

  await page.goto(`http://localhost:${PORT}/counter`);
  await page.click("button.btn");
  await page.waitForFunction(() => document.querySelector(".count-display strong")?.textContent === "1");
  check(true, "events and re-render work");

  await page.goto(`http://localhost:${PORT}/csp`);
  await page.waitForSelector(".markup strong");
  check((await page.textContent(".markup strong")) === "Trusted", "MarkupString renders through the runtime's Trusted Types policy");
  const staticColor = await page.$eval(".static-style", (element) => getComputedStyle(element).color);
  check(staticColor === "rgb(0, 128, 0)", `a static style attribute applies (${staticColor})`);
  const widthBefore = await page.$eval(".bound-style", (element) => getComputedStyle(element).width);
  await page.click("button.grow");
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".bound-style")).width === "150px");
  check(widthBefore === "100px", `a bound style attribute applies and updates (${widthBefore} → 150px)`);

  await page.goto(`http://localhost:${PORT}/components`);
  await page.waitForSelector(".progress-bar");
  check(true, "the components page renders");

  // @tsazor/worker under the policy: starting a module worker is a Trusted Types sink.
  await page.goto(`http://localhost:${PORT}/worker`);
  await page.click("button.parse");
  await page.waitForFunction(() => document.querySelector(".result")?.textContent !== "Parsing…", null, { timeout: 30000 });
  const workerStatus = await page.textContent(".result");
  check(workerStatus?.startsWith("Parsed") === true, `a worker runs under the policy (${workerStatus})`);

  check(violations.length === 0, `no CSP violations${violations.length ? `: ${violations.join(" | ")}` : ""}`);
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
