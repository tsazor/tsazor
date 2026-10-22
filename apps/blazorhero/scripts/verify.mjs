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
 * Phase 2, the catalog (`catalog`), phase 4, the documents (`documents`), phase 5, the dashboard and the chat with a
 * second user (`realTime`), phase 3, identity — users, roles, permissions, the account, a password reset, the sign-up
 * (`identity`) —, and phase 6, the languages (`inEveryLanguage`), run between the language and the logout.
 *
 * Starts the backend when it isn't running (the first run clones and builds BlazorHero, scripts/backend.mjs), builds
 * the app, and fails on every console error.
 * Run: node scripts/verify.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as playwright from "playwright-core";
import { launchBrowser } from "../../../scripts/browsers.mjs";
import { ADMIN, BACKEND, BASIC, DATABASE, SQL_SERVER } from "./backend.mjs";

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

/**
 * Phase 4, documents and audit, as the administrator. A document type added in its dialog after the validators'
 * messages; a document of that type, picked in an Autocomplete, with a file uploaded; its Download a link entry
 * (B40); its extended attributes, the generic abstract page (B38): a text and a Decimal attribute in two groups, a
 * tab per group with its "active/all" badge, the group's tab gone with its last attribute (B41); the audit trails of
 * all that, with a trail's details. What the run creates carries `stamp` and is removed at the end.
 */
async function documents(page, stamp) {
  const dialog = page.getByRole("dialog");
  const typeName = `Verify Type ${stamp}`;
  const title = `Verify Doc ${stamp}`;
  const downloads = mkdtempSync(path.join(os.tmpdir(), "blazorhero-verify-documents-"));
  try {
    // Document types.
    await page.getByRole("link", { name: "Document Types" }).click();
    await page.getByRole("table", { name: "Document Types" }).waitFor();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await dialog.getByRole("heading", { name: "Add Document Type" }).waitFor();
    await dialog.getByRole("button", { name: "Save" }).click();
    await dialog.getByText("Description is required!").waitFor();
    check(JSON.stringify(await dialog.getByRole("alert").allInnerTexts()) === JSON.stringify(["Name is required!", "Description is required!"]), "Document types: Save shows AddEditDocumentTypeCommandValidator's messages");
    await dialog.getByLabel("Name").fill(typeName);
    await dialog.getByLabel("Description").fill("Made by the verify run");
    await dialog.getByRole("button", { name: "Save" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("table", { name: "Document Types" }).getByText(typeName).waitFor();
    check(true, "a document type is saved and listed");
    await axe(page, "the document types");

    // The document store: a document with a file.
    await page.getByRole("link", { name: "Document Store" }).click();
    const store = page.getByRole("table", { name: "Document Store" });
    await store.waitFor();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await dialog.getByRole("heading", { name: "Add Document" }).waitFor();
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Description").fill("Uploaded by the verify run");
    await dialog.getByRole("combobox", { name: "Document Type" }).fill(stamp);
    await page.getByRole("listbox").getByRole("option", { name: typeName }).click();
    const file = path.join(downloads, "notes.txt");
    writeFileSync(file, `notes of ${stamp}`);
    await dialog.locator("input[type=file]").setInputFiles(file);
    await dialog.getByText("notes.txt").waitFor();
    await axe(page, "the document dialog");
    await dialog.getByRole("button", { name: "Save" }).click();
    await dialog.waitFor({ state: "detached" });
    const row = store.locator("tbody tr").filter({ hasText: title });
    await row.waitFor();
    check((await row.innerText()).includes(typeName), "a document is saved with its file and its type");
    await row.getByRole("button", { name: `Actions: ${title}` }).click();
    const link = await page.getByRole("menuitem", { name: "Download" }).evaluate((element) => ({ tag: element.tagName, href: element.getAttribute("href"), target: element.getAttribute("target") }));
    check(link.tag === "A" && Boolean(link.href) && link.target === "_blank", `its Download is a link entry to the stored file (${link.tag} ${link.href?.slice(0, 30)})`);
    await page.getByRole("menuitem", { name: "Manage Extended Attributes" }).click();

    // Its extended attributes: the abstract generic page.
    await page.waitForURL(/\/extended-attributes\/Document\/\d+$/);
    await page.getByRole("heading", { level: 1, name: "Manage Document Extended Attributes" }).waitFor();
    // The heading shows before the attributes have come (a cold backend is slow): wait for the tab.
    await page.getByRole("tab").first().waitFor();
    const tabs = async () => (await page.getByRole("tab").allInnerTexts()).map((text) => text.replace(/\s+/g, " ").trim());
    check(JSON.stringify(await tabs()) === JSON.stringify(["All Groups 0/0"]), `the extended attributes: the generic base's page, one tab (${(await tabs()).join(", ")})`);
    const add = async (fill) => {
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await dialog.getByRole("heading", { name: "Add Extended Attribute" }).waitFor();
      await fill();
      await dialog.getByRole("button", { name: "Save" }).click();
      await dialog.waitFor({ state: "detached" });
    };
    await add(async () => {
      await dialog.getByLabel("Key").fill("color");
      await dialog.getByLabel("Text").fill("blue");
      await dialog.getByLabel("Group").fill("Looks");
    });
    await add(async () => {
      await dialog.getByLabel("Type").selectOption("Decimal");
      await dialog.getByLabel("Key").fill("price");
      // The DecimalInput (B42): "12,50" is no number in en-US — the text stays, the field says so, nothing is saved.
      const decimal = dialog.getByLabel("Decimal");
      await decimal.fill("12,50");
      await dialog.getByLabel("Group").fill("Money");
      await dialog.getByRole("button", { name: "Save" }).click();
      await dialog.getByText("The Decimal field must be a number.").waitFor();
      check((await decimal.inputValue()) === "12,50" && (await decimal.getAttribute("inputmode")) === "decimal", "a Decimal in a DecimalInput (B42): text that is no number stays, with the parsing message, and the form doesn't submit");
      await decimal.fill("12.50");
      await decimal.press("Tab");
      await dialog.getByText("The Decimal field must be a number.").waitFor({ state: "detached" });
      await dialog.getByLabel("Is Active").uncheck();
    });
    await page.getByRole("tab", { name: /Money/ }).waitFor();
    check(JSON.stringify(await tabs()) === JSON.stringify(["All Groups 1/2", "Looks 1/1", "Money 0/1"]), `a tab per group with its active/all badge (${(await tabs()).join(", ")})`);
    const values = (await page.locator("tbody tr").allInnerTexts()).map((text) => text.replace(/\s+/g, " "));
    check(values.some((text) => text.includes("Text color blue")) && values.some((text) => text.includes("Decimal price 12.5")), "a text and a Decimal attribute, each value by its type");
    await axe(page, "the extended attributes");
    await page.locator("tbody tr").filter({ hasText: "price" }).getByRole("button", { name: "Actions: price" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll("[role=tab]")].some((tab) => tab.textContent.includes("Money")), null, { timeout: 10_000 }).catch(() => undefined);
    check(JSON.stringify(await tabs()) === JSON.stringify(["All Groups 1/1", "Looks 1/1"]), `the group's tab goes with its last attribute (${(await tabs()).join(", ")})`);

    // The audit trails of all that.
    await page.getByRole("link", { name: "Audit Trails" }).click();
    await page.getByRole("table", { name: "Audit Trails" }).waitFor();
    await page.getByRole("textbox", { name: "Search for Trails" }).fill("DocumentExtendedAttribute");
    await page.getByRole("button", { name: "Show Trail Details" }).first().click();
    const details = page.locator(".bh-audit-details");
    await details.getByText("Details for Trail ID").waitFor();
    check((await details.innerText()).includes("Primary Key"), "the audit trails: searched by table name, a trail's details");
    await axe(page, "the audit trails with a trail's details");
  } finally {
    rmSync(downloads, { recursive: true, force: true });
    const found = await api(page, "GET", `/api/documents?pageNumber=1&pageSize=50&searchString=${stamp}`).catch(() => ({ data: [] }));
    for (const document of found.data ?? []) {
      const attributes = await api(page, "GET", `/api/DocumentExtendedAttributes/by-entity/${document.id}`).catch(() => ({ data: [] }));
      for (const attribute of attributes.data ?? []) await api(page, "DELETE", `/api/DocumentExtendedAttributes/${attribute.id}`);
      await api(page, "DELETE", `/api/documents/${document.id}`);
    }
    const types = await api(page, "GET", "/api/documentTypes").catch(() => ({ data: [] }));
    for (const type of (types.data ?? []).filter((candidate) => candidate.name === typeName)) await api(page, "DELETE", `/api/documentTypes/${type.id}`);
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

    // The receiver elsewhere: the notification, and its action opens the conversation. Every message notifies, as in
    // the original — the first one's toast (10 s) goes first, or the two would be told apart only by their order.
    await page.getByText("New Message From John Doe").first().waitFor({ state: "detached", timeout: 15_000 });
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

/** The reset link's token, from the job Hangfire stored for the mail (the backend sends none: backend.mjs). */
function resetToken(email) {
  const query = `SET NOCOUNT ON; SELECT TOP 1 Arguments FROM HangFire.Job WHERE Arguments LIKE '%reset-password%' AND Arguments LIKE '%${email}%' ORDER BY Id DESC`;
  const result = spawnSync("sqlcmd", ["-S", SQL_SERVER, "-d", DATABASE, "-y", "0", "-Q", query], { encoding: "utf8" });
  return /Token=([A-Za-z0-9_-]+)/.exec(result.stdout)?.[1] ?? "";
}

/** A PNG of the given size, drawn in the page. */
function drawPicture(page, width, height) {
  return page.evaluate(({ width, height }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ff4081";
    context.fillRect(0, 0, width, height);
    return canvas.toDataURL("image/png").split(",")[1];
  }, { width, height });
}

/** The login form, filled with a user's own address and password. */
async function signInAs(page, email, password) {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

async function waitForRows(table, count) {
  await table.page().waitForFunction(({ table, count }) => table.querySelectorAll("tbody tr").length === count, { table: await table.elementHandle(), count });
}

/**
 * Phase 3, identity, as the administrator and a user the run registers. Users: the list with its read-only boxes,
 * searched and exported (the API answers the workbook as text); a user registered in the dialog after the
 * validators' messages; the profile's activation. Roles: one created and edited in the dialog, its permissions
 * ticked and commented (a row's edit) in the groups' tabs with their badges, saved — every client renews its token
 * —, given to the user on the user roles page, and refused for deletion while the user has it. The user: signs in
 * with the role's page in the menu, then the account — the picture shrunk and uploaded, then deleted, the details
 * (they sign out), the password; signed out, the password forgotten and reset by the mail's link (the token from
 * Hangfire's job) and the sign-up, which leaves the new user inactive. The run's role is deleted at the end; the
 * API deletes no users, so the two users stay (named by the run's stamp).
 */
async function identity(page, stamp) {
  const dialog = page.getByRole("dialog");
  const downloads = mkdtempSync(path.join(os.tmpdir(), "blazorhero-verify-"));
  const userName = `verify${stamp}`;
  const email = `vera.${stamp}@tsazor.test`;
  const lastName = `Fy${stamp}`;
  const fullName = `Vera ${lastName}`;
  const roleName = `Verify Role ${stamp}`;
  // Capital, lowercase, digit, eight or more: RegisterRequestValidator's rules.
  const passwords = [`Verify${stamp}1`, `Verify${stamp}2`, `Verify${stamp}3`];
  let userContext;
  let roleId;
  let userId;

  try {
    // Users.
    await page.getByRole("link", { name: "Users", exact: true }).click();
    const users = page.getByRole("table", { name: "Users" });
    await users.locator("tbody tr").first().waitFor();
    check(await page.getByRole("heading", { level: 1, name: "Users" }).isVisible(), "Users: the page's heading (HeroTitle) is its h1");
    const confirmed = users.getByRole("checkbox", { name: "Email Confirmation: johndoe" });
    await confirmed.click();
    check(
      (await confirmed.getAttribute("aria-readonly")) === "true" && (await confirmed.isChecked()) && !(await confirmed.isDisabled()),
      "the flags are read-only boxes: not disabled, aria-readonly, a click changes nothing (MudCheckBox ReadOnly, B48)",
    );
    await axe(page, "the users");

    await page.getByRole("button", { name: "Register New User" }).click();
    await dialog.getByRole("heading", { name: "Register User" }).waitFor();
    await dialog.getByRole("button", { name: "Register" }).click();
    await dialog.getByText("UserName is required").waitFor();
    const registerMessages = await dialog.getByRole("alert").allInnerTexts();
    check(
      JSON.stringify(registerMessages) === JSON.stringify(["UserName is required", "First Name is required", "Last Name is required", "Email is required", "Password is required!", "Password Confirmation is required!"]),
      `Register shows RegisterRequestValidator's messages (${registerMessages.join(", ")})`,
    );
    await axe(page, "the register dialog with its messages");
    await dialog.getByLabel("User Name").fill(userName);
    await dialog.getByLabel("First Name").fill("Vera");
    await dialog.getByLabel("Last Name").fill(lastName);
    await dialog.getByLabel("Email", { exact: true }).fill(email);
    await dialog.getByLabel("Password", { exact: true }).fill("short");
    await dialog.getByLabel("Confirm Password").fill("other");
    await dialog.getByRole("button", { name: "Register" }).click();
    await dialog.getByText("Password must be at least of length 8").waitFor();
    check(await dialog.getByText("Passwords don't match").isVisible(), "the password's rules and the confirmation's (Equal) speak too");
    await dialog.getByLabel("Password", { exact: true }).fill(passwords[0]);
    await dialog.getByLabel("Confirm Password").fill(passwords[0]);
    // The confirmation's message goes on its change (its blur): commit it first, or the boxes below move under the click.
    await dialog.getByLabel("Confirm Password").press("Tab");
    await dialog.getByText("Passwords don't match").waitFor({ state: "detached" });
    await dialog.getByLabel("Activate User?").check();
    await dialog.getByLabel("Auto Confirm Email?").check();
    await dialog.getByRole("button", { name: "Register" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByText(`User ${userName} Registered.`).first().waitFor();
    const userSearch = page.getByRole("textbox", { name: "Search For Users" });
    await userSearch.fill(stamp);
    await waitForRows(users, 1);
    const userRow = users.locator("tbody tr").first();
    check(
      (await userRow.innerText()).includes(email) && (await userRow.getByRole("checkbox", { name: `Active: ${userName}` }).isChecked()),
      "a registered user: the API's message as a toast, the user in the reloaded list, active and confirmed",
    );
    userId = (await api(page, "GET", "/api/identity/user")).data.find((user) => user.email === email).id;

    const [usersExport] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
    const workbook = path.join(downloads, usersExport.suggestedFilename());
    await usersExport.saveAs(workbook);
    await page.getByText("Filtered Users exported").first().waitFor();
    check(
      /^users_\d{14}\.xlsx$/.test(usersExport.suggestedFilename()) && readFileSync(workbook).subarray(0, 2).toString() === "PK",
      `Export saves the filtered users as a workbook — the API answers it as text (getString, B49: ${usersExport.suggestedFilename()})`,
    );

    await userRow.getByRole("button", { name: `Actions: ${userName}` }).click();
    await page.getByRole("menuitem", { name: "View Profile" }).click();
    await page.getByRole("heading", { level: 1, name: `${fullName}'s Profile` }).waitFor();
    const profileName = page.getByLabel("First Name");
    check(
      (await profileName.inputValue()) === "Vera" && (await profileName.evaluate((input) => input.readOnly && !input.disabled)) && (await page.getByText("This is an Administrator Only View.").isVisible()),
      "View Profile: the user's fields read-only (MudField, B48), the administrator's card (AuthorizeView Roles)",
    );
    await axe(page, "a user's profile");
    await page.getByLabel("Active?").uncheck();
    await page.getByRole("button", { name: "Save Changes" }).click();
    await page.getByText("Updated User Status.").first().waitFor();
    await page.waitForURL(`${APP}/identity/users`);
    await users.locator("tbody tr").first().waitFor();
    await userSearch.fill(stamp);
    await waitForRows(users, 1);
    check(!(await users.getByRole("checkbox", { name: `Active: ${userName}` }).isChecked()), "Save Changes deactivates the user (ToggleUserStatus) and goes back to the users");
    await api(page, "POST", "/api/identity/user/toggle-status", { activateUser: true, userId });

    await userSearch.fill("mukesh@");
    await waitForRows(users, 1);
    await users.getByRole("button", { name: "Actions: mukesh" }).click();
    await page.getByRole("menuitem", { name: "Manage Roles" }).click();
    await page.getByText("Not Allowed.").first().waitFor();
    check(new URL(page.url()).pathname === "/identity/users", "the seeded administrator's roles are not to be managed: a toast, the page stays");

    // Roles.
    await page.getByRole("link", { name: "Roles", exact: true }).click();
    const roles = page.getByRole("table", { name: "Roles" });
    await roles.locator("tbody tr").first().waitFor();
    await axe(page, "the roles");
    await page.getByRole("button", { name: "Create" }).click();
    await dialog.getByRole("heading", { name: "Add Role" }).waitFor();
    check((await dialog.getByLabel("Role ID").isDisabled()) && (await dialog.getByLabel("Role ID").inputValue()) === "", "Create: the role's id, empty and disabled");
    await dialog.getByRole("button", { name: "Save Role" }).click();
    await dialog.getByText("Name is required").waitFor();
    check(true, "Save Role shows RoleRequestValidator's message");
    await dialog.getByLabel("Role Name").fill(roleName);
    await dialog.getByLabel("Description").fill("Made by the verify run");
    await dialog.getByRole("button", { name: "Save Role" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByText(`Role ${roleName} Created.`).first().waitFor();
    const roleSearch = page.getByRole("textbox", { name: "Search for Roles..." });
    await roleSearch.fill(stamp);
    await waitForRows(roles, 1);
    check(true, "a new role: the API's message, the role in the list");
    await roles.getByRole("button", { name: `Actions: ${roleName}` }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await dialog.getByRole("heading", { name: "Update Role" }).waitFor();
    roleId = await dialog.getByLabel("Role ID").inputValue();
    await dialog.getByLabel("Description").fill("Edited by the verify run");
    await dialog.getByRole("button", { name: "Update Role" }).click();
    await page.getByText(`Role ${roleName} Updated.`).first().waitFor();
    await roles.locator("tbody tr").filter({ hasText: "Edited by the verify run" }).waitFor();
    check(roleId !== "", "Edit shows the role's id and updates the role");

    // The role's permissions.
    await roles.getByRole("button", { name: `Actions: ${roleName}` }).click();
    await page.getByRole("menuitem", { name: "Manage Permission" }).click();
    await page.getByRole("heading", { level: 1, name: "Manage Permission" }).waitFor();
    await page.getByText(`Manage ${roleId} ${roleName}'s Permissions`).waitFor();
    const claims = (await api(page, "GET", `/api/identity/role/permissions/${roleId}`)).data.roleClaims;
    const group = claims.find((claim) => claim.value === "Permissions.Products.View").group;
    const inGroup = claims.filter((claim) => claim.group === group).length;
    const allTab = page.getByRole("tab").first();
    const groupTab = page.getByRole("tab", { name: new RegExp(`^${group}\\b`) });
    check(
      (await allTab.innerText()).replace(/\s+/g, " ").trim() === `All Permissions 0/${claims.length}` && (await groupTab.innerText()).includes(`0/${inGroup}`),
      `the tabs: All Permissions first, a tab per group, each with its badge "selected/all" (${(await allTab.innerText()).replace(/\s+/g, " ").trim()})`,
    );
    await groupTab.click();
    const grid = page.getByRole("table", { name: group });
    await grid.getByRole("checkbox", { name: "Status: Permissions.Products.View" }).check();
    check((await groupTab.innerText()).includes(`1/${inGroup}`) && (await allTab.innerText()).includes(`1/${claims.length}`), "a ticked permission counts in its group's badge and in All Permissions' (the claims are shared)");
    await grid.getByRole("button", { name: "Edit: Permissions.Products.View" }).click();
    const comment = grid.getByRole("textbox", { name: "Description: Permissions.Products.View" });
    await comment.waitFor();
    check(await grid.getByText("Here you can leave a comment for this permission for the current role").isVisible(), "a row's edit (RowEditingTemplate) opens the comment of a selected permission");
    await axe(page, "the role's permissions, a row in its edit");
    await comment.fill(`Verify comment ${stamp}`);
    await grid.getByRole("button", { name: "Apply: Permissions.Products.View" }).click();
    await grid.getByText(`Verify comment ${stamp}`).waitFor();
    check((await comment.count()) === 0, "Apply ends the edit: the comment in the row");
    await grid.getByRole("button", { name: "Edit: Permissions.Products.Create" }).click();
    check(
      (await grid.getByRole("textbox", { name: "Description: Permissions.Products.Create" }).isDisabled()) && (await grid.getByText("Will be saved only when selected Permission").isVisible()),
      "an unselected permission's comment is disabled, and says why",
    );
    await grid.getByRole("button", { name: "Apply: Permissions.Products.Create" }).click();
    await page.getByRole("button", { name: "Update Role Permissions" }).click();
    await page.getByText("Permissions Updated.").first().waitFor();
    await page.waitForURL(`${APP}/identity/roles`);
    const saved = (await api(page, "GET", `/api/identity/role/permissions/${roleId}`)).data.roleClaims.filter((claim) => claim.selected);
    check(
      saved.length === 1 && saved[0].value === "Permissions.Products.View" && saved[0].description === `Verify comment ${stamp}`,
      "Update Role Permissions saves the ticked permission with its comment and goes back to the roles",
    );
    check(await page.getByText("Refreshed Token.").first().waitFor({ timeout: 10_000 }).then(() => true, () => false), "the hub has every client renew its token (RegenerateTokens): a toast");

    // The user's roles.
    await page.getByRole("link", { name: "Users", exact: true }).click();
    await users.locator("tbody tr").first().waitFor();
    await userSearch.fill(stamp);
    await waitForRows(users, 1);
    await users.getByRole("button", { name: `Actions: ${userName}` }).click();
    await page.getByRole("menuitem", { name: "Manage Roles" }).click();
    await page.getByRole("heading", { level: 1, name: fullName }).waitFor();
    const userRoles = page.getByRole("table", { name: fullName });
    await userRoles.locator("tbody tr").first().waitFor();
    check(
      (await page.getByText(`Manage Vera ${lastName}'s Roles`).isVisible()) && (await userRoles.getByRole("checkbox", { name: "Status: Basic" }).isChecked()),
      "Manage Roles: the user's name, every role, the user's ticked (Basic, as registered)",
    );
    await axe(page, "a user's roles");
    await page.getByRole("textbox", { name: "Search For User Roles" }).fill(stamp);
    await waitForRows(userRoles, 1);
    await userRoles.getByRole("checkbox", { name: `Status: ${roleName}` }).check();
    await page.getByRole("button", { name: "Update User Roles" }).click();
    await page.getByText("Roles Updated").first().waitFor();
    await page.waitForURL(`${APP}/identity/users`);
    const given = (await api(page, "GET", `/api/identity/user/roles/${userId}`)).data.userRoles.filter((role) => role.selected).map((role) => role.roleName);
    check(JSON.stringify(given.sort()) === JSON.stringify(["Basic", roleName].sort()), `Update User Roles gives the user the role (${given.join(", ")})`);

    // The role can't go while a user has it — and the API says so as a success (U17).
    await page.getByRole("link", { name: "Roles", exact: true }).click();
    await roles.locator("tbody tr").first().waitFor();
    await roleSearch.fill(stamp);
    await waitForRows(roles, 1);
    await roles.getByRole("button", { name: `Actions: ${roleName}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await dialog.getByRole("heading", { name: "Delete Confirmation" }).waitFor();
    check((await dialog.innerText()).includes(`Do you want to delete the role with Id ${roleId}?`), "Delete asks first, with the role's id");
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.getByText(`Not allowed to delete ${roleName} Role as it is being used.`).first().waitFor();
    await waitForRows(roles, 1);
    check(true, "a role a user has stays: the API's refusal as a toast");

    // The user: the role's page in the menu, then the account.
    userContext = await page.context().browser().newContext({ viewport: { width: 1400, height: 900 } });
    const vera = await userContext.newPage();
    vera.on("pageerror", (error) => check(false, `the user's page: ${error.message}`));
    const uploads = [];
    vera.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/identity/account/profile-picture/")) uploads.push(JSON.parse(request.postData()));
    });
    await vera.goto(`${APP}/login`);
    await signInAs(vera, email, passwords[0]);
    await vera.getByRole("navigation").first().waitFor();
    const veraNav = await navigationOf(vera);
    check(veraNav["Catalog Management"]?.join("|") === "Products", `the user signs in: the role's one permission brings its page into the menu (${JSON.stringify(veraNav["Catalog Management"] ?? [])})`);

    await vera.getByRole("button", { name: /^Account:/ }).click();
    await vera.getByRole("menuitem", { name: "Account" }).click();
    await vera.getByRole("heading", { level: 1, name: "Account" }).waitFor();
    await vera.getByLabel("First Name").waitFor();
    check(
      (await vera.getByLabel("First Name").inputValue()) === "Vera" && (await vera.getByLabel("Last Name").inputValue()) === lastName && (await vera.getByLabel("Email").isDisabled()),
      "Account, Profile: the details from the token's claims, the email disabled",
    );
    await axe(vera, "the account's profile");
    const picture = await drawPicture(vera, 1000, 500);
    await vera.locator("input[type=file]").setInputFiles({ name: "vera.png", mimeType: "image/png", buffer: Buffer.from(picture, "base64") });
    await vera.locator(".bh-profile__picture img").waitFor({ timeout: 15_000 });
    check(
      uploads.length === 1 && pngSize(uploads[0].data) === "400x200" && uploads[0].uploadType === 1 && uploads[0].fileName.startsWith(`${userId}-`),
      `Upload Image: the picture shrunk into 400 × 400 (${uploads[0] ? pngSize(uploads[0].data) : "none"}), named by the user, then the page loads again with it`,
    );
    // The card loads the picture from the API once the frame has started: wait for it.
    check(await vera.locator(".bh-user-card img").waitFor({ timeout: 15_000 }).then(() => true, () => false), "the app bar's user card shows the new picture (the reload)");
    await vera.getByRole("button", { name: "Delete Image" }).click();
    const veraDialog = vera.getByRole("dialog");
    await veraDialog.getByRole("heading", { name: "Delete Confirmation" }).waitFor();
    check((await veraDialog.innerText()).includes(`Do you want to delete the profile picture of ${email}?`), "Delete Image asks first");
    await veraDialog.getByRole("button", { name: "Confirm" }).click();
    await vera.waitForFunction(() => document.querySelector(".bh-profile__picture .fui-avatar__initials")?.textContent === "V", null, { timeout: 15_000 });
    check((await vera.locator(".bh-user-card img").count()) === 0, "deleted: the first letter of the name again, here and in the user card");

    await vera.getByLabel("Last Name").fill(`${lastName}x`);
    await vera.getByRole("button", { name: "Save Changes" }).click();
    await vera.getByText("Your Profile has been updated. Please Login to Continue.").first().waitFor();
    await vera.getByRole("heading", { name: "Sign In" }).waitFor();
    check(true, "changed details: saved, and the user signed out to sign in again");
    await signInAs(vera, email, passwords[0]);
    await vera.getByRole("navigation").first().waitFor();
    await vera.goto(`${APP}/account`);
    await vera.getByRole("tab", { name: "Security" }).click();
    await vera.getByRole("button", { name: "Change Password" }).click();
    await vera.getByText("Current Password is required!").waitFor();
    const securityMessages = await vera.getByRole("alert").allInnerTexts();
    check(
      JSON.stringify(securityMessages) === JSON.stringify(["Password is required!", "Password Confirmation is required!", "Current Password is required!"]),
      `Security: Change Password shows ChangePasswordRequestValidator's messages (${securityMessages.join(", ")})`,
    );
    await axe(vera, "the account's security");
    await vera.getByLabel("Password", { exact: true }).fill(passwords[1]);
    await vera.getByLabel("Password Confirmation").fill(passwords[1]);
    await vera.getByLabel("Current Password").fill("Wrong1234");
    await vera.getByLabel("Current Password").press("Tab");
    await vera.getByRole("alert").first().waitFor({ state: "detached" });
    await vera.getByRole("button", { name: "Show password" }).first().click();
    check(
      (await vera.getByLabel("Password Confirmation").getAttribute("type")) === "text" && (await vera.getByLabel("Current Password").getAttribute("type")) === "password",
      "one eye shows both new fields, not the current password",
    );
    await vera.getByRole("button", { name: "Change Password" }).click();
    await vera.getByText("Incorrect password.").first().waitFor();
    check(true, "a wrong current password: Identity's message as a toast");
    await vera.getByLabel("Current Password").fill(passwords[0]);
    await vera.getByRole("button", { name: "Change Password" }).click();
    await vera.getByText("Password Changed!").first().waitFor();
    check((await vera.getByLabel("Current Password").inputValue()) === "" && (await vera.getByLabel("Password", { exact: true }).inputValue()) === "", "the password is changed, the fields emptied");

    // Signed out: the password forgotten, reset by the mail's link.
    await vera.getByRole("button", { name: /^Account:/ }).click();
    await vera.getByRole("menuitem", { name: "Logout" }).click();
    await vera.getByRole("dialog", { name: "Logout Confirmation" }).getByRole("button", { name: "Logout" }).click();
    await vera.getByRole("heading", { name: "Sign In" }).waitFor();
    await vera.getByRole("link", { name: "Forgot password?" }).click();
    await vera.getByRole("heading", { name: "Forgot password?" }).waitFor();
    await axe(vera, "forgot password");
    await vera.getByLabel("E-mail").fill("vera");
    await vera.getByRole("button", { name: "Reset Password" }).click();
    await vera.getByText("Email is not correct").waitFor();
    await vera.getByLabel("E-mail").fill(email);
    await vera.getByLabel("E-mail").press("Tab");
    await vera.getByText("Email is not correct").waitFor({ state: "detached" });
    await vera.getByRole("button", { name: "Reset Password" }).click();
    await vera.getByText("Done!").first().waitFor();
    await vera.waitForURL(`${APP}/`);
    const token = resetToken(email);
    check(token.length > 100, `Reset Password: a reset mail with its link (the token, ${token.length} characters, read from Hangfire's job)`);

    await vera.goto(`${APP}/account/reset-password`);
    await vera.getByRole("heading", { name: "Reset password" }).waitFor();
    await vera.getByLabel("E-mail").fill(email);
    await vera.getByLabel("Password", { exact: true }).fill(passwords[2]);
    await vera.getByLabel("Confirm Password").fill(passwords[2]);
    await vera.getByRole("button", { name: "Reset Password" }).click();
    await vera.getByText("Token Not Found!").first().waitFor();
    check(true, "the reset page without a token says so (U15)");
    await vera.goto(`${APP}/account/reset-password?Token=${token}`);
    await vera.getByRole("heading", { name: "Reset password" }).waitFor();
    await axe(vera, "reset password");
    await vera.getByLabel("E-mail").fill(email);
    await vera.getByLabel("Password", { exact: true }).fill(passwords[2]);
    await vera.getByLabel("Confirm Password").fill(passwords[2]);
    await vera.getByRole("button", { name: "Reset Password" }).click();
    await vera.getByText("Password Reset Successful!").first().waitFor();
    await vera.getByRole("heading", { name: "Sign In" }).waitFor();
    await signInAs(vera, email, passwords[2]);
    await vera.getByRole("navigation").first().waitFor();
    check(true, "the link's token resets the password: the user signs in with the new one");
    await vera.getByRole("button", { name: /^Account:/ }).click();
    await vera.getByRole("menuitem", { name: "Logout" }).click();
    await vera.getByRole("dialog", { name: "Logout Confirmation" }).getByRole("button", { name: "Logout" }).click();
    await vera.getByRole("heading", { name: "Sign In" }).waitFor();

    // Signing up: the new user is inactive until an administrator activates them.
    await vera.getByRole("link", { name: "Register here" }).click();
    await vera.getByRole("heading", { name: "Register" }).waitFor();
    await axe(vera, "the sign-up");
    const selfName = `self${stamp}`;
    const selfEmail = `selma.${stamp}@tsazor.test`;
    await vera.getByLabel("User Name").fill(selfName);
    await vera.getByLabel("First Name").fill("Selma");
    await vera.getByLabel("Last Name").fill(lastName);
    await vera.getByLabel("E-mail").fill(selfEmail);
    await vera.getByLabel("Password", { exact: true }).fill(passwords[0]);
    await vera.getByLabel("Confirm Password").fill(passwords[0]);
    await vera.getByRole("button", { name: "Register", exact: true }).click();
    await vera.getByText(`User ${selfName} Registered. Please check your Mailbox to verify!`).first().waitFor();
    await vera.waitForURL(`${APP}/login`);
    await signInAs(vera, selfEmail, passwords[0]);
    await vera.getByText("User Not Active. Please contact the administrator.").first().waitFor();
    check(true, "a signed-up user: the API's message, the login; inactive until an administrator activates them");
  } finally {
    await userContext?.close();
    if (userId !== undefined && roleId !== undefined) {
      const current = await api(page, "GET", `/api/identity/user/roles/${userId}`).catch(() => undefined);
      const userRoles = (current?.data?.userRoles ?? []).map((role) => ({ ...role, selected: role.selected && role.roleName !== roleName }));
      await api(page, "PUT", `/api/identity/user/roles/${userId}`, { userId, userRoles }).catch(() => undefined);
    }
    if (roleId !== undefined) await api(page, "DELETE", `/api/identity/role/${roleId}`).catch(() => undefined);
    rmSync(downloads, { recursive: true, force: true });
  }
}

/** The stored preference changed as the original stores it (Blazored.LocalStorage: the C# names, B33). */
async function setPreference(page, changes) {
  await page.evaluate((changes) => {
    const current = JSON.parse(localStorage.getItem("clientPreference") ?? "{}");
    localStorage.setItem("clientPreference", JSON.stringify({ ...current, ...changes }));
  }, changes);
}

/**
 * Phase 6, the languages, as the administrator. Each of the eleven loads the app in it: the page's language
 * (`<html lang>`, B34), the navigation's headings from its table (English where it has none, as .NET falls back), the
 * API asked in its two letters. Arabic right to left: the navigation on the right, the pager's arrows mirrored, axe on
 * the products, the dashboard and the chat. The run ends in English, left to right.
 */
async function inEveryLanguage(page, apiLanguages) {
  const { LocalizationConstants, cultureOf } = await import("../src/Application/Constants.ts");
  const en = (await import("../src/i18n/en.ts")).default;
  const tableOf = async (neutral) => (neutral === "en" ? en : (await import(`../src/i18n/${neutral}.ts`)).default);
  const wrong = [];
  for (const { code } of LocalizationConstants.SupportedLanguages) {
    const culture = cultureOf(code);
    const neutral = culture.split("-")[0];
    const personal = (await tableOf(neutral))["NavMenu.Personal"] ?? en["NavMenu.Personal"];
    await setPreference(page, { LanguageCode: code, IsRTL: false });
    apiLanguages.length = 0;
    await page.reload();
    const shown = await page.getByRole("group", { name: personal }).waitFor({ timeout: 10_000 }).then(() => true, () => false);
    const lang = await page.evaluate(() => document.documentElement.lang);
    const asked = [...new Set(apiLanguages)];
    if (!shown || lang !== culture || asked.some((language) => language !== neutral)) wrong.push(`${code}: heading ${shown ? "ok" : `not "${personal}"`}, lang ${lang}, API ${asked.join("/")}`);
  }
  check(wrong.length === 0, `the eleven languages each load the app in them: <html lang>, the navigation's headings, the API's language${wrong.length ? ` — ${wrong.join("; ")}` : ""}`);

  // Arabic, right to left.
  const ar = await tableOf("ar");
  await setPreference(page, { LanguageCode: "ar", IsRTL: true });
  await page.goto(`${APP}/catalog/products`);
  await page.getByRole("heading", { level: 1, name: ar["Products.Products"] }).waitFor();
  await page.getByRole("table").waitFor();
  const layout = await page.evaluate(() => {
    const nav = document.querySelector("nav").getBoundingClientRect();
    const main = document.querySelector("main").getBoundingClientRect();
    const arrow = document.querySelector(".fui-paginator .fui-pagination__button .fui-icon");
    return {
      navOnTheRight: nav.left > main.left,
      dir: document.querySelector("body [data-fluent-theme]").getAttribute("dir"),
      lang: document.documentElement.lang,
      arrow: arrow === null ? "none" : getComputedStyle(arrow).transform,
    };
  });
  check(layout.navOnTheRight && layout.dir === "rtl" && layout.lang === "ar", `Arabic right to left: the navigation on the right, the theme root rtl, the page's language ar (${JSON.stringify(layout)})`);
  check(layout.arrow === "matrix(-1, 0, 0, 1, 0, 0)", `the pager's arrows point the way the pages go (mirrored: ${layout.arrow})`);
  await axe(page, "the products in Arabic, right to left");
  await page.goto(`${APP}/dashboard`);
  await page.locator(".bh-tile").first().waitFor();
  await axe(page, "the dashboard in Arabic, right to left");
  await page.goto(`${APP}/chat`);
  await page.getByRole("log").waitFor();
  await axe(page, "the chat in Arabic, right to left");

  await setPreference(page, { LanguageCode: "en-US", IsRTL: false });
  await page.goto(`${APP}/`);
  await page.getByRole("group", { name: "Personal" }).waitFor();
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
  // The frame renders the card once its start is done (the hub, the user's check): wait for it, a cold backend is slow.
  check(await page.getByText(ADMIN.email).first().waitFor({ timeout: 15_000 }).then(() => true, () => false), "the user card shows the signed-in user");
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
  const preference = await page.evaluate(() => JSON.parse(localStorage.getItem("clientPreference")));
  check(preference.IsDarkMode === true && preference.IsRTL === true && typeof preference.LanguageCode === "string", `the preference is stored as the original stores it, with the C# names (B33: ${Object.keys(preference).join(", ")})`);
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

  // Phase 4: documents, extended attributes, audit trails.
  await documents(page, Date.now().toString(36));

  // Phase 5: the dashboard and the chat.
  await realTime(page, Date.now().toString(36));

  // Phase 3: identity.
  await identity(page, Date.now().toString(36));

  // Phase 6: the eleven languages, Arabic right to left.
  await inEveryLanguage(page, languages);

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
