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
import * as playwright from "playwright-core";
import { BROWSER, launchBrowser } from "../../../scripts/browsers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PORT = 5396;
const APP = `http://localhost:${PORT}`;
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ROUTES = ["/", "/counter", "/counter-persistent", "/form", "/validation", "/format", "/upload", "/query", "/virtualize", "/fetchdata", "/auth", "/components", "/csp", "/code-behind-demo", "/scoped-demo", "/worker"];

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
  // Settle finite animations first (a cancelled one counts as done) — at most 3 s: a headless
  // engine that doesn't advance animations (WebKit) must not hold the gate.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]),
  );
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

const browser = await launchBrowser(playwright);
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of ROUTES) {
    await page.goto(`${APP}${route}`, { waitUntil: "networkidle" });
    const violations = await axe(page);
    check(violations.length === 0, `axe ${route}${violations.length ? `: ${violations.join(" | ")}` : ""}`);
  }
  // Keyboard patterns (WAI-ARIA APG) of the interactive components, on @tsazor/ui.
  await page.goto(`${APP}/components`, { waitUntil: "networkidle" });
  const focused = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");

  // Dialog: focus moves in, Tab stays inside, Escape closes and returns focus.
  await page.getByRole("button", { name: "Open modal" }).click();
  await page.waitForSelector("[role=dialog]");
  check(await page.evaluate(() => document.querySelector("[role=dialog]")?.contains(document.activeElement) ?? false), "dialog: focus moves into the dialog");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  check(await page.evaluate(() => document.querySelector("[role=dialog]")?.contains(document.activeElement) ?? false), "dialog: Tab stays inside");
  const openViolations = await axe(page);
  check(openViolations.length === 0, `axe /components with the dialog open${openViolations.length ? `: ${openViolations.join(" | ")}` : ""}`);
  await page.keyboard.press("Escape");
  await page.waitForSelector("[role=dialog]", { state: "detached" });
  check((await focused()) === "Open modal", "dialog: Escape closes it and focus returns to the opener");

  // Dropdown: ArrowDown opens on the first item, arrows move, Escape returns focus.
  const toggle = page.locator(".dropdown-toggle").first();
  await toggle.focus();
  await page.keyboard.press("ArrowDown");
  await page.waitForSelector("[role=menu]");
  check((await focused()) === "Open", "menu: ArrowDown opens it on the first item");
  await page.keyboard.press("ArrowDown");
  check((await focused()) === "Save", "menu: ArrowDown moves to the next item");
  const menuViolations = await axe(page);
  check(menuViolations.length === 0, `axe /components with the menu open${menuViolations.length ? `: ${menuViolations.join(" | ")}` : ""}`);
  await page.keyboard.press("Escape");
  await page.waitForSelector("[role=menu]", { state: "detached" });
  check(await toggle.evaluate((element) => element === document.activeElement), "menu: Escape closes it and focus returns to the toggle");

  // Tabs: arrows move the selection, only the active tab is a Tab stop.
  const firstTab = page.locator("[role=tab]").first();
  await firstTab.focus();
  await page.keyboard.press("ArrowRight");
  check((await focused()) === "Second", "tabs: ArrowRight moves to the next tab");
  check(
    (await page.locator("[role=tab]").evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute("tabindex")).join(","))) === "-1,0,-1",
    "tabs: roving tabindex follows the selection",
  );
  check((await page.locator("[role=tabpanel]").textContent())?.trim() === "Content of tab 2.", "tabs: the panel follows the selection");

  // Drawer: a modal panel — focus moves in, Escape closes it and returns focus.
  await page.getByRole("button", { name: "Filters" }).click();
  await page.waitForSelector(".offcanvas[role=dialog]");
  check(await page.evaluate(() => document.querySelector(".offcanvas")?.contains(document.activeElement) ?? false), "drawer: focus moves into the panel");
  const drawerViolations = await axe(page);
  check(drawerViolations.length === 0, `axe /components with the drawer open${drawerViolations.length ? `: ${drawerViolations.join(" | ")}` : ""}`);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".offcanvas", { state: "detached" });
  check((await focused()) === "Filters", "drawer: Escape closes it and focus returns to the opener");

  // Toast: shown through the Toaster service, in a polite live region.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector(".toast");
  check((await page.locator(".toast").textContent())?.includes("The order list is up to date.") === true, "toast: Save shows a toast");
  const toastViolations = await axe(page);
  check(toastViolations.length === 0, `axe /components with a toast${toastViolations.length ? `: ${toastViolations.join(" | ")}` : ""}`);

  // Tooltip: shows on focus, describes the button, Escape hides it.
  await page.locator(".print").focus();
  await page.waitForSelector("[role=tooltip]");
  const described = await page.locator(".print").evaluate((button) => document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent);
  check(described === "Print the order list", `tooltip: describes the button (${described})`);
  await page.keyboard.press("Escape");
  check((await page.locator("[role=tooltip]").count()) === 0, "tooltip: Escape hides it");

  // Form: messages only after a submit, linked to their inputs; axe with the errors showing.
  await page.getByRole("button", { name: "Reserve" }).click();
  await page.waitForSelector(".invalid-feedback");
  const name = page.getByLabel("Name", { exact: true });
  check((await name.getAttribute("aria-invalid")) === "true", "form: an invalid input says so (aria-invalid)");
  const describedBy = (await name.getAttribute("aria-describedby")) ?? "";
  const description = await page.evaluate((ids) => ids.split(" ").map((id) => document.getElementById(id)?.textContent?.trim()).join(" | "), describedBy);
  check(description.includes("Enter a name."), `form: the message describes the input (${description})`);
  const formViolations = await axe(page);
  check(formViolations.length === 0, `axe /components with form errors${formViolations.length ? `: ${formViolations.join(" | ")}` : ""}`);
  await name.fill("Marta");
  await name.dispatchEvent("change");
  await page.getByLabel("Bread").selectOption("rye");
  await page.getByRole("button", { name: "Reserve" }).click();
  await page.waitForFunction(() => document.querySelector(".order-status")?.textContent?.includes("Reserved"));
  check((await page.locator(".invalid-feedback").count()) === 0, "form: fixed and submitted, no messages left");

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
