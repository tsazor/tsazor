/**
 * The FluentCMS port, end to end: upstream FluentCMS (:5340), the BFF (:5341) serving the built app,
 * and the app in a browser.
 *
 *   signed out, an admin page says so → the login form shows the API's error for a wrong password →
 *   signing in keeps the JWT on the server (an HttpOnly cookie, no token in the response) → an admin
 *   page in the admin layout, its sidebar link current → the roles: add, edit (?id=), delete after
 *   a confirmation → the users: add, assign a role (checkbox group), delete → axe on both layouts,
 *   the dialog and the forms → signing out
 *
 * Starts what isn't running (the backend clones and builds FluentCMS the first time), builds the
 * app and the BFF, and fails on every console error but the one a wrong password causes.
 * Run: node scripts/verify.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as playwright from "playwright-core";
import { launchBrowser } from "../../../scripts/browsers.mjs";
import { ADMIN, BACKEND } from "./backend.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = "http://localhost:5341";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const spawned = [];

async function reachable(url) {
  try {
    await fetch(url, { redirect: "manual" });
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
  run("npx", ["vite", "build", "--logLevel", "warn"]);
  if (!(await reachable(`${BACKEND}/api/Setup/IsInitialized`)) || !existsSync(path.join(ROOT, ".backend", "fluentcms.json"))) {
    spawned.push(spawn(process.execPath, ["scripts/backend.mjs"], { cwd: ROOT, stdio: "inherit" }));
    // The first run clones and builds FluentCMS.
    await waitFor("the backend", async () => existsSync(path.join(ROOT, ".backend", "fluentcms.json")) && (await reachable(`${BACKEND}/api/Setup/IsInitialized`)), 900);
  }
  if (!(await reachable(`${APP}/bff/user`))) {
    run("dotnet", ["build", "bff", "--nologo", "-v", "q"]);
    spawned.push(spawn("dotnet", ["run", "--project", "bff", "--no-build"], { cwd: ROOT, stdio: "ignore", shell: true }));
    await waitFor("the BFF", () => reachable(`${APP}/bff/user`), 180);
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

async function axe(page) {
  // Fluent fades content in; mid-animation, axe measures the faded colours.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]),
  );
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async (tags) => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
    return result.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}×) ${v.nodes[0]?.target.join(" ")}`);
  }, WCAG_TAGS);
}

async function main() {
  await ensureServers();
  const browser = await launchBrowser(playwright);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    // Signed out: the admin pages are for Administrators.
    await page.goto(`${APP}/admin/roles`);
    await page.getByRole("heading", { name: "You have No Access to view this page." }).waitFor({ timeout: 15_000 });
    check(true, "signed out, an admin page says there is no access");

    // The login form, and the API's error for a wrong password.
    await page.goto(`${APP}/auth/login`);
    await page.getByLabel("Username").waitFor({ timeout: 15_000 });
    check((await page.getByRole("heading", { level: 2 }).textContent()) === "Welcome back", "the login page shows its form in the auth layout");
    const loginViolations = await axe(page);
    check(loginViolations.length === 0, `axe on the login page${loginViolations.length ? `: ${loginViolations.join(" | ")}` : ""}`);
    await page.getByLabel("Username").fill(ADMIN.username);
    await page.getByLabel("Password").fill("not the password");
    await page.getByRole("button", { name: "Sign in to your account" }).click();
    await page.getByText("User.LoginFailed").waitFor({ timeout: 10_000 });
    check(true, "a wrong password shows the API's error (User.LoginFailed)");

    // Signing in: the JWT stays on the server. (The answer is read on its way: the app navigates right after.)
    let login;
    await page.route("**/api/Account/Authenticate", async (route) => {
      const response = await route.fetch();
      login = { ok: response.ok(), body: await response.json() };
      await route.fulfill({ response });
    });
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in to your account" }).click();
    await page.waitForURL(`${APP}/`, { timeout: 10_000 });
    check(login?.ok === true && login.body.data?.userName === ADMIN.username && login.body.data?.token === null, "signing in answers with the user, without the token");
    const session = (await context.cookies()).find((cookie) => cookie.name === "fluentcms.session");
    check(session?.httpOnly === true && session.sameSite === "Strict", "the session is an HttpOnly, SameSite=Strict cookie");
    check(!(await page.evaluate(() => document.cookie)).includes("fluentcms.session"), "scripts can't read the session cookie");

    // An admin page in the admin layout.
    await page.goto(`${APP}/admin/roles`);
    await page.getByRole("navigation", { name: "Administration" }).waitFor({ timeout: 15_000 });
    const current = page.getByRole("navigation", { name: "Administration" }).getByRole("link", { name: "Roles" });
    check((await current.getAttribute("aria-current")) === "page", "the sidebar marks the current page");
    check((await page.getByRole("button", { name: ADMIN.username }).count()) === 1, "the header's menu shows the signed-in user");
    await page.getByRole("table", { name: "Roles" }).waitFor({ timeout: 15_000 });
    const adminViolations = await axe(page);
    check(adminViolations.length === 0, `axe on an admin page (the roles)${adminViolations.length ? `: ${adminViolations.join(" | ")}` : ""}`);

    // Roles: the CRUD pattern of every management screen.
    const rows = page.getByRole("table", { name: "Roles" }).locator("tbody tr");
    const administrators = rows.filter({ hasText: "Administrators" }).first();
    check(
      (await administrators.getByRole("link", { name: "Edit" }).count()) === 1 && (await administrators.getByRole("button", { name: /Delete/ }).count()) === 0,
      "a built-in role can be edited, not deleted",
    );
    const name = `Editors ${Date.now() % 100000}`;
    await page.getByRole("link", { name: "Add Role" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Description").fill("People who edit pages");
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(`${APP}/admin/roles`, { timeout: 10_000 });
    await rows.filter({ hasText: name }).waitFor({ timeout: 10_000 });
    check(true, "a new role, then back to the list (redirectTo)");

    await rows.filter({ hasText: name }).getByRole("link", { name: "Edit" }).click();
    await page.getByRole("heading", { name: "Update Role" }).waitFor({ timeout: 10_000 });
    await page.waitForFunction(() => document.querySelector("input")?.value !== "", null, { timeout: 10_000 });
    check(
      (await page.getByLabel("Name").inputValue()) === name && (await page.getByLabel("Description").inputValue()) === "People who edit pages",
      "the update form loads the role named by ?id= (@SupplyParameterFromQuery in a plugin)",
    );
    await page.getByLabel("Name").fill(`${name} (renamed)`);
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(`${APP}/admin/roles`, { timeout: 10_000 });
    await rows.filter({ hasText: `${name} (renamed)` }).waitFor({ timeout: 10_000 });
    check(true, "the update is in the list");

    await rows.filter({ hasText: `${name} (renamed)` }).getByRole("button", { name: /Delete/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 10_000 });
    check((await dialog.textContent())?.includes(`"${name} (renamed)"`) === true, "deleting asks first, naming the role");
    const dialogViolations = await axe(page);
    check(dialogViolations.length === 0, `axe with the dialog open${dialogViolations.length ? `: ${dialogViolations.join(" | ")}` : ""}`);
    await dialog.getByRole("button", { name: "Yes, I'm sure" }).click();
    await rows.filter({ hasText: name }).waitFor({ state: "detached", timeout: 10_000 });
    check(true, "the role is gone");

    // Users: three forms on one view, and a role assigned through a checkbox group.
    const userName = `ann${Date.now() % 100000}`;
    await page.goto(`${APP}/admin/users`);
    const users = page.getByRole("table", { name: "Users" }).locator("tbody tr");
    await users.first().waitFor({ timeout: 15_000 });
    await page.getByRole("link", { name: "Add User" }).click();
    await page.getByLabel("Username").fill(userName);
    await page.getByLabel("Password").fill("Secret123!");
    await page.getByLabel("Email").fill(`${userName}@example.com`);
    await page.getByLabel("Enabled").check();
    await page.getByRole("button", { name: "Submit" }).click();
    await users.filter({ hasText: userName }).waitFor({ timeout: 10_000 });
    check(true, "a new user is in the list");
    const usersViolations = await axe(page);
    check(usersViolations.length === 0, `axe on the users${usersViolations.length ? `: ${usersViolations.join(" | ")}` : ""}`);

    const openUser = async () => {
      await users.filter({ hasText: userName }).getByRole("link", { name: "Edit" }).click();
      await page.getByRole("group", { name: "Roles" }).getByRole("checkbox").first().waitFor({ timeout: 10_000 });
    };
    await openUser();
    check((await page.getByLabel("Username").inputValue()) === userName, "the user's update view loads the user");
    const updateViolations = await axe(page);
    check(updateViolations.length === 0, `axe on the user's three forms${updateViolations.length ? `: ${updateViolations.join(" | ")}` : ""}`);
    await page.getByRole("group", { name: "Roles" }).getByLabel("Administrators").check();
    await page.locator("form").nth(1).getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(`${APP}/admin/users`, { timeout: 10_000 });
    await openUser();
    check(await page.getByRole("group", { name: "Roles" }).getByLabel("Administrators").isChecked(), "an assigned role is checked when the user opens again");
    await page.getByRole("link", { name: "Cancel" }).first().click();
    await page.waitForURL(`${APP}/admin/users`, { timeout: 10_000 });
    await users.filter({ hasText: userName }).getByRole("button", { name: /Delete/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Yes, I'm sure" }).click();
    await users.filter({ hasText: userName }).waitFor({ state: "detached", timeout: 10_000 });
    check(true, "the user is gone");

    // Signing out through the user's menu.
    await page.getByRole("button", { name: ADMIN.username }).click();
    await page.getByRole("menuitem", { name: "Logout" }).click();
    await page.waitForURL(`${APP}/`, { timeout: 10_000 });
    const user = await page.evaluate(() => fetch("/bff/user").then((response) => response.json()));
    check(user.user === null, "signing out ends the session");

    // The browser logs the 500 that FluentCMS answers a wrong password with; nothing else may fail.
    const wrongPassword = (text) => text.includes("500 (Internal Server Error)");
    const unexpected = errors.filter((text) => !wrongPassword(text));
    check(
      errors.filter(wrongPassword).length <= 1 && unexpected.length === 0,
      `no console errors besides the wrong password's${unexpected.length ? `: ${unexpected.join(" | ")}` : ""}`,
    );
  } finally {
    await browser.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  failed++;
} finally {
  stopSpawned();
}
console.log(failed === 0 ? "\nverify-fluentcms: all checks passed" : `\nverify-fluentcms: ${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
