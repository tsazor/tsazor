#!/usr/bin/env node
/**
 * F1a A/B (docs/design-static-markup.md §5): the Tsazor bench app built with
 * the compiler's optimizations and without (TSAZOR_OPTIMIZE=0: no static markup
 * blocks, and no stable handlers either, since the per-optimization switches
 * went before 1.0), measured on the
 * static-heavy `/cards` page — 3,000 cards whose chrome is static and whose
 * price is dynamic. Median of N in-browser cycles:
 *
 * - show:     click → 3,000 cards in the DOM (build, diff, insert)
 * - rerender: click → the same 3,000 cards rendered again (diff only)
 * - hide:     click → no cards
 *
 *   node static-markup.mjs [--runs=7]
 */
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "../tsazor");
const runs = Number(process.argv.find((arg) => arg.startsWith("--runs="))?.slice(7) ?? 7);
const PORT = 5420;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10;
};

function build(staticMarkup) {
  const result = spawnSync("npx", ["vite", "build", "--logLevel", "error"], {
    cwd: appDir,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, TSAZOR_OPTIMIZE: staticMarkup ? "1" : "0" },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function serve() {
  const dist = path.join(appDir, "dist");
  const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };
  return createServer((request, response) => {
    let file = path.join(dist, new URL(request.url ?? "/", "http://x").pathname);
    if (!existsSync(file) || !statSync(file).isFile()) file = path.join(dist, "index.html");
    response.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  }).listen(PORT);
}

async function measure(browser) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/cards`);
  await page.waitForSelector("#show");
  const timed = (button, done) =>
    page.evaluate(
      ([selector, condition]) =>
        new Promise((resolve) => {
          const start = performance.now();
          document.querySelector(selector).click();
          const check = new Function(`return (${condition})`);
          // A MessageChannel poll: not tied to frames (requestAnimationFrame would
          // measure the frame rate) and not clamped like a nested setTimeout.
          const channel = new MessageChannel();
          channel.port1.onmessage = () => (check() ? resolve(performance.now() - start) : channel.port2.postMessage(0));
          channel.port2.postMessage(0);
        }),
      [button, done],
    );
  const results = { show: [], rerender: [], hide: [] };
  for (let i = 0; i < runs; i++) {
    results.show.push(await timed("#show", "document.querySelectorAll('.card').length === 3000"));
    results.rerender.push(await timed("#rerender", "document.querySelector('#renders').textContent === String(" + (i + 1) + ")"));
    results.hide.push(await timed("#hide", "document.querySelectorAll('.card').length === 0"));
  }
  await page.close();
  return { show: median(results.show), rerender: median(results.rerender), hide: median(results.hide) };
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const table = [];
try {
  // Alternate the variants, so drift of the machine hits both.
  for (const staticMarkup of [false, true, false, true]) {
    build(staticMarkup);
    const server = serve();
    try {
      table.push({ staticMarkup, ...(await measure(browser)) });
    } finally {
      server.close();
    }
  }
} finally {
  await browser.close();
  build(true); // leave the default build behind
}
for (const row of table) console.log(`${row.staticMarkup ? "blocks  " : "elements"}  show ${row.show} ms  rerender ${row.rerender} ms  hide ${row.hide} ms`);
