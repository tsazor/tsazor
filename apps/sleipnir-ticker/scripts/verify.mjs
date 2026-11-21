/**
 * End-to-end verification for the Sleipnir-Ticker app (ASP.NET Core API +
 * Tsazor frontend over Sleipnir SSE events).
 *
 * Starts the API (:5310) and the vite dev server (:5311) if they are not
 * already running, forces synthetic ticker mode for determinism, then drives
 * the live-data flow in headless Edge:
 *
 *   snapshot renders → ≥2 live updates arrive via SSE without interaction
 *   → sparkline populated (scoped CSS isolation) → event log populated
 *   → /history table → navigate back: subscription survives the route change
 *   → /jobs: server field errors under their fields → a valid job streams its
 *     progress to completion → late and mid-run subscribers get the history
 *   → zero console/page errors throughout
 *
 * Run: node scripts/verify.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import * as playwright from "playwright-core";
import { BROWSER, launchBrowser } from "../../../scripts/browsers.mjs";

const APP = "http://localhost:5311";
const API = "http://localhost:5310";

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
    if (!(await reachable(`${API}/api/sleipnir/discovery`))) {
        spawned.push(spawn("dotnet run --project api", { stdio: "ignore", shell: true, env: { ...process.env, TICKER_MODE: "synthetic" } }));
        console.log("started API on :5310 (synthetic)");
    }
    if (!(await reachable(APP))) {
        spawned.push(spawn("npx vite --port 5311 --strictPort", { shell: true, stdio: "ignore", env: { ...process.env } }));
        console.log("started vite dev server on :5311");
    }
    const deadline = Date.now() + 30_000;
    while (!(await reachable(APP)) || !(await reachable(`${API}/api/sleipnir/discovery`))) {
        if (Date.now() > deadline) throw new Error("servers did not come up within 30s (stale process on :5310/:5311?)");
        await new Promise((r) => setTimeout(r, 500));
    }
}

function stopSpawned() {
    for (const child of spawned) {
        try {
            spawnSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore", shell: true });
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

const PRICE_RE = /^[0-9,]+\.[0-9]{2}$/;

async function main() {
    await ensureServices();

    /* Sanity: the API itself answers the typed contract (camelCase). */
    const call = await fetch(`${API}/api/sleipnir/json`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controller: "Market", method: "GetTicker", id: "verify" }),
    });
    check(call.status === 200, "REST call endpoint reachable");
    const envelope = await call.json();
    check(
        typeof envelope.data?.lastPrice === "number" && typeof envelope.data?.symbol === "string",
        "TickerSnapshot arrives camelCase with numeric lastPrice",
    );
    check(envelope.data?.mode === "synthetic", "verify runs against the synthetic feed");

    const browser = await launchBrowser(playwright);
    const page = await browser.newPage();
    const errors = [];
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    const text = (selector) => page.locator(selector).first().textContent().then((t) => t.trim());

    try {
        /* --- Initial render --- */
        await page.goto(`${APP}/`, { waitUntil: "load" });
        await page.waitForSelector(".ticker-price .price", { timeout: 15_000 });
        // The first render shows the "—" placeholder (loading state) until the
        // snapshot call resolves — wait for a real price before sampling.
        await page.waitForFunction(() => /\d/.test(document.querySelector(".ticker-price .price")?.textContent ?? ""), null, { timeout: 15_000 });
        const readPrice = async () => {
            const t = (await text(".ticker-price .price")).replace(/^\$/, "").replace(/,/g, "");
            return Number(t);
        };
        const initialPrice = await readPrice();
        check(Number.isFinite(initialPrice) && initialPrice > 1, "big price renders in the panel");
        check(Math.abs(initialPrice - envelope.data.lastPrice) < 5000, "rendered price matches the API snapshot");

        /* --- Live push, no interaction: sample and count distinct prices --- */
        const collectDistinct = async (needed, ticks) => {
            const seen = new Set([await readPrice()]);
            const deadline = Date.now() + 15_000;
            while (seen.size < needed && Date.now() < deadline && ticks-- > 0) {
                await page.waitForTimeout(500);
                seen.add(await readPrice());
            }
            return seen.size;
        };
        const firstWindow = await collectDistinct(3, 30);
        check(firstWindow >= 3, "at least two live updates arrive via SSE without interaction");

        /* --- Connection badge --- */
        const statusText = await text(".nav .badge");
        check(statusText === "synthetic feed" || statusText === "Binance live", "connection badge shows the feed state");

        /* --- Sparkline (populated, scoped) + event log --- */
        const polyPoints = await page.locator("svg.sparkline-svg polyline").first().getAttribute("points");
        check(polyPoints !== null && polyPoints.split(" ").length > 40, "sparkline polyline carries a populated point set");
        // Elements created outside the SVG namespace are HTMLUnknownElement and
        // paint nothing — assert the browser really draws the line.
        const drawn = await page.locator("svg.sparkline-svg polyline").first().evaluate((el) => ({
            ns: el.namespaceURI,
            width: typeof el.getBBox === "function" ? el.getBBox().width : 0,
        }));
        check(drawn.ns === "http://www.w3.org/2000/svg" && drawn.width > 0, `sparkline is drawn as SVG (ns=${drawn.ns}, bbox width=${drawn.width})`);
        check((await page.locator(".list-group-item").count()) >= 2, "event log shows received ticks");
        const scopeAttr = await page.evaluate(() => {
            const box = document.querySelector(".sparkline-box");
            return box ? [...box.attributes].some((a) => /^b-[0-9a-f]{8}$/.test(a.name)) : false;
        });
        check(scopeAttr, "Sparkline markup is stamped with the scope attribute (CSS isolation)");

        /* --- /history route + subscription survival --- */
        await page.locator(".nav a[href='/history']").click();
        await page.waitForTimeout(1200);
        check(page.url().endsWith("/history"), "history route reached via navbar");
        const rows = await page.locator(".history-table tbody tr").count();
        check(rows >= 50, "history table lists the ring buffer");
        await page.locator(".nav a[href='/']").click();
        await page.waitForTimeout(2000);
        const afterReturn = await readPrice();
        check(Number.isFinite(afterReturn) && afterReturn > 1, "returning from /history re-renders the panel");
        const survivedWindow = await collectDistinct(2, 20);
        check(survivedWindow >= 2, "SSE subscription survives the route change (a new tick arrives unprompted)");

        /* --- /jobs: server validation errors land under their fields --- */
        await page.locator(".nav a[href='/jobs']").click();
        await page.waitForSelector(".job-form", { timeout: 10_000 });
        await page.fill("#job-label", "");
        await page.fill("#job-points", "100000");
        await page.locator(".job-form button[type=submit]").click();
        await page.waitForSelector(".field-points .validation-message", { timeout: 10_000 });
        const labelError = await text(".field-label .validation-message");
        const pointsError = await text(".field-points .validation-message");
        check(labelError === "The label is required.", `server field error under Label (${labelError})`);
        check(/^Only \d+ points are recorded so far\.$/.test(pointsError), `server field error under Points (${pointsError})`);
        check(page.url().endsWith("/jobs"), "an invalid job does not navigate");
        // Editing a field drops that field's server message, and only that one.
        await page.fill("#job-points", "20");
        await page.locator("#job-points").blur();
        await page.waitForTimeout(300);
        check(
            (await page.locator(".field-points .validation-message").count()) === 0
                && (await page.locator(".field-label .validation-message").count()) === 1,
            "editing a field clears its server error, the other stays",
        );

        /* --- a valid job: its page streams progress to completion --- */
        await page.fill("#job-label", `verify ${Date.now()}`);
        await page.locator("#job-label").blur();
        await page.locator(".job-form button[type=submit]").click();
        await page.waitForURL(/\/jobs\/\d+$/, { timeout: 10_000 });
        const jobUrl = page.url();
        const completed = () => document.querySelector(".job-state")?.textContent?.trim() === "completed";
        await page.waitForFunction(completed, null, { timeout: 15_000 });
        const events = await page.locator(".job-page .list-group-item").count();
        check(events === 11, `the job page shows every progress event (${events}/11), then the stream completes`);
        check((await page.locator(".job-result dd").count()) === 4, "the last event carries the result");
        check((await page.locator(".job-page .progress").first().getAttribute("aria-valuenow")) === "100", "progress bar at 100");

        /* --- a late subscriber: opened after the end, it still gets history + completion --- */
        await page.goto(jobUrl, { waitUntil: "load" });
        await page.waitForFunction(completed, null, { timeout: 10_000 });
        const replayed = await page.locator(".job-page .seq").allTextContents();
        check(replayed.length === 11 && replayed[0] === "#1", `a late subscriber gets the job's history from seq 1 (${replayed.length} events)`);

        /* --- a subscriber that joins mid-run: history first, then live, no duplicates --- */
        const started = await fetch(`${API}/api/sleipnir/json`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                controller: "Jobs",
                method: "Start",
                id: "verify-job",
                params: [{ parameterName: "request", num: -1, data: { label: `mid ${Date.now()}`, points: 20 } }],
            }),
        }).then((r) => r.json());
        check(typeof started.data?.id === "number", "Jobs.Start answers with the new job");
        await page.waitForTimeout(1000);
        await page.goto(`${APP}/jobs/${started.data?.id}`, { waitUntil: "load" });
        await page.waitForFunction(completed, null, { timeout: 15_000 });
        const seqs = (await page.locator(".job-page .seq").allTextContents()).map((s) => Number(s.replace("#", "")));
        check(seqs.length === 11 && seqs.every((s, i) => s === i + 1), `a mid-run subscriber sees seq 1…11 once each (${seqs.join(",")})`);
    } finally {
        if (errors.length > 0) {
            console.log("console/page errors:");
            for (const e of errors) console.log(`  ${e.slice(0, 200)}`);
        }
        check(errors.length === 0, "no console or page errors");
        await browser.close();
        stopSpawned();
    }

    console.log(failed === 0 ? "\nALL CHECKS PASS" : `\n${failed} CHECK(S) FAILED`);
    process.exitCode = failed === 0 ? 0 : 1;
}

try {
    await main();
} catch (err) {
    console.error(err && err.message);
    stopSpawned();
    process.exitCode = 1;
}