/**
 * End-to-end verification for the Blazing Pizza port.
 *
 * Starts the API server (:5300) and the vite dev server (:5301) if they are
 * not already running, then drives the full order flow in headless Edge:
 *
 *   register → configure pizza → checkout (validation) → place order
 *   → order details (Leaflet map, Poller status progression) → MyOrders
 *   → logout → login
 *
 * Fails on any console/page error and on every failed assertion.
 * Run: node scripts/verify-pizza.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";

const APP = "http://localhost:5301";
const API = "http://localhost:5300";
const PREPARATION_MS = 10_000; // server.mjs PREPARATION_DURATION_MS

let spawned = [];

async function reachable(url) {
  try {
    const res = await fetch(url);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function ensureServices() {
  if (!(await reachable(`${API}/specials`))) {
    spawned.push(spawn(process.execPath, ["server/server.mjs"], { stdio: "inherit" }));
    console.log("started API server on :5300");
  }
  if (!(await reachable(APP))) {
    spawned.push(spawn("npx", ["vite", "--port", "5301", "--strictPort"], { shell: true, stdio: "ignore" }));
    console.log("started vite dev server on :5301");
  }
  const deadline = Date.now() + 30_000;
  while (!(await reachable(APP)) || !(await reachable(`${API}/specials`))) {
    if (Date.now() > deadline) throw new Error("servers did not come up within 30s (stale process on :5300/:5301?)");
    await new Promise((r) => setTimeout(r, 500));
  }
}

function stopSpawned() {
  for (const child of spawned) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: true });
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

async function main() {
  await ensureServices();

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  const user = { name: "E2E Tester", email: `e2e-${Date.now()}@example.com`, password: "e2e-password" };
  const text = (selector) => page.locator(selector).first().textContent().then((t) => t.trim().replace(/\s+/g, " "));

  try {
    /* --- Register --- */
    await page.goto(`${APP}/register`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const inputs = page.locator(".auth-page input");
    await inputs.nth(0).fill(user.name);
    await inputs.nth(1).fill(user.email);
    await inputs.nth(2).fill(user.password);
    await page.locator(".auth-page button.btn-success").click();
    await page.waitForTimeout(1000);
    check(page.url().replace(/\/$/, "") === APP || page.url().endsWith("/"), "register navigates to home");
    check((await text(".user-info .username")) === user.name, "header shows the registered user");

    /* --- Configure a pizza --- */
    await page.locator(".pizza-cards li").nth(2).click();
    await page.waitForTimeout(400);
    // Toppings are name-sorted; option values are their index.
    await page.locator(".dialog select.custom-select").selectOption("0");
    await page.waitForTimeout(200);
    await page.locator(".dialog-buttons .btn-success").click();
    await page.waitForTimeout(400);
    check((await page.locator(".order-total .total-price").count()) === 1, "cart shows the configured pizza");

    /* --- Checkout: empty submit → validation --- */
    await page.locator(".order-total a").click();
    await page.waitForTimeout(800);
    check(page.url().endsWith("/checkout"), "checkout route reached");
    await page.locator(".checkout-button").click();
    await page.waitForTimeout(600);
    check((await page.locator(".validation-message").count()) >= 4, "empty address shows validation messages");
    check(page.url().endsWith("/checkout"), "invalid form stays on checkout");

    /* --- Checkout: valid submit --- */
    const fields = page.locator(".checkout-delivery-address input");
    await fields.nth(0).fill("Hans Becker");
    await fields.nth(1).fill("Baker Street 221B");
    await fields.nth(3).fill("London");
    await fields.nth(4).fill("Greater London");
    await fields.nth(5).fill("NW1 6XE");
    await page.locator(".checkout-button").click();
    await page.waitForTimeout(1500);
    check(/\/myorders\/\d+$/.test(page.url()), "valid submit navigates to order details");

    /* --- Order details: map + Poller status progression --- */
    check((await text(".track-order-title p")) === "Status: Preparing", "initial status is Preparing");
    check((await page.locator(".delivery-map").count()) === 1, "delivery map present");
    await page.waitForTimeout(1000);
    check((await page.locator(".leaflet-tile-loaded").count()) > 0, "leaflet tiles loaded");
    check((await page.locator(".leaflet-popup-content").allTextContents()).includes("You"), "'You' marker popup open");
    const wait = PREPARATION_MS - (Date.now() % 1000) + 3000;
    await page.waitForTimeout(wait);
    check((await text(".track-order-title p")) === "Status: Out for delivery", "Poller advances status to Out for delivery");
    check((await page.locator(".leaflet-marker-icon").count()) === 2, "driver marker appears next to 'You'");

    /* --- MyOrders --- */
    await page.goto(`${APP}/myorders`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    check((await page.locator(".orders-list .list-group-item").count()) === 1, "MyOrders lists the placed order");
    check((await text(".orders-list .list-group-item")).includes("Status:"), "order row shows its status");

    /* --- Logout / login --- */
    await page.locator(".user-info button.sign-out").click();
    await page.waitForTimeout(800);
    await page.goto(`${APP}/myorders`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    check((await text(".main")).includes("Hold on there"), "after logout MyOrders is protected");
    await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.locator(".auth-page input").nth(0).fill(user.email);
    await page.locator(".auth-page input[type=password]").fill(user.password);
    await page.locator(".auth-page button.btn-success").click();
    await page.waitForTimeout(1000);
    check(page.url().endsWith("/myorders"), "login navigates to MyOrders");
    check((await text(".user-info .username")) === user.name, "header shows the logged-in user");
  } finally {
    check(errors.length === 0, `zero console/page errors${errors.length ? `: ${errors.join(" || ").slice(0, 500)}` : ""}`);
    await browser.close();
    stopSpawned();
  }

  if (failed > 0) {
    console.error(`\nverify-pizza: ${failed} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nverify-pizza: all checks passed");
}

main().catch((err) => {
  stopSpawned();
  console.error("verify-pizza crashed:", err);
  process.exit(1);
});