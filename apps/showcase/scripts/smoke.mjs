/**
 * The showcase's smoke: the built app in a real browser (the gates' browser,
 * see scripts/browsers.mjs). The home shows the component index, the DataGrid
 * page renders its grids and one code panel per example (the copy button, once
 * clicked, says "Copied").
 *
 *   node scripts/smoke.mjs      (after `npm run build`)
 */
import http from "node:http";
import path from "node:path";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import * as playwright from "playwright-core";
import { launchBrowser } from "../../../scripts/browsers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

const server = http.createServer(async (request, response) => {
  const requestPath = decodeURIComponent(new URL(`http://x${request.url ?? "/"}`).pathname);
  const file = path.normalize(join(ROOT, requestPath)).replace(/\\/g, "/");
  if (!file.startsWith(ROOT.replaceAll("\\", "/"))) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(join(ROOT, requestPath));
    response.writeHead(200, { "content-type": MIME[extname(requestPath)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    // A client route: every miss serves the shell.
    try {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(await readFile(join(ROOT, "index.html")));
    } catch {
      response.writeHead(500).end();
    }
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
let exit = 0;
try {
  const browser = await launchBrowser(playwright);
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => (message.type() === "error" ? errors.push(message.text()) : undefined));

  await page.goto(`${url}/`);
  await page.waitForSelector("h1");
  if ((await page.textContent("h1")) !== "Tsazor components") throw new Error("the home page's title is missing");

  await page.goto(`${url}/datagrid`);
  await page.waitForSelector(".sz-example-demo table");
  const rows = await page.locator(".sz-example-demo table tbody tr").count();
  if (rows < 4) throw new Error(`the first grid shows only ${rows} rows`);
  const examples = await page.locator(".sz-code pre code").count();
  if (examples < 11) throw new Error(`the DataGrid page shows ${examples} code panels, expected one per example`);
  const firstCode = await page.textContent(".sz-code pre code");
  if (!firstCode.includes("DataGrid Items=")) throw new Error("the code panel does not show the example's source");

  await page.locator(".sz-code__bar button").first().click();
  await page.waitForFunction(() => [...document.querySelectorAll(".sz-code__bar button")].some((button) => button.textContent === "Copied"), { timeout: 5000 });

  for (const route of ["/richtext", "/schedule", "/chat", "/templates"]) {
    await page.goto(`${url}${route}`);
    await page.waitForSelector(".sz-code pre code");
    const panels = await page.locator(".sz-code pre code").count();
    if (panels < (route === "/schedule" ? 2 : route === "/templates" ? 3 : 1)) throw new Error(`the ${route} page shows ${panels} code panels`);
  }

  if (errors.length > 0) throw new Error(`page errors: ${errors.join("; ")}`);
  console.log("showcase smoke: home, DataGrid, RichText, Scheduler, a code panel per example, copy — ok");
  await browser.close();
} catch (error) {
  console.error(String(error));
  exit = 1;
} finally {
  server.close();
}
process.exit(exit);