/**
 * Real-browser verification for the scoped-CSS demo page (/scoped-demo).
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

await page.goto(`${BASE}/scoped-demo`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

// 1. Page rendered
check("page renders", (await page.locator("h1").textContent())?.includes("Scoped CSS Demo") === true);

// 2. Scope attribute present AND only inside this page (counter page must stay clean)
const cardHash = await page.locator(".demo-card").evaluate((el) => {
  const attr = [...el.attributes].find((a) => /^b-[0-9a-f]{8}$/.test(a.name));
  return attr?.name ?? null;
});
check("scope attribute on own elements", !!cardHash, `attr=${cardHash ?? "?"}`);
check("h1 also scoped", cardHash ? await page.locator(`h1[${cardHash}]`).count() === 1 : false);

// 3. Click button → count updates (scope attr frame must not break diffing)
await page.locator("button.btn-primary").click();
await page.waitForTimeout(200);
const count = await page.locator(".count strong").textContent();
check("count updates after click", count === "1", `count=${count}`);

// 4. Scoped CSS applied (computed styles)
if (cardHash) {
  const cardBg = await page.locator(".demo-card").evaluate((el) => getComputedStyle(el).backgroundColor);
  check("media-query background applied (@media ≥600px)", cardBg === "rgb(233, 244, 255)", cardBg);
  // shrink viewport below the media query → base color
  await page.setViewportSize({ width: 500, height: 700 });
  const cardBgNarrow = await page.locator(".demo-card").evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.setViewportSize({ width: 1280, height: 720 });
  check("narrow-viewport falls back to base style", cardBgNarrow === "rgb(248, 249, 250)", cardBgNarrow);

  const countColor = await page.locator(".count strong").evaluate((el) => getComputedStyle(el).color);
  check("descendant selector scoped (.demo-card .count strong)", countColor === "rgb(13, 110, 253)", countColor);

  const h1Anim = await page.locator("h1").evaluate((el) => getComputedStyle(el).animationName);
  check("@keyframes referenced and untouched", h1Anim === "demo-pop", h1Anim);
}

// 5. Other pages must NOT carry this page's scope
await page.goto(`${BASE}/counter`, { waitUntil: "networkidle" });
const leaked = await page.evaluate((hash) => document.querySelectorAll(`[${hash}]`).length, cardHash ?? "__");
check("no scope leakage onto /counter (different hash anyway)", leaked === 0, `matched=${leaked}`);

check("no console/page errors", errors.length === 0, errors.join(" | ").slice(0, 300));

console.log(results.join("\n"));
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
await browser.close();