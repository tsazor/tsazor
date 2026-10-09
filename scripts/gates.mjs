/**
 * `pnpm gates` — every browser gate of CI's `e2e` and `engines` jobs, here, in
 * Edge, Firefox and WebKit one after the other. A failing gate does not stop
 * the others (CI's `fail-fast: false`); the summary lists each one.
 *
 *   pnpm gates                     # build, then all gates in edge, firefox, webkit
 *   pnpm gates firefox webkit      # only these browsers
 *   pnpm gates --only skins,demo   # only the gates of these apps
 *   pnpm gates --skip-build        # the packages and apps are built already
 *
 * Windows, as CI's browser jobs (Edge channel, taskkill cleanup). The gates
 * reuse a dev server that already runs on their port — stop stale ones first.
 * The list below must match ci.yml; a check at the start says when it does not.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** CI's browser gates; `engines: false` runs only in Edge (CI's e2e job, not the engines job). */
const GATES = [
  { name: "Tutorial", run: [["--filter", "tutorial", "verify"]] },
  {
    name: "Tutorial as GitHub Pages serves it",
    engines: false,
    env: { TUTORIAL_BASE: "/Tsazor/" },
    run: [["--filter", "tutorial", "build:pages"], ["--filter", "tutorial", "verify:pages"]],
  },
  { name: "Blazing Pizza", run: [["--filter", "blazing-pizza", "verify"]] },
  { name: "Gallery", run: [["--filter", "gallery", "verify"]] },
  { name: "Demo under a strict CSP", run: [["--filter", "demo", "verify:csp"]] },
  { name: "Web Workers", run: [["--filter", "demo", "verify:worker"]] },
  { name: "Accessibility — @tsazor/fluent", run: [["--filter", "gallery", "verify:a11y"]] },
  { name: "Accessibility — @tsazor/bootstrap", run: [["--filter", "demo", "verify:a11y"]] },
  { name: "One set of pages, two skins", run: [["--filter", "skins", "verify"]] },
  { name: "Blazor parity — Blazor's own E2E tests", run: [["--filter", "blazor-parity", "verify"]] },
  { name: "The starter (npm create tsazor)", run: [["--filter", "starter", "verify"]] },
  { name: "Incremental migration", engines: false, run: [["--filter", "migration-sample", "verify"]] },
  { name: "The FluentCMS port", engines: false, run: [["--filter", "fluentcms", "verify"]] },
  {
    name: "Sleipnir ticker (synthetic mode)",
    engines: false,
    before: ["dotnet", "build", "apps/sleipnir-ticker/api"],
    run: [["--filter", "sleipnir-ticker", "verify"]],
  },
];

const BROWSERS = ["edge", "firefox", "webkit"];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const only = option("--only")?.split(",");
const browsers = args.filter((arg, i) => BROWSERS.includes(arg) && args[i - 1] !== "--only");
const selectedBrowsers = browsers.length > 0 ? browsers : BROWSERS;
const appOf = (gate) => gate.run[0][1];
const selectedGates = GATES.filter((gate) => !only || only.includes(appOf(gate)));

if (process.platform !== "win32") {
  console.error("gates: the browser gates are written for Windows (Edge channel, taskkill) — as CI's browser jobs.");
  process.exit(2);
}
checkAgainstCi();

/** Runs a command in the repository root; true when it exits 0. */
function run(command, commandArgs, env = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  return result.status === 0;
}

/** The gates' `pnpm --filter <app> <script>` commands per CI job, read from ci.yml. */
function ciCommands(job) {
  const yml = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const body = yml.split(/^  (?=[\w-]+:\s*$)/m).find((part) => part.startsWith(`${job}:`)) ?? "";
  return [...body.matchAll(/pnpm --filter (\S+) (verify\S*|build:pages)/g)].map((m) => `${m[1]} ${m[2]}`).sort();
}

/** Fails when the list above and ci.yml's e2e/engines jobs name different gates. */
function checkAgainstCi() {
  const mine = (gates) => gates.flatMap((gate) => gate.run.map((command) => `${command[1]} ${command[2]}`)).sort();
  const pairs = [
    ["e2e", mine(GATES)],
    ["engines", mine(GATES.filter((gate) => gate.engines !== false))],
  ];
  for (const [job, expected] of pairs) {
    const actual = ciCommands(job);
    if (actual.join("\n") !== expected.join("\n")) {
      const missing = actual.filter((c) => !expected.includes(c));
      const extra = expected.filter((c) => !actual.includes(c));
      console.error(`gates: scripts/gates.mjs no longer matches ci.yml's ${job} job.`);
      if (missing.length) console.error(`  only in ci.yml: ${missing.join(", ")}`);
      if (extra.length) console.error(`  only in gates.mjs: ${extra.join(", ")}`);
      process.exit(2);
    }
  }
}

const started = Date.now();
const seconds = (since) => Math.round((Date.now() - since) / 1000);

if (!flag("--skip-build")) {
  // Every package (the starter gate packs them all) and the gates' apps, in dependency order.
  // Some gates build their own dist only when it is missing, so a stale one would pass unnoticed.
  const apps = [...new Set(selectedGates.map(appOf))];
  console.log(`\n::: build the packages and ${apps.join(", ")}`);
  if (!run("pnpm", ["-r", "--filter", "./packages/*", ...apps.flatMap((app) => ["--filter", `${app}...`]), "build"])) {
    console.error("\ngates: the build failed — no gate ran.");
    process.exit(1);
  }
}

const otherEngines = selectedBrowsers.filter((browser) => browser !== "edge");
if (otherEngines.length > 0 && !run("pnpm", ["--filter", "demo", "exec", "playwright-core", "install", ...otherEngines])) {
  console.error(`\ngates: installing ${otherEngines.join(", ")} failed.`);
  process.exit(1);
}

const results = [];
for (const browser of selectedBrowsers) {
  for (const gate of selectedGates) {
    if (browser !== "edge" && gate.engines === false) continue;
    console.log(`\n::: ${browser} — ${gate.name}`);
    const since = Date.now();
    const env = { ...gate.env, TSAZOR_BROWSER: browser };
    const ok =
      (!gate.before || run(gate.before[0], gate.before.slice(1), env)) &&
      gate.run.every((command) => run("pnpm", command, env));
    results.push({ browser, name: gate.name, ok, seconds: seconds(since) });
  }
}

const failed = results.filter((result) => !result.ok);
console.log("\n::: summary");
for (const result of results) {
  console.log(`  ${result.ok ? "ok  " : "FAIL"}  ${result.browser.padEnd(7)}  ${result.name} (${result.seconds} s)`);
}
console.log(
  failed.length === 0
    ? `\ngates: all ${results.length} green in ${seconds(started)} s`
    : `\ngates: ${failed.length} of ${results.length} failed (${seconds(started)} s)`,
);
process.exit(failed.length === 0 ? 0 : 1);
