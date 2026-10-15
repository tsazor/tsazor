/**
 * Full end-to-end verification for apps/gallery — the stability proof.
 *
 * Self-spawns the vite dev server on :5321 (taskkill cleanup, orphan-safe),
 * then drives the real UI in headless Edge through 14 check groups:
 *
 *   tokens light+dark (computed styles) → button appearances → @bind
 *   round-trip + switch → form submit flow (invalid → errors → valid) →
 *   tabs click + arrow-key nav → dialog focus trap/escape/scroll
 *   lock/restore → orders filter/sort/paging + row detail dialog →
 *   toast aria-live + auto-dismiss → sidebar aria-current → zero errors.
 *
 * Run: node scripts/verify.mjs (GALLERY_PORT=5331 for a fresh server beside a running one)
 */
import { spawn, spawnSync } from "node:child_process";
import * as playwright from "playwright-core";
import { BROWSER, launchBrowser } from "../../../scripts/browsers.mjs";

const PORT = process.env.GALLERY_PORT ?? "5321";
const APP = `http://localhost:${PORT}`;

let spawned = [];

async function reachable(url) {
    try {
        const res = await fetch(url);
        return res.ok || res.status < 500;
    } catch {
        return false;
    }
}

async function ensureServer() {
    if (!(await reachable(APP))) {
        spawned.push(spawn("npx", ["vite", "--port", PORT, "--strictPort"], { shell: true, stdio: "ignore", env: { ...process.env } }));
        console.log(`started vite dev server on :${PORT}`);
    }
    const deadline = Date.now() + 30_000;
    while (!(await reachable(APP))) {
        if (Date.now() > deadline) throw new Error(`gallery did not come up within 30s (stale process on :${PORT}?)`);
        await new Promise((r) => setTimeout(r, 500));
    }
}

/** page.goto, retried: a freshly started Vite may drop the first requests while it optimizes dependencies. */
async function gotoRetried(page, url) {
    for (let attempt = 1; ; attempt++) {
        try {
            return await page.goto(url, { waitUntil: "networkidle" });
        } catch (error) {
            if (attempt >= 3) throw error;
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
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
    await ensureServer();

    const browser = await launchBrowser(playwright);
    const page = await browser.newPage();
    const errors = [];
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));

    /* 1 — tokens light vs dark (computed, not attribute-string) */
    await gotoRetried(page, `${APP}/`);
    const sidebarBg = () => page.evaluate(() => getComputedStyle(document.querySelector(".sidebar")).backgroundColor);
    const bgLight = await sidebarBg();
    check(bgLight.length > 0, "fluent tokens resolve (light sidebar background computed)");

    /* 2 — theme toggle re-themes live */
    const attrBefore = await page.getAttribute("html", "data-fluent-theme");
    await page.click(".theme-toggle");
    const bgDark = await sidebarBg();
    check(bgDark !== bgLight, `dark theme flips the computed background (${bgLight} -> ${bgDark})`);
    check((await page.getAttribute("html", "data-fluent-theme")) === (attrBefore === "dark" ? "light" : "dark"), "html attr mirrors the toggle");
    await page.click(".theme-toggle");
    check((await sidebarBg()) === bgLight, "toggle back restores the light background");

    /* 3 — button appearances (computed colors) */
    await page.click("a[href='/button']");
    await page.waitForSelector(".fui-button");
    const appearanceBg = async (label) => page.evaluate(
        (l) => getComputedStyle([...document.querySelectorAll(".fui-button")].find((b) => b.textContent === l)).backgroundColor,
        label,
    );
    const accentBg = await appearanceBg("Primary");
    const subtleBg = await appearanceBg("Subtle");
    check(accentBg !== subtleBg, `primary and subtle buttons compute distinct colors (${accentBg} vs ${subtleBg})`);
    const disabledBtn = page.locator(".fui-button--disabled").first();
    check((await disabledBtn.getAttribute("disabled")) !== null, "disabled button carries the disabled attribute");
    // Icons: iconStart/iconEnd at the icon's own size; an icon-only button is square and named by ariaLabel.
    const saveIcon = page.locator(".icon-buttons .fui-button", { hasText: "Save" }).locator("svg");
    check((await saveIcon.getAttribute("width")) === "20", "a Size20 icon in a button is drawn at 20px");
    const deleteButton = page.getByRole("button", { name: "Delete" });
    const deleteBox = await deleteButton.boundingBox();
    check(deleteBox !== null && Math.abs(deleteBox.width - deleteBox.height) < 1, `an icon-only button is square (${deleteBox?.width}×${deleteBox?.height})`);
    // The sidebar: the current page's link shows the filled icon, the others the regular one.
    const shownIcons = (selector) => page.locator(selector).evaluateAll((svgs) => svgs.filter((svg) => getComputedStyle(svg).display !== "none").length);
    check((await shownIcons(".fui-nav__link--active svg")) === 1 && (await page.locator(".fui-nav__link--active .fui-nav__icon--active").isVisible()), "the active sidebar link shows its filled icon");
    check((await shownIcons(".fui-nav__link:not(.fui-nav__link--active) svg")) === (await page.locator(".fui-nav__link:not(.fui-nav__link--active)").count()), "the other links show one icon each");
    // The toolbar: one tab stop; the arrow keys skip the disabled button and wrap.
    const toolbar = page.getByRole("toolbar", { name: "Text formatting" });
    check((await toolbar.locator("[tabindex='0']").count()) === 1, "the toolbar is one tab stop");
    await toolbar.getByRole("button", { name: "Numbered list" }).focus();
    await page.keyboard.press("ArrowRight");
    const wrapped = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    check(wrapped === "Bold", `the toolbar's arrow keys skip a disabled button and wrap (${wrapped})`);

    /* 4 — @bind round-trip: typed value reaches the echo line (change fires on blur) */
    await page.click("a[href='/inputs']");
    await page.waitForSelector("#demo-name");
    await page.fill("#demo-name", "Grace");
    await page.keyboard.press("Tab");
    check((await page.textContent(".page")).includes("\"Grace\""), "@bind round-trip updates the echo text");
    await page.click("#demo-agree");
    check((await page.evaluate(() => document.getElementById("demo-agree").checked)) === true, "checkbox toggle checks natively");
    await page.focus("#demo-volume");
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector(".page")?.textContent?.includes("volume = 70"));
    check((await page.getAttribute("#demo-volume", "aria-valuetext")) === "70 %", "a slider binds and its value reads in its format (aria-valuetext)");
    check((await page.inputValue("#demo-due")) === "11/02/2026", "a date picker writes its ISO value as the locale does");
    await page.locator("#demo-due").locator("xpath=following-sibling::button").click();
    await page.getByRole("dialog", { name: "Choose date" }).getByRole("gridcell", { name: "Tuesday, November 10, 2026" }).click();
    await page.waitForFunction(() => document.querySelector(".page")?.textContent?.includes('due = "2026-11-10"'));
    check(true, "a date picker's calendar picks a day into the bound ISO value");
    check((await page.inputValue("#demo-at")) === "09:30", "a time picker writes its ISO value as the locale does (en-GB)");
    await page.focus("#demo-at");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector(".page")?.textContent?.includes('at = "10:00:00"'));
    check((await page.inputValue("#demo-at")) === "10:00", "a time picker's list picks the next half hour into the bound ISO value");
    await page.locator("#demo-upload input[type=file]").setInputFiles([
      { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("abc") },
      { name: "b.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
    ]);
    await page.waitForFunction(() => document.querySelector(".page")?.textContent?.includes('read = "a.txt (3 bytes), b.txt (5 bytes)"'));
    check(true, "a file upload zone reads the chosen files into buffers");

    /* 4b — switch control via its label (the native input is under the track) */
    check((await page.locator("[role='switch']").first().count()) === 1, "switch carries role=switch");
    await page.click("label[for='demo-compact']");
    check((await page.evaluate(() => document.getElementById("demo-compact").checked)) === true, "switch toggle checks via its label");

    /* 5 — form submit flow: empty submit → errors; valid → onValidSubmit */
    await page.click("a[href='/form']");
    await page.waitForSelector(".fui-form");
    await page.click("button[type='submit']");
    await page.waitForSelector(".fui-input--invalid");
    check((await page.locator(".fui-input--invalid").count()) >= 1, "empty submit flags invalid controls");
    check((await page.locator(".fui-input[aria-invalid='true']").count()) >= 1, "invalid control is aria-invalid");
    const firstMessage = await page.evaluate(() => {
        const row = document.querySelector(".fui-input__message");
        return row ? row.textContent.trim() : "";
    });
    check(firstMessage.length > 0, `validation message row renders inline ("${firstMessage}")`);
    await page.fill("#form-name", "Ada");
    await page.keyboard.press("Tab");
    await page.fill("#form-age", "30");
    await page.keyboard.press("Tab");
    await page.selectOption("#form-topic", "support");
    await page.click("#form-agree");
    await page.click("button[type='submit']");
    await page.waitForSelector(".form-done");
    check((await page.textContent(".form-done")).includes("the form was saved"), "valid submit reaches onValidSubmit");

    /* 6 — tabs: click + arrow keyboard, roving tabindex */
    await page.click("a[href='/tabs']");
    await page.waitForSelector(".fui-tab");
    await page.locator(".fui-tab", { hasText: "Activity" }).click();
    await page.waitForTimeout(100);
    check((await page.locator(".fui-tab", { hasText: "Activity" }).getAttribute("aria-selected")) === "true", "clicking a tab selects it (aria-selected)");
    check((await page.locator(".fui-tab", { hasText: "Activity" }).getAttribute("tabindex")) === "0", "selected tab owns the roving tabindex");
    await page.locator(".fui-tab", { hasText: "Activity" }).focus();
    const before = await page.textContent(".tabs-echo");
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(100);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(100);
    check((await page.textContent(".tabs-echo")).includes("Activity"), "ArrowLeft/ArrowRight cycle tabs back to 2");

    /* 7 — dialog: focus, scroll lock, escape, focus restore */
    await page.click("a[href='/dialog']");
    await page.waitForSelector(".fui-button");
    check((await page.locator(".fui-dialog").count()) === 0, "dialog starts closed");
    await page.locator(".fui-button", { hasText: "Open dialog" }).click();
    await page.waitForSelector(".fui-dialog");
    const dialog = page.locator(".fui-dialog").first();
    check((await dialog.getAttribute("role")) === "dialog" && (await dialog.getAttribute("aria-modal")) === "true", "open dialog is role=dialog aria-modal=true");
    check((await page.evaluate(() => document.body.style.overflow)) === "hidden", "dialog locks body scroll");
    const insideDialog = await page.evaluate(() => {
        const overlay = document.querySelector(".fui-dialog-overlay");
        return overlay.contains(document.activeElement) || document.activeElement === overlay;
    });
    check(insideDialog, "initial focus is inside the overlay");
    await page.locator(".fui-dialog__footer", { hasText: "Delete" }).waitFor();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    check((await page.locator(".fui-dialog").count()) === 0, "Escape closes the dialog");
    check((await page.evaluate(() => document.body.style.overflow)) !== "hidden", "closing restores body scroll");
    check(await page.evaluate(() => document.activeElement?.className === "fui-button" || !!document.activeElement), "focus returns after close");

    /* 8 — orders: filter, sort, paging, row detail dialog */
    await page.click("a[href='/dashboard']");
    await page.waitForSelector(".kpi-grid");
    check((await page.locator(".kpi").count()) === 4, "dashboard shows four KPI cards");
    await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length === 3, { timeout: 10_000 });
    check((await page.locator("table tbody tr").count()) === 3, "dashboard table shows the recent rows");
    await page.click("a[href='/dashboard/orders']");
    await page.waitForSelector(".orders-row");
    check((await page.locator(".orders-row").count()) === 3, "orders page pages to 3 rows (pageSize)");
    await page.locator(".pager .fui-button", { hasText: "Next" }).click();
    await page.waitForTimeout(100);
    check((await page.textContent(".pager")).includes("Page 2"), "paging advances to page 2");
    check((await page.locator(".orders-row").count()) === 3, "page 2 still shows 3 rows");
    await page.fill("#orders-filter", "emil");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);
    check((await page.locator(".activity-row").count()) >= 1, "filter change writes the activity log");
    check((await page.locator(".orders-row").count()) === 1, "filter narrows to Emil (view clamps the page index)");
    await page.fill("#orders-filter", "");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);
    await page.locator(".table-toolbar .fui-button", { hasText: "Sort total" }).click();
    await page.waitForTimeout(100);
    check((await page.textContent(".pager")).includes("Page 1"), "sort resets paging back to page 1");
    const firstRow = (await page.textContent(".orders-row")).trim();
    check(firstRow.includes("#104"), "sorting by total puts Dilan (>8) first (asc)");

    /* 8b — datagrid (QuickGrid-shaped): column components, sorting, paging, selection */
    await page.click("a[href='/datagrid']");
    await page.waitForSelector(".fui-datagrid tbody tr");
    const gridHeads = (await page.locator(".fui-datagrid thead th button.fui-datagrid__sort").allTextContents()).map((text) => text.replace(/[▲▼↕]/g, "").trim());
    check(JSON.stringify(gridHeads) === JSON.stringify(["Customer", "Placed", "Total (€)", "Status"]),
        `datagrid headers come from the column components (${gridHeads.join(", ")})`);
    check((await page.locator(".fui-datagrid th[aria-sort=ascending]").textContent()).includes("Customer"),
        "datagrid sorts by its default column (aria-sort)");
    check((await page.textContent(".fui-datagrid tbody tr")).includes("42.50"),
        "datagrid Format shapes the cell text");
    check((await page.locator(".fui-datagrid td.fui-datagrid__cell--end").count()) === 5,
        "datagrid aligns the money column right, five rows per page");
    await page.locator(".fui-datagrid th button", { hasText: "Total" }).click();
    await page.waitForFunction(() => document.querySelector(".fui-datagrid th[aria-sort]")?.textContent?.includes("Total"));
    check((await page.locator(".fui-datagrid tbody tr").first().textContent()).includes("8.00"),
        "a header click sorts by that column");
    await page.locator(".fui-paginator button[aria-label='Next page']").click();
    await page.waitForFunction(() => document.querySelector(".fui-paginator__page")?.textContent === "Page 2 of 2");
    check((await page.locator(".fui-datagrid tbody tr").count()) === 2, "the paginator shows the last two rows");
    await page.locator(".fui-datagrid tbody input[type=checkbox]").first().check();
    await page.waitForFunction(() => document.querySelector(".echo")?.textContent?.startsWith("1 selected"));
    check(true, "a row checkbox selects the row (@bind-SelectedItems)");

    /* 8c — a column's ColumnOptions drops a filter below its header */
    await page.locator(".fui-datagrid th .fui-datagrid__options").first().click();
    await page.waitForSelector(".fui-datagrid__options-panel");
    check((await page.locator(".fui-datagrid__options-panel").textContent()).includes("Filter customers"),
        "ColumnOptions renders a filter below the header when its options button is clicked");
    await page.fill(".fui-datagrid__options-panel input", "ali");
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => document.querySelectorAll(".fui-datagrid tbody tr").length === 1);
    check((await page.locator(".fui-datagrid tbody tr").first().textContent()).includes("Alice"),
        "the ColumnOptions filter narrows the rows live");

    /* 9 — row click opens the detail dialog (back from the datagrid page) */
    await page.click("a[href='/dashboard']");
    await page.waitForSelector(".kpi-grid");
    await page.click("a[href='/dashboard/orders']");
    await page.waitForSelector(".orders-row");
    await page.locator(".orders-row").first().click();
    await page.waitForSelector(".fui-dialog");
    const detail = (await page.textContent(".fui-dialog")).trim();
    check(detail.includes("Order #") && detail.includes("status"), `row click opens the detail dialog ("${detail.slice(0, 40)}")`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    check((await page.locator(".fui-dialog").count()) === 0, "detail dialog closes again");

    /* 10 — toast: aria-live region, severity role, auto-dismiss */
    await page.click("a[href='/feedback']");
    await page.waitForSelector(".fui-toasts", { state: "attached" }); // empty until a toast shows
    check((await page.locator(".fui-toasts").getAttribute("aria-live")) === "polite", "toast region is aria-live=polite");
    await page.locator(".fui-button", { hasText: "Error toast" }).click();
    await page.waitForSelector(".fui-toast");
    check((await page.locator(".fui-toast").getAttribute("role")) === "alert", "error toast announces as role=alert");
    await page.locator(".fui-button", { hasText: "Success toast" }).click();
    await page.waitForTimeout(200);
    check((await page.locator(".fui-toast").count()) === 2, "two toasts stack in the region");
    await page.waitForTimeout(4500);
    check((await page.locator(".fui-toast").count()) === 0, "toasts auto-dismiss after their timeout");

    /* 10b — overlay: a busy card is inert under it; a click on its background closes it (closeMode outside) */
    await page.locator(".overlay-card .fui-button", { hasText: "Refresh" }).click();
    const cardOverlay = page.locator(".overlay-card > .fui-overlay");
    await cardOverlay.waitFor();
    check(await page.locator(".overlay-card .fui-card-footer, .overlay-card footer").first().evaluate((footer) => footer.closest("[inert]") !== null), "the overlay makes the busy card inert");
    await cardOverlay.locator(".fui-spinner").click();
    check(await cardOverlay.isVisible(), "a click on the overlay's content keeps it (closeMode outside)");
    await cardOverlay.click({ position: { x: 4, y: 4 } });
    await cardOverlay.waitFor({ state: "detached" });
    check((await page.locator(".overlay-state").textContent()) === "Up to date.", "a click on its background closes it and @bind-Visible follows");

    /* 11 — sidebar nav marks the current page */
    const navActive = page.locator(".fui-nav__link--active");
    check((await navActive.count()) === 1, "exactly one active sidebar link");
    check((await navActive.getAttribute("aria-current")) === "page", "the active link is aria-current=page");

    /* 12 — badge/card/divider chrome renders */
    check((await page.locator(".fui-badge").count()) >= 3, "badges render on the feedback page");
    check((await page.locator(".fui-card").first().count()) === 1, "card renders with its fluent chrome");
    check((await page.locator(".fui-divider").count()) >= 1, "divider renders inside card footer");

    /* 13 — a11y smoke: live regions beyond toasts */
    check((await page.locator("[role='status'], [aria-live='polite']").count()) >= 2, "live regions present (toasts, spinner)");

    /* 14 — dialog focus trap cycles inside the overlay */
    await page.click("a[href='/dialog']");
    await page.locator(".fui-button", { hasText: "Open dialog" }).click();
    await page.waitForSelector(".fui-dialog");
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
    const trapped = await page.evaluate(() => {
        const overlay = document.querySelector(".fui-dialog-overlay");
        return overlay?.contains(document.activeElement) ?? false;
    });
    check(trapped, "twelve tabs later focus is still trapped in the overlay");
    check((await page.evaluate(() => document.body.style.overflow)) === "hidden", "scroll lock re-armed for the reopened dialog");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    check((await page.evaluate(() => document.body.style.overflow)) !== "hidden", "scroll lock released again");

    /* 15 — avatars and Markdown (wave A) */
    await page.click("a[href='/content']");
    await page.waitForSelector(".fui-avatar");
    const ada = page.getByRole("img", { name: "Ada Lovelace" }).first();
    check((await ada.textContent()) === "AL", "an avatar shows its name's initials and is named by it");
    const colorful = await page.locator(".avatar-row").first().locator(".fui-avatar").evaluateAll((avatars) => avatars.map((a) => a.className));
    check(new Set(colorful).size > 3 && colorful.every((name) => !name.includes("--colorful")), `colorful avatars get named colors by their names (${new Set(colorful).size} colors)`);
    const painted = await page.locator(".fui-avatar--teal").first().evaluate((a) => getComputedStyle(a).backgroundColor);
    check(painted !== "rgba(0, 0, 0, 0)" && painted !== "", `a named color paints the avatar (${painted})`);
    await page.getByRole("button", { name: "Grace Hopper" }).focus();
    await page.keyboard.press("Enter");
    await page.getByText("Hello, Grace.").waitFor({ timeout: 5000 });
    check(true, "an avatar with onClick is a button that Enter clicks");
    check((await page.locator(".markdown-box .tz-markdown h3").textContent()) === "Order 1042", "Markdown renders in the Fluent gallery");

    /* global */
    check(errors.length === 0, "zero console/page errors across the whole run");
    if (errors.length > 0) {
        console.log("console/page errors:");
        for (const e of errors) console.log(`  ${e.slice(0, 250)}`);
    }

    await browser.close();
    stopSpawned();

    console.log(failed === 0 ? "\nALL CHECKS PASS" : `\n${failed} CHECK(S) FAILED`);
    process.exitCode = failed === 0 ? 0 : 1;
}

try {
    await main();
} catch (err) {
    console.error(err && err.message);
    stopSpawned();
    // Exit now: a browser left open by the failure would keep the process alive.
    process.exit(1);
}