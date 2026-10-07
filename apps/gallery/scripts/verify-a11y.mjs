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

const APP = "http://localhost:5321";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ROUTES = ["/", "/button", "/inputs", "/form", "/tabs", "/dialog", "/table", "/datagrid", "/feedback", "/primitives", "/theme", "/dashboard", "/dashboard/orders", "/dashboard/settings"];

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
    if (!(await reachable(APP))) {
        spawned.push(spawn("npx", ["vite", "--port", "5321", "--strictPort"], { shell: true, stdio: "ignore", env: { ...process.env } }));
        console.log("started vite dev server on :5321");
    }
    const deadline = Date.now() + 30_000;
    while (!(await reachable(APP))) {
        if (Date.now() > deadline) throw new Error("gallery did not come up within 30s (stale process on :5321?)");
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
