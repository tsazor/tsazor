/**
 * Real-browser verification of counter state across client-side navigation:
 * /counter keeps its count in a component field (reset after navigating away
 * and back — the page instance is disposed, like in Blazor), while
 * /counter-persistent keeps it in an injected CounterState service.
 * Uses msedge via playwright-core (no Chromium download).
 */
import { chromium } from "playwright-core";

const BASE = "http://localhost:5199";
const errors = [];

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

const results = [];
const check = (name, ok, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const count = async () => (await page.locator(".count-display strong").textContent())?.trim();
const clickTimes = async (n) => {
  for (let i = 0; i < n; i++) {
    await page.locator(".card button.btn").click();
    await page.waitForTimeout(100);
  }
};
// Client-side navigation through the nav bar (no reload, so services survive).
const navTo = async (label) => {
  await page.locator("nav.nav a", { hasText: label }).first().click();
  await page.waitForTimeout(300);
};

await page.goto(`${BASE}/counter`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);

// 1. Component-field state: reset after leaving the page (Blazor behaviour).
await clickTimes(3);
check("counter counts", (await count()) === "3", await count());
await navTo("Home");
await navTo("Counter");
check("counter resets after navigating away and back (page instance disposed)", (await count()) === "0", await count());

// 2. Service state: survives navigation.
await navTo("Persistent counter");
check("persistent counter page renders", (await page.locator("h1").textContent())?.includes("Persistent counter") === true);
await clickTimes(2);
check("persistent counter counts", (await count()) === "2", await count());
await navTo("Home");
await navTo("Persistent counter");
check("persistent counter keeps its count across navigation", (await count()) === "2", await count());
await clickTimes(1);
check("persistent counter continues from the kept count", (await count()) === "3", await count());
check("URL is the persistent counter route", page.url().endsWith("/counter-persistent"), page.url());

check("no console/page errors", errors.length === 0, errors.join(" | ").slice(0, 300));

console.log(results.join("\n"));
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
await browser.close();
