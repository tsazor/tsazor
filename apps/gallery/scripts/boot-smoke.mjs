/**
 * Phase-1 smoke for apps/gallery: boots the dev server, checks the shell
 * renders (provider mounted, app-shell present) and the theme toggle switches
 * the html data attribute. Self-spawning with hard cleanup.
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";

const PORT = 5321;

let passed = 0;
let failed = 0;

function check(label, value) {
  if (value) {
    passed++;
    console.log(`PASS ${label}`);
  } else {
    failed++;
    console.log(`FAIL ${label}`);
  }
}

async function reachable() {
  return new Promise((resolve) => {
    fetch(`http://localhost:${PORT}/`).then((r) => resolve(r.ok)).catch(() => resolve(false));
  });
}

const viteDir = process.env.GALLERY_DIR;
const vite = spawn("npm.cmd", ["run", "dev"], { cwd: viteDir, stdio: "ignore", shell: true });

let served = false;
for (let i = 0; i < 30 && !served; i++) {
  await new Promise((r) => setTimeout(r, 500));
  served = await reachable();
}

try {
  check("dev server reachable", served);
  if (served) {
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });

    check("shell rendered", await page.locator(".app-shell").count() > 0);
    check("provider rendered", await page.locator(".fui-provider").count() > 0);
    check("home page rendered", (await page.textContent("h1")) === "Overview");
    const initialTheme = await page.getAttribute("html", "data-fluent-theme");
    check("html theme attribute set", initialTheme === "dark" || initialTheme === "light");

    if (initialTheme) {
      await page.click(".theme-toggle");
      const toggled = await page.getAttribute("html", "data-fluent-theme");
      check("theme toggle flips attribute", toggled !== initialTheme);
      check("layout shows flipped theme", (await page.textContent(".theme-toggle")).includes(
        initialTheme === "dark" ? "Dark" : "Light"
      ));
    }
    check("zero page errors", errors.length === 0);
    if (errors.length > 0) console.log(errors.join("\n"));

    await browser.close();
  }
} finally {
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(vite.pid), "/T", "/F"]);
  } else {
    vite.kill("SIGTERM");
  }
}

console.log(`${passed} PASSED / ${failed} FAILED`);
process.exit(failed > 0 ? 1 : 0);