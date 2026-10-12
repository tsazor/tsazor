/**
 * The starter gate: the apps `npm create tsazor` writes, as a user gets them,
 * in a real browser — with @tsazor/bootstrap, with @tsazor/fluent and without
 * a library. Each one:
 *
 *   tsazor check and vite build → Home → Counter (the button counts, focus on
 *   the h1 after the navigation) → Weather (the table from the sample data) →
 *   an unknown address → the nav menu on a phone; axe (WCAG 2.2 AA) on every
 *   page, the library's stylesheet and toast region, no errors on the page.
 *
 * The packages come packed: the tarball smoke (scripts/tarball-smoke.mjs)
 * writes and installs the Bootstrap app with the packed starter; the other two
 * apps are written by the same starter and use its node_modules.
 *
 *   node scripts/verify.mjs      (after `pnpm -r build`)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as playwright from "playwright-core";
import { BROWSER, launchBrowser } from "../../../scripts/browsers.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SCRATCH = path.join(tmpdir(), "tsazor-starter-gate");

/**
 * The three apps: the library (a tarball name prefix), the port, the proof that its stylesheet loaded, and the body's
 * typeface — the library's, or the template's without one (F16).
 */
const VARIANTS = [
  { name: "bootstrap", dir: "app", port: 5391, rootProperty: "--bs-blue", bodyFont: "system-ui" },
  { name: "fluent", dir: "app-fluent", port: 5392, tarball: "tsazor-fluent-", rootProperty: "--fui-foreground-on-brand", bodyFont: '"Segoe UI Variable Text"' },
  { name: "none", dir: "app-none", port: 5393, bodyFont: '"Helvetica Neue"' },
];

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};

/** Runs a command; on failure prints its output and ends the gate. */
function run(command, args, cwd, label) {
  const result = spawnSync(command, args, { cwd, shell: true, encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`${result.stdout ?? ""}${result.stderr ?? ""}`);
    console.error(`FAIL  ${label}`);
    process.exit(1);
  }
  return result;
}

/* The apps ------------------------------------------------------------------ */

rmSync(SCRATCH, { recursive: true, force: true });
run("node", [path.join(REPO, "scripts", "tarball-smoke.mjs"), "--keep", "--dir", SCRATCH], REPO, "the tarball smoke (packs, writes and installs the Bootstrap app)");
check(true, "the tarball smoke: the packed starter's Bootstrap app installs, builds and passes its test");

const starter = path.join(SCRATCH, "starter", "package", "dist", "index.js");
const tarballs = readdirSync(path.join(SCRATCH, "tarballs"));
const modules = path.join(SCRATCH, "app", "node_modules");
for (const variant of VARIANTS.filter((v) => v.dir !== "app")) {
  const ui = variant.tarball ? ["--ui", path.join(SCRATCH, "tarballs", tarballs.find((file) => file.startsWith(variant.tarball)))] : [];
  run("node", [starter, variant.dir, ...ui, "--no-install"], SCRATCH, `[${variant.name}] create-tsazor`);
  symlinkSync(modules, path.join(SCRATCH, variant.dir, "node_modules"), process.platform === "win32" ? "junction" : "dir");
}
for (const variant of VARIANTS) {
  const app = path.join(SCRATCH, variant.dir);
  run("node", ["node_modules/@tsazor/cli/dist/bin.js", "check", "."], app, `[${variant.name}] tsazor check`);
  run("node", ["node_modules/vite/bin/vite.js", "build", "--logLevel", "warn"], app, `[${variant.name}] vite build`);
  check(true, `[${variant.name}] tsazor check and vite build`);
}

/* Serving the builds -------------------------------------------------------- */

const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml" };
const servers = VARIANTS.map(({ dir, port }) => {
  const dist = path.join(SCRATCH, dir, "dist");
  return http
    .createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://localhost:${port}`);
      let file = path.join(dist, decodeURIComponent(url.pathname));
      // The SPA fallback: an address that is no file is the app's.
      if (!file.startsWith(dist) || !existsSync(file) || !path.extname(file)) file = path.join(dist, "index.html");
      response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      response.end(readFileSync(file));
    })
    .listen(port);
});

async function axe(page) {
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async (tags) => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
    return result.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}×) ${v.nodes[0]?.target.join(" ")} — ${(v.nodes[0]?.any[0] ?? v.nodes[0]?.all[0])?.message ?? ""}`);
  }, WCAG_TAGS);
}

/* The checks ---------------------------------------------------------------- */

const browser = await launchBrowser(playwright);
try {
  for (const variant of VARIANTS) {
    const base = `http://localhost:${variant.port}`;
    const say = (ok, label) => check(ok, `[${variant.name}] ${label}`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const axeClean = async (label) => {
      const violations = await axe(page);
      say(violations.length === 0, `axe ${label}${violations.length ? `: ${violations.join(" | ")}` : ""}`);
    };
    const heading = () => page.locator("h1").textContent();

    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForSelector("h1");
    say((await heading()) === "Hello, world!", "Home renders in the layout");
    say((await page.title()) === "Home", "PageTitle sets the document title");
    const home = page.getByRole("link", { name: "Home" });
    say((await home.getAttribute("class")) === "nav-link active" && (await home.getAttribute("aria-current")) === "page", "the Home NavLink is active (class nav-link active, aria-current)");
    if (variant.rootProperty) {
      const value = await page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), variant.rootProperty);
      say(value !== "", `the library's stylesheet is loaded (${variant.rootProperty})`);
      say((await page.locator("[aria-live=polite]").count()) > 0, "the library's toast region is in the layout");
    }
    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    say(bodyFont.startsWith(variant.bodyFont), `the body's typeface is ${variant.rootProperty ? "the library's" : "the template's"} (${bodyFont.split(",")[0]})`);
    await axeClean("/");

    await page.getByRole("link", { name: "Counter" }).click();
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Counter");
    say(await page.evaluate(() => document.activeElement?.tagName === "H1"), "FocusOnNavigate moves focus to the new page's h1");
    say((await page.getByRole("status").textContent()) === "Current count: 0", "Counter starts at 0");
    await page.getByRole("button", { name: "Click me" }).click();
    await page.waitForFunction(() => document.querySelector("[role=status]")?.textContent === "Current count: 1");
    say(true, "Click me increments the count");
    say((await home.getAttribute("class")) === "nav-link", "the Home NavLink is no longer active");
    await axeClean("/counter");

    await page.getByRole("link", { name: "Weather" }).click();
    await page.waitForSelector("table tbody tr");
    const rows = await page.locator("table tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent)));
    say(rows.length === 5, `Weather shows the five sample days (${rows.length})`);
    say(rows[0]?.[1] === "1" && rows[0]?.[2] === "33" && rows[0]?.[3] === "Freezing", `the first day: 1 °C, 33 °F, Freezing (${rows[0]?.join(" · ")})`);
    await axeClean("/weather");

    await page.goto(`${base}/no/such/page`, { waitUntil: "networkidle" });
    await page.waitForSelector("[role=alert]");
    say((await page.getByRole("alert").textContent()) === "Sorry, there's nothing at this address.", "an unknown address shows NotFound in the layout");
    say((await page.title()) === "Not found", "NotFound sets its title");

    /* On a phone the menu collapses behind the toggle and closes after a choice. */
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    phone.on("pageerror", (error) => errors.push(error.message));
    await phone.goto(base, { waitUntil: "networkidle" });
    await phone.waitForSelector("h1");
    const counterLink = phone.getByRole("link", { name: "Counter" });
    say(!(await counterLink.isVisible()), "phone: the menu starts collapsed");
    const toggle = phone.getByRole("button", { name: "Navigation menu" });
    await toggle.click();
    await counterLink.waitFor({ state: "visible" });
    say((await toggle.getAttribute("aria-expanded")) === "true", "phone: the toggle opens the menu (aria-expanded)");
    await counterLink.click();
    await phone.waitForFunction(() => document.querySelector("h1")?.textContent === "Counter");
    say(!(await counterLink.isVisible()), "phone: choosing a page closes the menu");
    await phone.close();

    say(errors.length === 0, `no errors on the page${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await page.close();
  }
} finally {
  await browser.close();
  for (const server of servers) server.close();
}

console.log(failed === 0 ? `\nALL PASS (${BROWSER})` : `\n${failed} FAILED (${BROWSER})`);
if (failed === 0) rmSync(SCRATCH, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
