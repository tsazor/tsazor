/**
 * The BlazorHero port, end to end: upstream BlazorHero (:5350) and the built app (vite preview, :5353, through the
 * same proxy as the dev server), in a browser. Phase 1, the shell:
 *
 *   signed out, any page is the login, in the bar's layout → a submit shows the validators' messages, sends nothing
 *   → a wrong password: the API's message as a toast → the administrator: the JWT in localStorage as the original
 *   keeps it, the welcome, the frame (header, user card, the navigation by permission), the hub connected with the
 *   token, the backend's pages in a new tab → dark mode and the direction, kept across a reload → a language: the
 *   page loads again in it, the API asked in it → the logout dialog: Cancel stays, Logout leaves (the hub too) → the
 *   basic user sees only what the role allows → an unknown address: the not-found layout → axe on each layout, the
 *   dialog and the menus
 *
 * Starts the backend when it isn't running (the first run clones and builds BlazorHero, scripts/backend.mjs), builds
 * the app, and fails on every console error.
 * Run: node scripts/verify.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as playwright from "playwright-core";
import { launchBrowser } from "../../../scripts/browsers.mjs";
import { ADMIN, BACKEND, BASIC } from "./backend.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = "http://localhost:5353";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const spawned = [];

async function reachable(url) {
  try {
    await fetch(url, { redirect: "manual", headers: { "accept-language": "en" } });
    return true;
  } catch {
    return false;
  }
}

async function waitFor(what, ready, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (!(await ready())) {
    if (Date.now() > deadline) throw new Error(`${what} did not come up within ${seconds} s`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit", shell: true });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

async function ensureServers() {
  run("npx", ["tsazor", "check"]);
  run("npx", ["vite", "build", "--logLevel", "warn"]);
  if (!(await reachable(`${BACKEND}/swagger/v1/swagger.json`))) {
    spawned.push(spawn(process.execPath, ["scripts/backend.mjs"], { cwd: ROOT, stdio: "inherit" }));
    // The first run installs the .NET 6 SDK, clones and builds BlazorHero, and seeds its database.
    await waitFor("the backend", () => reachable(`${BACKEND}/swagger/v1/swagger.json`), 1200);
  }
  if (!(await reachable(APP))) {
    spawned.push(spawn("npx", ["vite", "preview"], { cwd: ROOT, stdio: "ignore", shell: true }));
    await waitFor("the preview server", () => reachable(APP), 60);
  }
}

function stopSpawned() {
  for (const child of spawned) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: true });
  }
}

let failed = 0;
function check(condition, label) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) failed++;
}

async function axe(page, label) {
  // A theme switch fades the colours in: measured mid-transition, a colour is neither the old nor the new one.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"), null, { timeout: 5000 }).catch(() => undefined);
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async (tags) => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
    return result.violations.map((violation) => `${violation.id} (${violation.nodes.length}): ${violation.nodes[0]?.target.join(" ")}`);
  }, WCAG_TAGS);
  check(violations.length === 0, `axe: ${label}${violations.length ? ` — ${violations.join(" | ")}` : ""}`);
}

const text = (page, selector) => page.locator(selector).first().innerText();

/** The login form, filled by its own buttons as a person would. */
async function signIn(page, user) {
  await page.getByRole("button", { name: user === ADMIN ? "Fill Administrator Credentials" : "Fill Basic User Credentials" }).click();
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.getByRole("navigation").first().waitFor();
}

/** The navigation's links, by section: "" for the ones above the headings. */
function navigationOf(page) {
  return page.evaluate(() => {
    const nav = document.querySelector("nav");
    const sections = {};
    for (const part of nav.children) {
      const heading = part.getAttribute("role") === "group" ? document.getElementById(part.getAttribute("aria-labelledby")).textContent.trim() : "";
      sections[heading] = [...part.querySelectorAll("a")].map((link) => link.textContent.trim());
    }
    return sections;
  });
}

let browser;
try {
  await ensureServers();
  browser = await launchBrowser(playwright);
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  const languages = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) languages.push(request.headers()["accept-language"]);
  });
  const hubFrames = [];
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/signalRHub")) return;
    hubFrames.push({ url: socket.url(), sent: [], received: [] });
    const frames = hubFrames.at(-1);
    socket.on("framesent", (frame) => frames.sent.push(String(frame.payload)));
    socket.on("framereceived", (frame) => frames.received.push(String(frame.payload)));
  });

  // Signed out: every page is the login, at its own address.
  await page.goto(`${APP}/home`);
  await page.getByRole("heading", { name: "Sign In" }).waitFor();
  check(new URL(page.url()).pathname === "/home", "signed out, a page shows the login at its own address (AuthorizeRouteView's NotAuthorized)");
  check(await page.getByRole("banner").getByRole("button", { name: "Toggle Dark Mode" }).isVisible(), "the signed-out bar has the dark-mode toggle and the language menu");
  await axe(page, "the login");

  // The app's own dark mode decides, not the OS's: under a dark OS the page stays light until the user switches.
  const osDark = await browser.newPage({ colorScheme: "dark" });
  await osDark.goto(`${APP}/login`);
  await osDark.getByRole("heading", { name: "Sign In" }).waitFor();
  const osDarkBackground = await osDark.evaluate(() => getComputedStyle(document.querySelector("main").parentElement).backgroundColor);
  const lightBackground = await page.evaluate(() => getComputedStyle(document.querySelector("main").parentElement).backgroundColor);
  check(osDarkBackground === lightBackground, `a dark OS leaves the light theme as it is (${osDarkBackground})`);
  await osDark.close();

  // The form: a submit shows TokenRequestValidator's messages and sends nothing.
  const signInButton = page.getByRole("button", { name: "Sign In" });
  const apiRequests = languages.length; // one entry per API request
  await page.getByLabel("E-mail").fill("mukesh");
  await signInButton.click();
  await page.getByText("Email is not correct").waitFor();
  const alerts = await page.getByRole("alert").allInnerTexts();
  check(alerts.includes("Email is not correct") && alerts.includes("Password is required!"), `a submit shows the validators' messages (${alerts.join(", ")})`);
  check(languages.length === apiRequests, "an invalid form sends nothing");
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Show password" }).click();
  check((await page.getByLabel("Password", { exact: true }).getAttribute("type")) === "text", "the eye shows the password");
  await signInButton.click();
  await page.getByText("Invalid Credentials.").waitFor();
  check(true, "a wrong password shows the API's message as a toast");
  check(await page.evaluate(() => localStorage.getItem("authToken") === null), "a failed sign-in stores no token");

  // The administrator.
  await page.goto(`${APP}/`);
  await signIn(page, ADMIN);
  await page.getByText(/Welcome Mukesh/).waitFor();
  check(true, "signed in: the welcome toast");
  // Blazored.LocalStorage writes a string as JSON: the original's keys and values, read the same way.
  const stored = await page.evaluate(() => ({ token: JSON.parse(localStorage.getItem("authToken")), refresh: JSON.parse(localStorage.getItem("refreshToken")) }));
  check(stored.token?.split(".").length === 3 && Boolean(stored.refresh), "the JWT and the refresh token are in localStorage, as the original keeps them");
  check((await text(page, "main h1")).startsWith("Blazor Hero"), "the home page renders in the frame");
  check(await page.getByText(ADMIN.email).isVisible(), "the user card shows the signed-in user");
  const adminNav = await navigationOf(page);
  check(
    JSON.stringify(Object.keys(adminNav)) === JSON.stringify(["", "Personal", "Document Management", "Administrator", "Communication", "Catalog Management"]) &&
      adminNav[""].includes("Hangfire") && adminNav.Administrator.includes("Users") && adminNav.Administrator.includes("Roles"),
    `the administrator sees every section (${Object.keys(adminNav).filter(Boolean).join(", ")})`,
  );
  const targets = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("nav a")].map((link) => [link.textContent.trim(), link.getAttribute("target")])));
  check(targets.Hangfire === "_blank" && targets.Swagger === "_blank" && targets["Quick Start Guide"] === "_blank" && targets.Home === null, "Hangfire, the guide and Swagger open in a new tab");
  const [swagger] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: "Swagger" }).click()]);
  await swagger.waitForLoadState();
  check((await swagger.title()) === "Swagger UI", "Swagger opens from the backend, past the app's routing");
  await swagger.close();
  check(new URL(page.url()).pathname === "/", "the app stays where it was");

  // The hub: connected with the token in the query string, as the original's connection is.
  await page.waitForTimeout(500);
  const hub = hubFrames.at(-1);
  check(hub !== undefined && new URL(hub.url).searchParams.get("access_token") === stored.token, "the hub connects over WebSockets with the token (access_token)");
  check(hub?.sent.some((frame) => frame.includes("\"OnConnectAsync\"")) === true, "the client tells the hub it is connected (OnConnectAsync)");
  await axe(page, "the signed-in frame");

  // The account menu and the support menu: menus in the header.
  await page.getByRole("button", { name: /^Account:/ }).click();
  check((await page.getByRole("menuitem").allInnerTexts()).join("|") === "Account|Logout", "the avatar opens the account menu");
  await axe(page, "the account menu");
  await page.keyboard.press("Escape");

  // Dark mode and the direction: kept in the preferences, so a reload keeps them.
  await page.getByRole("button", { name: "Toggle Dark Mode" }).click();
  await page.getByRole("button", { name: "Toggle right-to-left/left-to-right" }).click();
  const theme = () => page.evaluate(() => {
    const root = document.querySelector("body [data-fluent-theme]");
    return { theme: root.getAttribute("data-fluent-theme"), dir: root.getAttribute("dir") };
  });
  check(JSON.stringify(await theme()) === JSON.stringify({ theme: "dark", dir: "rtl" }), "dark mode and right-to-left switch the theme root");
  await axe(page, "the dark theme");
  await page.reload();
  await page.getByRole("navigation").first().waitFor();
  check(JSON.stringify(await theme()) === JSON.stringify({ theme: "dark", dir: "rtl" }), "both survive a reload (clientPreference)");
  await page.getByRole("button", { name: "Toggle Dark Mode" }).click();
  await page.getByRole("button", { name: "Toggle right-to-left/left-to-right" }).click();
  check(JSON.stringify(await theme()) === JSON.stringify({ theme: "light", dir: "ltr" }), "and switch back");

  // A language: the page loads again in it, and the API is asked in it.
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("menuitem", { name: "German" }).click();
  await page.getByRole("group", { name: "Persönlich" }).waitFor();
  languages.length = 0;
  await page.reload();
  await page.getByRole("group", { name: "Persönlich" }).waitFor();
  check(true, "German: the navigation's headings in German, after a reload too");
  check(languages.length > 0 && languages.every((language) => language === "de"), `the API is asked in German (Accept-Language: ${[...new Set(languages)].join(", ")})`);
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("menuitem", { name: "Englisch" }).click();
  await page.getByRole("group", { name: "Personal" }).waitFor();

  // The logout dialog: Cancel stays, Logout leaves.
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  const dialog = page.getByRole("dialog", { name: "Logout Confirmation" });
  await dialog.waitFor();
  check((await dialog.innerText()).includes("Do you really want to Logout?"), "Logout asks first (DialogService.Show<Logout>)");
  await axe(page, "the logout dialog");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.waitFor({ state: "detached" });
  check(await page.evaluate(() => localStorage.getItem("authToken") !== null), "Cancel keeps the user signed in");
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await dialog.getByRole("button", { name: "Logout" }).click();
  // Signed out, the page shows the login at once; the address follows when the navigation to /login completes.
  await page.waitForURL(`${APP}/login`, { timeout: 5000 }).catch(() => undefined);
  await page.getByRole("heading", { name: "Sign In" }).waitFor();
  check(new URL(page.url()).pathname === "/login", `Logout leaves for the login (${new URL(page.url()).pathname})`);
  check(await page.evaluate(() => localStorage.getItem("authToken") === null && localStorage.getItem("refreshToken") === null), "the tokens are gone");
  check(hubFrames.at(-1)?.sent.some((frame) => frame.includes("\"OnDisconnectAsync\"")) === true, "the client leaves the hub (OnDisconnectAsync)");

  // The basic user: the role grants no permissions, so the menu shows what needs none.
  await signIn(page, BASIC);
  const basicNav = await navigationOf(page);
  check(!basicNav[""].includes("Hangfire") && !("Administrator" in basicNav) && !("Catalog Management" in basicNav), `the basic user sees no permission's pages (${Object.entries(basicNav).map(([heading, links]) => `${heading || "top"}: ${links.join(", ")}`).join("; ")})`);

  // An address no page has: the not-found layout.
  await page.goto(`${APP}/no/such/page`);
  await page.getByRole("heading", { name: "The page you were looking for doesn't exist." }).waitFor();
  check(true, "an unknown address shows the not-found layout");
  await axe(page, "the not-found layout");

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
} catch (error) {
  console.error(error);
  failed++;
} finally {
  await browser?.close();
  stopSpawned();
}
console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
