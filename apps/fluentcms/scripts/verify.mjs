/**
 * The FluentCMS port, end to end: upstream FluentCMS (:5340), the BFF (:5341) serving the built app,
 * and the app in a browser.
 *
 *   signed out, an admin page says so → the login form shows the API's error for a wrong password →
 *   signing in keeps the JWT on the server (an HttpOnly cookie, no token in the response) → an admin
 *   page in the admin layout, its sidebar link current → the roles: add, edit (?id=), delete after
 *   a confirmation → the users: add, assign a role (checkbox group), delete → plugins, global
 *   settings, layouts, blocks, a site's settings → API tokens, pages (a TreeView) → files: a folder,
 *   an upload (multipart), the file served, rename, move in the folder picker, delete → axe on both
 *   layouts, the dialogs and the forms → signing out
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

    // The other management screens, each once around.
    const table = (name) => page.getByRole("table", { name }).locator("tbody tr");
    const stamp = Date.now() % 100000;
    await page.goto(`${APP}/admin/plugins`);
    await table("Plugins").first().waitFor({ timeout: 15_000 });
    check((await table("Plugins").count()) > 10, "the plugin definitions are listed");

    await page.goto(`${APP}/admin/globalsettings`);
    await page.waitForFunction(() => (document.querySelector("input")?.value ?? "") !== "", null, { timeout: 15_000 });
    check((await page.getByLabel("Super Admin User Names").inputValue()).split(",").includes(ADMIN.username), "the global settings name the super admins");
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(`${APP}/admin`, { timeout: 10_000 });

    for (const screen of [
      { list: "Layouts", add: "Add Layout", name: `Layout ${stamp}`, fields: { "Layout Head": "<title>t</title>", "Layout Body": '<PluginsSection Name="Main" fluentcms />' }, check: "Layout Body" },
      { list: "Blocks", add: "Add Block", name: `Block ${stamp}`, fields: { Category: "Headers", Description: "A header", Content: "<h1>Hi</h1>" }, check: "Content" },
    ]) {
      await page.goto(`${APP}/admin/${screen.list.toLowerCase()}`);
      await page.getByRole("table", { name: screen.list }).waitFor({ timeout: 15_000 });
      await page.getByRole("link", { name: screen.add }).click();
      await page.getByLabel("Name").fill(screen.name);
      for (const [label, value] of Object.entries(screen.fields)) await page.getByLabel(label).fill(value);
      await page.getByRole("button", { name: "Submit" }).click();
      await table(screen.list).filter({ hasText: screen.name }).getByRole("link", { name: "Edit" }).click();
      await page.waitForFunction((label) => [...document.querySelectorAll("label")].some((l) => l.textContent === label && (document.getElementById(l.htmlFor)?.value ?? "") !== ""), screen.check, { timeout: 10_000 });
      const loaded = await page.getByLabel(screen.check).inputValue();
      await page.getByRole("link", { name: "Cancel" }).click();
      await table(screen.list).filter({ hasText: screen.name }).getByRole("button", { name: /Delete/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Yes, I'm sure" }).click();
      await table(screen.list).filter({ hasText: screen.name }).waitFor({ state: "detached", timeout: 10_000 });
      check(loaded === screen.fields[screen.check], `${screen.list}: add, open the update form (it loads), delete`);
    }

    await page.goto(`${APP}/admin/sites`);
    const editSite = async () => {
      await table("Sites").first().getByRole("link", { name: "Edit" }).click();
      await page.waitForFunction(() => (document.querySelector("select")?.value ?? "") !== "", null, { timeout: 15_000 });
    };
    await editSite();
    const before = await page.getByLabel("Meta Title").inputValue();
    await page.getByLabel("Meta Title").fill(`Title ${stamp}`);
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(`${APP}/admin/sites`, { timeout: 10_000 });
    await editSite();
    const saved = await page.getByLabel("Meta Title").inputValue();
    await page.getByLabel("Meta Title").fill(before);
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(`${APP}/admin/sites`, { timeout: 10_000 });
    check(saved === `Title ${stamp}`, "a site's settings are saved (site and settings, two calls)");

    // API tokens: policies per area, the secret shown on request, re-generated, and the BFF's own
    // token protected (the BFF names its key, never its secret).
    const tokens = table("API Tokens");
    const tokenName = `Token ${stamp}`;
    await page.goto(`${APP}/admin/api-tokens`);
    await tokens.first().waitFor({ timeout: 15_000 });
    // "Full Access" is the token FluentCMS's setup made, the one the BFF uses.
    const own = tokens.filter({ hasText: "Full Access" });
    await own.getByRole("link", { name: "Edit" }).waitFor({ timeout: 15_000 });
    check((await own.getByRole("button", { name: /Delete/ }).count()) === 0, "the BFF's own API token can't be deleted");
    await page.getByRole("link", { name: "Add API Token" }).click();
    await page.getByLabel("Name").fill(tokenName);
    await page.getByLabel("Expire At").fill("2027-12-31");
    await page.locator("label", { hasText: "Enabled" }).click();
    await page.getByRole("group", { name: "Page Management" }).getByLabel("Read").check();
    await page.getByRole("button", { name: "Submit" }).click();
    const token = tokens.filter({ hasText: tokenName });
    await token.getByRole("button", { name: /Show the token/ }).click();
    const secret = await token.locator(".token").innerText();
    await token.getByRole("button", { name: /Re-Generate/ }).click();
    // (FluentCMS's secret is a JWT stamped in seconds: re-generated within the second it is the same.)
    const [regenerated] = await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/ApiToken/RegenerateSecret")),
      page.getByRole("dialog").getByRole("button", { name: "Yes, I'm sure" }).click(),
    ]);
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
    check(secret.includes(":") && regenerated.ok() && (await token.locator(".token").innerText()).includes(":"), "a token's secret is shown on request, and re-generated");
    await token.getByRole("link", { name: "Edit" }).click();
    await page.waitForFunction(() => (document.querySelector("input[type=date]")?.value ?? "") !== "", null, { timeout: 10_000 });
    check(
      (await page.getByLabel("Expire At").inputValue()) === "2027-12-31" && (await page.getByRole("group", { name: "Page Management" }).getByLabel("Read").isChecked()),
      "the token's update form loads its date and policies",
    );
    await page.getByRole("link", { name: "Cancel" }).click();
    await token.getByRole("button", { name: /Delete/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Yes, I'm sure" }).click();
    await token.waitFor({ state: "detached", timeout: 10_000 });

    // Pages: the parent picked in a TreeView (track B), the page under it.
    const pagesTable = table("Pages");
    const pageTitle = `News ${stamp}`;
    await page.goto(`${APP}/admin/pages`);
    await pagesTable.first().waitFor({ timeout: 15_000 });
    await page.getByRole("link", { name: "Add Page" }).click();
    await page.getByRole("tree").waitFor({ timeout: 10_000 });
    await page.getByLabel("Title", { exact: true }).fill(pageTitle);
    await page.getByLabel("Path").fill(`news-${stamp}`);
    await page.getByRole("treeitem", { name: "Blogs" }).click();
    const createViolations = await axe(page);
    check(createViolations.length === 0, `axe on the page form with its tree${createViolations.length ? `: ${createViolations.join(" | ")}` : ""}`);
    await page.getByRole("button", { name: "Submit" }).click();
    await pagesTable.filter({ hasText: pageTitle }).waitFor({ timeout: 10_000 });
    check((await pagesTable.filter({ hasText: pageTitle }).innerText()).includes(`/blogs/news-${stamp}`), "a new page goes under the parent picked in the tree");
    await pagesTable.filter({ hasText: pageTitle }).getByRole("link", { name: "Edit" }).click();
    await page.locator("[role=treeitem][aria-selected=true]").waitFor({ timeout: 10_000 });
    check((await page.locator("[role=treeitem][aria-selected=true]").getAttribute("data-tree-id")) !== "" && (await page.locator("[role=treeitem][aria-selected=true] .fui-tree__text").first().innerText()) === "Blogs", "the page's update form shows its parent selected");
    await page.getByRole("link", { name: "Cancel" }).click();
    await pagesTable.filter({ hasText: pageTitle }).getByRole("button", { name: /Delete/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Yes, I'm sure" }).click();
    await pagesTable.filter({ hasText: pageTitle }).waitFor({ state: "detached", timeout: 10_000 });

    // Files: a folder, an upload (multipart through the BFF), the file served, rename, move, delete.
    const files = table("Files");
    // (No spaces: FluentCMS looks a file's folder up by the URL's escaped path, so `a%20b` isn't found.)
    const folderName = `folder-${stamp}`;
    const [hello, notes] = [`hello-${stamp}`, `notes-${stamp}.md`];
    await page.goto(`${APP}/admin/files`);
    await files.filter({ hasText: "images" }).first().waitFor({ timeout: 15_000 });
    check((await page.getByRole("heading", { level: 2 }).first().textContent()) === "File Management (files)", "the file management opens the root folder");
    await page.getByRole("button", { name: "Add Folder" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill(folderName);
    await page.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
    await files.filter({ hasText: folderName }).waitFor({ timeout: 10_000 });
    await files.filter({ hasText: folderName }).getByRole("button", { name: folderName, exact: true }).click();
    await page.getByRole("heading", { name: `File Management (${folderName})` }).waitFor({ timeout: 10_000 });
    const trail = page.getByRole("navigation", { name: "Folder path" });
    check(
      (await files.first().innerText()).includes("(parent)") && (await trail.innerText()).includes("files") && (await trail.locator("[aria-current=page]").innerText()) === folderName,
      "a new folder opens in place, with the way up and the trail",
    );

    await page.getByRole("button", { name: "Upload File" }).click();
    const [upload] = await Promise.all([
      page.waitForRequest((request) => request.url().includes("/api/File/Upload")),
      page.getByRole("dialog").getByLabel("Files").setInputFiles([
        { name: `${hello}.txt`, mimeType: "text/plain", buffer: Buffer.from(`hello ${stamp}`) },
        { name: notes, mimeType: "text/markdown", buffer: Buffer.from("# notes") },
      ]),
    ]);
    await files.filter({ hasText: notes }).waitFor({ timeout: 10_000 });
    check((upload.headers()["content-type"] ?? "").startsWith("multipart/form-data; boundary="), "an upload goes as multipart/form-data (F5)");
    const href = await files.filter({ hasText: `${hello}.txt` }).getByRole("link", { name: `Download ${hello}.txt` }).getAttribute("href");
    const served = await page.evaluate((url) => fetch(url).then((response) => response.text()), href);
    check(served === `hello ${stamp}`, `an uploaded file is served at its folder path (${href})`);
    const filesViolations = await axe(page);
    check(filesViolations.length === 0, `axe on the files${filesViolations.length ? `: ${filesViolations.join(" | ")}` : ""}`);

    await files.filter({ hasText: `${hello}.txt` }).getByRole("button", { name: `Rename ${hello}.txt` }).click();
    check((await page.getByRole("dialog").getByLabel("Name").inputValue()) === hello, "renaming a file edits its name without the extension");
    const renameViolations = await axe(page);
    check(renameViolations.length === 0, `axe with the rename dialog open${renameViolations.length ? `: ${renameViolations.join(" | ")}` : ""}`);
    await page.getByRole("dialog").getByLabel("Name").fill(`greeting-${stamp}`);
    await page.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
    await files.filter({ hasText: `greeting-${stamp}.txt` }).waitFor({ timeout: 10_000 });
    check(true, "the renamed file keeps its extension");

    await files.filter({ hasText: notes }).getByRole("button", { name: `Move ${notes}` }).click();
    const chooser = page.getByRole("dialog", { name: "Choose Folder" });
    await chooser.getByRole("table", { name: "Folders" }).locator("tbody tr").first().waitFor({ timeout: 10_000 });
    await chooser.getByRole("navigation", { name: "Folder path" }).getByRole("button", { name: "files", exact: true }).click();
    await chooser.getByRole("table", { name: "Folders" }).locator("tbody tr", { hasText: "images" }).waitFor({ timeout: 10_000 });
    await chooser.getByRole("button", { name: "Move Here" }).click();
    await files.filter({ hasText: notes }).waitFor({ state: "detached", timeout: 10_000 });
    await trail.getByRole("button", { name: "files", exact: true }).click();
    await page.getByRole("heading", { name: "File Management (files)" }).waitFor({ timeout: 10_000 });
    await files.filter({ hasText: notes }).waitFor({ timeout: 10_000 });
    check(true, "a file moves to the folder picked in the folder chooser");

    await files.filter({ hasText: notes }).getByRole("button", { name: `Delete ${notes}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Yes, I'm sure" }).click();
    await files.filter({ hasText: notes }).waitFor({ state: "detached", timeout: 10_000 });
    await files.filter({ hasText: folderName }).getByRole("button", { name: `Delete ${folderName}` }).click();
    check((await page.getByRole("dialog").textContent())?.includes("with all of its files and folders") === true, "deleting a folder warns about its contents");
    await page.getByRole("dialog").getByRole("button", { name: "Yes, I'm sure" }).click();
    await files.filter({ hasText: folderName }).waitFor({ state: "detached", timeout: 10_000 });
    check(true, "a file and a folder are deleted");

    // Content types: a type, its fields through each type's settings form (a DynamicComponent), the settings
    // stored under FluentCMS's keys and read back, a field and the type deleted.
    const contentTypes = table("Content Types");
    const fields = table("Fields");
    const typeTitle = `Articles ${stamp}`;
    await page.goto(`${APP}/admin/content-types`);
    await page.getByRole("table", { name: "Content Types" }).waitFor({ timeout: 15_000 });
    await page.getByRole("link", { name: "New Content Type" }).click();
    await page.getByLabel("Slug").fill(`articles-${stamp}`);
    await page.getByLabel("Title").fill(typeTitle);
    await page.getByRole("button", { name: "Submit" }).click();
    await contentTypes.filter({ hasText: typeTitle }).getByRole("link", { name: `Fields of ${typeTitle}` }).click();
    await page.getByRole("heading", { name: "Content Type Fields" }).waitFor({ timeout: 10_000 });

    const addField = async (typeName, values, advanced = {}, selects = {}, view = {}) => {
      await page.getByRole("button", { name: "New Field" }).click();
      await page.getByRole("dialog", { name: "Select a field type" }).getByRole("button", { name: new RegExp(`^${typeName}`) }).click();
      const form = page.getByRole("dialog", { name: "Create New Field" });
      await form.waitFor({ timeout: 10_000 });
      for (const [label, value] of Object.entries(values)) await form.getByLabel(label, { exact: true }).fill(value);
      if (Object.keys(view).length > 0) {
        await form.getByRole("tab", { name: "View" }).click();
        for (const [label, value] of Object.entries(view)) await form.getByLabel(label, { exact: true }).selectOption({ label: value });
      }
      if (Object.keys(advanced).length + Object.keys(selects).length > 0) {
        await form.getByRole("tab", { name: "Advanced" }).click();
        for (const [label, value] of Object.entries(advanced)) await form.getByLabel(label, { exact: true }).fill(value);
        for (const [label, value] of Object.entries(selects)) await form.getByLabel(label, { exact: true }).selectOption(value);
      }
      return form;
    };
    const addAndSubmit = async (...args) => {
      const form = await addField(...args);
      await form.getByRole("button", { name: "Submit" }).click();
      await form.waitFor({ state: "detached", timeout: 10_000 });
    };
    const title = await addField("String", { Name: "title", Label: "Title", Description: "The title", "Maximum Length": "80" });
    const settingsViolations = await axe(page);
    check(settingsViolations.length === 0, `axe on a field's settings form${settingsViolations.length ? `: ${settingsViolations.join(" | ")}` : ""}`);
    await title.getByRole("button", { name: "Submit" }).click();
    await fields.filter({ hasText: "title" }).waitFor({ timeout: 10_000 });
    const color = await addField("Single Select", { Name: "color", Label: "Color", Description: "A color" }, { Options: "red\ngreen" });
    await color.getByRole("button", { name: "Submit" }).click();
    await fields.filter({ hasText: "color" }).waitFor({ timeout: 10_000 });
    check((await fields.filter({ hasText: "color" }).innerText()).includes("Single Select"), "fields of two types, each through its own settings form");

    await fields.filter({ hasText: "title" }).getByRole("button", { name: "Edit title" }).click();
    const update = page.getByRole("dialog", { name: "Update Field" });
    await update.waitFor({ timeout: 10_000 });
    check(
      (await update.getByLabel("Name", { exact: true }).isDisabled()) && (await update.getByLabel("Maximum Length").inputValue()) === "80",
      "a field's settings come back from FluentCMS's keys (MaximumLength), its name fixed",
    );
    await update.locator("label", { hasText: "Required" }).click();
    await update.getByRole("button", { name: "Submit" }).click();
    await update.waitFor({ state: "detached", timeout: 10_000 });
    await page.waitForFunction(() => [...document.querySelectorAll("table[aria-label=Fields] tbody tr")].some((row) => row.textContent?.includes("title") && row.textContent.includes("YES")), null, { timeout: 10_000 });
    check(true, "an updated field is saved (required)");

    // Contents: a field of each simple type, then a content through the forms built from them (phase 4b).
    await addAndSubmit("Number", { Name: "count", Label: "Count", Description: "How many" });
    await addAndSubmit("Boolean", { Name: "done", Label: "Done", Description: "Finished" });
    await addAndSubmit("Date Time", { Name: "due", Label: "Due", Description: "When" }, {}, { Format: "dddd, dd MMMM yyyy" });
    await addAndSubmit("Multi Select", { Name: "tags", Label: "Tags", Description: "Tags" }, { Options: "news\nevents" });
    // Phase 4c: the views that need track B — rich text (Quill), an autocomplete, a file picker.
    await addAndSubmit("String", { Name: "body", Label: "Body", Description: "The text" }, {}, {}, { "Form view type": "Rich Text Editor" });
    await addAndSubmit("Multi Select", { Name: "topics", Label: "Topics", Description: "Topics" }, { Options: "design\ndevelopment\nevents" }, {}, { "Form view type": "Autocomplete" });
    await addAndSubmit("Single File", { Name: "image", Label: "Image", Description: "An image" });
    await fields.filter({ hasText: "image" }).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "Back" }).click();
    await contentTypes.filter({ hasText: typeTitle }).getByRole("link", { name: `Contents of ${typeTitle}` }).click();
    await page.getByRole("table", { name: "Contents" }).waitFor({ timeout: 15_000 });
    const contents = table("Contents");
    await page.getByRole("link", { name: "New Content" }).click();
    await page.getByLabel("Title").waitFor({ timeout: 10_000 });
    await page.getByLabel("Title").fill("First post");
    await page.getByLabel("Color").selectOption("green");
    await page.getByLabel("Count").fill("3");
    await page.locator("label", { hasText: "Done" }).click();
    await page.getByLabel("Due").fill("2024-06-12");
    await page.getByRole("group", { name: "Tags" }).getByLabel("news").check();
    // Rich text: Quill, made by an @attach, hands the edit back through valueChanged.
    await page.locator(".ql-editor").click();
    await page.keyboard.type("Hello rich text");
    // The autocomplete: type, pick with the keyboard, a chip.
    const topics = page.getByRole("combobox", { name: "Topics" });
    await topics.fill("even");
    await page.getByRole("listbox", { name: "Topics" }).waitFor({ timeout: 10_000 });
    const comboboxViolations = await axe(page);
    check(comboboxViolations.length === 0, `axe with the autocomplete's listbox open${comboboxViolations.length ? `: ${comboboxViolations.join(" | ")}` : ""}`);
    await topics.press("ArrowDown");
    await topics.press("Enter");
    await page.getByRole("button", { name: "Remove events" }).waitFor({ timeout: 10_000 });
    // The file picker: the file selector dialog, a folder opened, a file picked.
    await page.getByRole("group", { name: "Image" }).getByRole("button", { name: "Choose File" }).click();
    const selector = page.getByRole("dialog", { name: "Choose File" });
    await selector.getByRole("button", { name: "Open images" }).click();
    await selector.getByRole("button", { name: "Select logo.svg" }).click();
    await selector.waitFor({ state: "detached", timeout: 10_000 });
    await page.getByRole("group", { name: "Image" }).getByRole("link", { name: "logo.svg" }).waitFor({ timeout: 10_000 });
    const contentViolations = await axe(page);
    check(contentViolations.length === 0, `axe on a content form built from its fields${contentViolations.length ? `: ${contentViolations.join(" | ")}` : ""}`);
    await page.getByRole("button", { name: "Submit" }).click();
    const row = contents.filter({ hasText: "First post" });
    await row.waitFor({ timeout: 10_000 });
    await row.getByRole("link", { name: "logo.svg" }).waitFor({ timeout: 10_000 });
    const rowText = await row.innerText();
    check(
      ["green", "3", "True", "Wednesday, 12 June 2024", "news", "events", "Hello rich text"].every((text) => rowText.includes(text)),
      `a content in the list, each field through its list view and the date in its .NET format (${rowText.replace(/\s+/g, " ")})`,
    );
    await row.getByRole("link", { name: "Edit First post" }).click();
    await page.waitForFunction(() => (document.querySelector("input[type=date]")?.value ?? "") !== "", null, { timeout: 10_000 });
    check(
      (await page.getByLabel("Title").inputValue()) === "First post" && (await page.getByLabel("Due").inputValue()) === "2024-06-12" && (await page.getByRole("group", { name: "Tags" }).getByLabel("news").isChecked()),
      "the update form loads a content's values into each field's view",
    );
    await page.locator(".ql-editor").waitFor({ timeout: 10_000 });
    check(
      (await page.locator(".ql-editor").innerText()).includes("Hello rich text") &&
        (await page.getByRole("button", { name: "Remove events" }).count()) === 1 &&
        (await page.getByRole("group", { name: "Image" }).getByRole("link", { name: "logo.svg" }).count()) === 1,
      "the value goes into Quill from outside; the autocomplete and the file picker show theirs",
    );
    await page.getByLabel("Title").fill("First post, edited");
    await page.getByRole("button", { name: "Submit" }).click();
    await contents.filter({ hasText: "First post, edited" }).waitFor({ timeout: 10_000 });
    await contents.filter({ hasText: "First post, edited" }).getByRole("button", { name: "Delete First post, edited" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Yes, I'm sure" }).click();
    await contents.filter({ hasText: "First post" }).waitFor({ state: "detached", timeout: 10_000 });
    check(true, "a content is updated and deleted");
    await page.getByRole("button", { name: "Back" }).click();
    await contentTypes.filter({ hasText: typeTitle }).getByRole("link", { name: `Fields of ${typeTitle}` }).click();
    await fields.filter({ hasText: "color" }).waitFor({ timeout: 10_000 });

    await fields.filter({ hasText: "color" }).getByRole("button", { name: "Delete color" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Yes, I'm sure" }).click();
    await fields.filter({ hasText: "color" }).waitFor({ state: "detached", timeout: 10_000 });
    await page.getByRole("button", { name: "Back" }).click();
    await contentTypes.filter({ hasText: typeTitle }).waitFor({ timeout: 10_000 });
    // Slug, Title, Description, Fields: the fourth cell counts them.
    check((await contentTypes.filter({ hasText: typeTitle }).locator("td").nth(3).innerText()).trim() === "8", "a field is deleted; the list counts the rest");
    await contentTypes.filter({ hasText: typeTitle }).getByRole("button", { name: `Delete ${typeTitle}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Yes, I'm sure" }).click();
    await contentTypes.filter({ hasText: typeTitle }).waitFor({ state: "detached", timeout: 10_000 });

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
  } catch (error) {
    // The page as the failing step left it.
    const shot = path.join(ROOT, ".tmp", "verify-failure.png");
    await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
    console.error(`verify-fluentcms: the page at the failure is ${shot} (${page.url()}); console errors: ${JSON.stringify(errors)}`);
    throw error;
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
