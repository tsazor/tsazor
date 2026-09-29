/**
 * Real-browser verification for the code-behind demo page (/code-behind-demo).
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

await page.goto(`${BASE}/code-behind-demo`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

// 1. Page rendered
check("page renders", (await page.locator("h1").textContent())?.includes("Code-behind Demo") === true);

// 2. State lives in the code-behind class: lifecycle ran and markup renders through the chain
const paragraphs = await page.locator(".demo-card p, .card p").allTextContents();
const msgText = paragraphs.find((t) => t.includes("Code-behind state")) ?? "";
check("lifecycle + computed member render", msgText.includes("count=0") && msgText.includes("initialized at"), msgText?.trim());

// 3. Clicking increments code-behind state; markup diff updates through inheritance
await page.locator("button.btn-primary").click();
await page.waitForTimeout(200);
await page.locator("button.btn-primary").click();
await page.waitForTimeout(200);
const strongs = await page.locator(".demo-card strong, .card strong").allTextContents();
check("count updates via code-behind method", strongs[0] === "2", strongs.join(", "));
check("computed getter follows state", strongs[1] === "4", strongs[1] ?? "");

check("no console/page errors", errors.length === 0, errors.join(" | ").slice(0, 300));

console.log(results.join("\n"));
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
await browser.close();