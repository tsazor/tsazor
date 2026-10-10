/**
 * The skins gate: the same pages built with @tsazor/bootstrap and with
 * @tsazor/fluent, each served on its own port, and the same checks run on both —
 * axe (WCAG 2.2 AA) on every page and the behaviors, found by role, label and
 * text (no skin classes), so both skins must behave alike.
 *
 *   node scripts/verify.mjs   (builds both into dist/ first)
 */
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as playwright from "playwright-core";
import { launchBrowser } from "../../../scripts/browsers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SKINS = { bootstrap: 5397, fluent: 5398 };
const ROUTES = ["/", "/actions", "/forms", "/data", "/overlays", "/structure", "/content", "/icons"];
const url = (skin) => `http://localhost:${SKINS[skin]}`;

for (const [skin, other] of [["bootstrap", "fluent"], ["fluent", "bootstrap"]]) {
  const build = spawnSync("npx", ["vite", "build", "--mode", skin, "--outDir", `dist/${skin}`, "--logLevel", "warn"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, OTHER_SKIN_URL: url(other) },
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml" };
const servers = Object.entries(SKINS).map(([skin, port]) => {
  const dist = path.join(ROOT, "dist", skin);
  return http
    .createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", url(skin));
      let file = path.join(dist, decodeURIComponent(requestUrl.pathname));
      if (!file.startsWith(dist) || !existsSync(file) || !path.extname(file)) file = path.join(dist, "index.html");
      response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      response.end(readFileSync(file));
    })
    .listen(port);
});

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};

async function axe(page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]),
  );
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async (tags) => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
    return result.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}×) ${v.nodes[0]?.target.join(" ")} — ${(v.nodes[0]?.any[0] ?? v.nodes[0]?.all[0])?.message ?? ""}`);
  }, WCAG_TAGS);
}

async function open(page, base, route) {
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  // A page that failed to load is empty, and axe finds nothing wrong with nothing.
  await page.waitForSelector("h1", { timeout: 15_000 });
}

const browser = await launchBrowser(playwright);
try {
  for (const skin of Object.keys(SKINS)) {
    const base = url(skin);
    const other = skin === "fluent" ? "bootstrap" : "fluent";
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const say = (ok, label) => check(ok, `[${skin}] ${label}`);
    const focusedText = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");

    for (const route of ROUTES) {
      await open(page, base, route);
      const violations = await axe(page);
      say(violations.length === 0, `axe ${route}${violations.length ? `: ${violations.join(" | ")}` : ""}`);
    }

    /* The skin: its stylesheet is loaded, and the switch leads to the same page in the other build. */
    await open(page, base, "/data");
    say((await page.getAttribute("html", "data-skin")) === skin, "the build renders with its skin");
    const switchHref = await page.getByRole("link", { name: /Show this page with/ }).getAttribute("href");
    say(switchHref === `${url(other)}/data`, `the skin switch leads to the same page in the other build (${switchHref})`);

    /* Actions: button, menu, popover, tooltip. */
    await open(page, base, "/actions");
    await page.getByRole("button", { name: "Primary" }).click();
    await page.waitForFunction(() => document.querySelector(".clicks")?.textContent === "1");
    say(true, "a button raises onClick");
    await page.getByRole("button", { name: "Order actions" }).focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForSelector("[role=menu]");
    say((await focusedText()) === "Copy", "menu: ArrowDown opens it on the first item");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.waitForSelector("[role=menu]", { state: "detached" });
    say((await page.textContent(".menu-choice")) === "Chose Archive.", "menu: End and Enter choose the last item");
    say(await page.getByRole("button", { name: "Order actions" }).evaluate((el) => el === document.activeElement), "menu: focus returns to the toggle");
    const opener = page.getByRole("button", { name: "Opening hours" });
    await opener.click();
    await page.waitForSelector("[role=dialog]");
    say(await page.evaluate(() => document.activeElement?.getAttribute("role") === "dialog"), "popover: focus moves into it");
    await page.keyboard.press("Escape");
    await page.waitForSelector("[role=dialog]", { state: "detached" });
    say(await opener.evaluate((el) => el === document.activeElement), "popover: Escape returns focus to its button");
    await page.getByRole("button", { name: "Print" }).focus();
    await page.waitForSelector("[role=tooltip]");
    say((await page.getByRole("button", { name: "Print" }).getAttribute("aria-describedby")) !== null, "tooltip: describes its button");

    /* Forms: messages only after a submit, linked to their inputs. */
    await open(page, base, "/forms");
    await page.getByRole("button", { name: "Reserve" }).click();
    await page.waitForFunction(() => document.body.textContent?.includes("Enter a name."));
    const name = page.getByLabel("Name", { exact: true });
    say((await name.getAttribute("aria-invalid")) === "true", "form: an invalid field says so (aria-invalid)");
    const describedBy = (await name.getAttribute("aria-describedby")) ?? "";
    const description = await page.evaluate((ids) => ids.split(" ").map((id) => document.getElementById(id)?.textContent?.trim()).join(" | "), describedBy);
    say(description.includes("As it should appear on the order.") && description.includes("Enter a name."), `form: help and message describe the field (${description})`);
    const formViolations = await axe(page);
    say(formViolations.length === 0, `axe /forms with the messages${formViolations.length ? `: ${formViolations.join(" | ")}` : ""}`);
    await name.fill("Marta");
    await name.dispatchEvent("change");
    await page.getByLabel("Bread").selectOption("rye");
    await page.getByLabel("I accept the terms").check();
    await page.getByRole("button", { name: "Reserve" }).click();
    await page.waitForFunction(() => document.querySelector(".order-status")?.textContent?.startsWith("Reserved: 1 × rye for Marta"));
    say(true, "form: fixed and submitted, OnValidSubmit runs");

    /* Data: the grid sorts, pages and selects. */
    await open(page, base, "/data");
    const grid = page.getByRole("table", { name: "Orders" });
    say((await grid.locator("th[aria-sort=ascending]").textContent())?.includes("Customer") === true, "grid: sorted by its default column (aria-sort)");
    await grid.getByRole("button", { name: /Total/ }).click();
    await page.waitForFunction(() => document.querySelector("table[aria-label=Orders] th[aria-sort]")?.textContent?.includes("Total"));
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForFunction(() => document.querySelector("table[aria-label=Orders]")?.textContent !== null);
    await grid.getByRole("checkbox", { name: "Select row 11" }).check();
    await page.waitForFunction(() => document.querySelector(".grid-selection")?.textContent === "1 selected");
    say(true, "grid: sorts on a header, pages, and selects a row");

    /* Overlays: dialog, drawer, toasts. */
    await open(page, base, "/overlays");
    await page.getByRole("button", { name: "Delete order" }).click();
    await page.waitForSelector("[role=dialog]");
    say(await page.evaluate(() => document.querySelector("[role=dialog]")?.contains(document.activeElement) ?? false), "dialog: focus moves in");
    const dialogViolations = await axe(page);
    say(dialogViolations.length === 0, `axe /overlays with the dialog open${dialogViolations.length ? `: ${dialogViolations.join(" | ")}` : ""}`);
    await page.keyboard.press("Escape");
    await page.waitForSelector("[role=dialog]", { state: "detached" });
    say((await focusedText()) === "Delete order", "dialog: Escape closes it and focus returns");
    await page.getByRole("button", { name: "Filters" }).click();
    await page.waitForSelector("[role=dialog]");
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForFunction(() => document.querySelector(".overlay-result")?.textContent === "Showing all orders.");
    say(true, "drawer: a button in it applies and closes it");
    await page.getByRole("button", { name: "Error toast" }).click();
    await page.waitForSelector("[role=alert]");
    say((await page.locator("[role=alert]").textContent())?.includes("Upload failed.") === true, "toast: a danger toast is an alert");

    /* Icons: on the components, and the Icons page browses the skin's set. */
    await open(page, base, "/actions");
    const iconPaths = await page.locator(".icons-demo").evaluate((row) => row.querySelectorAll("svg path").length);
    say(iconPaths >= 4, `icons: Save, More, Delete and the badge draw the skin's icons (${iconPaths} paths)`);
    say((await page.getByRole("button", { name: "Delete" }).locator("svg").count()) === 1, "icons: an icon-only button is named by its ariaLabel");
    await open(page, base, "/icons");
    await page.waitForSelector(".icons-cell", { timeout: 30_000 });
    const total = Number((await page.locator(".icons-count").textContent())?.split(" ")[0]);
    say(total > 2000, `icons page: the whole set (${total} icons)`);
    say((await page.locator(".icons-cell").count()) < 300, "icons page: Virtualize renders only the rows in view");
    await page.getByLabel("Search").fill("arrow left");
    await page.waitForFunction((all) => Number(document.querySelector(".icons-count")?.textContent?.split(" ")[0]) < all, total);
    const names = await page.locator(".icons-name").allTextContents();
    say(names.length > 0 && names.every((name) => /arrow/i.test(name) && /left/i.test(name)), `icons page: the search filters as you type (${names.slice(0, 3).join(", ")})`);
    if (skin === "fluent") {
      await page.getByLabel("Search").fill("");
      await page.getByLabel("Variant").selectOption("Light");
      await page.waitForFunction(() => document.querySelector(".icons-cell")?.getAttribute("title")?.startsWith("Icons.Light.Size24.") ?? false);
      say(true, "icons page: another variant loads its own module, at a size it has (Light starts at 24)");
    }
    await page.locator(".icons-cell").first().click();
    await page.waitForFunction(() => document.body.textContent?.includes('<Icon Value="@Icons.') ?? false);
    say(true, "icons page: a click gives the icon's markup");

    /* Content: avatars. */
    await open(page, base, "/content");
    const avatars = page.locator(".avatars [role=img]");
    say((await avatars.first().textContent()) === "AL" && (await avatars.first().getAttribute("aria-label")) === "Ada Lovelace", "avatar: the name's initials, named by it");
    const backgrounds = await avatars.evaluateAll((items) => items.slice(0, 5).map((item) => getComputedStyle(item).backgroundColor));
    say(new Set(backgrounds).size > 2, `avatar: colorful gives the names different colors (${new Set(backgrounds).size})`);
    say((await page.locator(".avatars [aria-hidden=true] svg").count()) === 1, "avatar: without a name, a decorative person icon");
    await page.getByRole("button", { name: "Marta Bauer" }).press("Enter");
    await page.waitForFunction(() => document.querySelector(".picked")?.textContent === "Picked Marta Bauer.");
    say(true, "avatar: with onClick it is a button that Enter clicks");

    /* Content: Markdown, rendered and sanitized in a real browser (unit tests can't: DOMPurify needs a real DOM). */
    const preview = page.locator(".markdown-preview .tz-markdown");
    say((await preview.locator("h2").textContent()) === "Order 1042", "markdown: the text renders as HTML");
    say((await preview.locator("input[type=checkbox]").count()) === 2 && (await preview.locator("td").count()) === 4, "markdown: task lists and tables (GitHub Flavored Markdown)");
    const external = preview.getByRole("link", { name: "the hours" });
    say((await external.getAttribute("target")) === "_blank" && (await external.getAttribute("rel")) === "noopener noreferrer", "markdown: a link to another origin opens in a new tab, without access to the page");
    await page.getByLabel("Text").fill("# Live\n\nTyped *now*");
    await page.waitForFunction(() => document.querySelector(".markdown-preview h1")?.textContent === "Live");
    say(true, "markdown: the preview follows the typing (TextArea immediate)");
    const untrusted = page.locator(".markdown-untrusted .tz-markdown");
    // The image is missing: an onerror that survived would have run by now.
    await page.waitForFunction(() => document.querySelector(".markdown-untrusted img")?.complete === true);
    say((await page.evaluate(() => window.__xss)) === undefined, "markdown: nothing in an untrusted text ran (script, onerror)");
    say((await untrusted.locator("script, [onerror], [style], a[href^='javascript:']").count()) === 0 && (await untrusted.locator("img[alt=chart]").count()) === 1,
      "markdown: the sanitizer removed what could run and kept the rest");
    await untrusted.getByText("Open the report").click();
    say((await page.evaluate(() => window.__xss)) === undefined, "markdown: the javascript: link lost its href, so a click runs nothing");
    say((await untrusted.getByRole("link", { name: "Orders" }).getAttribute("target")) === null, "markdown: a link in the app stays in the app");

    /* Structure: tabs, accordion, pagination. */
    await open(page, base, "/structure");
    await page.getByRole("tab", { name: "Items" }).focus();
    await page.keyboard.press("ArrowRight");
    say((await page.getByRole("tabpanel").textContent())?.includes("Tomorrow") === true, "tabs: ArrowRight shows the next panel");
    await page.getByRole("button", { name: "Payment" }).click();
    say((await page.getByRole("button", { name: "Payment" }).getAttribute("aria-expanded")) === "true", "accordion: a header opens its section");
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForFunction(() => document.querySelector(".page-echo")?.textContent === "Page 3 of 7");
    say(true, "pagination: Next raises onPageChanged");

    say(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await page.close();
  }
} catch (error) {
  console.error(error);
  failed++;
} finally {
  await browser.close();
  for (const server of servers) server.close();
}
console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
