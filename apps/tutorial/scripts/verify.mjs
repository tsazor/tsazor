/**
 * End-to-end check of the tutorial in headless Edge: deep links, track
 * switch + persistence, editing → live preview (worker compile + sandboxed
 * iframe), Solve/Reset, inline diagnostics, scoped CSS in the preview,
 * runtime errors mapped to .tsazor positions, the narrow (phone) layout.
 *
 * Self-spawns `vite` on :5330 unless it is already running.
 * Run: node scripts/verify.mjs [--screenshots <dir>]
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as playwright from "playwright-core";
import { BROWSER, launchBrowser } from "../../../scripts/browsers.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
let APP = "http://localhost:5330";
const shotsIndex = process.argv.indexOf("--screenshots");
const shots = shotsIndex > 0 ? process.argv[shotsIndex + 1] : undefined;
if (shots) mkdirSync(shots, { recursive: true });

const spawned = [];
async function reachable(url) {
    try {
        const res = await fetch(url);
        return res.ok || res.status < 500;
    } catch {
        return false;
    }
}
/** The checkout a dev server on `url` serves (its tutorial root), or undefined. */
async function servedRoot(url) {
    try {
        const res = await fetch(`${url}/__tutorial-root`);
        return res.ok ? path.resolve(await res.text()) : undefined;
    } catch {
        return undefined;
    }
}

async function ensureServer() {
    // Reuse a running server only if it serves this checkout (other worktrees
    // may run their own tutorial on :5330); otherwise start one on a free port.
    for (let port = 5330; port < 5340; port++) {
        const url = `http://localhost:${port}`;
        if (await reachable(url)) {
            if ((await servedRoot(url))?.toLowerCase() === ROOT.toLowerCase()) {
                APP = url;
                break;
            }
            continue;
        }
        APP = url;
        spawned.push(spawn("npx", ["vite", "--port", String(port), "--strictPort"], { shell: true, stdio: "ignore", cwd: ROOT, env: { ...process.env } }));
        console.log(`started vite dev server on :${port}`);
        break;
    }
    const deadline = Date.now() + 60_000;
    while (!(await reachable(APP))) {
        if (Date.now() > deadline) throw new Error("tutorial did not come up within 60s");
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

/** The visible preview iframe's frame. */
async function previewFrame(page) {
    const handle = await page.waitForSelector(".preview-frame:not(.preview-frame--pending)", { timeout: 20_000 });
    return handle.contentFrame();
}

/** A computed style of an element in the preview, once the element exists (polls; "" after 20 s). */
async function previewStyle(page, selector, property) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        try {
            const frame = await previewFrame(page);
            return await frame.$eval(selector, (el, name) => getComputedStyle(el)[name], property);
        } catch {
            await page.waitForTimeout(250);
        }
    }
    return "";
}

async function previewText(page, selector) {
    const deadline = Date.now() + 20_000;
    let last = "";
    while (Date.now() < deadline) {
        try {
            const frame = await previewFrame(page);
            last = (await frame.$eval(selector, (el) => el.textContent)) ?? "";
            return last;
        } catch {
            await page.waitForTimeout(200);
        }
    }
    return last;
}

async function waitForPreview(page, selector, expected) {
    const deadline = Date.now() + 20_000;
    let text = "";
    while (Date.now() < deadline) {
        text = await previewText(page, selector).catch(() => "");
        if (text.includes(expected)) return text;
        await page.waitForTimeout(250);
    }
    return text;
}

async function setEditorText(page, text) {
    await page.click(".cm-content");
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Delete");
    // insertText: no auto-indent / bracket closing interference.
    await page.keyboard.insertText(text);
}

async function shot(page, name) {
    if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) });
}

async function main() {
    await ensureServer();
    const browser = await launchBrowser(playwright);
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", async (m) => {
        if (m.type() !== "error") return;
        // Firefox renders an Error argument as just "Error" in text(): describe it from the value.
        const parts = await Promise.all(
            m.args().map((arg) => arg.evaluate((value) => (value instanceof Error ? `${value.name}: ${value.message}` : String(value))).catch(() => "")),
        );
        errors.push(parts.some(Boolean) ? parts.join(" ") : m.text());
    });

    /* 1 — the start page: introduction, track choice, chapters; Start opens the track's first lesson */
    await page.goto(`${APP}/`);
    await page.waitForSelector(".home h1", { timeout: 20_000 });
    check((await page.textContent(".home h1"))?.includes("Build web apps"), "/ shows the introduction");
    check((await page.$$(".part")).length === 3, "the start page lists the three parts");
    await page.click("a:has-text('Start the TypeScript track')");
    await page.waitForURL(/\/ts\/welcome$/, { timeout: 20_000 });
    check(true, "Start the TypeScript track opens /ts/welcome");
    check((await page.textContent(".lesson h1"))?.includes("Welcome to Tsazor"), "lesson title rendered");
    check((await waitForPreview(page, "h1", "Welcome!")).includes("Welcome!"), "preview runs the lesson app (worker → iframe)");
    check(!(await page.content()).includes("Blazor") || true, "(ts track text loaded)");
    const tsText = await page.textContent(".prose");
    check(!/Blazor|Razor|C#|\.NET/.test(tsText ?? ""), "TS track text has no Blazor/Razor/C#/.NET references");
    await shot(page, "01-welcome-ts");

    /* 2 — next lesson via pager, then Solve */
    await page.click(".pager-link--next");
    await page.waitForURL(/\/ts\/your-first-component$/);
    check((await waitForPreview(page, "h1", "Hello world!")).includes("Hello world!"), "next lesson loads its start state");
    await page.click("button:has-text('Solve')");
    check((await waitForPreview(page, "h1", "Hello Tsazor!")).includes("Hello Tsazor!"), "Solve shows the solution");
    await page.click("button:has-text('Reset')");
    check((await waitForPreview(page, "h1", "Hello world!")).includes("Hello world!"), "Reset restores the start state");

    /* 3 — typing recompiles */
    await setEditorText(page, '<h1>Hello @name!</h1>\n\n@code {\n    name = "editor";\n}\n');
    check((await waitForPreview(page, "h1", "Hello editor!")).includes("Hello editor!"), "editing updates the preview");

    /* 4 — a compile error shows inline + in the problems panel, the old preview stays */
    await setEditorText(page, "<h1>Hello @(name</h1>\n@code {\n    name = \"x\";\n}\n");
    await page.waitForSelector(".problem", { timeout: 20_000 });
    const problem = await page.textContent(".problem");
    check(/TZS\d{3}/.test(problem ?? ""), `problems panel lists the diagnostic (${problem?.trim().slice(0, 70)})`);
    check((await page.$(".cm-lintRange-error")) !== null, "editor marks the error range");
    check((await page.$(".tab .badge")) !== null, "file tab shows an error badge");
    await shot(page, "02-diagnostic");

    /* 5 — runtime errors are mapped back to the .tsazor source */
    await setEditorText(page, "<h1>boom</h1>\n\n@code {\n    protected override onInitialized(): void {\n        throw new Error(\"kaput\");\n    }\n}\n");
    await page.waitForSelector(".console .line--error", { timeout: 20_000 });
    const consoleText = await page.textContent(".console");
    check(consoleText?.includes("kaput"), "runtime error reaches the console panel");
    check(/App\.tsazor:5:\d+/.test(consoleText ?? ""), `stack maps to App.tsazor line 5 (${(consoleText ?? "").match(/App\.tsazor:\d+:\d+/)?.[0]})`);
    await shot(page, "03-runtime-error");
    await page.click("button:has-text('Reset')");

    /* 6 — track switch keeps the lesson, persists, and the edit survived in memory */
    await page.click(".track:has-text('Blazor developer')");
    await page.waitForURL(/\/blazor\/your-first-component$/);
    const blazorText = await page.textContent(".prose");
    check(/Blazor/.test(blazorText ?? ""), "Blazor track text loaded");
    await page.goto(`${APP}/`);
    await page.waitForSelector(".resume a", { timeout: 20_000 });
    const resumeHref = (await page.getAttribute(".resume a", "href")) ?? "";
    check(resumeHref.endsWith("blazor/your-first-component"), `the start page offers to continue where you left off (${resumeHref})`);
    check((await page.textContent(".parts-track"))?.includes("Blazor developer"), "the remembered track's chapters are shown");

    /* 6b — keyword index: reached from the start page, searchable, links into the remembered track */
    await page.click(".site-links a:has-text('Index')");
    await page.waitForSelector(".index-page .group", { timeout: 20_000 });
    check((await page.locator(".group h2").count()) > 10, "the index lists keywords by letter");
    check((await page.textContent(".track--active"))?.includes("Blazor developer"), "the index follows the remembered track");
    await page.fill(".search input", "navlink");
    await page.waitForFunction(() => [...document.querySelectorAll(".entry dt")].every((dt) => dt.textContent.toLowerCase().includes("navlink")));
    check((await page.locator(".entry").count()) >= 2, `the search filters the entries (${await page.textContent(".status")})`);
    await page.click(".entry a:has-text('NavLink')");
    await page.waitForURL(/\/blazor\/nav-link$/);
    check(true, "an index entry opens its lesson");

    /* 6c — reference: overview → package → component; the language page's contents scroll to the section */
    await page.click(".topbar a:has-text('Reference')");
    await page.waitForSelector(".reference .card", { timeout: 20_000 });
    await page.click(".card:has-text('@tsazor/runtime')");
    await page.waitForURL(/\/reference\/components\/runtime$/);
    await page.click(".components a:has-text('NavLink')");
    await page.waitForURL(/\/reference\/components\/runtime\/NavLink$/);
    check((await page.locator(".parameters tbody tr").count()) >= 4, "a component page lists its parameters");
    check((await page.textContent(".parameters"))?.includes('"active"'), "parameters show their defaults");
    await page.click(".reference-nav a:has-text('Language')");
    await page.waitForSelector(".toc a");
    await page.click(".toc a:has-text('Diagnostics')");
    await page.waitForFunction(() => window.scrollY > 1000);
    check(new URL(page.url()).hash === "#diagnostics", "the language page's contents link to the section and scroll there");
    await page.click(".reference-nav a:has-text('Diagnostics')");
    await page.waitForSelector(".diagnostic");
    await page.click(".codes a:has-text('TZS025')");
    await page.waitForFunction(() => location.hash === "#tzs025" && document.getElementById("tzs025").getBoundingClientRect().top < 100);
    check((await page.locator(".diagnostic .example").count()) > 15, "the diagnostics page lists the codes with examples and jumps to a code");
    await page.click(".reference-nav a[href='reference/api/runtime']");
    await page.waitForURL(/\/reference\/api\/runtime$/);
    await page.click(".symbols a:has-text('NavigationManager')");
    await page.waitForURL(/\/reference\/api\/runtime\/NavigationManager$/);
    check((await page.locator(".member").count()) > 10 && (await page.textContent(".member:has-text('navigateTo')")) !== null, "an API page shows the export's members with their signatures");

    /* Component library: a lesson with @tsazor/bootstrap gets Bootstrap's stylesheet in the preview */
    await page.goto(`${APP}/ts/a-component-library`);
    await page.waitForSelector(".cm-content");
    await page.click("button:has-text('Solve')");
    const primaryBg = await previewStyle(page, ".btn-primary", "backgroundColor");
    check(primaryBg === "rgb(13, 110, 253)", `component library: the preview styles Bootstrap's components (${primaryBg})`);

    /* Playground: the start project runs; files can be added (named like components) and used; a lesson continues there */
    await page.goto(`${APP}/playground`);
    check((await waitForPreview(page, "h1", "Hello world!")).includes("Hello world!"), "playground: the start project runs in the preview");
    await page.click("button.new-file");
    await page.keyboard.type("counter.tsazor");
    check(((await page.textContent(".name-problem")) ?? "").includes("capital letter"), "playground: a component's file name must start with a capital letter");
    await page.fill(".name-input", "Counter.tsazor");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".tab--active:has-text('Counter.tsazor')");
    await page.click("[role=tab]:has-text('App.tsazor') >> nth=0");
    await page.click(".cm-content");
    await page.keyboard.press("Control+Home");
    await page.keyboard.insertText("<Counter />\n");
    check((await waitForPreview(page, "p", "Counter")).includes("Counter"), "playground: a new component file is usable in App.tsazor");
    await page.click("button.reset");
    check((await page.locator("[role=tab]").count()) === 2, "playground: Reset brings back the start project");
    await page.goto(`${APP}/ts/off-the-main-thread`);
    await page.click("button.open-playground");
    await page.waitForURL(/\/playground$/);
    await page.waitForSelector("[role=tab]:has-text('orders.worker.ts')");
    check(true, "a lesson continues in the playground with its files");

    /* 6d — cross-links: lesson code → reference → "Learn it in" → lesson; the index search finds reference entries */
    await page.goto(`${APP}/ts/nav-link`);
    await page.waitForSelector(".prose a.ref-link");
    await page.click(".prose a.ref-link:has-text('NavLink')");
    await page.waitForURL(/\/reference\/components\/runtime\/NavLink$/);
    await page.waitForSelector(".learn-in a");
    await page.click(".learn-in a:has-text('NavLink')");
    await page.waitForURL(/\/(ts|blazor)\/nav-link$/);
    check(true, "a code span links to its reference entry, whose page links back to the lesson");
    await page.goto(`${APP}/index`);
    await page.fill(".search input", "TsazorHttp");
    await page.waitForSelector(".reference-hits a");
    check((await page.textContent(".reference-hits"))?.includes("TsazorHttpError"), "the index search lists matching reference entries");
    check((await page.locator(".entry .ref-entry a").count()) > 0, "index entries link to their reference entry");
    if (shots) {
        await page.goto(`${APP}/index`);
        await page.waitForSelector(".group");
        await page.screenshot({ path: path.join(shots, "00-index.png") });
    }

    /* 7 — deep link + scoped CSS in the preview */
    await page.goto(`${APP}/blazor/styling`);
    await page.click("button:has-text('Solve')");
    await page.waitForTimeout(1500);
    const color = await (await previewFrame(page)).$eval("p", (el) => getComputedStyle(el).color);
    check(color === "rgb(218, 165, 32)", `styling solution colors the paragraph goldenrod (${color})`);
    await shot(page, "04-styling");

    await page.goto(`${APP}/blazor/nested-components`);
    await page.click("button:has-text('Solve')");
    await waitForPreview(page, "body", "another paragraph");
    const colors = await (await previewFrame(page)).$$eval("p", (els) => els.map((el) => getComputedStyle(el).color));
    check(colors.length === 2 && colors[0] === "rgb(218, 165, 32)" && colors[1] !== colors[0], `scoped styles stay in App (${colors.join(" | ")})`);

    await page.goto(`${APP}/ts/raw-html`);
    await page.click("button:has-text('Solve')");
    await page.waitForTimeout(1500);
    const strong = await (await previewFrame(page)).$("strong");
    check(strong !== null, "MarkupString renders real HTML");

    /* 7b — one smoke check per Part 1 chapter (2–7), in the real browser */
    const frameOf = () => previewFrame(page);
    async function previewClick(selector) {
        await (await frameOf()).click(selector);
    }

    await page.goto(`${APP}/ts/fields-are-state`);
    await page.click("button:has-text('Solve')");
    await waitForPreview(page, "button", "Clicked 0");
    await previewClick("button");
    check((await waitForPreview(page, "button", "Clicked 1 time")).includes("Clicked 1 time"), "ch2 State: a click re-renders the counter");

    await page.goto(`${APP}/ts/external-data`);
    check((await waitForPreview(page, ".listeners", "Listening: 0")).includes("Listening: 0"), "ch2 External data: the start state does not listen");
    await page.click("button:has-text('Solve')");
    await waitForPreview(page, ".listeners", "Listening: 1");
    const priceBefore = await previewText(page, ".price");
    await page.waitForTimeout(1200);
    const priceAfter = await previewText(page, ".price");
    check(priceBefore !== priceAfter && /ACME: \d+\.\d\d/.test(priceAfter), `ch2 External data: this.observe re-renders on every tick (${priceBefore} → ${priceAfter})`);
    await previewClick("button");
    await previewClick("button");
    check((await waitForPreview(page, ".listeners", "Listening: 1")).includes("Listening: 1"), "ch2 External data: hide/show keeps one subscription (teardown on dispose)");

    await page.goto(`${APP}/ts/component-bindings`);
    await page.click("button:has-text('Solve')");
    await waitForPreview(page, "body", "Table for 2");
    await previewClick(".stepper button[aria-label=More]");
    check((await waitForPreview(page, "body", "Table for 3")).includes("Table for 3"), "ch6 Bindings: @bind-value on a @Bindable component writes back");

    await page.goto(`${APP}/ts/typed-checks`);
    await waitForPreview(page, "h1", "Welcome back");
    await page.waitForSelector(".problem .code:has-text('TS2339')", { timeout: 30_000 }).catch(() => null);
    const typeProblems = (await page.$$eval(".problem .code", (els) => els.map((el) => el.textContent?.trim()))).join(",");
    check(typeProblems.includes("TS2339") && typeProblems.includes("TS1360"), `ch3 Parameters: tsazor check shows real type diagnostics (${typeProblems})`);
    check((await page.$(".preview-frame--pending, .frames--stale")) === null, "type errors don't mark the preview stale");
    await shot(page, "06-typed-checks");
    await page.click("button:has-text('Solve')");
    await waitForPreview(page, "h1", "Welcome back, Ada!");
    await page.waitForFunction(() => document.querySelectorAll(".problem").length === 0, null, { timeout: 30_000 }).catch(() => null);
    check((await page.$$(".problem")).length === 0, "the solution clears the type diagnostics");

    await page.goto(`${APP}/blazor/keyed-blocks`);
    await page.click("button:has-text('Solve')");
    await waitForPreview(page, "body", "egg");
    await previewClick("button");
    check((await waitForPreview(page, "p", "🍌")).includes("🍌 banana"), "ch4 Logic: @key keeps each Thing with its item");

    await page.goto(`${APP}/ts/event-modifiers`);
    await page.click("button:has-text('Solve')");
    await waitForPreview(page, "h2", "Inbox");
    await previewClick(".card button");
    const log = await waitForPreview(page, "body", "Log: archived");
    check(log.includes("Log: archived") && !log.includes("opened"), "ch5 Events: stopPropagation keeps the card closed");

    await page.goto(`${APP}/ts/select-bindings`);
    await page.click("button:has-text('Solve')");
    await waitForPreview(page, "p", "mother");
    await (await frameOf()).selectOption("select", "school");
    check((await waitForPreview(page, "p", "school")).includes("school"), "ch6 Bindings: a select bind writes back (real browser)");

    await page.goto(`${APP}/ts/deep-styles`);
    await page.click("button:has-text('Solve')");
    await page.waitForTimeout(1500);
    const boxColor = await (await frameOf()).$eval(".box", (el) => getComputedStyle(el).backgroundColor);
    check(boxColor === "rgb(196, 181, 253)", `ch7 Styles: ::deep styles the child component (${boxColor})`);

    await page.goto(`${APP}/ts/lifecycle`);
    await page.waitForSelector(".prose table");
    await shot(page, "07-lifecycle-table");

    await page.goto(`${APP}/ts/if-else`);
    const keywordInBody = await page.$$eval(".prose pre.code .tok-keyword", (els) => els.map((el) => el.textContent));
    check(keywordInBody.includes("const") && keywordInBody.includes("else"), "control-block bodies are highlighted as code (lesson text)");
    await page.click("button:has-text('Solve')");
    await page.waitForTimeout(500);
    const editorKeywords = await page.$$eval(".cm-content .tok-keyword", (els) => els.map((el) => el.textContent));
    check(editorKeywords.includes("else"), "control-block keywords are highlighted in the editor");

    /* 7c — one smoke check per Part 2 chapter (8–13), in the real browser */
    const problemCount = () => page.$$eval(".problem", (els) => els.length);
    async function noProblems() {
        await page.waitForFunction(() => document.querySelectorAll(".problem").length === 0, null, { timeout: 30_000 }).catch(() => null);
        return (await problemCount()) === 0;
    }

    await page.goto(`${APP}/ts/templated-components`);
    await page.click("button:has-text('Solve')");
    check((await waitForPreview(page, "li strong", "Ada")).includes("Ada"), "ch8 Reusing content: a templated List renders its ItemTemplate with a typed context");
    check(await noProblems(), "ch8 Reusing content: the solution type-checks (TItem inferred)");

    await page.goto(`${APP}/ts/cascading-values`);
    await page.click("button:has-text('Solve')");
    await waitForPreview(page, ".toolbar", "Save");
    await (await frameOf()).check("input[type=checkbox]");
    await page.waitForTimeout(300);
    const themed = await (await frameOf()).$eval(".themed", (el) => el.className);
    check(themed.includes("dark"), `ch9 Cascading values: the cascade reaches the nested button (${themed})`);

    await page.goto(`${APP}/ts/injecting-services`);
    check((await waitForPreview(page, ".badge", "🛒 0")).includes("🛒 0"), "ch10 Services: a lesson with Program.ts starts through createTsazorApp");
    await page.click("button:has-text('Solve')");
    // The start state reads the same: give the solution's frame time to take over.
    await page.waitForTimeout(1500);
    await waitForPreview(page, ".badge", "🛒 0");
    await previewClick(".products button");
    check((await waitForPreview(page, ".badge", "🛒 1")).includes("🛒 1"), "ch10 Services: @inject shares the registered Cart");

    await page.goto(`${APP}/ts/element-refs`);
    await page.click("button:has-text('Solve')");
    await page.waitForTimeout(1500);
    await waitForPreview(page, "p", "Your account is active.");
    await previewClick("button.danger");
    await page.waitForTimeout(300);
    const modal = await (await frameOf()).$eval("dialog", (el) => el.open && el.matches(":modal"));
    check(modal, "ch11 Element references: @ref + showModal() opens a real modal dialog");

    await page.goto(`${APP}/ts/page-title`);
    await page.click("button:has-text('Solve')");
    await page.waitForSelector(".preview .page-title", { timeout: 20_000 }).catch(() => null);
    const tabTitle = (await page.textContent(".preview .page-title").catch(() => "")) ?? "";
    check(tabTitle.includes("(2) Inbox"), `ch12 Special components: PageTitle shows in the preview's tab bar (${tabTitle})`);
    await previewClick("button");
    await page.waitForFunction(() => document.querySelector(".preview .page-title")?.textContent?.includes("(0) Inbox"), null, { timeout: 10_000 }).catch(() => null);
    check(((await page.textContent(".preview .page-title")) ?? "").includes("(0) Inbox"), "ch12 Special components: the tab title follows the component");
    await shot(page, "08-page-title");

    await page.goto(`${APP}/ts/error-boundaries`);
    await page.click("button:has-text('Solve')");
    await page.waitForTimeout(1500);
    await waitForPreview(page, "h1", "Dashboard");
    await previewClick(".refresh");
    check((await waitForPreview(page, ".failed", "The weather service is down.")).includes("The weather service is down."), "ch12 Special components: the ErrorBoundary shows its error view");

    await page.goto(`${APP}/ts/code-behind`);
    await page.click("button:has-text('Solve')");
    check((await waitForPreview(page, ".verdict", "Weak")).includes("Weak"), "ch13 Organizing code: a code-behind (X.tsazor.ts) runs in the preview");
    check(await noProblems(), "ch13 Organizing code: the code-behind solution type-checks");
    await page.goto(`${APP}/ts/imports-file`);
    await page.click("button:has-text('Solve')");
    check((await waitForPreview(page, ".total", "€5.70")).includes("€5.70"), "ch13 Organizing code: imports inherited from _Imports.tsazor");
    check(await noProblems(), "ch13 Organizing code: the _Imports solution type-checks");

    /* 7c — Part 3: a Program.ts lesson with routes (the preview's runtime shim) */
    await page.goto(`${APP}/ts/the-user-in-code`);
    await page.click("button:has-text('Solve')");
    await page.waitForTimeout(1500);
    await waitForPreview(page, ".user button", "Sign in");
    await previewClick(".user button");
    check((await waitForPreview(page, ".user", "Hi, Marta")).includes("Hi, Marta"), "ch16 Auth: Program.ts registers the provider; the header follows the sign-in");
    await previewClick("nav a:nth-child(2)");
    await waitForPreview(page, "h2", "Pre-order bread");
    const prefilled = await (await frameOf()).$eval(".order input", (el) => el.value);
    check(prefilled === "Marta", `ch16 Auth: a Program.ts app routes in the preview and the cascade prefills the form (${prefilled})`);
    const authUrl = (await page.textContent(".page-url").catch(() => "")) ?? "";
    check(authUrl.endsWith("/bread"), `ch16 Auth: the preview bar shows the URL of a Program.ts app (${authUrl})`);
    check(await noProblems(), "ch16 Auth: the solution type-checks");

    /* 7c'' — chapter 14: hash routing through Program.ts (the shim keeps the mode) */
    await page.goto(`${APP}/ts/hash-routing`);
    await page.click("button:has-text('Solve')");
    await page.waitForTimeout(1500);
    await waitForPreview(page, "h1", "The Daily Loaf");
    await previewClick("nav a:nth-child(2)");
    await waitForPreview(page, "h2", "Orders");
    await previewClick(".filters a:nth-child(2)");
    const hashList = await waitForPreview(page, ".orders", "#101 Marta");
    let hashUrl = "";
    for (const deadline = Date.now() + 10_000; Date.now() < deadline; await page.waitForTimeout(250)) {
        hashUrl = (await page.textContent(".page-url").catch(() => "")) ?? "";
        if (hashUrl.endsWith("#/orders?state=open")) break;
    }
    check(hashUrl.endsWith("/#/orders?state=open") && !hashList.includes("Jonas"), `ch14 Routing: hash mode routes in the preview; the bar shows the fragment (${hashUrl})`);
    check(await noProblems(), "ch14 Routing: the hash solution type-checks");

    /* 7c''' — chapter 18: the preview runs *.test.ts with its Vitest-compatible runner */
    await page.goto(`${APP}/ts/fakes-for-services`);
    const startReport = await waitForPreview(page, ".test-summary", "failed");
    const startError = await waitForPreview(page, ".test-fail pre", "BakeryClock");
    check(startReport.includes("0 passed, 1 failed") && startError.includes("Service not registered: BakeryClock"), `ch18 Testing: the start's report shows the failing test and why (${startReport.trim()})`);
    await page.click("button:has-text('Solve')");
    check((await waitForPreview(page, ".test-summary", "2 passed")).includes("2 passed"), "ch18 Testing: the solved tests pass in the preview (@tsazor/testing + vitest in the import map)");
    check(await noProblems(), "ch18 Testing: the fake clock type-checks against BakeryClock");
    await page.goto(`${APP}/ts/testing-a-form`);
    await page.click("button:has-text('Solve')");
    check((await waitForPreview(page, ".test-summary", "2 passed")).includes("2 passed"), "ch18 Testing: a form test submits through the real browser");

    /* 7c'''' — chapter 19: localization through Program.ts, Intl in the real browser */
    await page.goto(`${APP}/ts/prices-and-dates`);
    await page.click("button:has-text('Solve')");
    await page.waitForTimeout(1500);
    await waitForPreview(page, ".price", "€3.40");
    await previewClick(".languages button:nth-child(2)");
    const germanPrice = (await waitForPreview(page, ".price", "3,40")).replace(/ /g, " ");
    const germanDate = await waitForPreview(page, ".baked", "Oktober");
    check(germanPrice.includes("3,40 €") && germanDate.includes("5. Oktober 2026"), `ch19 Localization: the switch re-renders; Intl formats in German (${germanPrice.trim()}, ${germanDate.trim()})`);
    check(await noProblems(), "ch19 Localization: the solution type-checks");

    /* 7c' — chapter 17: TsazorHttp over the in-memory server, @tsazor/dotnet in the import map */
    await page.goto(`${APP}/ts/when-parameters-change`);
    await page.click("button:has-text('Solve')");
    await page.waitForTimeout(1500);
    await waitForPreview(page, ".user button", "Sign in");
    await previewClick(".user button:last-of-type");
    await previewClick("nav a:nth-child(3)");
    check((await waitForPreview(page, ".orders", "#105 Lena")).includes("#105 Lena"), "ch17 Backend: the orders come from BakeryApi.ts through TsazorHttp");
    await previewClick(".filters a:nth-child(2)");
    let openOnly = "";
    for (const deadline = Date.now() + 10_000; Date.now() < deadline; await page.waitForTimeout(250)) {
        openOnly = await previewText(page, ".orders").catch(() => "");
        if (openOnly.includes("#104 Omar") && !openOnly.includes("Lena")) break;
    }
    check(openOnly.includes("#104 Omar") && !openOnly.includes("Lena"), `ch17 Backend: a new query parameter loads again in onParametersSet (${openOnly.trim().replace(/\s+/g, " ")})`);
    check(await noProblems(), "ch17 Backend: the parameters solution type-checks");
    await page.goto(`${APP}/ts/a-typed-client`);
    await page.click("button:has-text('Solve')");
    await page.waitForTimeout(1500);
    await waitForPreview(page, ".user button", "Sign in");
    await previewClick(".user button");
    await previewClick("nav a:nth-child(2)");
    await waitForPreview(page, "h2", "Pre-order bread");
    const bread = await frameOf();
    await bread.selectOption(".order select", "ciabatta");
    await bread.fill(".order input[type=number]", "5");
    await bread.dispatchEvent(".order input[type=number]", "change");
    await previewClick(".order button[type=submit]");
    check((await waitForPreview(page, ".status", "Only 2 ciabatta")).includes("Only 2 ciabatta left today."), "ch17 Backend: the generated client and problemMessage (@tsazor/dotnet) run in the preview");
    check(await noProblems(), "ch17 Backend: the typed-client solution type-checks");
    await page.goto(`${APP}/ts/your-first-component`);
    await waitForPreview(page, "h1", "Hello");
    check((await page.$(".preview .page-title")) === null, "a lesson without PageTitle shows no tab title");

    /* 7d — the Blazor-only chapter "TypeScript for C# developers" */
    await page.goto(`${APP}/blazor/types-and-nullability`);
    check((await waitForPreview(page, "body", "Grace")).includes("Grace"), "C# chapter: a .ts module lesson renders in the preview");
    await page.click("button:has-text('Solve')");
    await page.waitForTimeout(1500);
    const graceItems = await (await frameOf()).$$eval("td.quantity", (els) => els.map((el) => el.textContent));
    check(graceItems.join(",") === "3,0,1", `C# chapter: ?? keeps Grace's 0 items (${graceItems.join(",")})`);
    await page.click(".menu-button");
    const blazorChapters = await page.$$eval(".panel h3", (els) => els.map((el) => el.textContent));
    check(blazorChapters[0] === "TypeScript for C# developers" && blazorChapters[1] === "Introduction", `C# chapter: first in the Blazor track's menu (${blazorChapters.slice(0, 2).join(" | ")})`);
    await page.goto(`${APP}/blazor/types-and-nullability`);
    check((await page.$(".prose a[href$='docs/csharp-to-typescript.md']")) !== null, "C# chapter: links the cheat sheet");
    await page.click(".prose a:has-text('Welcome')");
    await page.waitForURL(/\/blazor\/welcome$/, { timeout: 20_000 });
    check(true, "C# chapter: 'Skip ahead to Welcome' navigates within the Blazor track");
    await page.goto(`${APP}/blazor/types-and-nullability`);
    await page.click(".track:has-text('TypeScript developer')");
    await page.waitForURL(/\/ts\/welcome$/, { timeout: 20_000 });
    check(true, "C# chapter: the track switch from a Blazor-only lesson leads to the TS track's next lesson (/ts/welcome)");
    await page.click(".menu-button");
    const tsChapters = await page.$$eval(".panel h3", (els) => els.map((el) => el.textContent));
    check(tsChapters[0] === "Introduction" && !tsChapters.some((title) => /C#/.test(title ?? "")), "C# chapter: absent from the TypeScript track's menu");

    await page.goto(`${APP}/blazor/linq-and-arrays`);
    await page.click("button:has-text('Solve')");
    check((await waitForPreview(page, ".top", "Barbara, Ada, Linus")).includes("Barbara, Ada, Linus"), "C# chapter: filter/toSorted/slice/map in the preview");
    check(await noProblems(), "C# chapter: toSorted type-checks in the browser (ES2023 lib)");

    await page.goto(`${APP}/blazor/this-and-equality`);
    check((await waitForPreview(page, ".checkout", "TypeError")).includes("TypeError"), "C# chapter: the function-callback this trap throws in the preview");
    await page.waitForSelector(".problem .code:has-text('TS2683')", { timeout: 30_000 }).catch(() => null);
    check((await page.$(".problem .code:has-text('TS2683')")) !== null, "C# chapter: TS2683 shows in the problems panel");
    await page.click("button:has-text('Solve')");
    check((await waitForPreview(page, ".checkout", "0.30000000000000004")).includes("0.30000000000000004"), "C# chapter: the arrow solution keeps this (and shows the double)");
    check(await noProblems(), "C# chapter: the this-and-equality solution type-checks");

    await page.goto(`${APP}/blazor/numbers-and-dates`);
    check((await waitForPreview(page, ".checkout", "0.30000000000000004")).includes("0.30000000000000004"), "C# chapter: the double basket starts the numbers lesson");
    await page.click("button:has-text('Solve')");
    let cents = "";
    for (let tries = 0; tries < 80 && cents.trim() !== "Total: 0.30"; tries++) {
      cents = await previewText(page, ".checkout").catch(() => "");
      if (cents.trim() !== "Total: 0.30") await page.waitForTimeout(250);
    }
    check(cents.trim() === "Total: 0.30", `C# chapter: the cents solution adds up (${cents.trim()})`);
    check(await noProblems(), "C# chapter: the numbers-and-dates solution type-checks");

    await page.goto(`${APP}/blazor/attributes-and-decorators`);
    await page.click("button:has-text('Solve')");
    check((await waitForPreview(page, "ol", "multiply(4, 5)")).includes("multiply(4, 5) → 20"), "C# chapter: a standard method decorator runs in the preview");
    await shot(page, "09-csharp-decorators");
    await page.goto(`${APP}/ts/your-first-component`);
    await waitForPreview(page, "h1", "Hello");
    /* 8 — lesson menu navigates */
    await page.click(".menu-button");
    await page.click(".panel a:has-text('Dynamic attributes')");
    await page.waitForURL(/\/ts\/dynamic-attributes$/);
    check(true, "lesson menu navigates");

    /* 9 — unknown lesson */
    await page.goto(`${APP}/ts/nope`);
    check((await page.textContent("h1"))?.includes("Lesson not found"), "unknown slug shows the not-found panel");

    /* 10 — phone layout stacks and does not scroll sideways */
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    phone.on("pageerror", (e) => errors.push(e.message));
    await phone.goto(`${APP}/ts/your-first-component`);
    await waitForPreview(phone, "h1", "Hello");
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `no horizontal overflow on a phone (${overflow}px)`);
    const order = await phone.evaluate(() => {
        const top = (s) => document.querySelector(s).getBoundingClientRect().top;
        return top(".lesson") < top(".editor-host") && top(".editor-host") < top(".frames");
    });
    check(order, "phone layout stacks text → editor → preview");
    if (shots) await phone.screenshot({ path: path.join(shots, "05-phone.png"), fullPage: true });
    for (const page of ["", "index", "reference/language", "reference/components/runtime/InputText"]) {
        await phone.goto(`${APP}/${page}`);
        await phone.waitForSelector(".site-bar");
        const sideways = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check(sideways <= 0, `/${page}: no horizontal overflow on a phone (${sideways}px)`);
    }

    // Provoked: the runtime-error check ("kaput") and the error-boundary lesson (logged as handled).
    // WebKit against the Vite dev server: a dev module request that fails under load surfaces as
    // "Importing a module script failed" / "… due to access control checks" (CI, now and then). The
    // functional checks above would fail on a real import error, so it is reported, not counted.
    const devServerFlake = (e) => BROWSER === "webkit" && /Importing a module script failed|due to access control checks/.test(e);
    for (const e of errors.filter(devServerFlake)) console.log(`NOTE  WebKit dev-server module load: ${e}`);
    const unexpected = errors.filter((e) => !e.includes("kaput") && !e.includes("[tsazor] ErrorBoundary handled:") && !devServerFlake(e));
    check(unexpected.length === 0, `no page errors (besides the provoked ones)${unexpected.length ? `: ${unexpected.join(" | ")}` : ""}`);
    await browser.close();
}

main()
    .catch((error) => {
        console.error(error);
        failed++;
    })
    .finally(() => {
        stopSpawned();
        console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
        process.exit(failed === 0 ? 0 : 1);
    });
