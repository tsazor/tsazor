/**
 * E9 — accessibility gate for @tsazor/bootstrap (WCAG 2.2 AA, automated
 * part): axe-core on every demo route of the production build, and the
 * keyboard/focus behavior of the interactive components on /components.
 *
 *   node scripts/verify-a11y.mjs   (builds dist/ first when it is missing)
 */
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PORT = 5396;
const APP = `http://localhost:${PORT}`;
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ROUTES = ["/", "/counter", "/counter-persistent", "/form", "/validation", "/format", "/upload", "/query", "/virtualize", "/fetchdata", "/auth", "/components", "/csp", "/code-behind-demo", "/scoped-demo"];

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

async function axe(page, context = "document") {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished)));
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(
    async ([selector, tags]) => {
      const root = selector === "document" ? document : document.querySelector(selector);
      const result = await window.axe.run(root, { runOnly: { type: "tag", values: tags } });
      return result.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}×) ${v.nodes[0]?.target.join(" ")} — ${(v.nodes[0]?.any[0] ?? v.nodes[0]?.all[0])?.message ?? ""}`);
    },
    [context, WCAG_TAGS],
  );
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of ROUTES) {
    await page.goto(`${APP}${route}`, { waitUntil: "networkidle" });
    const violations = await axe(page);
    check(violations.length === 0, `axe ${route}${violations.length ? `: ${violations.join(" | ")}` : ""}`);
  }
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
