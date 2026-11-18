#!/usr/bin/env node
/**
 * The .NET gate (docs/design-aspnetcore.md): what a .NET developer gets from `dotnet new tsazor`, before anything goes
 * to nuget.org or npm.
 *
 *   both NuGet packages packed → the @tsazor/* packages in a fresh Verdaccio (as the release rehearsal does) → the
 *   template installed into a hive of its own → `dotnet new tsazor` with each --ui → for each: the solution's build
 *   (npm install, the API client from the OpenAPI document), the Release build (tsazor check, vite build), the client's
 *   test → for the Bootstrap app: `dotnet publish`, the published server's answers (fallback, 404s, caching), a new
 *   client build served without a restart, the pages in a browser (the API, the server's validation errors), and
 *   `dotnet run` in Development (the Vite dev server started by the server, hot reload through it)
 *
 *   node dotnet/scripts/template-e2e.mjs [--keep] [--ui bootstrap,fluent,none] [--registry <url>]
 *   (after `pnpm -r build`; --registry reuses a registry that has the current version)
 *
 * The NuGet packages stay out of the machine's caches: their own feed and NUGET_PACKAGES in the scratch directory, the
 * template in a hive of its own (`--debug:custom-hive`).
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { launchBrowser } from "../../scripts/browsers.mjs";
import { startRegistry, userconfigFor } from "../../scripts/registry.mjs";
import { publishAll } from "../../scripts/release.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOTNET = path.join(REPO, "dotnet");
// playwright-core is the browser gates' dependency (apps/starter).
const playwright = createRequire(path.join(REPO, "apps", "starter", "package.json"))("playwright-core");

const { values } = parseArgs({ options: { keep: { type: "boolean" }, ui: { type: "string" }, registry: { type: "string" } } });
const uis = (values.ui ?? "bootstrap,fluent,none").split(",");
const scratch = mkdtempSync(path.join(tmpdir(), "tsazor-template-e2e-"));
const feed = path.join(scratch, "nuget");
const hive = path.join(scratch, "hive");
const windows = process.platform === "win32";

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};

/** The environment of a user's shell: no `npm_*` of a package manager that started the gate (registry-rehearsal.mjs). */
const shellEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^npm_/i.test(name)));
let env = { ...shellEnv, NUGET_PACKAGES: path.join(scratch, "packages"), DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" };

function run(command, args, cwd, label) {
  const result = spawnSync(command, args, { cwd, env, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${label} failed:\n${result.stdout}${result.stderr}`);
  return result.stdout;
}

/** Starts a long-running process; `stop()` ends it with its children (the dev server under `dotnet run`). */
function start(command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, { cwd, env: { ...env, ...extraEnv }, shell: true, windowsHide: true, detached: !windows });
  let output = "";
  child.stdout.on("data", (data) => (output += data));
  child.stderr.on("data", (data) => (output += data));
  const exited = new Promise((resolve) => child.once("exit", resolve));
  return {
    output: () => output,
    stop: async () => {
      if (child.exitCode !== null) return;
      if (windows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(-child.pid, "SIGTERM");
      await exited;
    },
  };
}

async function waitFor(url, process, seconds = 120) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    try {
      await fetch(url, { redirect: "manual" });
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`Nothing answered at ${url}:\n${process.output()}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

const version = JSON.parse(readFileSync(path.join(REPO, "packages", "runtime", "package.json"), "utf8")).version;
let registry;
const browser = await launchBrowser(playwright);
try {
  /* The packages ------------------------------------------------------------------------------------------------ */

  run("dotnet", ["pack", path.join(DOTNET, "src", "Tsazor.AspNetCore"), "-c", "Release", "-o", feed], DOTNET, "dotnet pack Tsazor.AspNetCore");
  run("dotnet", ["pack", path.join(DOTNET, "templates"), "-c", "Release", "-o", feed], DOTNET, "dotnet pack Tsazor.Templates");
  const packed = readdirSync(feed).sort();
  check(packed.join(" ") === `Tsazor.AspNetCore.${version}.nupkg Tsazor.Templates.${version}.nupkg`, `dotnet pack: ${packed.join(", ")}`);

  let registryUrl = values.registry;
  if (!registryUrl) {
    registry = await startRegistry({ dir: path.join(scratch, "registry"), port: 4877 });
    registryUrl = registry.url;
    const userconfig = await userconfigFor(registry.url, scratch);
    const { tarballs } = publishAll({ registry: registry.url, userconfig, out: path.join(scratch, "tarballs") });
    check(true, `${tarballs.length} npm packages published to ${registry.url}`);
  }
  env = { ...env, npm_config_registry: registryUrl };

  run("dotnet", ["new", "install", path.join(feed, `Tsazor.Templates.${version}.nupkg`), "--debug:custom-hive", hive], scratch, "dotnet new install");
  check(true, "dotnet new install Tsazor.Templates (a hive of its own)");

  /* Each --ui: create, build, test ------------------------------------------------------------------------------ */

  const apps = {};
  for (const ui of uis) {
    const name = ui === "bootstrap" ? "Contoso.Shop" : `App.${ui[0].toUpperCase()}${ui.slice(1)}`;
    const dir = path.join(scratch, name);
    const say = (ok, label) => check(ok, `[${ui}] ${label}`);
    run("dotnet", ["new", "tsazor", "-n", name, "-o", dir, "--ui", ui, "--no-restore", "--debug:custom-hive", hive], scratch, `[${ui}] dotnet new tsazor`);
    writeFileSync(
      path.join(dir, "nuget.config"),
      `<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n  <packageSources>\n    <add key="tsazor-e2e" value="${feed}" />\n  </packageSources>\n</configuration>\n`,
    );
    const server = path.join(dir, `${name}.Server`);
    const client = path.join(dir, `${name}.Client`);
    const manifest = JSON.parse(readFileSync(path.join(client, "package.json"), "utf8"));
    say(
      manifest.name === `${name.toLowerCase()}.client` && (ui === "none" || manifest.dependencies[`@tsazor/${ui}`] === `^${version}`),
      `dotnet new: the client ${manifest.name} with ${ui === "none" ? "no library" : `@tsazor/${ui}`}`,
    );
    say(readFileSync(path.join(server, `${name}.Server.csproj`), "utf8").includes(`Include="Tsazor.AspNetCore" Version="${version}"`), `the server references Tsazor.AspNetCore ${version}`);

    run("dotnet", ["build", path.join(dir, `${name}.slnx`)], dir, `[${ui}] dotnet build`);
    say(existsSync(path.join(client, "node_modules", "@tsazor", "runtime")), "dotnet build ran npm install");
    say(
      existsSync(path.join(server, "obj", `${name}.Server.json`)) && readFileSync(path.join(client, "src", "api", "server.ts"), "utf8").includes("createSignup("),
      "dotnet build wrote the OpenAPI document and from it src/api (createSignup)",
    );
    // The template ships src/api for a client started before the first build: it must be what the build writes.
    const stale = ["models.ts", "server.ts"].filter(
      (file) =>
        readFileSync(path.join(DOTNET, "templates", "client", "src", "api", file), "utf8").replace(/\r\n/g, "\n").replaceAll("MyApp", name) !==
        readFileSync(path.join(client, "src", "api", file), "utf8").replace(/\r\n/g, "\n"),
    );
    say(stale.length === 0, `the template's src/api is what the build writes${stale.length ? ` — not ${stale.join(", ")}: copy them to dotnet/templates/client/src/api` : ""}`);

    run("dotnet", ["build", server, "-c", "Release"], dir, `[${ui}] dotnet build -c Release`);
    say(existsSync(path.join(server, "bin", "Release", "net10.0", "wwwroot", "index.html")), "dotnet build -c Release: tsazor check, vite build, dist in bin/Release/net10.0/wwwroot");

    run("npm", ["test"], client, `[${ui}] npm test`);
    say(true, "the client's test (vitest)");
    apps[ui] = { name, dir, server, client };
  }

  /* Publish: the server's answers -------------------------------------------------------------------------------- */

  const app = apps.bootstrap ?? Object.values(apps)[0];
  const publish = path.join(scratch, "publish");
  run("dotnet", ["publish", app.server, "-c", "Release", "-o", publish], app.dir, "dotnet publish");
  const assets = readdirSync(path.join(publish, "wwwroot", "assets"));
  const script = assets.find((file) => file.endsWith(".js"));
  check(existsSync(path.join(publish, "wwwroot", "index.html")) && script !== undefined, `dotnet publish: wwwroot/index.html and ${assets.length} files in wwwroot/assets`);

  const base = "http://127.0.0.1:5897";
  const published = start("dotnet", [`${app.name}.Server.dll`, "--urls", base], publish, { ASPNETCORE_ENVIRONMENT: "Production" });
  try {
    await waitFor(base, published);
    const get = (url, init) => fetch(new URL(url, base), { redirect: "manual", ...init });
    for (const route of ["/", "/weather", "/runs/42"]) {
      const response = await get(route);
      check(
        response.status === 200 && response.headers.get("content-type")?.startsWith("text/html") && response.headers.get("cache-control") === "no-cache",
        `GET ${route}: index.html, Cache-Control no-cache (${response.status}, ${response.headers.get("cache-control")})`,
      );
    }
    const asset = await get(`/assets/${script}`);
    check(
      asset.status === 200 && asset.headers.get("content-type")?.includes("javascript") && asset.headers.get("cache-control") === "public, max-age=31536000, immutable",
      `GET /assets/${script}: JavaScript, immutable for a year (${asset.headers.get("cache-control")})`,
    );
    for (const missing of ["/assets/index-missing.js", "/logo.png", "/api/missing", "/api"]) {
      const response = await get(missing);
      const body = await response.text();
      check(response.status === 404 && !body.includes("<!doctype html>"), `GET ${missing}: 404, not index.html`);
    }
    const forecast = await get("/api/weatherforecast");
    check(forecast.status === 200 && (await forecast.json()).length === 5, "GET /api/weatherforecast: five days");
    const invalid = await get("/api/signups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "", email: "x", age: 12 }) });
    const problem = await invalid.json();
    check(invalid.status === 400 && Object.keys(problem.errors ?? {}).sort().join(",") === "Age,Email,Name", `POST /api/signups invalid: 400 ValidationProblemDetails (${Object.keys(problem.errors ?? {}).join(", ")})`);

    // A new client build, deployed next to the running server: no restart.
    const home = path.join(app.client, "src", "Pages", "Home.tsazor");
    writeFileSync(home, readFileSync(home, "utf8").replace("Hello, world!", "Hello, new build!"));
    run("npm", ["run", "build"], app.client, "npm run build (the new build)");
    cpSync(path.join(app.client, "dist"), path.join(publish, "wwwroot"), { recursive: true });
    const newIndex = await (await get("/")).text();
    const newScript = /src="\/assets\/([^"]+\.js)"/.exec(newIndex)?.[1];
    const served = newScript ? await get(`/assets/${newScript}`) : undefined;
    check(newScript !== undefined && newScript !== script && served?.status === 200, `a new build is served without a restart (${script} → ${newScript})`);

    /* The pages in a browser ------------------------------------------------------------------------------------ */

    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    check((await page.locator("h1").textContent()) === "Hello, new build!", "the browser: Home from the new build");
    await page.getByRole("link", { name: "Weather" }).click();
    await page.waitForSelector("table tbody tr");
    check((await page.locator("table tbody tr").count()) === 5, "the browser: Weather shows the server's five days");
    await page.getByRole("link", { name: "Sign up" }).click();
    await page.waitForSelector("#signup-name");
    await page.fill("#signup-name", "Ada");
    await page.fill("#signup-email", "taken@example.com");
    await page.fill("#signup-age", "12");
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.waitForSelector(".validation-message");
    const clientSide = await page.locator(".validation-message").allTextContents();
    check(clientSide.some((text) => text.includes("18") && text.includes("120")), `the browser: the client checks the server's Range(18, 120) first (${clientSide.join(" | ")})`);
    await page.fill("#signup-age", "30");
    // Leave the field first: its message goes on the change, the button moves up, and a click would miss it.
    await page.press("#signup-age", "Tab");
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.waitForFunction(() => [...document.querySelectorAll(".validation-message")].some((e) => e.textContent?.includes("already signed up")));
    check(true, "the browser: the server's validation error shows next to the email field");
    await page.fill("#signup-email", "ada@example.com");
    await page.press("#signup-email", "Tab");
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.waitForFunction(() => document.querySelector("[role=status]")?.textContent === "Welcome, Ada!");
    check(true, "the browser: a valid sign-up gets the server's answer");
    check(errors.length === 0, `the browser: no errors on the page${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await page.close();
  } finally {
    await published.stop();
  }

  /* Development: dotnet run starts the dev server; hot reload through the server --------------------------------- */

  const settings = JSON.parse(readFileSync(path.join(app.server, "Properties", "launchSettings.json"), "utf8"));
  const devUrl = settings.profiles.http.applicationUrl;
  const vitePort = /localhost:(\d+)/.exec(/DevServer\.Url = new Uri\("([^"]+)"\)/.exec(readFileSync(path.join(app.server, "Program.cs"), "utf8"))[1])[1];
  const development = start("dotnet", ["run", "--project", app.server, "--launch-profile", "http", "--no-build"], app.dir);
  try {
    await waitFor(devUrl, development);
    const page = await browser.newPage();
    await page.goto(devUrl, { waitUntil: "networkidle", timeout: 120_000 });
    try {
      await page.waitForSelector("h1", { timeout: 15_000 });
    } catch {
      // Vite's first start with an empty cache (node_modules/.vite) sometimes answers a dependency of the first page
      // with 504 "Outdated Optimize Dep" and sends no reload: the page stays empty until the next load. The same
      // happens with `npm run dev` alone, without the server in between (found 2026-11-18).
      console.log("NOTE  dotnet run: the first page load stayed empty (Vite's cold start); loading it again");
      await page.reload({ waitUntil: "networkidle" });
    }
    check((await page.locator("h1").textContent()) === "Hello, new build!", `dotnet run: the app from the Vite dev server (port ${vitePort}) behind ${devUrl}`);
    check(development.output().includes("starting the dev server"), "dotnet run: the server started the dev server itself");
    await page.evaluate(() => (window.__noReload = true));
    const home = path.join(app.client, "src", "Pages", "Home.tsazor");
    writeFileSync(home, readFileSync(home, "utf8").replace("Hello, new build!", "Hello, hot reload!"));
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Hello, hot reload!", undefined, { timeout: 30_000 });
    check(await page.evaluate(() => window.__noReload === true), "dotnet run: an edit reaches the page through the HMR WebSocket, without a reload");
    const missing = await fetch(new URL("/api/missing", devUrl));
    check(missing.status === 404, "dotnet run: /api/missing is a 404, not the dev server's index.html");
    await page.close();
  } catch (error) {
    throw new Error(`${error.message}
The server's output:
${development.output()}`);
  } finally {
    await development.stop();
  }
} catch (error) {
  check(false, error.message);
} finally {
  await browser.close();
  await registry?.stop();
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
if (values.keep || failed > 0) console.log(`kept: ${scratch}`);
else rmSync(scratch, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
