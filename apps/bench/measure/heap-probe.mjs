import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, "../tsazor/dist");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const server = createServer((req, res) => {
  const rel = new URL(req.url, "http://x").pathname.replace(/^\//, "");
  let file = path.join(dist, rel);
  if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(5410, "127.0.0.1", r));

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--js-flags=--expose-gc"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));

await page.goto("http://127.0.0.1:5410/#/rows", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__benchReadyAt === "number", null, { timeout: 20000 });

// full rows cycle
await page.click(".rows-toolbar button:nth-child(1)");
await page.waitForFunction(() => document.querySelectorAll(".rows-table tbody tr").length === 10000);
await page.click(".rows-toolbar button:nth-child(2)");
await page.waitForFunction(() => document.querySelectorAll(".rows-table tbody tr").length === 11000);
await page.click(".rows-toolbar button:nth-child(3)");
await page.waitForTimeout(700);
await page.click(".rows-toolbar button:nth-child(4)");
await page.waitForTimeout(700);
await page.locator(".rows-table td.col-title").nth(3).click();
await page.waitForTimeout(700);
await page.locator(".rows-table .col-remove").nth(5).click();
await page.waitForTimeout(700);

// forced GC (CDP) then heap — 3 samples, GC twice for stability
const cdp = await page.context().newCDPSession(page);
await cdp.send("HeapProfiler.enable").catch(() => {});
const samples = [];
for (let i = 0; i < 3; i++) {
  await cdp.send("HeapProfiler.forceGC").catch(async () => {
    await page.evaluate(() => window.gc?.());
  });
  await page.waitForTimeout(150);
  samples.push(await page.evaluate(() => performance.memory.usedJSHeapSize / 1048576));
}
console.log(`forcedGC heap MB: ${samples.map((s) => s.toFixed(1)).join(" / ")}`);

await browser.close();
server.closeAllConnections?.();
server.close();
process.exit(0);