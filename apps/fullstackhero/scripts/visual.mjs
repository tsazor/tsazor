/**
 * Visual comparison: the original admin's Playwright suite runs unchanged against the original and against the port,
 * each test ending with a screenshot of the page as the test left it (animations finished); the two screenshots are
 * compared pixel by pixel. The acceptance test checks what the specs assert — roles, names, requests; this shows
 * what they don't: the layout, the classes, the colors (docs/port-fullstackhero.md).
 *
 *   node scripts/visual.mjs                      every spec
 *   node scripts/visual.mjs roles dashboard      the specs whose path contains one of the words
 *   node scripts/visual.mjs --compare-only       compare the screenshots of the last run again
 *
 * Each spec is wrapped, not edited: a generated file registers an afterEach that takes the screenshot, then imports
 * the original spec. The original runs on its dev server (:5173), the port on one of its own (:5379). The result:
 * .tmp/visual/report.html (side by side with a diff image) and a table of the mismatch per test, worst first.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { admin, ensureAdminPackages, ensureClone, root } from "./upstream.mjs";

const args = process.argv.slice(2);
const filters = args.filter((arg) => !arg.startsWith("--"));
const compareOnly = args.includes("--compare-only");
const out = path.join(root, ".tmp", "visual");

ensureClone();
ensureAdminPackages();

/** The original's spec files (relative to its tests/), filtered by the words. */
function specs() {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".spec.ts")) found.push(path.relative(path.join(admin, "tests"), full).replace(/\\/g, "/"));
    }
  };
  walk(path.join(admin, "tests"));
  return found.filter((spec) => filters.length === 0 || filters.some((word) => spec.includes(word)));
}

function run(app) {
  const port = app === "original" ? 5173 : 5379;
  const shots = path.join(out, app);
  rmSync(shots, { recursive: true, force: true });
  mkdirSync(shots, { recursive: true });
  const wrappers = path.join(admin, "tests-visual");
  rmSync(wrappers, { recursive: true, force: true });
  for (const spec of specs()) {
    const file = path.join(wrappers, spec);
    mkdirSync(path.dirname(file), { recursive: true });
    const original = path.relative(path.dirname(file), path.join(admin, "tests", spec)).replace(/\\/g, "/");
    writeFileSync(
      file,
      `// Written by apps/fullstackhero/scripts/visual.mjs: ${spec}, with a screenshot after each test.
import { test } from "@playwright/test";
test.afterEach(async ({ page }, info) => {
  const name = info.titlePath.slice(1).join(" - ").replace(/[^a-z0-9 ._-]+/gi, "_").slice(0, 180);
  await page.screenshot({ path: ${JSON.stringify(shots.replace(/\\/g, "/"))} + "/" + name + ".png", animations: "disabled" }).catch(() => {});
});
import ${JSON.stringify(original.startsWith(".") ? original : `./${original}`)};
`,
    );
  }
  const server = app === "original" ? { command: "npm run dev", cwd: admin } : { command: process.platform === "win32" ? `set PORT=${port}&& pnpm dev` : `PORT=${port} pnpm dev`, cwd: root };
  const config = path.join(admin, `playwright.visual-${app}.config.ts`);
  writeFileSync(
    config,
    `// Written by apps/fullstackhero/scripts/visual.mjs.
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests-visual",
  fullyParallel: true,
  workers: 4,
  outputDir: ${JSON.stringify(path.join(root, ".tmp", `visual-results-${app}`))},
  reporter: [["dot"]],
  use: { baseURL: "http://localhost:${port}", channel: "msedge", locale: "en-US", launchOptions: { args: ["--lang=en-US"] }, viewport: { width: 1280, height: 800 }, trace: "off", actionTimeout: 10_000, navigationTimeout: 15_000 },
  projects: [{ name: "edge", use: { channel: "msedge" } }],
  webServer: { command: ${JSON.stringify(server.command)}, cwd: ${JSON.stringify(server.cwd)}, url: "http://localhost:${port}", reuseExistingServer: true, timeout: 60_000, stdout: "ignore", stderr: "pipe" },
});
`,
  );
  console.log(`visual: running the specs against the ${app}`);
  spawnSync("npx", ["playwright", "test", "--config", path.basename(config)], { cwd: admin, stdio: "inherit", shell: process.platform === "win32" });
}

if (!compareOnly) {
  run("original");
  run("port");
}

// Compare in the browser: both images on a canvas, a pixel differs when a channel differs by more than 24.
const names = readdirSync(path.join(out, "original")).filter((name) => existsSync(path.join(out, "port", name)));
const missing = readdirSync(path.join(out, "original")).filter((name) => !existsSync(path.join(out, "port", name)));
mkdirSync(path.join(out, "diff"), { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const rows = [];
try {
  const page = await browser.newPage();
  for (const name of names) {
    const a = `data:image/png;base64,${readFileSync(path.join(out, "original", name)).toString("base64")}`;
    const b = `data:image/png;base64,${readFileSync(path.join(out, "port", name)).toString("base64")}`;
    const result = await page.evaluate(async ([a, b]) => {
      const load = (src) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = Math.min(ia.width, ib.width);
      const h = Math.min(ia.height, ib.height);
      const canvas = (img) => { const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0); return c.getContext("2d").getImageData(0, 0, w, h); };
      const da = canvas(ia);
      const db = canvas(ib);
      const diff = new ImageData(w, h);
      let differing = 0;
      for (let i = 0; i < da.data.length; i += 4) {
        const delta = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
        if (delta > 24) {
          differing++;
          diff.data.set([255, 0, 64, 255], i);
        } else {
          const gray = (da.data[i] + da.data[i + 1] + da.data[i + 2]) / 3;
          diff.data.set([gray, gray, gray, 60], i);
        }
      }
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").putImageData(diff, 0, 0);
      return { ratio: differing / (w * h), sizeDiffers: ia.width !== ib.width || ia.height !== ib.height, png: c.toDataURL("image/png") };
    }, [a, b]);
    writeFileSync(path.join(out, "diff", name), Buffer.from(result.png.split(",")[1], "base64"));
    rows.push({ name, ratio: result.ratio, sizeDiffers: result.sizeDiffers });
  }
} finally {
  await browser.close();
}

rows.sort((x, y) => y.ratio - x.ratio);
const percent = (ratio) => `${(ratio * 100).toFixed(2)}%`;
console.log("\nvisual (pixels that differ, worst first):");
for (const row of rows) console.log(`  ${percent(row.ratio).padStart(7)}  ${row.name.replace(/\.png$/, "")}${row.sizeDiffers ? "  (size differs)" : ""}`);
for (const name of missing) console.log(`     —     ${name.replace(/\.png$/, "")}  (no screenshot from the port)`);
const same = rows.filter((row) => row.ratio < 0.005).length;
console.log(`  ${same}/${rows.length} within 0.5%`);

const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
writeFileSync(
  path.join(out, "report.html"),
  `<!doctype html><meta charset="utf-8"><title>Visual comparison</title>
<style>body{font:14px system-ui;margin:16px}section{margin:24px 0}h2{font-size:14px}div{display:flex;gap:8px}img{width:32%;border:1px solid #ccc}</style>
<h1>fullstackhero: original vs Tsazor port</h1><p>${same}/${rows.length} within 0.5%. Left: original, middle: port, right: differing pixels.</p>
${rows.map((row) => `<section><h2>${percent(row.ratio)} — ${esc(row.name)}</h2><div><img src="original/${encodeURI(row.name)}"><img src="port/${encodeURI(row.name)}"><img src="diff/${encodeURI(row.name)}"></div></section>`).join("\n")}
`,
);
console.log(`  report: ${path.join(out, "report.html")}`);
