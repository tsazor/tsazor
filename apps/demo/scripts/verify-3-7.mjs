/**
 * Real-browser verification of the Phase-3.6/3.7 demo pages: decorator
 * validation (/validation), @bind:format (/format), InputFile (/upload) and
 * SupplyParameterFromQuery (/query). Uses msedge via playwright-core.
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
const navTo = async (label) => {
  await page.locator("nav.nav a", { hasText: label }).first().click();
  await page.waitForTimeout(300);
};

/* 3.6 — decorator validation ------------------------------------------ */
await page.goto(`${BASE}/validation`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await page.locator("button[type=submit]").click();
await page.waitForTimeout(200);
check("OnInvalidSubmit fired on the untouched form", (await page.locator("p.log").textContent())?.includes("OnInvalidSubmit") === true, await page.locator("p.log").textContent());
const summary = (await page.locator(".validation-errors, ul, p").allTextContents()).join(" ");
check("the Name rule message is .NET's exact text", summary.includes("The name field is required."), summary.slice(0, 200));
check("the Email rule message is .NET's exact text", summary.includes("The email field is required."), summary.slice(0, 200));
await page.waitForTimeout(200);

const fillField = async (index, value) => {
  await page.locator(".field input").nth(index).fill(value);
  await page.waitForTimeout(100);
};
await fillField(0, "Ada Lovelace");
await fillField(1, "ada@example.org");
await fillField(2, "ada@example.org");
await fillField(3, "31");
await page.waitForTimeout(150);
await page.locator("button[type=submit]").click();
await page.waitForTimeout(300);
check("OnValidSubmit fired for valid input", (await page.locator("p.log").textContent())?.includes("OnValidSubmit") === true, await page.locator("p.log").textContent());
check("the success line shows the name", (await page.locator("p.success").textContent())?.includes("Ada Lovelace") === true, await page.locator("p.success").textContent());

/* 3.7 — bind:format ----------------------------------------------------- */
await navTo("Format");
await page.waitForTimeout(300);
const price = () => page.locator('input[type="number"]').inputValue();
check("the number bind renders through the 0.00 mask", (await price()) === "1234.50", await (await price()));
const priceModel = (await page.locator("div.card p.log").first().textContent()) ?? "";
check("the formatted display matches the model", priceModel.includes("model: 1234.5"), priceModel);
await page.locator('input[type="number"]').fill("99.5");
await page.locator('input[type="number"]').dispatchEvent("change");
await page.waitForTimeout(300);
check("the parsed change value updates the model", ((await page.locator("p.log").nth(0).textContent()) ?? "").includes("model: 99.5"));
check("the reparsed input re-renders through the mask", (await price()) === "99.50", await (await price()));

const total = (await page.locator("p.log").last().textContent()) ?? "";
check("formatValue renders grouped N2 in markup", total.includes("total N2: 2,089.50"), total);

/* 3.7 — InputFile -------------------------------------------------------- */
await navTo("Upload");
await page.waitForTimeout(300);
await page.locator('input[type="file"]').setInputFiles([
  { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello tsazor") },
  { name: "log.txt", mimeType: "text/plain", buffer: Buffer.from("second") },
]);
await page.waitForTimeout(400);
const list = (await page.locator("ul.file-list li").allTextContents()).join(" | ");
check("OnChange listed the selected files", list.includes("notes.txt — 12 bytes") && list.includes("log.txt"), list);

/* 3.7 — SupplyParameterFromQuery ---------------------------------------- */
await navTo("Query");
await page.waitForTimeout(300);
const navToRaw = async (scope, label) => {
  await page.locator(`${scope} a`, { hasText: label }).first().click();
  await page.waitForTimeout(300);
};
check("absent query keys supply null", ((await page.locator("p.log").textContent()) ?? "").includes("tags: null"), await page.locator("p.log").textContent());
await navToRaw(".pager", "page 1, alpha+beta");
await page.waitForTimeout(300);
check("the int parameter converted", (await page.locator(".card strong").first().textContent()) === "1", await page.locator(".card strong").first().textContent());
const queryLog = (await page.locator("p.log").textContent()) ?? "";
check("the multiple field collected every repeated key", queryLog.includes("tags: [alpha, beta]") && queryLog.includes("doubled: 2"), queryLog);
await navToRaw(".pager", "page 3 (uppercase key)");
await page.waitForTimeout(300);
check("query keys match case-insensitively", (await page.locator(".card strong").first().textContent()) === "3", await page.locator(".card strong").first().textContent());
await page.waitForTimeout(200);

check("no console/page errors", errors.length === 0, errors.join(" | ").slice(0, 300));

console.log(results.join("\n"));
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
await browser.close();