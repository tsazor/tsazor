/**
 * E9 — accessibility gate for @tsazor/fluent (WCAG 2.2 AA, automated part).
 *
 * 1. axe-core on every gallery route, in the light and the dark theme (the
 *    contrast differs), and on the open dialog; any violation fails.
 * 2. Keyboard and focus behavior of the interactive components (WAI-ARIA
 *    Authoring Practices): the dialog's focus trap in both directions,
 *    Escape and focus restore; the tabs' arrow/Home/End keys and roving
 *    tabindex.
 *
 * Automated checks find only part of the WCAG issues; the manual
 * screen-reader audit is a separate item before 1.0 (roadmap E9).
 *
 * Run: node scripts/verify-a11y.mjs (self-spawns vite on :5321 like verify.mjs)
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import * as playwright from "playwright-core";
import { BROWSER, launchBrowser } from "../../../scripts/browsers.mjs";

// The app's port: GALLERY_PORT, or the first free one from 5321 on; always an own vite
// (a foreign app on the port is never ours — its own feeds block networkidle forever).
const GALLERY_PORT = process.env.GALLERY_PORT;
const BASE_PORT = Number(GALLERY_PORT ?? 5321);
const PORT = GALLERY_PORT !== undefined
    ? BASE_PORT
    : await (async () => {
        for (let attempt = 0; attempt < 10; attempt++) {
            const candidate = BASE_PORT + attempt;
            try {
                await fetch(`http://localhost:${candidate}/`);
            } catch {
                return candidate; // nothing answered: free
            }
        }
        throw new Error(`no free port for the gallery in ${BASE_PORT}–${BASE_PORT + 9} (set GALLERY_PORT)`);
    })();
const PORT_TEXT = String(PORT);
const APP = `http://localhost:${PORT}`;
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ROUTES = ["/", "/button", "/inputs", "/form", "/tabs", "/dialog", "/overlays", "/structure", "/more", "/table", "/datagrid", "/feedback", "/content", "/primitives", "/theme", "/dashboard", "/dashboard/orders", "/dashboard/settings"];

const spawned = [];
async function reachable(url) {
    try {
        const res = await fetch(url);
        return res.ok || res.status < 500;
    } catch {
        return false;
    }
}
async function ensureServer() {
    // Always our own vite; nothing reachable counts as ours (the port note above).
    spawned.push(spawn("npx", ["vite", "--port", PORT_TEXT, "--strictPort"], { shell: true, stdio: "ignore", env: { ...process.env } }));
    console.log(`started vite dev server on :${PORT}`);
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

/** axe-core on the current document; returns readable violations. */
async function axe(page, context = "document") {
    if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE });
    const violations = await page.evaluate(
        async ([selector, tags]) => {
            const root = selector === "document" ? document : document.querySelector(selector);
            const result = await window.axe.run(root, { runOnly: { type: "tag", values: tags } });
            return result.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}×) ${v.nodes[0]?.target.join(" ")} — ${(v.nodes[0]?.any[0] ?? v.nodes[0]?.all[0])?.message ?? ""}`);
        },
        [context, WCAG_TAGS],
    );
    return violations;
}

const focused = (page) => page.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""}:${(el.textContent ?? "").trim().slice(0, 20)}` : "none";
});

async function main() {
    await ensureServer();
    const browser = await launchBrowser(playwright);
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    /* 1 — axe on every route, light and dark */
    for (const theme of ["light", "dark"]) {
        for (const route of ROUTES) {
            await gotoRetried(page, `${APP}${route}`);
            // A page that failed to load is empty, and axe finds nothing wrong with nothing.
            await page.waitForSelector("h1", { timeout: 15_000 });
            const current = await page.getAttribute("html", "data-fluent-theme");
            if ((current ?? "light") !== theme) {
                // A programmatic click: a toast or an overlay may cover the toggle.
                await page.$eval(".theme-toggle", (button) => button.click());
                await page.waitForTimeout(100);
            }
            const violations = await axe(page);
            check(violations.length === 0, `axe ${theme} ${route}${violations.length ? `: ${violations.join(" | ")}` : ""}`);
        }
    }

    /* 2 — the dialog: axe while open, focus trap both ways, Escape, focus restore */
    await page.goto(`${APP}/dialog`, { waitUntil: "networkidle" });
    const trigger = page.locator("button", { hasText: "Open dialog" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector("[role=dialog]");
    // Measure the settled dialog, not a frame of its fade-in.
    // Settle finite animations first (a cancelled one counts as done) — at most 3 s: a headless
  // engine that doesn't advance animations (WebKit) must not hold the gate.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]),
  );
    const openViolations = await axe(page, "[role=dialog]");
    check(openViolations.length === 0, `axe on the open dialog${openViolations.length ? `: ${openViolations.join(" | ")}` : ""}`);
    check(await page.evaluate(() => document.querySelector("[role=dialog]")?.closest(".fui-dialog-overlay")?.contains(document.activeElement)), "opening moves focus into the dialog");
    // Forward: close → Cancel → Delete → (wrap) close.
    const forward = [];
    for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Tab");
        forward.push(await focused(page));
    }
    check(forward[3] === forward[0] && forward.slice(0, 3).every((f) => f.startsWith("button")), `Tab cycles inside the dialog (${forward.join(" → ")})`);
    // Backward from the last element: to the previous one, not to the first.
    await page.keyboard.press("Tab"); // now on the 2nd (Cancel)
    await page.keyboard.press("Tab"); // now on the 3rd (Delete), the last
    const last = await focused(page);
    await page.keyboard.press("Shift+Tab");
    const previous = await focused(page);
    check(previous === forward[1], `Shift+Tab from the last element goes to the previous one (${last} → ${previous})`);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    check((await focused(page)) === forward[2], "Shift+Tab from the first element wraps to the last");
    await page.keyboard.press("Escape");
    await page.waitForSelector("[role=dialog]", { state: "detached" });
    check((await focused(page)).includes("Open dialog"), `Escape closes and focus returns to the trigger (${await focused(page)})`);

    /* 3 — the tabs: arrow keys, Home/End, roving tabindex, aria-selected */
    await page.goto(`${APP}/tabs`, { waitUntil: "networkidle" });
    const tabState = () => page.evaluate(() => [...document.querySelectorAll("#demo-tabs [role=tab], [role=tablist] [role=tab]")].map((t) => `${t.textContent?.trim()}:${t.getAttribute("aria-selected")}:${t.getAttribute("tabindex")}`));
    await page.locator("[role=tab]").first().focus();
    await page.keyboard.press("ArrowRight");
    let tabs = await tabState();
    check(tabs[1]?.endsWith(":true:0") && tabs.filter((t) => t.endsWith(":0")).length === 1, `ArrowRight selects the next tab; one tab in the tab order (${tabs.join(", ")})`);
    check((await focused(page)).includes("Activity"), "focus follows the selection");
    await page.keyboard.press("End");
    tabs = await tabState();
    check(tabs[tabs.length - 1]?.endsWith(":true:0"), "End selects the last tab");
    await page.keyboard.press("Home");
    tabs = await tabState();
    check(tabs[0]?.endsWith(":true:0"), "Home selects the first tab");
    await page.keyboard.press("ArrowLeft");
    tabs = await tabState();
    check(tabs[tabs.length - 1]?.endsWith(":true:0"), "ArrowLeft from the first tab wraps to the last");
    const panelLabel = await page.evaluate(() => {
        const panel = document.querySelector("[role=tabpanel]");
        const label = panel && document.getElementById(panel.getAttribute("aria-labelledby") ?? "");
        return label?.getAttribute("role") ?? null;
    });
    check(panelLabel === "tab", "the visible panel is labelled by its tab");

    /* 4 — menu, drawer, tooltip (the @tsazor/ui behaviors in the Fluent skin) */
    await page.goto(`${APP}/overlays`, { waitUntil: "networkidle" });
    const focusedText = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    const toggle = page.locator(".fui-menu-button__toggle");
    await toggle.focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForSelector("[role=menu]");
    check((await focusedText()) === "Copy", "menu: ArrowDown opens it on the first item");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    check((await focusedText()) === "Archive", "menu: the arrow keys skip the disabled item");
    const menuViolations = await axe(page);
    check(menuViolations.length === 0, `axe /overlays with the menu open${menuViolations.length ? `: ${menuViolations.join(" | ")}` : ""}`);
    await page.keyboard.press("Enter");
    await page.waitForSelector("[role=menu]", { state: "detached" });
    check((await page.textContent(".menu-choice")) === "Chose Archive." && (await toggle.evaluate((el) => el === document.activeElement)), "menu: Enter chooses the item, closes the menu and returns focus");

    await page.locator(".fui-button", { hasText: "Filters" }).click();
    await page.waitForSelector(".fui-drawer");
    check(await page.evaluate(() => document.querySelector(".fui-drawer")?.contains(document.activeElement) ?? false), "drawer: focus moves into the panel");
    const drawerViolations = await axe(page);
    check(drawerViolations.length === 0, `axe /overlays with the drawer open${drawerViolations.length ? `: ${drawerViolations.join(" | ")}` : ""}`);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".fui-drawer", { state: "detached" });
    check((await focusedText()) === "Filters", "drawer: Escape closes it and focus returns to the opener");

    await page.locator("[aria-label=Print]").focus();
    await page.waitForSelector("[role=tooltip]");
    const described = await page.locator("[aria-label=Print]").evaluate((el) => document.getElementById(el.getAttribute("aria-describedby") ?? "")?.textContent);
    check(described === "Print the order list", `tooltip: describes the button (${described})`);
    const tooltipViolations = await axe(page);
    check(tooltipViolations.length === 0, `axe /overlays with a tooltip${tooltipViolations.length ? `: ${tooltipViolations.join(" | ")}` : ""}`);
    await page.keyboard.press("Escape");
    check((await page.locator("[role=tooltip]:visible").count()) === 0, "tooltip: Escape hides it (it stays in the DOM, hidden, for browse mode)");

    /* 5 — accordion, radio group, collapse (the structure page) */
    await page.goto(`${APP}/structure`, { waitUntil: "networkidle" });
    const headers = page.locator(".fui-accordion__button");
    await headers.nth(1).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll(".fui-accordion__button")[1]?.getAttribute("aria-expanded") === "true");
    check((await page.locator(".fui-accordion__panel").textContent())?.includes("Invoice") === true && (await headers.nth(0).getAttribute("aria-expanded")) === "false",
        "accordion: Enter on a header opens its panel and closes the other");
    await page.getByLabel("Sliced", { exact: true }).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector(".echo")?.textContent === "Slicing: thin");
    check(true, "radio group: the arrow keys move the choice (@bind-Value)");
    await page.locator(".fui-button", { hasText: "Details" }).click();
    await page.waitForSelector(".fui-collapse");
    check((await page.locator(".fui-button", { hasText: "Details" }).getAttribute("aria-expanded")) === "true", "collapse: the toggle says it is expanded");
    const structureViolations = await axe(page);
    check(structureViolations.length === 0, `axe /structure with a panel and the details open${structureViolations.length ? `: ${structureViolations.join(" | ")}` : ""}`);

    /* 6 — popover, button group, date field (the "more" page) */
    await page.goto(`${APP}/more`, { waitUntil: "networkidle" });
    const opener = page.getByRole("button", { name: "Opening hours" });
    await opener.click();
    await page.waitForSelector(".fui-popover");
    check(await page.evaluate(() => document.activeElement?.classList.contains("fui-popover") ?? false), "popover: focus moves into it");
    const popoverViolations = await axe(page);
    check(popoverViolations.length === 0, `axe /more with the popover open${popoverViolations.length ? `: ${popoverViolations.join(" | ")}` : ""}`);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".fui-popover", { state: "detached" });
    check(await opener.evaluate((el) => el === document.activeElement), "popover: Escape closes it and focus returns to the button");
    check((await page.getByRole("group", { name: "View" }).locator("button").count()) === 3, "button group: a named group of three buttons");
    await page.getByRole("button", { name: "Month" }).click();
    await page.waitForFunction(() => document.querySelector(".view-choice")?.textContent === "View: month");
    await page.getByLabel("Delivery date").fill("2026-10-09");
    await page.getByLabel("Delivery date").dispatchEvent("change");
    await page.waitForFunction(() => document.querySelector(".delivery-echo")?.textContent === "Delivery: 2026-10-09");
    check(true, "date field: the ISO date text binds (@bind-Value)");

    check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await browser.close();
}

main()
    .catch((error) => {
        console.error(error);
        failed++;
    })
    .finally(() => {
        stopSpawned();
        console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
        // Exit now: a browser left open by a failure would keep the process alive.
        process.exit(failed === 0 ? 0 : 1);
    });
