/**
 * The port against fullstackhero's real backend (scripts/backend.mjs, Aspire): signs in with the seeded demo account
 * and opens every page — the detail pages through the first entry of their list — collecting what went wrong on the
 * way: page errors, console errors, API answers of 400 and up. Read-only: nothing is created or changed.
 *
 *   node scripts/live.mjs              the port (its dev server on :5372, started when it isn't running)
 *   node scripts/live.mjs --original   the original admin (the AppHost runs it on :5173), the reference
 *
 * The same browser as the acceptance (Edge, en-US). Prints one line per page: its heading and what went wrong.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { admin } from "./upstream.mjs";

const original = process.argv.includes("--original");
const base = original ? "http://localhost:5173" : "http://localhost:5372";
const require = createRequire(path.join(admin, "package.json"));
const { chromium } = require("@playwright/test");

const PAGES = [
  "/", "/users", "/roles", "/tenants", "/audits", "/billing", "/billing/invoices", "/billing/plans", "/billing/topups",
  "/impersonation", "/notifications", "/webhooks", "/health", "/settings/profile", "/settings/security",
  "/settings/sessions", "/settings/appearance", "/users/new", "/roles/new", "/tenants/new",
];
/** A list page and the pattern of its entries' detail links. */
const DETAILS = [
  ["/users", /^\/users\/(?!new$)[^/]+$/],
  ["/roles", /^\/roles\/(?!new$)[^/]+$/],
  ["/tenants", /^\/tenants\/(?!new$)[^/]+$/],
  ["/audits", /^\/audits\/[^/]+$/],
  ["/billing/invoices", /^\/billing\/invoices\/[^/]+$/],
  ["/webhooks", /^\/webhooks\/[^/]+$/],
];

const browser = await chromium.launch({ channel: "msedge", args: ["--lang=en-US"] });
const context = await browser.newContext({ locale: "en-US", ignoreHTTPSErrors: true });
const page = await context.newPage();
let problems = [];
page.on("pageerror", (error) => problems.push(`page error: ${error.message.split("\n")[0]}`));
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text().split("\n")[0].slice(0, 160)}`);
});
page.on("response", (response) => {
  const url = new URL(response.url());
  if (url.pathname.startsWith("/api") && response.status() >= 400) problems.push(`HTTP ${response.status()} ${response.request().method()} ${url.pathname}${url.search}`);
});

const settle = async () => {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(300);
};
const heading = async () => (await page.locator("main h1, h1").first().textContent({ timeout: 5_000 }).catch(() => null))?.trim() ?? "(no h1)";
const report = async (route) => {
  await settle();
  const title = await heading();
  console.log(`${problems.length === 0 ? "ok  " : "FAIL"} ${route.padEnd(34)} ${title}`);
  for (const problem of problems) console.log(`       ${problem}`);
  const failed = problems.length > 0;
  problems = [];
  return failed;
};

console.log(`live: ${original ? "the original admin" : "the Tsazor port"} at ${base}`);
await page.goto(`${base}/login`);
await page.getByLabel("Tenant").fill("root");
await page.getByLabel("Email").fill("superadmin@root.com");
await page.getByLabel("Password", { exact: true }).fill("Password123!");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
let failures = (await report("/login → signed in")) ? 1 : 0;

// In-app navigation, as a link click does it (React Router and Tsazor's NavigationManager both follow popstate): a
// full page load per page would cut the realtime hub's connection off mid-negotiation and reload the app each time.
const go = (route) =>
  page.evaluate((target) => {
    history.pushState({}, "", target);
    dispatchEvent(new PopStateEvent("popstate", { state: {} }));
  }, route);

for (const route of PAGES) {
  await go(route);
  if (await report(route)) failures++;
}
for (const [list, pattern] of DETAILS) {
  await go(list);
  await settle();
  problems = [];
  // The lists open an entry by a link, or by a button ("Open user …") or a click on its row.
  const hrefs = await page.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  const href = hrefs.find((candidate) => candidate && pattern.test(candidate.split("?")[0]));
  if (href) await go(href);
  else {
    // The original's rows: a button per list item, or a table row. (Not an "Open …" button: the header's account
    // menu is one.)
    const candidates = ["ol > li > button:visible", "tbody tr:visible"];
    let row = page.locator(candidates[0]).first();
    for (const selector of candidates) {
      row = page.locator(selector).first();
      if ((await row.count()) > 0) break;
    }
    if ((await row.count()) === 0) {
      console.log(`skip ${`${list}/{entry}`.padEnd(34)} (no entry listed)`);
      continue;
    }
    await row.click();
    await page.waitForURL((url) => pattern.test(url.pathname), { timeout: 10_000 }).catch(() => {});
  }
  const url = new URL(page.url());
  if (!pattern.test(url.pathname)) {
    console.log(`skip ${`${list}/{entry}`.padEnd(34)} (the first entry opened no detail page: ${url.pathname})`);
    problems = [];
    continue;
  }
  if (await report(url.pathname)) failures++;
}
if (process.argv.includes("--write")) failures += await writeFlows();

await browser.close();
console.log(`\nlive: ${failures === 0 ? "every page clean" : `${failures} page(s) with problems`}`);

/**
 * `--write`: a role's life against the real API, cleaned up after itself — create it in the dialog, grant a
 * permission and save, delete it after typing its name. The selectors are the original's specs' (tests/roles).
 */
async function writeFlows() {
  let failed = 0;
  const name = `Live check ${Date.now().toString(36)}`;
  const step = async (label, run, expected = []) => {
    problems = [];
    try {
      await run();
    } catch (error) {
      problems.push(`step failed: ${error.message.split("\n")[0]}`);
    }
    await settle();
    problems = problems.filter((problem) => !expected.some((pattern) => pattern.test(problem)));
    if (await report(label)) failed++;
  };
  // The original, too: after the delete, its query invalidation refetches the deleted role's permissions (404).
  const REFETCH_OF_THE_DELETED = [/^HTTP 404 GET \/api\/v1\/identity\/[^/]+\/permissions$/, /^console: Failed to load resource: the server responded with a status of 404/];
  const apiCall = (method, suffix) =>
    page.waitForResponse((response) => response.request().method() === method && new URL(response.url()).pathname.endsWith(suffix), { timeout: 15_000 });

  await step(`write: create role "${name}"`, async () => {
    await go("/roles");
    await settle();
    const main = page.getByRole("main");
    await main.getByRole("button", { name: "New role" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Name/).fill(name);
    await dialog.getByLabel(/^Description/).fill("Created by apps/fullstackhero/scripts/live.mjs");
    const created = apiCall("POST", "/identity/roles");
    await dialog.getByRole("button", { name: "Create role", exact: true }).click();
    const response = await created;
    if (!response.ok()) throw new Error(`POST /identity/roles answered ${response.status()}`);
    await dialog.waitFor({ state: "detached", timeout: 10_000 });
  });

  await step("write: grant a permission and save", async () => {
    const main = page.getByRole("main");
    // The dialog's success opens the new role (the original navigates there); otherwise its list entry does.
    const onDetail = () => /^\/roles\/(?!new$)[^/]+$/.test(new URL(page.url()).pathname);
    await page.waitForURL(() => onDetail(), { timeout: 3_000 }).catch(() => {});
    if (!onDetail()) {
      await main.getByRole("button", { name: new RegExp(`^${name}\\b`) }).click();
      await page.waitForURL(() => onDetail(), { timeout: 10_000 });
    }
    await main.getByRole("heading", { name, exact: true }).waitFor({ timeout: 10_000 });
    await main.getByText("Create users", { exact: true }).click();
    const saved = apiCall("PUT", "/permissions");
    await main.getByRole("button", { name: /save permissions/i }).click();
    const response = await saved;
    if (!response.ok()) throw new Error(`PUT …/permissions answered ${response.status()}`);
  });

  await step("write: delete the role", async () => {
    const main = page.getByRole("main");
    const confirm = main.getByPlaceholder(name, { exact: true });
    await confirm.fill(name);
    await confirm.press("Tab");
    const deleted = apiCall("DELETE", "");
    await main.getByRole("button", { name: "Delete role" }).click();
    const response = await deleted;
    if (!response.ok()) throw new Error(`DELETE answered ${response.status()}`);
    await page.waitForURL((url) => url.pathname === "/roles", { timeout: 10_000 });
    await settle();
    if ((await main.getByRole("button", { name: new RegExp(`^${name}\\b`) }).count()) > 0) throw new Error("the role is still listed");
  }, REFETCH_OF_THE_DELETED);
  return failed;
}
process.exit(failures === 0 ? 0 : 1);
