/**
 * The BlazorHero port, end to end: upstream BlazorHero (:5350) and the built app (vite preview, :5353, through the
 * same proxy as the dev server), in a browser. Phase 1, the shell:
 *
 *   signed out, any page is the login, in the bar's layout → a submit shows the validators' messages, sends nothing
 *   → a wrong password: the API's message as a toast → the administrator: the JWT in localStorage as the original
 *   keeps it, the welcome, the frame (header, user card, the navigation by permission), the hub connected with the
 *   token, the backend's pages in a new tab → dark mode and the direction, kept across a reload → a language: the
 *   page loads again in it, the API asked in it → the logout dialog: Cancel stays, Logout leaves (the hub too) → the
 *   basic user sees only what the role allows → an unknown address: the not-found layout → axe on each layout, the
 *   dialog and the menus
 *
 * Phase 2, the catalog (`catalog`), and phase 5, the dashboard and the chat with a second user (`realTime`), run
 * between the language and the logout.
 *
 * Starts the backend when it isn't running (the first run clones and builds BlazorHero, scripts/backend.mjs), builds
 * the app, and fails on every console error.
 * Run: node scripts/verify.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as playwright from "playwright-core";
import { launchBrowser } from "../../../scripts/browsers.mjs";
import { ADMIN, BACKEND, BASIC } from "./backend.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = "http://localhost:5353";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const spawned = [];

async function reachable(url) {
  try {
    await fetch(url, { redirect: "manual", headers: { "accept-language": "en" } });
    return true;
  } catch {
    return false;
  }
}

async function waitFor(what, ready, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (!(await ready())) {
    if (Date.now() > deadline) throw new Error(`${what} did not come up within ${seconds} s`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit", shell: true });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

async function ensureServers() {
  run("npx", ["tsazor", "check"]);
  run("npx", ["vite", "build", "--logLevel", "warn"]);
  if (!(await reachable(`${BACKEND}/swagger/v1/swagger.json`))) {
    spawned.push(spawn(process.execPath, ["scripts/backend.mjs"], { cwd: ROOT, stdio: "inherit" }));
    // The first run installs the .NET 6 SDK, clones and builds BlazorHero, and seeds its database.
    await waitFor("the backend", () => reachable(`${BACKEND}/swagger/v1/swagger.json`), 1200);
  }
  if (!(await reachable(APP))) {
    spawned.push(spawn("npx", ["vite", "preview"], { cwd: ROOT, stdio: "ignore", shell: true }));
    await waitFor("the preview server", () => reachable(APP), 60);
  }
}

function stopSpawned() {
  for (const child of spawned) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: true });
  }
}

let failed = 0;
function check(condition, label) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) failed++;
}

async function axe(page, label) {
  // A theme switch fades the colours in: measured mid-transition, a colour is neither the old nor the new one.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"), null, { timeout: 5000 }).catch(() => undefined);
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async (tags) => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
    return result.violations.map((violation) => `${violation.id} (${violation.nodes.length}): ${violation.nodes[0]?.target.join(" ")}`);
  }, WCAG_TAGS);
  check(violations.length === 0, `axe: ${label}${violations.length ? ` — ${violations.join(" | ")}` : ""}`);
}

const text = (page, selector) => page.locator(selector).first().innerText();

/** The login form, filled by its own buttons as a person would. */
async function signIn(page, user) {
  await page.getByRole("button", { name: user === ADMIN ? "Fill Administrator Credentials" : "Fill Basic User Credentials" }).click();
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.getByRole("navigation").first().waitFor();
}

/** The navigation's links, by section: "" for the ones above the headings. */
function navigationOf(page) {
  return page.evaluate(() => {
    const nav = document.querySelector("nav");
    const sections = {};
    for (const part of nav.children) {
      const heading = part.getAttribute("role") === "group" ? document.getElementById(part.getAttribute("aria-labelledby")).textContent.trim() : "";
      sections[heading] = [...part.querySelectorAll("a")].map((link) => link.textContent.trim());
    }
    return sections;
  });
}

/** The API as the signed-in user: the page's token, the original's JSON. */
function api(page, method, url, body) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const token = JSON.parse(localStorage.getItem("authToken"));
      const headers = { "content-type": "application/json", authorization: `Bearer ${token}`, "accept-language": "en" };
      const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return response.json();
    },
    { method, url, body },
  );
}

/** A PNG's width and height (its IHDR chunk), from base64. */
function pngSize(base64) {
  const bytes = Buffer.from(base64, "base64");
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

/** The table pager's "first-last of total", as numbers. */
async function pagerSummary(page) {
  const text = await page.getByRole("navigation", { name: "Pages" }).innerText();
  return text.match(/(\d+)-(\d+) of (\d+)/)?.slice(1).map(Number) ?? [];
}

/**
 * Phase 2, the catalog, as the administrator. Brands: added and edited in a dialog with the validators' messages,
 * searched and sorted in the browser, exported, imported from that workbook, deleted after a confirmation.
 * Products: paged, sorted and searched on the server (a search's results page too — U9), one added with its brand
 * picked in an Autocomplete and a picture shrunk to fit 400 × 400 before the upload, edited, deleted, exported.
 * Everything the run creates carries `stamp` and is removed at the end.
 */
async function catalog(page, stamp) {
  const requests = [];
  const recordRequest = (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/v1/")) requests.push({ method: request.method(), path: url.pathname, query: url.searchParams, body: request.postData() });
  };
  page.on("request", recordRequest);
  const dialog = page.getByRole("dialog");
  const downloads = mkdtempSync(path.join(os.tmpdir(), "blazorhero-verify-"));
  const brandName = `Verify Brand ${stamp}`;

  try {
    // Brands.
    await page.getByRole("link", { name: "Brands", exact: true }).click();
    const brands = page.getByRole("table", { name: "Brands" });
    await brands.waitFor();
    check(await page.getByRole("heading", { level: 1, name: "Brands" }).isVisible(), "Brands: the page's heading (HeroTitle) is its h1");
    await axe(page, "the brands");

    await page.getByRole("button", { name: "Create" }).click();
    await dialog.getByRole("heading", { name: "Add Brand" }).waitFor();
    await dialog.getByRole("button", { name: "Save" }).click();
    await dialog.getByText("Tax must be greater than 0").waitFor();
    const brandMessages = await dialog.getByRole("alert").allInnerTexts();
    check(
      JSON.stringify(brandMessages) === JSON.stringify(["Name is required!", "Description is required!", "Tax must be greater than 0"]),
      `Save shows AddEditBrandCommandValidator's messages (${brandMessages.join(", ")})`,
    );
    await axe(page, "the brand dialog with its messages");
    await dialog.getByLabel("Name").fill(brandName);
    await dialog.getByLabel("Description").fill("Made by the verify run");
    await dialog.getByLabel("Tax").fill("7.5");
    await dialog.getByRole("button", { name: "Save" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByText("Brand Saved").first().waitFor();
    const brandRow = () => brands.locator("tbody tr").filter({ hasText: brandName });
    await brandRow().first().waitFor();
    check(true, "a valid brand is saved: the API's message as a toast, the row in the table");

    await brandRow().getByRole("button", { name: `Actions: ${brandName}` }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await dialog.getByRole("heading", { name: "Update Brand" }).waitFor();
    check(await dialog.getByLabel("Id").isDisabled(), "Edit shows the brand's id, disabled");
    await dialog.getByLabel("Description").fill("Edited by the verify run");
    await dialog.getByRole("button", { name: "Update" }).click();
    await page.getByText("Brand Updated").first().waitFor();
    await brands.locator("tbody tr").filter({ hasText: "Edited by the verify run" }).waitFor();
    check(true, "Edit updates the brand");

    const brandSearch = page.getByRole("textbox", { name: "Search for Brands" });
    await brandSearch.fill(stamp);
    await page.waitForFunction((table) => table.querySelectorAll("tbody tr").length === 1, await brands.elementHandle());
    check((await brands.locator("tbody mark").first().innerText()) === stamp, "the search filters the brands in the browser and marks the match (Highlighter)");

    const [brandExport] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
    const workbook = path.join(downloads, brandExport.suggestedFilename());
    await brandExport.saveAs(workbook);
    await page.getByText("Filtered Brands exported").first().waitFor();
    check(
      /^brands_\d{14}\.xlsx$/.test(brandExport.suggestedFilename()) && readFileSync(workbook).subarray(0, 2).toString() === "PK",
      `Export saves the filtered brands as a workbook (${brandExport.suggestedFilename()}), no JS interop`,
    );

    await page.getByRole("button", { name: "Import" }).click();
    await dialog.getByRole("heading", { name: "Import - Brands" }).waitFor();
    check(await dialog.getByRole("button", { name: "Import" }).isDisabled(), "Import waits for a workbook");
    await dialog.locator("input[type=file]").setInputFiles(workbook);
    await dialog.getByText(path.basename(workbook)).waitFor();
    await dialog.getByRole("button", { name: "Import" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction((table) => table.querySelectorAll("tbody tr").length === 2, await brands.elementHandle());
    check(true, "Import adds the workbook's brand (the export, read back by the API)");

    await brandRow().nth(1).getByRole("button", { name: `Actions: ${brandName}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await dialog.getByRole("heading", { name: "Delete Confirmation" }).waitFor();
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.getByText("Brand Deleted").first().waitFor();
    await page.waitForFunction((table) => table.querySelectorAll("tbody tr").length === 1, await brands.elementHandle());
    check(true, "Delete asks first, then removes the brand");
    await brandSearch.fill("");

    const nameHeader = brands.locator("thead th").filter({ hasText: "Name" });
    await nameHeader.getByRole("button", { name: "Name" }).click();
    const sortedOnce = await nameHeader.getAttribute("aria-sort");
    await nameHeader.getByRole("button", { name: "Name" }).click();
    check(sortedOnce === "ascending" && (await nameHeader.getAttribute("aria-sort")) === "descending", "a column sorts in the browser, then the other way (aria-sort)");

    // Products.
    const seeded = await api(page, "GET", "/api/v1/brands");
    const brandId = seeded.data.find((brand) => brand.name === brandName).id;
    for (let i = 1; i <= 24; i++) {
      await api(page, "POST", "/api/v1/products", {
        id: 0,
        name: `Verify Roll ${stamp} ${String(i).padStart(2, "0")}`,
        barcode: `V-${stamp}-${i}`,
        description: i % 2 === 0 ? "Rye" : "Wheat",
        rate: i,
        brandId,
      });
    }
    await page.getByRole("link", { name: "Products", exact: true }).click();
    const products = page.getByRole("table", { name: "Products" });
    await products.locator("tbody tr").first().waitFor();
    await axe(page, "the products");
    const productRequest = () => requests.filter((request) => request.method === "GET" && request.path === "/api/v1/products").at(-1);

    await page.getByRole("button", { name: "Create" }).click();
    await dialog.getByRole("heading", { name: "Add Product" }).waitFor();
    await dialog.getByRole("button", { name: "Save" }).click();
    await dialog.getByText("Brand is required!").waitFor();
    const productMessages = await dialog.getByRole("alert").allInnerTexts();
    check(
      ["Name is required!", "Description is required!", "Brand is required!", "Rate must be greater than 0", "Barcode is required!"].every((message) => productMessages.includes(message)),
      `Save shows AddEditProductCommandValidator's messages, the brand's at its Autocomplete (${productMessages.join(", ")})`,
    );
    check((await dialog.getByRole("combobox", { name: "Brand" }).getAttribute("aria-invalid")) === "true", "the brand's Autocomplete is invalid until a brand is picked");
    await axe(page, "the product dialog with its messages");
    const productName = `Verify Loaf ${stamp}`;
    await dialog.getByLabel("Name").fill(productName);
    await dialog.getByLabel("Description").fill("Baked by the verify run");
    await dialog.getByRole("combobox", { name: "Brand" }).fill(stamp);
    await page.getByRole("listbox").getByRole("option", { name: brandName }).click();
    await dialog.getByLabel("Rate").fill("4.5");
    await dialog.getByLabel("Barcode").fill(`V-${stamp}-loaf`);
    const picture = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 700;
      const context = canvas.getContext("2d");
      context.fillStyle = "#1565c0";
      context.fillRect(0, 0, 1000, 700);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await dialog.locator("input[type=file]").setInputFiles({ name: "loaf.png", mimeType: "image/png", buffer: Buffer.from(picture, "base64") });
    await dialog.locator("img").waitFor();
    check(!(await dialog.getByRole("combobox", { name: "Brand" }).getAttribute("aria-invalid")), "picking a brand validates the field again (the Autocomplete notifies the form)");
    await dialog.getByRole("button", { name: "Save" }).click();
    await page.getByText("Product Saved").first().waitFor();
    const saved = JSON.parse(requests.filter((request) => request.method === "POST" && request.path === "/api/v1/products").at(-1).body);
    check(saved.brandId === brandId && pngSize(saved.uploadRequest.data) === "400x280", `the product goes with its brand and the picture shrunk to fit 400 × 400 (${pngSize(saved.uploadRequest.data)}, RequestImageFileAsync)`);

    await page.waitForFunction(() => /\d+-\d+ of \d+/.test(document.querySelector("nav[aria-label=Pages]")?.textContent ?? ""));
    const [, , total] = await pagerSummary(page);
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForFunction(() => /11-20 of/.test(document.querySelector("nav[aria-label=Pages]")?.textContent ?? ""));
    check(productRequest().query.get("pageNumber") === "2" && productRequest().query.get("pageSize") === "10", `the next page comes from the server (pageNumber=2 of ${total} products)`);
    await page.getByLabel("Rows per page:").selectOption("25");
    await page.waitForFunction(() => /1-25 of/.test(document.querySelector("nav[aria-label=Pages]")?.textContent ?? ""));
    check(productRequest().query.get("pageNumber") === "1" && productRequest().query.get("pageSize") === "25", "rows per page: 25 load from the first page (TablePager)");
    await page.getByLabel("Rows per page:").selectOption("10");

    const productNameHeader = products.locator("thead th").filter({ hasText: "Name" });
    await productNameHeader.getByRole("button", { name: "Name" }).click();
    await page.waitForFunction(() => document.querySelector("table[aria-label=Products] th[aria-sort=ascending]") !== null);
    check(productRequest().query.get("orderBy") === "Name Ascending", `a template column sorts on the server by its sortKey (orderBy=${productRequest().query.get("orderBy")})`);

    const productSearch = page.getByRole("textbox", { name: "Search" });
    await productSearch.fill(stamp);
    await productSearch.press("Enter");
    await page.waitForFunction(() => /1-10 of 25/.test(document.querySelector("nav[aria-label=Pages]")?.textContent ?? ""));
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForFunction(() => /11-20 of 25/.test(document.querySelector("nav[aria-label=Pages]")?.textContent ?? ""));
    check(productRequest().query.get("searchString") === stamp && productRequest().query.get("pageNumber") === "2", "a search's results page on the server (U9: the original went back to page 1)");

    await productSearch.fill(productName);
    await productSearch.press("Enter");
    const productRow = products.locator("tbody tr").filter({ hasText: productName });
    await productRow.waitFor();
    await productRow.getByRole("button", { name: `Actions: ${productName}` }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await dialog.getByRole("heading", { name: "Update Product" }).waitFor();
    await page.waitForFunction(() => (document.querySelector("[role=dialog] img")?.naturalWidth ?? 0) > 0);
    const stored = await dialog.locator("img").evaluate((image) => ({ src: image.getAttribute("src"), width: image.naturalWidth }));
    check(/^Files[\\/]Images[\\/]Products[\\/]/.test(stored.src) && stored.width === 400, `Edit shows the stored picture, served by the API (${stored.src}, base href)`);
    check((await dialog.getByRole("combobox", { name: "Brand" }).inputValue()) === brandName && (await dialog.getByLabel("Barcode").isDisabled()), "Edit shows the product's brand by name and its barcode disabled");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "detached" });

    const [productExport] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
    await page.getByText("Filtered Products exported").first().waitFor();
    check(/^products_\d{14}\.xlsx$/.test(productExport.suggestedFilename()), `Export saves the filtered products (${productExport.suggestedFilename()})`);

    await productRow.getByRole("button", { name: `Actions: ${productName}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.getByText("Product Deleted").first().waitFor();
    check(true, "Delete removes the product after the confirmation");
  } finally {
    page.off("request", recordRequest);
    // What the run created.
    const left = await api(page, "GET", `/api/v1/products?pageNumber=1&pageSize=100&searchString=${stamp}&orderBy=`).catch(() => ({ data: [] }));
    for (const product of left.data ?? []) await api(page, "DELETE", `/api/v1/products/${product.id}`);
    const brandsLeft = await api(page, "GET", "/api/v1/brands").catch(() => ({ data: [] }));
    for (const brand of (brandsLeft.data ?? []).filter((candidate) => candidate.name === brandName)) await api(page, "DELETE", `/api/v1/brands/${brand.id}`);
    rmSync(downloads, { recursive: true, force: true });
  }
}

/** The basic role's permissions: `Permissions.Communication.Chat` granted or taken back (the API as the administrator). */
async function setBasicChat(page, selected) {
  const roles = await api(page, "GET", "/api/identity/role");
  const basic = roles.data.find((role) => role.name === "Basic");
  const permissions = await api(page, "GET", `/api/identity/role/permissions/${basic.id}`);
  const roleClaims = permissions.data.roleClaims.map((claim) => (claim.value === "Permissions.Communication.Chat" ? { ...claim, selected } : claim));
  return api(page, "PUT", "/api/identity/role/permissions/update", { roleId: basic.id, roleClaims });
}

/**
 * Phase 5, real time, as the administrator and, in a browser context of their own, the basic user. The dashboard:
 * the tiles hold the API's counts, the bar chart a series per entity and a bar per month; a brand saved in another
 * tab (its dialog sends the hub's UpdateDashboard) raises the count without a reload. The chat (the basic role gets
 * its permission for the run): who is online follows the hub (ConnectUser, the ping, DisconnectUser) with a toast; a
 * message sent with Enter appears on both sides at once; the receiver on another page gets the notification, whose
 * "Chat?" opens the conversation with the message in its history; on a narrow window the contacts are in a drawer.
 * The brand is removed at the end; the messages stay (the API deletes none).
 */
async function realTime(page, stamp) {
  const brandName = `Verify Live ${stamp}`;
  let basicContext;
  try {
    // The dashboard: the API's numbers.
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.getByRole("heading", { level: 1, name: "Dashboard" }).waitFor();
    await page.locator(".bh-tile").first().waitFor();
    const counts = (await api(page, "GET", "/api/v1/dashboard")).data;
    const tile = async (label) => Number((await page.locator(".bh-tile").filter({ hasText: label }).locator(".bh-tile__value").innerText()).trim());
    const expected = { Products: counts.productCount, Brands: counts.brandCount, "Registered Users": counts.userCount, "Registered Roles": counts.roleCount, "Document Types": counts.documentTypeCount };
    const shown = {};
    for (const label of Object.keys(expected)) shown[label] = await tile(label);
    check(JSON.stringify(shown) === JSON.stringify(expected), `the tiles show the API's counts (${Object.entries(shown).map(([label, count]) => `${label} ${count}`).join(", ")})`);
    const chart = page.locator(".bh-dashboard__chart");
    check(await chart.getByRole("img", { name: "Quick Insights." }).isVisible(), "the bar chart is an image named by its aria-label");
    const legend = await chart.locator(".tz-chart__legend").innerText().catch(() => "");
    check(
      (await chart.locator(".tz-chart__bar").count()) === counts.dataEnterBarChart.length * 12 && counts.dataEnterBarChart.every((series) => legend.includes(series.name)),
      `the bar chart: a bar per month for each of the ${counts.dataEnterBarChart.length} series, named in the legend`,
    );
    await axe(page, "the dashboard");

    // UpdateDashboard: a brand saved in another tab raises the count here, without a reload.
    const other = await page.context().newPage();
    await other.goto(`${APP}/catalog/brands`);
    await other.getByRole("table", { name: "Brands" }).waitFor();
    await other.getByRole("button", { name: "Create" }).click();
    const otherDialog = other.getByRole("dialog");
    await otherDialog.getByLabel("Name").fill(brandName);
    await otherDialog.getByLabel("Description").fill("Made by the verify run");
    await otherDialog.getByLabel("Tax").fill("5");
    await otherDialog.getByRole("button", { name: "Save" }).click();
    await otherDialog.waitFor({ state: "detached" });
    await page.waitForFunction((count) => [...document.querySelectorAll(".bh-tile")].find((tile) => tile.textContent.includes("Brands"))?.querySelector(".bh-tile__value")?.textContent.trim() === String(count), counts.brandCount + 1, { timeout: 10_000 }).catch(() => undefined);
    check((await tile("Brands")) === counts.brandCount + 1, `a brand saved in another tab raises the dashboard's count at once (UpdateDashboard: ${counts.brandCount} → ${await tile("Brands")})`);
    await other.close();

    // The chat. The basic user signs in now, so the token carries the permission.
    check((await setBasicChat(page, true)).succeeded === true, "the basic role gets the chat's permission for the run");
    const users = (await api(page, "GET", "/api/identity/user")).data;
    const admin = users.find((user) => user.email === ADMIN.email);
    const basic = users.find((user) => user.email === BASIC.email);
    await page.getByRole("link", { name: "Chat" }).click();
    await page.getByRole("heading", { level: 1, name: "chat" }).waitFor();
    const contact = page.locator(".bh-chat__contacts").getByRole("button", { name: /John Doe/ });
    await contact.waitFor();
    const presence = () => contact.locator(".bh-presence").getAttribute("class");
    check((await presence()).includes("danger"), "the contacts: the basic user, offline (the red dot)");

    basicContext = await page.context().browser().newContext({ viewport: { width: 1400, height: 900 } });
    const john = await basicContext.newPage();
    john.on("pageerror", (error) => check(false, `the basic user's page: ${error.message}`));
    await john.goto(`${APP}/login`);
    await signIn(john, BASIC);
    await page.getByText("johndoe Logged In.").first().waitFor();
    check((await presence()).includes("success"), "the basic user signs in: online at once (ConnectUser), with a toast");

    await contact.click();
    await page.waitForURL(`${APP}/chat/${basic.id}`);
    await page.getByRole("heading", { level: 1, name: "John Doe" }).waitFor();
    check(true, "a contact opens the conversation at its address (chat/{id})");
    await axe(page, "the chat");

    await john.goto(`${APP}/chat/${admin.id}`);
    await john.getByRole("heading", { level: 1, name: "Mukesh Murugan" }).waitFor();
    // The page pinged at its start: the administrator, whose shell answered, is online.
    await john.waitForFunction(() => document.querySelector(".bh-chat__contacts .bh-presence")?.classList.contains("fui-indicator--success"), null, { timeout: 5000 }).catch(() => undefined);
    check(await john.locator(".bh-chat__contacts .bh-presence.fui-indicator--success").count() === 1, "a page opened at its address pings: the administrator shows online (PingRequest, PingResponse)");
    const message = `Hello from the verify run ${stamp}`;
    const input = john.getByRole("textbox", { name: "Enter your message..." });
    await input.click();
    await input.pressSequentially(message);
    await input.press("Enter");
    await page.getByRole("log").getByText(message).waitFor({ timeout: 10_000 });
    await john.getByRole("log").getByText(message).waitFor();
    check((await input.inputValue()) === "", "Enter sends: the message on both sides at once, the field empty (U12)");

    // The receiver elsewhere: the notification, and its action opens the conversation.
    await page.getByRole("link", { name: "Home" }).click();
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await input.fill(`${message} again`);
    await john.getByRole("button", { name: "Send" }).click();
    const notification = page.getByText("New Message From John Doe");
    await notification.waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "Chat?" }).click();
    await page.waitForURL(`${APP}/chat/${basic.id}`);
    await page.getByRole("log").getByText(`${message} again`).waitFor();
    check(true, "the receiver on another page gets the notification; Chat? opens the conversation, the message in its history");

    // The contacts in a drawer on a narrow window.
    await page.setViewportSize({ width: 800, height: 900 });
    check(!(await page.locator(".bh-chat__contacts").isVisible()), "on a narrow window the contacts leave the page");
    await page.getByRole("button", { name: "contacts" }).click();
    const drawer = page.getByRole("dialog", { name: "contacts" });
    await drawer.getByRole("button", { name: /John Doe/ }).waitFor();
    check(true, "and open in a drawer");
    await axe(page, "the chat's drawer");
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "detached" });
    await page.setViewportSize({ width: 1400, height: 900 });

    // The basic user signs out: offline, with a toast.
    await john.getByRole("button", { name: /^Account:/ }).click();
    await john.getByRole("menuitem", { name: "Logout" }).click();
    await john.getByRole("dialog", { name: "Logout Confirmation" }).getByRole("button", { name: "Logout" }).click();
    await page.getByText("johndoe Logged Out.").first().waitFor({ timeout: 10_000 });
    check((await presence()).includes("danger"), "the basic user signs out: offline at once (DisconnectUser), with a toast");
  } finally {
    await basicContext?.close();
    await setBasicChat(page, false).catch(() => undefined);
    const brandsLeft = await api(page, "GET", "/api/v1/brands").catch(() => ({ data: [] }));
    for (const brand of (brandsLeft.data ?? []).filter((candidate) => candidate.name === brandName)) await api(page, "DELETE", `/api/v1/brands/${brand.id}`);
  }
}

let browser;
try {
  await ensureServers();
  browser = await launchBrowser(playwright);
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  const languages = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) languages.push(request.headers()["accept-language"]);
  });
  const hubFrames = [];
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/signalRHub")) return;
    hubFrames.push({ url: socket.url(), sent: [], received: [] });
    const frames = hubFrames.at(-1);
    socket.on("framesent", (frame) => frames.sent.push(String(frame.payload)));
    socket.on("framereceived", (frame) => frames.received.push(String(frame.payload)));
  });

  // Signed out: every page is the login, at its own address.
  await page.goto(`${APP}/home`);
  await page.getByRole("heading", { name: "Sign In" }).waitFor();
  check(new URL(page.url()).pathname === "/home", "signed out, a page shows the login at its own address (AuthorizeRouteView's NotAuthorized)");
  check(await page.getByRole("banner").getByRole("button", { name: "Toggle Dark Mode" }).isVisible(), "the signed-out bar has the dark-mode toggle and the language menu");
  await axe(page, "the login");

  // The app's own dark mode decides, not the OS's: under a dark OS the page stays light until the user switches.
  const osDark = await browser.newPage({ colorScheme: "dark" });
  await osDark.goto(`${APP}/login`);
  await osDark.getByRole("heading", { name: "Sign In" }).waitFor();
  const osDarkBackground = await osDark.evaluate(() => getComputedStyle(document.querySelector("main").parentElement).backgroundColor);
  const lightBackground = await page.evaluate(() => getComputedStyle(document.querySelector("main").parentElement).backgroundColor);
  check(osDarkBackground === lightBackground, `a dark OS leaves the light theme as it is (${osDarkBackground})`);
  await osDark.close();

  // The form: a submit shows TokenRequestValidator's messages and sends nothing.
  const signInButton = page.getByRole("button", { name: "Sign In" });
  const apiRequests = languages.length; // one entry per API request
  await page.getByLabel("E-mail").fill("mukesh");
  await signInButton.click();
  await page.getByText("Email is not correct").waitFor();
  const alerts = await page.getByRole("alert").allInnerTexts();
  check(alerts.includes("Email is not correct") && alerts.includes("Password is required!"), `a submit shows the validators' messages (${alerts.join(", ")})`);
  check(languages.length === apiRequests, "an invalid form sends nothing");
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Show password" }).click();
  check((await page.getByLabel("Password", { exact: true }).getAttribute("type")) === "text", "the eye shows the password");
  await signInButton.click();
  await page.getByText("Invalid Credentials.").waitFor();
  check(true, "a wrong password shows the API's message as a toast");
  check(await page.evaluate(() => localStorage.getItem("authToken") === null), "a failed sign-in stores no token");

  // The administrator.
  await page.goto(`${APP}/`);
  await signIn(page, ADMIN);
  await page.getByText(/Welcome Mukesh/).waitFor();
  check(true, "signed in: the welcome toast");
  // Blazored.LocalStorage writes a string as JSON: the original's keys and values, read the same way.
  const stored = await page.evaluate(() => ({ token: JSON.parse(localStorage.getItem("authToken")), refresh: JSON.parse(localStorage.getItem("refreshToken")) }));
  check(stored.token?.split(".").length === 3 && Boolean(stored.refresh), "the JWT and the refresh token are in localStorage, as the original keeps them");
  check((await text(page, "main h1")).startsWith("Blazor Hero"), "the home page renders in the frame");
  check(await page.getByText(ADMIN.email).isVisible(), "the user card shows the signed-in user");
  const adminNav = await navigationOf(page);
  check(
    JSON.stringify(Object.keys(adminNav)) === JSON.stringify(["", "Personal", "Document Management", "Administrator", "Communication", "Catalog Management"]) &&
      adminNav[""].includes("Hangfire") && adminNav.Administrator.includes("Users") && adminNav.Administrator.includes("Roles"),
    `the administrator sees every section (${Object.keys(adminNav).filter(Boolean).join(", ")})`,
  );
  const targets = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("nav a")].map((link) => [link.textContent.trim(), link.getAttribute("target")])));
  check(targets.Hangfire === "_blank" && targets.Swagger === "_blank" && targets["Quick Start Guide"] === "_blank" && targets.Home === null, "Hangfire, the guide and Swagger open in a new tab");
  const [swagger] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: "Swagger" }).click()]);
  await swagger.waitForLoadState();
  check((await swagger.title()) === "Swagger UI", "Swagger opens from the backend, past the app's routing");
  await swagger.close();
  check(new URL(page.url()).pathname === "/", "the app stays where it was");

  // The hub: connected with the token in the query string, as the original's connection is.
  await page.waitForTimeout(500);
  const hub = hubFrames.at(-1);
  check(hub !== undefined && new URL(hub.url).searchParams.get("access_token") === stored.token, "the hub connects over WebSockets with the token (access_token)");
  check(hub?.sent.some((frame) => frame.includes("\"OnConnectAsync\"")) === true, "the client tells the hub it is connected (OnConnectAsync)");
  await axe(page, "the signed-in frame");

  // The account menu and the support menu: menus in the header.
  await page.getByRole("button", { name: /^Account:/ }).click();
  check((await page.getByRole("menuitem").allInnerTexts()).join("|") === "Account|Logout", "the avatar opens the account menu");
  await axe(page, "the account menu");
  await page.keyboard.press("Escape");

  // Dark mode and the direction: kept in the preferences, so a reload keeps them.
  await page.getByRole("button", { name: "Toggle Dark Mode" }).click();
  await page.getByRole("button", { name: "Toggle right-to-left/left-to-right" }).click();
  const theme = () => page.evaluate(() => {
    const root = document.querySelector("body [data-fluent-theme]");
    return { theme: root.getAttribute("data-fluent-theme"), dir: root.getAttribute("dir") };
  });
  check(JSON.stringify(await theme()) === JSON.stringify({ theme: "dark", dir: "rtl" }), "dark mode and right-to-left switch the theme root");
  await axe(page, "the dark theme");
  await page.reload();
  await page.getByRole("navigation").first().waitFor();
  check(JSON.stringify(await theme()) === JSON.stringify({ theme: "dark", dir: "rtl" }), "both survive a reload (clientPreference)");
  await page.getByRole("button", { name: "Toggle Dark Mode" }).click();
  await page.getByRole("button", { name: "Toggle right-to-left/left-to-right" }).click();
  check(JSON.stringify(await theme()) === JSON.stringify({ theme: "light", dir: "ltr" }), "and switch back");

  // A language: the page loads again in it, and the API is asked in it.
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("menuitem", { name: "German" }).click();
  await page.getByRole("group", { name: "Persönlich" }).waitFor();
  languages.length = 0;
  await page.reload();
  await page.getByRole("group", { name: "Persönlich" }).waitFor();
  check(true, "German: the navigation's headings in German, after a reload too");
  check(languages.length > 0 && languages.every((language) => language === "de"), `the API is asked in German (Accept-Language: ${[...new Set(languages)].join(", ")})`);
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("menuitem", { name: "Englisch" }).click();
  await page.getByRole("group", { name: "Personal" }).waitFor();

  // Phase 2: the catalog.
  await catalog(page, Date.now().toString(36));

  // Phase 5: the dashboard and the chat.
  await realTime(page, Date.now().toString(36));

  // The logout dialog: Cancel stays, Logout leaves.
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  const dialog = page.getByRole("dialog", { name: "Logout Confirmation" });
  await dialog.waitFor();
  check((await dialog.innerText()).includes("Do you really want to Logout?"), "Logout asks first (DialogService.Show<Logout>)");
  await axe(page, "the logout dialog");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.waitFor({ state: "detached" });
  check(await page.evaluate(() => localStorage.getItem("authToken") !== null), "Cancel keeps the user signed in");
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await dialog.getByRole("button", { name: "Logout" }).click();
  // Signed out, the page shows the login at once; the address follows when the navigation to /login completes.
  await page.waitForURL(`${APP}/login`, { timeout: 5000 }).catch(() => undefined);
  await page.getByRole("heading", { name: "Sign In" }).waitFor();
  check(new URL(page.url()).pathname === "/login", `Logout leaves for the login (${new URL(page.url()).pathname})`);
  check(await page.evaluate(() => localStorage.getItem("authToken") === null && localStorage.getItem("refreshToken") === null), "the tokens are gone");
  check(hubFrames.at(-1)?.sent.some((frame) => frame.includes("\"OnDisconnectAsync\"")) === true, "the client leaves the hub (OnDisconnectAsync)");

  // The basic user: the role grants no permissions, so the menu shows what needs none.
  await signIn(page, BASIC);
  const basicNav = await navigationOf(page);
  check(!basicNav[""].includes("Hangfire") && !("Administrator" in basicNav) && !("Catalog Management" in basicNav), `the basic user sees no permission's pages (${Object.entries(basicNav).map(([heading, links]) => `${heading || "top"}: ${links.join(", ")}`).join("; ")})`);
  // A page the policy closes (@authorize({ policy })): NotAuthorized is the login, which sends a signed-in user home.
  await page.goto(`${APP}/catalog/products`);
  await page.waitForURL(`${APP}/`, { timeout: 10_000 }).catch(() => undefined);
  check(new URL(page.url()).pathname === "/" && (await page.getByRole("table", { name: "Products" }).count()) === 0, "the basic user can't open the products: the policy sends them home");

  // An address no page has: the not-found layout.
  await page.goto(`${APP}/no/such/page`);
  await page.getByRole("heading", { name: "The page you were looking for doesn't exist." }).waitFor();
  check(true, "an unknown address shows the not-found layout");
  await axe(page, "the not-found layout");

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
} catch (error) {
  console.error(error);
  failed++;
} finally {
  await browser?.close();
  stopSpawned();
}
console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
