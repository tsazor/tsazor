/**
 * Real-browser verification for the @tsazor/components POC page
 * (/components). Uses msedge via playwright-core (no Chromium download).
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

await page.goto(`${BASE}/components`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

// 1. Page rendered
check("page renders", (await page.locator("h1").textContent())?.includes("Komponenten-POC") === true);
// 1b. HTML entities decode in card headers (regression: &amp; used to show literally)
const headers = await page.locator(".card-header").allTextContents();
check("entity headings decoded", headers.some((h) => h.includes("Tabs & Accordion")) && !headers.some((h) => h.includes("&amp;")));

// 2. Buttons + badge counter
await page.locator("button.btn-primary", { hasText: "Zählen" }).click();
await page.waitForTimeout(200);
const badge = await page.locator(".badge.rounded-pill").textContent();
check("button click updates badge", badge === "1", `badge=${badge}`);

// 3. Progress updates via diff (style attribute; compared as parsed CSS, since
//    the literal attribute text is whatever the markup wrote — Blazor semantics)
const barWidth = () => page.locator(".progress-bar").evaluate((el) => el.style.width);
const before = await barWidth();
await page.locator("button", { hasText: "+10 %" }).click();
await page.waitForTimeout(200);
const after = await barWidth();
check("progress bar re-rendered via diff", before === "40%" && after === "50%", `${before} -> ${after}`);

// 4. Alert dismiss + restore
await page.locator(".btn-close").click();
await page.waitForTimeout(200);
check("alert dismissed", (await page.locator(".alert").count()) === 0);
await page.locator("button", { hasText: "Alert wieder zeigen" }).click();
await page.waitForTimeout(200);
check("alert restored on remount", (await page.locator(".alert").count()) === 1);

// 5. Modal open/close
await page.locator("button", { hasText: "Modal öffnen" }).click();
await page.waitForTimeout(200);
check("modal visible", (await page.locator(".modal.d-block").count()) === 1);
check("modal title", (await page.locator(".modal-title").textContent()) === "Bestätigen");
await page.locator(".modal-footer .btn-secondary", { hasText: "Schließen" }).click();
await page.waitForTimeout(200);
check("modal closed via footer", (await page.locator(".modal.d-block").count()) === 0);

// 6. Tabs
const tabButtons = page.locator(".nav-tabs .nav-link");
check("three tabs rendered", (await tabButtons.count()) === 3);
check("first tab active", (await tabButtons.nth(0).getAttribute("class"))?.includes("active") === true);
await tabButtons.nth(2).click();
await page.waitForTimeout(200);
check("third tab active after click", (await tabButtons.nth(2).getAttribute("class"))?.includes("active") === true);
check("third pane shown", (await page.locator(".tab-pane").textContent())?.includes("Tab 3") === true);

// 7. Accordion
const accButtons = page.locator(".accordion-button");
check("two accordion items", (await accButtons.count()) === 2);
await accButtons.nth(1).click();
await page.waitForTimeout(200);
check("second item opens", (await page.locator(".accordion-body").textContent())?.includes("browserseitig") === true);
check("first item collapsed", (await accButtons.nth(0).getAttribute("class"))?.includes("collapsed") === true);

// 8. Dropdown
await page.locator(".dropdown-toggle").click();
await page.waitForTimeout(200);
check("dropdown menu open", (await page.locator(".dropdown-menu").count()) === 1);
await page.locator(".dropdown-item", { hasText: "Speichern" }).click();
await page.waitForTimeout(200);
check("dropdown selection shown", (await page.locator(".dropdown-toggle").textContent()) === "Speichern");
check("dropdown closed after select", (await page.locator(".dropdown-menu").count()) === 0);

// 9. Pagination
const pageIndicator = () => page.locator(".pagination").locator("xpath=ancestor::div[1]/span").textContent();
check("initial page indicator", (await pageIndicator())?.includes("Seite 2") === true);
await page.locator(".page-item.active .page-link").evaluate(() => {}); // existence
await page.locator(".page-link", { hasText: "5" }).click();
await page.waitForTimeout(200);
check("pagination switched to page 5", (await pageIndicator())?.includes("Seite 5") === true);
check("page 5 marked active", (await page.locator(".page-item.active .page-link").textContent()) === "5");

// 10. Collapse (scoped: the open accordion item also carries .collapse.show)
const collapseBody = () => page.locator(".collapse.show").filter({ hasText: "Versteckter Inhalt" });
check("collapse hidden", (await collapseBody().count()) === 0);
await page.locator("button", { hasText: "Collapse umschalten" }).click();
await page.waitForTimeout(200);
check("collapse visible", (await collapseBody().count()) === 1);

// 11. Breadcrumb + Table + ListGroup
check("breadcrumb active item", (await page.locator(".breadcrumb-item.active").textContent())?.trim() === "Beispiele");
check("table striped", (await page.locator(".table-striped").count()) === 1);
check("table rows", (await page.locator("tbody tr").count()) === 3);
await page.locator(".list-group-item", { hasText: "Klickbarer Eintrag" }).click();
await page.waitForTimeout(200);
check("listgroup click counted", (await page.locator(".list-group-item", { hasText: "Klickbarer Eintrag" }).textContent())?.includes("(1)") === true);

// 12. SPA intact: navigate via NavLink to /counter and back
await page.getByRole("link", { name: "Counter", exact: true }).click();
await page.waitForTimeout(300);
check("spa navigation to counter", (await page.locator("h1").textContent()) === "Counter");
await page.getByRole("link", { name: "Components", exact: true }).click();
await page.waitForTimeout(300);
check("spa navigation back", (await page.locator("h1").textContent())?.includes("Komponenten-POC") === true);

// 13. Console error check
check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(results.join("\n"));
const failed = results.filter((line) => line.startsWith("FAIL"));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
process.exit(failed.length > 0 ? 1 : 0);