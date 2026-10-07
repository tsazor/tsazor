/**
 * E6 — incremental migration, end to end: the Blazor Server app (Legacy, :5411) and the Tsazor
 * pages side by side behind the YARP gateway (Gateway, :5410), one origin, one sign-in cookie.
 *
 *   Blazor home → "Orders" (migrated) is served by the Tsazor build → not signed in: the Blazor
 *   app's login → back on the Tsazor orders, data from the API boundary (/api/orders) → SPA
 *   navigation to an order → "Customers" is a Blazor page that sees the same user → back to the
 *   Tsazor page → an unknown URL is handed back to the gateway once, not in a loop → the API
 *   refuses a request without the cookie → sign out.
 *
 * Builds the Tsazor pages and both .NET projects, starts the servers unless they run already.
 * Run: node scripts/verify.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as playwright from "playwright-core";
import { BROWSER, launchBrowser } from "../../../scripts/browsers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATEWAY = "http://localhost:5410";
const LEGACY = "http://localhost:5411";

const spawned = [];

async function reachable(url) {
  try {
    const response = await fetch(url, { redirect: "manual" });
    return response.status < 500;
  } catch {
    return false;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit", shell: true });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

async function ensureServers() {
  run("npx", ["vite", "build", "--logLevel", "warn"]);
  const legacyUp = await reachable(`${LEGACY}/auth/user`);
  const gatewayUp = await reachable(`${GATEWAY}/auth/user`);
  if (!legacyUp || !gatewayUp) {
    run("dotnet", ["build", "Legacy", "--nologo", "-v", "q"]);
    run("dotnet", ["build", "Gateway", "--nologo", "-v", "q"]);
  }
  if (!legacyUp) {
    spawned.push(spawn("dotnet", ["run", "--project", "Legacy", "--no-build"], { cwd: ROOT, stdio: "ignore", shell: true }));
    console.log("started the Blazor Server app on :5411");
  }
  if (!gatewayUp) {
    spawned.push(spawn("dotnet", ["run", "--project", "Gateway", "--no-build"], { cwd: ROOT, stdio: "ignore", shell: true }));
    console.log("started the gateway on :5410");
  }
  const deadline = Date.now() + 60_000;
  while (!(await reachable(`${LEGACY}/auth/user`)) || !(await reachable(`${GATEWAY}/auth/user`))) {
    if (Date.now() > deadline) throw new Error("servers did not come up within 60s (a stale process on :5410/:5411?)");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function stopSpawned() {
  for (const child of spawned) {
    try {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: true });
      else child.kill("SIGTERM");
    } catch {
      /* best effort */
    }
  }
}

let failed = 0;
function check(condition, label) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) failed++;
}

const servedBy = (page) => page.getAttribute(".shell", "data-app");

async function main() {
  await ensureServers();
  const browser = await launchBrowser(playwright);
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    // The first request warms up both apps behind the gateway (JIT, Razor) — slow on a cold CI runner.
    await page.goto(`${GATEWAY}/`, { timeout: 120_000 });
    await page.waitForSelector(".shell[data-app='blazor']");
    check((await page.textContent("h1"))?.includes("Bakery admin"), "the gateway serves the Blazor home page");

    // Wait for the Blazor circuit so the click goes through Blazor's link handling.
    await page.waitForFunction(() => window.Blazor !== undefined);
    await page.click(".topbar a:has-text('Orders')");
    await page.waitForURL(/\/account\/login\?returnUrl=%2Forders$/, { timeout: 30_000 });
    check(true, "Orders (migrated) without a session: the Tsazor page sends the user to the Blazor app's login");

    await page.fill("input[name=name]", "alice");
    await page.click("button[type=submit]");
    await page.waitForURL(`${GATEWAY}/orders`);
    await page.waitForSelector(".shell[data-app='tsazor'] table.grid tbody tr");
    check((await servedBy(page)) === "tsazor", "after sign-in, /orders is the Tsazor page");
    check((await page.locator("table.grid tbody tr").count()) === 3, "it lists the orders from the API boundary (/api/orders)");
    check((await page.textContent(".user"))?.trim() === "alice", "the Tsazor page sees the user of the shared cookie");

    await page.click("table.grid a:has-text('2')");
    await page.waitForURL(`${GATEWAY}/orders/2`);
    await page.waitForSelector("dl.order");
    check((await page.textContent("dl.order"))?.includes("Fabrikam"), "an order opens inside the Tsazor app (client-side routing)");

    await page.click(".topbar a:has-text('Customers')");
    await page.waitForURL(`${GATEWAY}/customers`);
    await page.waitForSelector(".shell[data-app='blazor'] .who");
    check((await page.textContent(".who"))?.trim() === "alice", "Customers is a Blazor page and sees the same user");

    await page.waitForFunction(() => window.Blazor !== undefined);
    await page.click(".topbar a:has-text('Orders')");
    await page.waitForSelector(".shell[data-app='tsazor'] table.grid tbody tr");
    check(true, "back from Blazor to the Tsazor page");

    await page.goto(`${GATEWAY}/orders/2/nowhere`);
    await page.waitForSelector("h1:has-text('Not found')", { timeout: 30_000 });
    check(true, "an unknown URL below a Tsazor route is handed back once, then shown as not found (no reload loop)");

    const anonymous = await fetch(`${GATEWAY}/api/orders`);
    check(anonymous.status === 401, `the API refuses a request without the cookie (${anonymous.status})`);

    await page.goto(`${GATEWAY}/orders`);
    await page.waitForSelector(".shell[data-app='tsazor'] .user");
    await page.click(".topbar button:has-text('Sign out')");
    await page.waitForURL(`${GATEWAY}/`);
    await page.waitForSelector(".shell[data-app='blazor'] a:has-text('Sign in')");
    check(true, "sign out ends the session for both parts");

    check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  } finally {
    await browser.close();
  }
}

main()
  .catch((error) => {
    console.error(error);
    failed++;
  })
  .finally(() => {
    stopSpawned();
    console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
    process.exit(failed === 0 ? 0 : 1);
  });
