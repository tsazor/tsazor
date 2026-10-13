/**
 * The original admin's Playwright suite (clients/admin/tests: 30 specs, every API call mocked with `page.route`), run
 * unchanged against the Tsazor port — the port's acceptance test (docs/port-fullstackhero.md).
 *
 *   node scripts/acceptance.mjs                      every spec
 *   node scripts/acceptance.mjs auth/login dashboard  the specs whose path contains one of the words
 *   node scripts/acceptance.mjs --original            the same specs against the original admin (the reference)
 *   node scripts/acceptance.mjs --port=5381 users     against a dev server of its own on that port (parallel runs)
 *   node scripts/acceptance.mjs --workers=2 …         Playwright's workers (default 4)
 *
 * The port's dev server (:5372) starts when it isn't running, as the original's config starts its own; the specs
 * expect a dev build (the demo accounts are DEV-only). The browser is Edge (no Playwright browser download), in
 * en-US as on the original's CI: the specs read amounts as "$129.50". (Playwright's `locale` alone leaves Edge's Intl
 * default at the system's language — "129,50 $" on a German Windows; `--lang` sets it.)
 * The configuration is written next to the specs, in the clone; the results go to .tmp/acceptance.json.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { admin, ensureAdminPackages, ensureClone, root } from "./upstream.mjs";

const args = process.argv.slice(2);
const original = args.includes("--original");
const option = (name, fallback) => Number(args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
const filters = args.filter((arg) => !arg.startsWith("--"));

ensureClone();
ensureAdminPackages();

const port = original ? 5173 : option("port", 5372);
const workers = option("workers", 4);
// One run per port at a time: its report, its configuration and its test-results directory are its own.
const results = path.join(root, ".tmp", `acceptance-${port}.json`);
mkdirSync(path.dirname(results), { recursive: true });
const config = path.join(admin, `playwright.tsazor-${port}.config.ts`);
const server = original
  ? { command: "npm run dev", cwd: admin }
  : { command: process.platform === "win32" ? `set PORT=${port}&& pnpm dev` : `PORT=${port} pnpm dev`, cwd: root };
writeFileSync(
  config,
  `// Written by apps/fullstackhero/scripts/acceptance.mjs: the original's suite against ${original ? "the original admin" : "the Tsazor port"}.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: ${workers},
  outputDir: ${JSON.stringify(path.join(root, ".tmp", `test-results-${port}`))},
  reporter: [["list"], ["json", { outputFile: ${JSON.stringify(results)} }]],
  use: { baseURL: "http://localhost:${port}", channel: "msedge", locale: "en-US", launchOptions: { args: ["--lang=en-US"] }, trace: "off", actionTimeout: 10_000, navigationTimeout: 15_000 },
  projects: [{ name: "edge", use: { channel: "msedge" } }],
  webServer: {
    command: ${JSON.stringify(server.command)},
    cwd: ${JSON.stringify(server.cwd)},
    url: "http://localhost:${port}",
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
`,
);

const result = spawnSync("npx", ["playwright", "test", "--config", path.basename(config), ...filters], {
  cwd: admin,
  stdio: "inherit",
  shell: process.platform === "win32",
});

// A summary per spec: passed of all, and the failing tests' titles.
try {
  const report = JSON.parse(readFileSync(results, "utf8"));
  const files = new Map();
  const visit = (suite, file) => {
    const current = suite.file ?? file;
    for (const spec of suite.specs ?? []) {
      const entry = files.get(current) ?? { passed: 0, failed: [] };
      const ok = spec.tests.every((test) => test.results.some((run) => run.status === "passed"));
      if (ok) entry.passed++;
      else entry.failed.push(spec.title);
      files.set(current, entry);
    }
    for (const child of suite.suites ?? []) visit(child, current);
  };
  for (const suite of report.suites ?? []) visit(suite);
  let passed = 0;
  let total = 0;
  console.log("\nacceptance:");
  for (const [file, entry] of [...files].sort()) {
    passed += entry.passed;
    total += entry.passed + entry.failed.length;
    console.log(`  ${entry.failed.length === 0 ? "ok  " : "FAIL"} ${file}  ${entry.passed}/${entry.passed + entry.failed.length}`);
    for (const title of entry.failed) console.log(`         - ${title}`);
  }
  console.log(`  ${passed}/${total} passed`);
} catch (error) {
  console.error(`acceptance: no report (${error.message})`);
}
process.exit(result.status ?? 1);
