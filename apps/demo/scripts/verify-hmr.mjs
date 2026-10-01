/**
 * Live verification for phase 4.1 (HMR und Invalidierung): starts a real Vite
 * dev server, then drives the scenarios end to end in a headless browser:
 *
 *   (a) neue Seite (@page)      → Routen-Manifest ändert sich → Reload
 *   (b) neue Komponente für vorher unaufgelöstes Tag → ohne Reload
 *   (c) Komponenten-Änderung    → HMR-Swap, State (Marker) überlebt
 *   (d) `_Imports.tsazor` @import → freier Name der Seite löst sich, ohne Reload
 *   (e) CSS-Sidecar kommt       → Style wirkt, ohne Reload
 *   (f) CSS-Sidecar geht        → voller Reload (injizierte <style> überlebt nicht)
 *   (g) Komponente geht         → Tag wird wieder als Element emittiert, ohne Reload
 *   (h) Aufräumen (Seite weg)   → Routen-Manifest erneut, Reload
 *
 * Uses msedge via playwright-core (no Chromium download).
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "http://localhost:5198";
const errors = [];

/** Files this script created — removed again in `finally`. */
const created = [];
const importsPath = path.join(appDir, "src", "_Imports.tsazor");
let savedImports = null;

const server = await createServer({
  root: appDir,
  configFile: path.join(appDir, "vite.config.ts"),
  server: { port: 5198, strictPort: true },
  logLevel: process.env.VITE_LOG ?? "error",
});
await server.listen();

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const traced = [];
page.on("websocket", (ws) => {
  ws.on("framereceived", (frame) => {
    const data = typeof frame.payload === "string" ? frame.payload : String(frame.payload ?? "");
    if (/update|reload|error/.test(data)) traced.push(`ws: ${data.slice(0, 200)}`);
  });
});
page.on("console", (msg) => {
  if (msg.type() === "error") {
    const url = msg.location()?.url ?? "";
    errors.push(`console: ${msg.text()} ${/404|reload/.test(msg.text()) ? `(${url})` : ""}`);
  }
});
page.on("pageerror", (err) => {
  const text = `pageerror: ${err.message}\n${(err.stack ?? "").split("\n").slice(0, 6).join("\n")}`;
  // - (d) expects `this.hmrHello` to fail while the @import is missing (A3 proof).
  // - (f)/(g) module deletion churn: Vite's client runs one queued update
  //   against the removed module (404/"reading 'default'") before the
  //   consumers' swap lands — bounded, documented, end state is correct.
  if (/hmrHello|HmrBadge\.tsazor\?import|HmrProbe\.tsazor\.css\?import/.test(text)) errors.push(`pageerror(expected): ${err.message}`);
  else errors.push(text);
});

let reloads = 0;
page.on("load", () => (reloads += 1));

const results = [];
const check = (name, ok, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const write = async (rel, content) => {
  const file = path.join(appDir, rel);
  if (!created.includes(file)) created.push(file);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
};

const remove = async (rel) => {
  created.push(path.join(appDir, rel));
  await rm(path.join(appDir, rel), { force: true });
};

/** Node-side polling (a browser-evaluated predicate may itself be async). */
const waitFor = async (fn, timeout = 15_000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`timeout waiting for ${fn.toString().slice(0, 80)}`);
};

const textOf = async (selector) => {
  const el = await page.locator(selector).first().elementHandle().catch(() => null);
  return el === null ? null : (await el.textContent()) ?? null;
};

const arm = async () => page.evaluate(() => (window.__hmrMarker = 42));
const markerIs = async () => page.evaluate(() => window.__hmrMarker ?? null);

const BADGE_V1 = "<span class=\"hmr-badge\">badge-1</span>";
const BADGE_V2 = "<span class=\"hmr-badge\">badge-2</span>";
const PROBE_V1 = `@page "/hmr-probe"

<h1>HMR probe</h1>

<p class="hmr-stamp">@stamp</p>

<HmrBadge />

@code {
    private stamp = "v1";
}
`;
const PROBE_V2 = PROBE_V1.replace(
  '<p class="hmr-stamp">@stamp</p>',
  '<p class="hmr-stamp">@stamp</p>\n<p class="hmr-hello">@hmrHello()</p>',
);
// In _Imports.tsazor the @import is appended after the last line.
const IMPORTS_WITH_HELLO = () => `${savedImports}@import { hmrHello } from "./hmr-hello"\n`;

try {
  savedImports = await readFile(importsPath, "utf8");

  // (a) — Neue Seite: Routen-Manifest ändert sich → Reload der App.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const beforeA = reloads;
  await write("src/Pages/HmrProbe.tsazor", PROBE_V1);
  await waitFor(() => reloads > beforeA);
  check("(a) neue Seite löst Reload aus (Routen-Manifest)", reloads === beforeA + 1, `reloads=${reloads - beforeA}`);

  await page.goto(`${BASE}/hmr-probe`, { waitUntil: "networkidle" });
  check("(a) neue Route rendert", (await textOf("h1"))?.includes("HMR probe") === true);
  check("(a) Page-State v1 gerendert", (await textOf(".hmr-stamp")) === "v1");
  check("(a) unaufgelöstes Tag als Element", (await page.locator(".hmr-badge").count()) === 0);

  // (b) — Neue Komponente für ein vorher unaufgelöstes Tag (TZS005).
  await arm();
  const beforeB = reloads;
  await write("src/Pages/HmrBadge.tsazor", `${BADGE_V1}\n`);
  await waitFor(async () => (await textOf(".hmr-badge")) === "badge-1");
  await page.waitForTimeout(400);
  check("(b) neue Komponente erscheint ohne Reload", reloads === beforeB, `reloads=${reloads - beforeB}`);
  check("(b) Browser-State überlebt den Swap", (await markerIs()) === 42);

  // (c) — Komponenten-Änderung: Swap des Inhalts, State bleibt.
  const beforeC = reloads;
  await write("src/Pages/HmrBadge.tsazor", `${BADGE_V2}\n`);
  await waitFor(async () => (await textOf(".hmr-badge")) === "badge-2");
  await page.waitForTimeout(400);
  check("(c) Komponenten-Änderung ohne Reload", reloads === beforeC, `reloads=${reloads - beforeC}`);
  check("(c) State überlebt den Swap", (await markerIs()) === 42);

  // (d) — `_Imports.tsazor` @import: freie Namen lösen sich (A3), ohne Reload.
  // Vorher: die Seite referenziert `hmrHello` — ohne den Import wirft der
  // Render einen ReferenceError (erwartetes Rauschen, oben gefiltert); erst
  // die _Imports-Änderung transformiert die Seite neu — jetzt mit Import.
  await write("src/hmr-hello.ts", 'export function hmrHello(): string { return "hello-v1"; }\n');
  await write("src/Pages/HmrProbe.tsazor", PROBE_V2);
  const beforeD = reloads;
  await writeFile(importsPath, IMPORTS_WITH_HELLO());
  await waitFor(async () => (await textOf(".hmr-hello")) === "hello-v1", 20_000);
  await page.waitForTimeout(400);
  check("(d) _Imports-@import löst freien Namen ohne Reload", reloads === beforeD, `reloads=${reloads - beforeD}`);
  check("(d) State überlebt den Swap", (await markerIs()) === 42);

  // (e) — CSS-Sidecar dazwischen: Style wirkt, ohne Reload.
  const beforeE = reloads;
  await write("src/Pages/HmrProbe.tsazor.css", ".hmr-stamp { color: rgb(255, 0, 0); }\n");
  await waitFor(async () => {
    const el = await page.locator(".hmr-stamp").first().elementHandle().catch(() => null);
    if (el === null) return false;
    const color = await page.evaluate((node) => getComputedStyle(node).color, el);
    return color === "rgb(255, 0, 0)";
  });
  const el = await page.locator(".hmr-stamp").first().elementHandle().catch(() => null);
  const stampColor = el === null ? null : (await page.evaluate((node) => getComputedStyle(node).color, el));
  check("(e) CSS-Sidecar wird angewendet", stampColor === "rgb(255, 0, 0)", stampColor ?? "n/a");
  check("(e) ohne Reload", reloads === beforeE, `reloads=${reloads - beforeE}`);
  check("(e) State überlebt", (await markerIs()) === 42);

  // (f) — CSS-Sidecar geht: der injizierte <style> überlebt HMR nicht → Reload.
  const beforeF = reloads;
  await remove("src/Pages/HmrProbe.tsazor.css");
  await waitFor(() => reloads > beforeF);
  const stampColorAfter = await page.evaluate(() => {
    const el = document.querySelector(".hmr-stamp");
    return el === null ? null : getComputedStyle(el).color;
  });
  check("(f) CSS-Sidecar entfernen erzwingt Reload", reloads > beforeF, `reloads=${reloads - beforeF}`);
  check("(f) Style ist weg", stampColorAfter !== "rgb(255, 0, 0)", stampColorAfter ?? "n/a");

  // (g) — Komponente geht: das Tag wird wieder als Element emittiert.
  await arm();
  const beforeG = reloads;
  await remove("src/Pages/HmrBadge.tsazor");
  await waitFor(async () => (await page.locator(".hmr-badge").count()) === 0);
  await page.waitForTimeout(400);
  check("(g) entferntes Komponenten-Tag ohne Reload", reloads === beforeG, `reloads=${reloads - beforeG}`);
  check("(g) State überlebt den Swap", (await markerIs()) === 42);
} catch (error) {
  check("Szenarien vollständig durchgelaufen", false, error.message);
} finally {
  // (h) — Alles zurück: das Routen-Manifest ändert sich erneut (Reload).
  const beforeH = reloads;
  await remove("src/Pages/HmrProbe.tsazor");
  await waitFor(() => reloads > beforeH, 10_000).catch(() => {});
  check("(h) entfernte Seite aktualisiert das Routen-Manifest", reloads > beforeH, `reloads=${reloads - beforeH}`);

  await browser.close();
  await server.close();
  // Demo-Dateien wiederherstellen, bevor die erzeugten Dateien wegkommen.
  if (savedImports !== null) await writeFile(importsPath, savedImports);
  for (const file of created) {
    await rm(file, { force: true, recursive: true });
  }
  
  await rm(path.join(appDir, "src", "Shared"), { force: true }).catch(() => {});
}

// Erwartetes Rauschen ausklammern:
// - Szenario d: ReferenceError bis der Import da ist (der A3-Nachweis),
// - Szenarien f/g: beim Entfernen einer geladenen Datei reicht Vites Client
//   einmal an die verschwundene Datei (404 + "Failed to reload") bevor der
//   Swap der Verbraucher landet — begrenzt, dokumentiert, unsichtbar am Ende.
const isExpected = (line) =>
  line.startsWith("pageerror(expected)") ||
  line.includes("Failed to reload /src/Pages/HmrBadge.tsazor") ||
  line.includes("Failed to reload /src/Pages/HmrProbe.tsazor.css") ||
  (/Failed to load resource.*404/.test(line) &&
    (line.includes("HmrBadge") || line.includes("HmrProbe")));
const unexpected = errors.filter((line) => !isExpected(line));
check("keine unerwarteten Fehler", unexpected.length === 0, unexpected.join(" | ").slice(0, 400));

console.log(results.join("\n"));
if (process.env.VITE_HMR_TRACE) console.log("ws-trace:\n" + traced.join("\n"));
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);