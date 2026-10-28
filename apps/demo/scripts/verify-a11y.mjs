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
    // A page that failed to load is empty, and axe finds nothing wrong with nothing.
    await page.waitForSelector("h1", { timeout: 15_000 });
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
  check((await page.locator("[role=tooltip]:visible").count()) === 0, "tooltip: Escape hides it (it stays in the DOM, hidden, for browse mode)");

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
  // Exact: "Bread" is also a substring of the breadcrumb nav's label.
  await page.getByLabel("Bread", { exact: true }).selectOption("rye");
  await page.getByRole("button", { name: "Reserve" }).click();
  await page.waitForFunction(() => document.querySelector(".order-status")?.textContent?.includes("Reserved"));
  check((await page.locator(".invalid-feedback").count()) === 0, "form: fixed and submitted, no messages left");

  // Switch: a role=switch checkbox bound to the page.
  await page.getByRole("switch", { name: "Deliver tomorrow" }).check();
  await page.waitForFunction(() => document.querySelector(".delivery-state")?.textContent === "Delivery tomorrow");
  check(true, "switch: toggling it updates the page (@bind-Value)");

  // Popover: a non-modal dialog by the button; focus in, Escape returns it.
  const opener = page.getByRole("button", { name: "Opening hours" });
  await opener.click();
  await page.waitForSelector(".popover[role=dialog]");
  check(await page.evaluate(() => document.activeElement?.classList.contains("popover") ?? false), "popover: focus moves into it");
  const popoverViolations = await axe(page);
  check(popoverViolations.length === 0, `axe /components with the popover open${popoverViolations.length ? `: ${popoverViolations.join(" | ")}` : ""}`);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".popover", { state: "detached" });
  check(await opener.evaluate((el) => el === document.activeElement), "popover: Escape closes it and focus returns to the button");
  await page.getByLabel("Delivery date").fill("2026-10-09");
  await page.getByLabel("Delivery date").dispatchEvent("change");
  await page.waitForFunction(() => document.querySelector(".delivery-echo")?.textContent === "Delivery: 2026-10-09");
  check(true, "date field: the ISO date text binds (@bind-Value)");

  // DataGrid: sorting by keyboard (aria-sort), paging, row selection.
  const grid = page.locator("table[aria-label=Orders]");
  const sortState = () => grid.locator("th").evaluateAll((ths) => ths.map((th) => th.getAttribute("aria-sort") ?? "").join(","));
  check((await sortState()) === ",,ascending,,,", `grid: the default sort column says so (${await sortState()})`);
  await grid.getByRole("button", { name: /Total/ }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll("table[aria-label=Orders] th")[4]?.getAttribute("aria-sort") === "ascending");
  check((await grid.locator("tbody tr").first().locator("td").nth(4).textContent())?.trim() === "3.40", "grid: Enter on a header sorts by it");
  await page.locator(".tz-paginator").getByRole("button", { name: "Next page" }).click();
  await page.waitForFunction(() => document.querySelector(".tz-paginator-page")?.textContent === "Page 2 of 3");
  check((await grid.locator("tbody tr").count()) === 10, "grid: the paginator shows the next page");
  await grid.getByRole("checkbox", { name: "Select row 11" }).check();
  await page.waitForFunction(() => document.querySelector(".grid-selection")?.textContent?.startsWith("1 selected"));
  check(true, "grid: a row checkbox selects the row (@bind-SelectedItems)");
  const gridViolations = await axe(page);
  check(gridViolations.length === 0, `axe /components with a sorted, paged, selected grid${gridViolations.length ? `: ${gridViolations.join(" | ")}` : ""}`);

  // Virtualized DataGrid (/virtualize): a window of rows between tr spacers, scrolling and sorting over all 10,000.
  await page.goto(`${APP}/virtualize`, { waitUntil: "networkidle" });
  const vgrid = page.locator("table[aria-label=Orders]");
  const dataRows = () => vgrid.locator("tbody > tr:not([aria-hidden])");
  const firstId = async () => Number(await dataRows().first().locator("td").first().textContent());
  check((await dataRows().count()) < 40 && (await vgrid.getAttribute("aria-rowcount")) === "10001", `virtual grid: renders a window of rows (${await dataRows().count()}), aria-rowcount 10001`);
  const rowHeight = await dataRows().first().evaluate((row) => row.getBoundingClientRect().height);
  check(Math.abs(rowHeight - 33) < 1, `virtual grid: a row is ItemSize high (${rowHeight})`);
  await page.locator(".virtual-grid").evaluate((panel) => { panel.scrollTop = 33 * 3000; });
  // The rows are measured: the first window after the jump is an estimate, the next spacer reports settle it.
  await page
    .waitForFunction(() => {
      const first = Number(document.querySelector("table[aria-label=Orders] tbody > tr:not([aria-hidden]) td")?.textContent);
      return first > 2900 && first <= 3001;
    }, undefined, { timeout: 5000 })
    .catch(() => undefined);
  const scrolledTo = await firstId();
  check(scrolledTo > 2900 && scrolledTo <= 3001, `virtual grid: scrolling shows the rows there (#${scrolledTo})`);
  await page.locator(".virtual-grid").evaluate((panel) => { panel.scrollTop = 0; });
  await vgrid.getByRole("button", { name: /#/ }).click();
  await vgrid.getByRole("button", { name: /#/ }).click();
  await page.waitForFunction(() => document.querySelector("table[aria-label=Orders] tbody > tr:not([aria-hidden]) td")?.textContent === "10000");
  check(true, "virtual grid: sorting descending puts #10000 first");
  const vgridViolations = await axe(page);
  check(vgridViolations.length === 0, `axe /virtualize with the grid sorted${vgridViolations.length ? `: ${vgridViolations.join(" | ")}` : ""}`);

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
