/**
 * Framework bench: identical TodoMVC + 10k-rows apps, measured identically.
 *
 * Usage:  node run.mjs [--app=tsazor,react,...] [--runs=5] [--skip-build]
 * Writes results.json next to this file; prints a summary table.
 *
 * Methodology (identical for all frameworks):
 *   - each app is statically served with no cache headers
 *   - load: FCP from the paint timeline; readiness from the app's own
 *     `window.__benchReadyAt = performance.now()` marker, set right after the
 *     initial view first rendered — the same protocol in all 5 apps; median
 *     of N runs, fresh browser context per run (cold)
 *   - ops: in-browser (click → poll until the DOM settled), so event handling,
 *     state change and re-render are all inside the number; median of N
 *     cycles; each cycle starts from a fresh page (deterministic state)
 *   - memory: retained JS heap (MB, forced GC via CDP / --expose-gc) after the ops
 */
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* App registry                                                        */
/* ------------------------------------------------------------------ */

const APPS = [
  { name: "tsazor",  port: 5410, todoRoute: "/todo", rowsRoute: "/rows", kind: "vite",   dir: path.resolve(__dirname, "../tsazor") },
  { name: "react",  port: 5411, todoRoute: "/#/todo", rowsRoute: "/#/rows", kind: "vite", dir: path.resolve(__dirname, "../react") },
  { name: "vue",    port: 5412, todoRoute: "/#/todo", rowsRoute: "/#/rows", kind: "vite", dir: path.resolve(__dirname, "../vue") },
  { name: "svelte", port: 5413, todoRoute: "/#/todo", rowsRoute: "/#/rows", kind: "vite", dir: path.resolve(__dirname, "../svelte") },
  { name: "blazor", port: 5414, todoRoute: "/todo", rowsRoute: "/rows", kind: "dotnet", dir: path.resolve(__dirname, "../blazor") },
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".dll": "application/octet-stream",
  ".dat": "application/octet-stream",
  ".pdb": "application/octet-stream",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

// `dotnet publish -o publish` puts the servable site one level down, in
// publish/wwwroot — vite apps go straight to dist.
const distDirOf = (app) =>
  app.kind === "vite" ? path.join(app.dir, "dist") : path.join(app.dir, "publish", "wwwroot");

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

function buildApp(app) {
  const shell = process.platform === "win32";
  if (app.kind === "vite") {
    const pnpm = shell ? "pnpm.cmd" : "pnpm";
    return guardedRun(pnpm, ["--filter", `bench-${app.name}`, "exec", "vite", "build"], app.dir, shell);
  }
  return guardedRun("dotnet", ["publish", "-c", "Release", "-o", "publish"], app.dir, false);
}

function guardedRun(cmd, args, cwd, shell) {
  const result = spawnSync(cmd, args, { cwd, stdio: "pipe", encoding: "utf8", shell });
  if (result.status !== 0) {
    throw new Error(`build failed in ${cwd}: ${cmd} ${args.join(" ")}\n${(result.stdout ?? "") + (result.stderr ?? "")}`);
  }
}

/* ------------------------------------------------------------------ */
/* Bundle sizes                                                        */
/* ------------------------------------------------------------------ */

function measureDir(dir, predicate) {
  let raw = 0;
  let gz = 0;
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const file = path.join(current, entry);
      if (statSync(file).isDirectory()) {
        walk(file);
        continue;
      }
      if (!predicate(path.extname(file).toLowerCase())) continue;
      const bytes = readFileSync(file);
      raw += bytes.length;
      gz += gzipSync(bytes).length;
    }
  };
  walk(dir);
  return { raw, gz };
}

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;

function bundleOf(app) {
  const dir = distDirOf(app);
  if (app.kind === "vite") {
    const code = measureDir(dir, (ext) => ext === ".js");
    const css = measureDir(dir, (ext) => ext === ".css");
    return { codeRawKB: kb(code.raw), codeGzipKB: kb(code.gz), cssGzipKB: kb(css.gz) };
  }
  // Blazor: _framework holds both the .NET runtime and the app's own compiled
  // code (Bench.dll + blazor boot js). Split them for the table.
  const frameworkDir = path.join(dir, "_framework");
  const isAppCode = (relative) => /(^|[\\/])(?!Bench\b)[^\\/]*(\.(dll|wasm|dat)|blazor\.config\.json)$/i.test(relative);
  let appCode = { raw: 0, gz: 0 };
  let runtime = { raw: 0, gz: 0 };
  const walk = (current, relative) => {
    for (const entry of readdirSync(current)) {
      const file = path.join(current, entry);
      if (statSync(file).isDirectory()) {
        walk(file, path.join(relative, entry));
        continue;
      }
      const bytes = readFileSync(file);
      const target = isAppCode(path.join(relative, entry)) ? appCode : runtime;
      target.raw += bytes.length;
      target.gz += gzipSync(bytes).length;
    }
  };
  if (existsSync(frameworkDir)) walk(frameworkDir, "");
  const css = measureDir(dir, (ext) => ext === ".css");
  return { codeRawKB: kb(appCode.raw), codeGzipKB: kb(appCode.gz), cssGzipKB: kb(css.gz), runtimeGzipKB: kb(runtime.gz) };
}

/* ------------------------------------------------------------------ */
/* Browser metrics                                                     */
/* ------------------------------------------------------------------ */

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const tenMs = (values) => Math.round(median(values) * 10) / 10;

/**
 * Timed op, entirely inside the page: resolve `selector`'s node, click it,
 * poll `check` (in-page fn) until true or 30 s deadline; returns duration ms.
 */
async function timedOp(page, selector, checkFn) {
  return page.evaluate(
    async (op) => {
      const check = new Function(`return ${op.check};`)();
      const t0 = performance.now();
      const node = document.querySelector(op.selector);
      if (!node) return -1;
      node.click();
      for (;;) {
        if (check() || performance.now() - t0 > 30000) break;
        await new Promise((r) => setTimeout(r, 4));
      }
      return performance.now() - t0;
    },
    { selector, check: checkFn.toString() },
  );
}

// Wait for DOM quiescence (2 equal samples 80 ms apart) before sampling a
// before-state. Runs OUTSIDE the timed window: frameworks whose large-tree
// commits are still mutating the DOM (React 19 on 10k+ rows) otherwise give
// inconsistent before-states, and the op's completion check would never fire.
const SETTLE_SNIPPET = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const settleCounts = async () => {
    const count = () => document.querySelectorAll(".rows-table tbody tr").length;
    for (;;) {
      const a = count();
      await sleep(80);
      if (a === count()) return;
    }
  };
`;

async function timedSwap(page) {
  const body = SETTLE_SNIPPET + `
    const labels = () => Array.from(document.querySelectorAll(".rows-table tbody tr")).slice(0, 2).map((tr) => tr.querySelector(".col-title").textContent);
    const t0 = performance.now();
    await settleCounts();
    const before = labels();
    document.querySelector(".rows-toolbar button:nth-child(4)").click();
    for (;;) {
      const now = labels();
      if ((now[0] === before[1] && now[1] === before[0]) || performance.now() - t0 > 30000) break;
      await new Promise((r) => setTimeout(r, 4));
    }
    return performance.now() - t0;
  `;
  return page.evaluate(new Function(`return (async () => { ${body} })();`));
}

async function timedSelect(page, index) {
  const body = `
    const t0 = performance.now();
    document.querySelectorAll(".rows-table td.col-title")[${index}].click();
    for (;;) {
      if (document.querySelectorAll(".rows-table tr.selected").length === 1 || performance.now() - t0 > 30000) break;
      await new Promise((r) => setTimeout(r, 4));
    }
    return performance.now() - t0;
  `;
  return page.evaluate(new Function(`return (async () => { ${body} })();`));
}

async function timedRemove(page, index) {
  const body = SETTLE_SNIPPET + `
    const t0 = performance.now();
    await settleCounts();
    const before = document.querySelectorAll(".rows-table tbody tr").length;
    document.querySelectorAll(".rows-table .col-remove")[${index}].click();
    for (;;) {
      const now = document.querySelectorAll(".rows-table tbody tr").length;
      if (now === before - 1 || performance.now() - t0 > 30000) {
        return { duration: performance.now() - t0, removed: now === before - 1 };
      }
      await new Promise((r) => setTimeout(r, 4));
    }
  `;
  return page.evaluate(new Function(`return (async () => { ${body} })();`));
}

/**
 * Retained JS heap after a full rows cycle, with garbage forced to collect
 * first (CDP HeapProfiler.forceGC, fallback window.gc via --expose-gc). The
 * plain `performance.memory` reading is dominated by uncollected garbage —
 * it measured Tsazor at ~70 MB where the retained live set is ~17 MB.
 */
async function measureForcedHeap(page) {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("HeapProfiler.enable").catch(() => {});
    const samples = [];
    for (let i = 0; i < 3; i++) {
      await cdp.send("HeapProfiler.forceGC").catch(async () => {
        await page.evaluate(() => window.gc?.());
      });
      await page.waitForTimeout(150);
      const heap = await page.evaluate(() => performance.memory.usedJSHeapSize / 1048576);
      samples.push(heap);
    }
    cdp.detach().catch(() => {});
    if (samples.length === 0) return null;
    return Math.round(median(samples) * 10) / 10;
  } catch {
    return null;
  }
}

async function measureLoad(browser, targetUrl, timeoutMs) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page
    .waitForFunction(() => typeof window.__benchReadyAt === "number", null, { timeout: timeoutMs })
    .catch(() => {});
  const metrics = await page.evaluate(() => {
    const fcpEntry = performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint");
    return { fcp: fcpEntry ? fcpEntry.startTime : null, ready: window.__benchReadyAt ?? null };
  });
  await context.close();
  return metrics;
}

async function benchmarkApp(browser, app, runs) {
  const out = { name: app.name, bundle: null, load: null, ops: null, memoryMB: null, errors: [] };

  const dir = distDirOf(app);
  if (!existsSync(dir)) {
    out.errors.push(`missing build output at ${dir}`);
    return out;
  }
  out.bundle = bundleOf(app);

  // -------- load (fresh context per run = cold) --------
  const loads = [];
  for (let i = 0; i < runs; i++) {
    const metrics = await measureLoad(browser, `${app.url}${app.todoRoute}`, app.kind === "dotnet" ? 60000 : 20000);
    if (metrics && metrics.ready !== null) loads.push(metrics);
  }
  if (loads.length > 0) {
    const withFcp = loads.filter((l) => l.fcp !== null);
    out.load = {
      fcpMs: withFcp.length > 0 ? Math.round(median(withFcp.map((l) => l.fcp)) * 10) / 10 : null,
      readyMs: Math.round(median(loads.map((l) => l.ready)) * 10) / 10,
    };
  } else {
    out.errors.push("no successful load measurement (__benchReadyAt never set)");
  }

  // -------- rows ops --------
  const cycleTimes = { create10k: [], append1k: [], updateEvery10th: [], swap: [], select: [], remove: [] };
  let removedOnce = true;
  for (let cycle = 0; cycle < runs; cycle++) {
    const page = await browser.newPage();
    page.on("pageerror", (e) => out.errors.push(`[rows] ${e.message}`));
    try {
      await page.goto(`${app.url}${app.rowsRoute}`, { waitUntil: "domcontentloaded", timeout: app.kind === "dotnet" ? 60000 : 20000 });
      await page.waitForSelector(".rows-toolbar", { timeout: app.kind === "dotnet" ? 60000 : 20000 });
      await page.waitForFunction(() => typeof window.__benchReadyAt === "number", null, { timeout: app.kind === "dotnet" ? 60000 : 20000 });

      // "create 10,000 rows" is measured on an empty page (the deterministic start)
      cycleTimes.create10k.push(await timedOp(page, ".rows-toolbar button:nth-child(1)", () => document.querySelectorAll(".rows-table tbody tr").length === 10000));
      cycleTimes.append1k.push(await timedOp(page, ".rows-toolbar button:nth-child(2)", () => document.querySelectorAll(".rows-table tbody tr").length === 11000));
      cycleTimes.updateEvery10th.push(
        await timedOp(page, ".rows-toolbar button:nth-child(3)", () => {
          const tds = document.querySelectorAll(".rows-table td.col-title");
          if (tds.length === 0) return false;
          for (let i = 0; i < tds.length; i += 10) if (!tds[i].textContent.includes("!!!")) return false;
          return true;
        }),
      );
      cycleTimes.swap.push(await timedSwap(page));
      cycleTimes.select.push(await timedSelect(page, 3));
      const removeResult = await timedRemove(page, 5);
      cycleTimes.remove.push(removeResult.duration);
      removedOnce = removedOnce && removeResult.removed;

      out.memoryMB = await measureForcedHeap(page);
    } catch (err) {
      out.errors.push(`[rows cycle ${cycle}] ${String(err?.message ?? err)}`);
    } finally {
      await page.close();
    }
  }
  out.ops = {
    create10kMs: Math.round(median(cycleTimes.create10k) * 10) / 10,
    append1kMs: Math.round(median(cycleTimes.append1k) * 10) / 10,
    updateEvery10thMs: Math.round(median(cycleTimes.updateEvery10th) * 10) / 10,
    swapMs: Math.round(median(cycleTimes.swap) * 10) / 10,
    selectMs: Math.round(median(cycleTimes.select) * 10) / 10,
    removeMs: Math.round(median(cycleTimes.remove) * 10) / 10,
    removeWorked: removedOnce,
    cycles: runs,
  };
  out.todoChecks = await verifyTodoMvc(browser, app);
  return out;
}

/**
 * Behavioral verification of the TodoMVC spec (same selectors in all 5 apps).
 * Fails the run loudly — these are correctness checks, not measurements.
 */
async function verifyTodoMvc(browser, app) {
  const checks = {};
  const page = await browser.newPage();
  try {
    await page.goto(`${app.url}${app.todoRoute}`, { waitUntil: "domcontentloaded", timeout: app.kind === "dotnet" ? 60000 : 20000 });
    if (app.kind === "dotnet") await page.waitForSelector(".todoapp", { timeout: 60000 });
    // add
    await page.fill(".new-todo", "buy milk");
    await page.press(".new-todo", "Enter");
    checks.addsTodo = (await page.locator(".todo-list li").count()) === 1
      && (await page.locator(".todo-count").textContent())?.trim().endsWith("1 items left");
    // edit (dblclick → change → commit)
    await page.dblclick(".todo-title");
    await page.fill(".edit-todo", "buy oat milk");
    await page.press(".edit-todo", "Enter");
    checks.edit = (await page.locator(".todo-title").textContent()) === "buy oat milk";
    // toggle: completes → left count 0
    await page.locator(".todo-list input[type=checkbox]").first().check();
    checks.toggle = (await page.locator(".todo-count").textContent())?.trim().startsWith("0");
    // filter active: item hidden
    await page.locator(".todo-filter button:nth-child(2)").click();
    checks.filterActive = (await page.locator(".todo-list li").count()) === 0;
    // toggle-all: with completed item, toggling all marks all completed → filter completed shows it
    await page.locator(".todo-filter button:nth-child(1)").click();
    await page.locator(".todo-footer input[type=checkbox]").first().check();
    checks.toggleAll = (await page.locator(".todo-list li.completed").count()) === 1;
    // clear completed → empty list
    await page.locator(".clear-completed").click();
    checks.clearCompleted = (await page.locator(".todo-list").count()) === 0;
    // persistence across a reload
    await page.reload({ waitUntil: "domcontentloaded" });
    checks.emptyAfterClear = (await page.locator(".todo-list").count()) === 0;
  } catch (err) {
    out_errors_push(checks, String(err?.message ?? err));
  } finally {
    await page.close();
  }
  return checks;
}

function out_errors_push(checks, message) {
  checks.failed = message;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => a.replace(/^--/, "").split("=")),
);
const only = args.app ? args.app.split(",") : null;
const runs = Math.max(1, parseInt(args.runs ?? "5", 10));

const servers = [];
const results = [];
let browser = null;

for (const app of APPS) {
  if (only && !only.includes(app.name)) continue;
  try {
    if (!args["skip-build"]) {
      buildApp(app);
      process.stdout.write(`[bench] ${app.name}: built\n`);
    }
  } catch (err) {
    process.stderr.write(`[bench] ${app.name}: build failed, skipped. ${String(err?.message ?? err).slice(0, 300)}\n`);
    continue;
  }
  const dist = distDirOf(app);
  if (!existsSync(dist)) {
    process.stderr.write(`[bench] ${app.name}: no build output at ${dist}\n`);
    continue;
  }
  const server = createServer((req, res) => {
    const rel = new URL(req.url, "http://x").pathname.replace(/^\//, "");
    let file = path.join(dist, rel);
    if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, "index.html");
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).on("error", () => res.destroy()).pipe(res);
  });
  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(app.port, "127.0.0.1", resolve);
  });
  servers.push(server);
  app.url = `http://127.0.0.1:${app.port}`;

  if (!browser) {
    browser = await chromium
      .launch({ channel: "msedge", headless: true, args: ["--js-flags=--expose-gc"] })
      .catch(() => chromium.launch({ headless: true, args: ["--js-flags=--expose-gc"] }));
  }
  const result = await benchmarkApp(browser, app, runs).catch((err) => ({
    name: app.name,
    bundle: null,
    load: null,
    ops: null,
    memoryMB: null,
    errors: [String(err?.message ?? err)],
  }));
  results.push(result);
  // incremental write: a crash in a later app must not lose earlier results
  writeFileSync(path.resolve(__dirname, "results.json"), JSON.stringify(results, null, 2));
}

if (browser) await browser.close();
for (const server of servers) {
  server.closeAllConnections?.();
  server.close();
}

writeFileSync(path.resolve(__dirname, "results.json"), JSON.stringify(results, null, 2));
printTable(results);

function printTable(rows) {
  const header = ["app", "code gz KB", "runtime gz KB", "CSS gz KB", "FCP ms", "ready ms", "create10k ms", "append1k ms", "upd10th ms", "swap ms", "select ms", "remove ms", "heap MB"];
  const line = (cells) => cells.join(" | ");
  process.stdout.write(`\n${line(header)}\n${"-".repeat(header.join(" | ").length)}\n`);
  for (const r of rows) {
    const b = r.bundle ?? {};
    const l = r.load ?? {};
    const o = r.ops ?? {};
    process.stdout.write(
      line([
        r.name.padEnd(7),
        (b.codeGzipKB ?? "-").toString(),
        (b.runtimeGzipKB ?? "-").toString(),
        (b.cssGzipKB ?? "-").toString(),
        (l.fcpMs ?? "-").toString(),
        (l.readyMs ?? "-").toString(),
        (o.create10kMs ?? "-").toString(),
        (o.append1kMs ?? "-").toString(),
        (o.updateEvery10thMs ?? "-").toString(),
        (o.swapMs ?? "-").toString(),
        (o.selectMs ?? "-").toString(),
        (o.removeMs ?? "-").toString(),
        (r.memoryMB ?? "-").toString(),
      ]) + "\n",
    );
  }
  process.stdout.write(
    "(code gz = framework + app JS; runtime gz = Blazor's .NET runtime only; load = median over "
    + runs + " cold navigations; ops median over " + runs + " cycles; heap MB = retained live set (forced GC) after one rows cycle)\n",
  );
}