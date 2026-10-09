/**
 * The FluentCMS backend for the port: upstream FluentCMS, unchanged, at the pinned commit.
 *
 *   node scripts/backend.mjs           # clone and build once, run on :5340, set it up the first time
 *   node scripts/backend.mjs --reset   # the same, from an empty database
 *
 * The clone lives in .backend/ (git-ignored). The first-time setup creates the admin user and the
 * default site, and FluentCMS writes its API token into its own appsettings.json. This script copies
 * the token to .backend/fluentcms.json, where the BFF reads it: the SPA never sees it.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BACKEND = "http://localhost:5340";
export const ADMIN = { username: "admin", email: "admin@example.com", password: "Admin123!" };
/** The hosts the SPA is served from (Vite, the BFF). FluentCMS finds the site by the URL's host. */
const SITE_URLS = ["localhost:5342", "localhost:5341"];

const UPSTREAM = "https://github.com/fluentcms/FluentCMS.git";
const COMMIT = "c63d49cdbc1f4051d34bb71087d904c56e33951e";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".backend");
const clone = path.join(work, "FluentCMS");
const host = path.join(clone, "src", "FluentCMS");
const dll = path.join(host, "bin", "Debug", "net9.0", "FluentCMS.dll");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

function ensureClone() {
  if (existsSync(path.join(clone, ".git"))) return;
  console.log(`backend: cloning FluentCMS ${COMMIT.slice(0, 7)}`);
  mkdirSync(clone, { recursive: true });
  run("git", ["init", "--quiet"], clone);
  run("git", ["config", "core.longpaths", "true"], clone);
  run("git", ["fetch", "--quiet", "--depth", "1", UPSTREAM, COMMIT], clone);
  run("git", ["checkout", "--quiet", "FETCH_HEAD"], clone);
}

function ensureBuild() {
  if (existsSync(dll)) return;
  console.log("backend: building FluentCMS (.NET 9)");
  run("dotnet", ["build", path.join(host, "FluentCMS.csproj"), "--nologo", "-v", "q"], clone);
}

/** An empty database, the template files gone, the API token out of appsettings.json. */
function reset() {
  for (const name of ["fluentcms.db", "fluentcms-log.db", "files"]) {
    rmSync(path.join(host, name), { recursive: true, force: true });
  }
  run("git", ["checkout", "--quiet", "--", "src/FluentCMS/appsettings.json"], clone);
  rmSync(path.join(work, "fluentcms.json"), { force: true });
  console.log("backend: reset to an empty database");
}

async function reachable() {
  try {
    await fetch(`${BACKEND}/api/Setup/IsInitialized`, { redirect: "manual" });
    return true;
  } catch {
    return false;
  }
}

/** Calls the API; returns the envelope's data, throws with its errors. */
async function api(method, url, { body, key, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (key) headers["X-API-AUTH"] = key;
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${BACKEND}${url}`, { method, headers, body: body && JSON.stringify(body), redirect: "manual" });
  const text = await response.text();
  const envelope = text ? JSON.parse(text) : {};
  if (!response.ok || envelope.isSuccess === false) {
    throw new Error(`${method} ${url}: HTTP ${response.status} ${JSON.stringify(envelope.errors ?? text)}`);
  }
  return envelope.data;
}

function apiKey() {
  const settings = JSON.parse(readFileSync(path.join(host, "appsettings.json"), "utf8").replace(/^﻿/, ""));
  return settings.ClientSettings?.Key ?? "";
}

/** The first-time setup, then the BFF's settings. */
async function setUp() {
  // Once set up, FluentCMS answers IsInitialized only with the API token (before, without one).
  if (!(await api("GET", "/api/Setup/IsInitialized", { key: apiKey() || undefined }))) {
    console.log(`backend: first-time setup (user ${ADMIN.username}, template Default)`);
    await api("POST", "/api/Setup/Start", { body: { ...ADMIN, template: "Default", url: SITE_URLS[0] } });
  }
  const key = apiKey();
  if (!key) throw new Error("backend: the setup wrote no API token into appsettings.json");

  // The SPA is served from more than one host; the site has to answer to each of them.
  const { token } = await api("POST", "/api/Account/Authenticate", { body: ADMIN, key });
  const [site] = await api("GET", "/api/Site/GetAll", { key, token });
  const missing = SITE_URLS.filter((url) => !site.urls.includes(url));
  if (missing.length > 0) {
    await api("PUT", "/api/Site/Update", { key, token, body: { ...site, urls: [...site.urls, ...missing] } });
  }

  writeFileSync(
    path.join(work, "fluentcms.json"),
    JSON.stringify({ FluentCms: { ApiUrl: `${BACKEND}/`, ApiKey: key } }, null, 2),
  );
}

async function main() {
  ensureClone();
  ensureBuild();
  if (process.argv.includes("--reset")) {
    if (await reachable()) throw new Error(`backend: stop the backend on ${BACKEND} before --reset`);
    reset();
  }

  let child;
  if (await reachable()) {
    console.log(`backend: already running on ${BACKEND}`);
  } else {
    child = spawn("dotnet", [dll], {
      cwd: host, // FluentCMS reads its templates, appsettings.json and database from here
      stdio: "inherit",
      env: {
        ...process.env,
        ASPNETCORE_ENVIRONMENT: "Development",
        ASPNETCORE_URLS: BACKEND,
        ClientSettings__Url: BACKEND,
        Logging__LogLevel__Default: "Warning",
        // FluentCMS writes a content's dates with DateTime.ToString(), in the server's culture ("06.06.2024
        // 17:04:05" on a German machine). Its Blazor Server UI parsed them back on the same server; a browser
        // can't know that culture. Invariant: "06/06/2024 17:04:05" everywhere (port-fluentcms.md, U2).
        DOTNET_SYSTEM_GLOBALIZATION_INVARIANT: "true",
      },
    });
    child.on("exit", (code) => process.exit(code ?? 0));
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill());
    const deadline = Date.now() + 60_000;
    while (!(await reachable())) {
      if (Date.now() > deadline) throw new Error(`backend: FluentCMS did not answer on ${BACKEND} within 60 s`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  await setUp();
  console.log(`backend: ready on ${BACKEND} — sign in as ${ADMIN.username} / ${ADMIN.password}`);
}

// Run only when started directly; codegen.mjs and verify.mjs import the constants.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
