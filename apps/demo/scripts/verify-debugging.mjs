/**
 * Real-browser debugging verification for the demo app: the DevTools story for
 * .tazor files. Uses msedge via playwright-core + a raw CDP session (Debugger
 * domain), no Chromium download.
 *
 * Checks:
 *  1. The dev server serves Counter.tazor as a module whose inline sourcemap
 *     maps the @code statement line back to the real source line.
 *  2. A breakpoint set on the mapped location (real .tazor coordinates)
 *     resolves and PAUSES when the button is clicked.
 *  3. Variable inspection from the pause scope: this.* members are live
 *     (this.currentCount, this.incrementCount — DevTools shows the same).
 *  4. Step-through: stepOver lands on the next mapped .tazor line, same scope.
 *  5. After resume the debugged statement's effect is in the UI (count 1).
 *
 * Run from apps/demo:  node scripts/verify-debugging.mjs
 */
import { chromium } from "playwright-core";

const BASE = "http://localhost:5199";
const errors = [];

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

const results = [];
const check = (name, ok, detail = "") => {
  const line = `${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`;
  results.push(line);
  console.log(line); // progressive output — no silent hangs
};

/* ------------------------------------------------------------------ */
/* 1. Fetch the transformed module and decode its inline sourcemap.    */
/*    Source line 14 (1-based: `this.currentCount++`) must map into    */
/*    the compiled code (VLQ decode).                                  */
/* ------------------------------------------------------------------ */
const moduleText = await (await fetch(`${BASE}/src/Pages/Counter.tazor?import`)).text();
const mapMatch = moduleText.match(/sourceMappingURL=data:application\/json[^\s"']*(?:;charset=utf-8)?;base64,([A-Za-z0-9+/=]+)/);
check("module has an inline base64 sourcemap", mapMatch !== null);

const map = JSON.parse(Buffer.from(mapMatch[1], "base64").toString("utf8"));
check("sourcemap names the real .tazor source", (map.sources ?? []).some((s) => s.endsWith("Counter.tazor")), map.sources.join(","));
check("sourcemap embeds the .tazor source text", (map.sourcesContent ?? []).join("").includes("@code {"));

/* Minimal VLQ decoder — enough to locate the mapped statement. */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const vlq = (seg) => {
  const out = [];
  let shift = 0, value = 0;
  for (const c of seg) {
    const d = B64.indexOf(c);
    if (d === -1) break;
    value += (d & 31) << shift;
    if (d & 32) { shift += 5; continue; }
    const negative = value & 1;
    value >>= 1;
    out.push(negative ? -value : value);
    value = 0; shift = 0;
  }
  return out;
};

const INCREMENT_LINE_0B = map.sourcesContent[map.sources.findIndex((s) => s.endsWith("Counter.tazor"))]
  .split("\n").findIndex((l) => l.includes("this.currentCount++"));
check("source line for this.currentCount++ found", INCREMENT_LINE_0B >= 0, `0-based line ${INCREMENT_LINE_0B}`);

const sourceMappings = [];
{
  let srcIdx = 0, srcLine = 0, srcCol = 0;
  map.mappings.split(";").forEach((genLineText, genLine) => {
    let genCol = 0;
    for (const seg of genLineText.split(",")) {
      if (!seg) continue;
      const fields = vlq(seg);
      genCol += fields[0];
      if (fields.length >= 4) {
        srcIdx += fields[1]; srcLine += fields[2]; srcCol += fields[3];
        sourceMappings.push({ genLine, genCol, srcIdx, srcLine, srcCol });
      }
    }
  });
}
const mappingToIncrement = sourceMappings.filter((m) => m.srcLine === INCREMENT_LINE_0B).sort((a, b) => a.genCol - b.genCol)[0];
check(`compiled position maps FROM source line ${INCREMENT_LINE_0B + 1} (1-based)`, mappingToIncrement !== undefined,
  mappingToIncrement ? `→ compiled line ${mappingToIncrement.genLine} (0-based), col ${mappingToIncrement.genCol}` : "");

/* ------------------------------------------------------------------ */
/* 2. CDP: enable the debugger, find the Counter.tazor script, set a   */
/*    breakpoint on the mapped location, click, catch the pause.       */
/* ------------------------------------------------------------------ */
const client = await context.newCDPSession(page);
const cdpSend = (method, params = {}) => client.send(method, params);

await cdpSend("Debugger.enable", { maxScriptsToCache: 1000 });
/* Soft send: while the runtime is paused, a command's response can lag —
 * don't let the click trigger block on it. */
const cdpSendSoft = (method, params = {}) =>
  Promise.race([cdpSend(method, params), page.waitForTimeout(2000).then(() => null)]);

let counterScriptId = null;
client.on("Debugger.scriptParsed", (script) => {
  if (script.url.includes("Counter.tazor")) counterScriptId = script.scriptId;
});

await page.goto(`${BASE}/counter`, { waitUntil: "networkidle" });
for (let i = 0; i < 50 && counterScriptId === null; i++) await page.waitForTimeout(100);
check("Debugger sees the compiled Counter.tazor script", counterScriptId !== null);

let bp;
check("breakpoint resolves at the mapped location",
  (await cdpSend("Debugger.setBreakpoint", {
    location: { scriptId: counterScriptId, lineNumber: mappingToIncrement.genLine, columnNumber: mappingToIncrement.genCol },
  }).then((r) => (bp = r) && r.actualLocation?.lineNumber >= 0).catch(() => false)) === true,
  bp.actualLocation ? `resolved at compiled line ${bp.actualLocation.lineNumber}` : String(bp));

/* Variable inspection happens in the paused state — wire the events first. */
let paused = null;
const nextPause = () =>
  new Promise((resolve) => {
    const handler = (event) => {
      client.off("Debugger.paused", handler);
      resolve(event);
    };
    client.on("Debugger.paused", handler);
  });

/* Real input via CDP (a Playwright click awaits the handler — which is paused). */
const box = await page.locator("button.btn").boundingBox();
const x = Math.round(box.x + box.width / 2);
const y = Math.round(box.y + box.height / 2);
const pausePromise = nextPause();
await cdpSend("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
await cdpSendSoft("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
const pause1 = await Promise.race([pausePromise, page.waitForTimeout(10000).then(() => null)]);
check("paused on click (breakpoint hit in event handler)", pause1 !== null && pause1.reason === "other", pause1?.reason ?? "no pause");
check("paused inside the Counter.tazor script", pause1 !== null && pause1.callFrames[0]?.location?.scriptId === counterScriptId);

/* 3. Variable inspection from the pause scope. */
const before = await cdpSend("Debugger.evaluateOnCallFrame", {
  callFrameId: pause1.callFrames[0].callFrameId,
  expression: "this.currentCount",
  returnByValue: true,
});
check("inspectable state this.currentCount === 0 before the line runs", before.result?.value === 0, before.result?.description);

const kind = await cdpSend("Debugger.evaluateOnCallFrame", {
  callFrameId: pause1.callFrames[0].callFrameId,
  expression: "typeof this.incrementCount",
  returnByValue: true,
});
check("inspectable method typeof this.incrementCount === 'function'", kind.result?.value === "function", kind.result?.value);

/* 4. Step through to the next mapped line. */
await cdpSend("Debugger.stepOver");
const pause2 = await Promise.race([nextPause(), page.waitForTimeout(10000).then(() => null)]);
check("stepOver lands on the next mapped .tazor line",
  pause2 !== null && pause2.callFrames[0]?.location?.scriptId === counterScriptId && pause2.callFrames[0].location.lineNumber !== bp.actualLocation.lineNumber,
  pause2 ? `line ${pause2.callFrames[0].location.lineNumber}` : "no second pause");

/* 5. Resume — the statement runs, the render updates the DOM. */
await cdpSend("Debugger.resume");
await page.waitForTimeout(300);
const display = await page.locator(".count-display strong").textContent();
check("after resume the UI shows the debugged statement's effect", display === "1", display ?? "");

check("no console/page errors", errors.length === 0, errors.join(" | ").slice(0, 300));

await cdpSend("Debugger.disable");
await browser.close();
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);