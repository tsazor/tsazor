/**
 * R4 — the tutorial as GitHub Pages serves it: the build below
 * `/Tsazor/` (TUTORIAL_BASE), no SPA fallback but `404.html` (a copy of
 * index.html, sent with status 404 for unknown paths). Checks the entry,
 * a deep link, the preview (compile + run in the browser) and navigation.
 *
 *   TUTORIAL_BASE=/Tsazor/ vite build && cp dist/index.html dist/404.html
 *   node scripts/verify-pages.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const BASE = "/Tsazor/";
const PORT = 5395;
const ORIGIN = `http://localhost:${PORT}`;
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml", ".wasm": "application/wasm" };

if (!existsSync(path.join(DIST, "404.html")) || !readFileSync(path.join(DIST, "index.html"), "utf8").includes(`<base href="${BASE}"`)) {
  console.error(`dist/ is not a Pages build: build with TUTORIAL_BASE=${BASE} and copy index.html to 404.html.`);
  process.exit(2);
}

// GitHub Pages: files as they are, anything else is 404.html with status 404.
const server = http
  .createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", ORIGIN).pathname);
    let file = pathname.startsWith(BASE) ? path.join(DIST, pathname.slice(BASE.length)) : "";
    if (file && existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (file && existsSync(file)) {
      response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      response.end(readFileSync(file));
      return;
    }
    response.writeHead(404, { "content-type": "text/html" });
    response.end(readFileSync(path.join(DIST, "404.html")));
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
  const previewText = async (selector) => {
    const handle = await page.waitForSelector(".preview-frame:not(.preview-frame--pending)", { timeout: 30_000 });
    const frame = await handle.contentFrame();
    await frame.waitForSelector(selector, { timeout: 30_000 });
    return frame.textContent(selector);
  };

  await page.goto(`${ORIGIN}${BASE}`);
  await page.waitForSelector(".home h1", { timeout: 30_000 });
  await page.click("a:has-text('Start the TypeScript track')");
  await page.waitForURL((url) => url.pathname.startsWith(`${BASE}ts/`), { timeout: 30_000 });
  check(true, `the start page leads to the first lesson below ${BASE} (${new URL(page.url()).pathname})`);
  check(((await previewText("h1")) ?? "").length > 0, "the preview compiles and runs the lesson");

  await page.goto(`${ORIGIN}${BASE}ts/your-first-component`);
  await page.waitForSelector(".lesson-text, .prose", { timeout: 30_000 });
  check(new URL(page.url()).pathname === `${BASE}ts/your-first-component`, "a deep link loads through 404.html and keeps its address");
  await page.click("button:has-text('Solve')");
  check(((await previewText("h1")) ?? "").includes("Tsazor"), "Solve runs the solution in the preview");

  await page.click("a:has-text('Next'), button:has-text('Next')");
  await page.waitForTimeout(500);
  check(new URL(page.url()).pathname.startsWith(`${BASE}ts/`) && !page.url().endsWith("your-first-component"), `Next stays below ${BASE} (${new URL(page.url()).pathname})`);
  await page.goto(`${ORIGIN}${BASE}index`);
  await page.waitForSelector(".index-page .group", { timeout: 30_000 });
  await page.click(".entry a >> nth=0");
  await page.waitForURL((url) => /^\/Tsazor\/(ts|blazor)\/[\w-]+$/.test(url.pathname), { timeout: 30_000 });
  check(true, `the keyword index loads as a deep link and its entries stay below ${BASE}`);

  await page.goto(`${ORIGIN}${BASE}reference/language#diagnostics`);
  await page.waitForFunction(() => window.scrollY > 1000, undefined, { timeout: 30_000 });
  check(true, "a reference deep link with a fragment loads and scrolls to its section");
  await page.goto(`${ORIGIN}${BASE}reference/components/fluent/Button`);
  await page.waitForSelector(".parameters", { timeout: 30_000 });
  check(true, "a component page loads as a deep link");
  await page.goto(`${ORIGIN}${BASE}reference/api/testing/render`);
  await page.waitForSelector(".signature", { timeout: 30_000 });
  check(true, "an API page loads as a deep link");

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
