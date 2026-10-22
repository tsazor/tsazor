#!/usr/bin/env node
/**
 * The tree of the first public commit (docs/design-release.md, "The first public commit"): HEAD without the
 * internal notes, exported and checked. Nothing here touches the working tree.
 *
 *   1. exports HEAD (`git archive`) into the directory and removes what stays private (EXCLUDED),
 *   2. checks every text file for traces of the private work (TRACES) — a path on this machine, the old
 *      repository, a handoff, an internal roadmap, a note about the owner,
 *   3. checks every relative Markdown link: its file is in the tree,
 *   4. with --verify: `pnpm install --frozen-lockfile`, `pnpm -r build` and `pnpm -r test` in the tree.
 *
 * Exit 0 only when every check is green. The directory then holds what `tsazor/tsazor`'s first commit carries.
 *
 * Usage: node scripts/public-tree.mjs [--dir <path>] [--verify] [--keep]
 *   --dir     the directory to export into (replaced); default a new one in the OS temp dir
 *   --verify  install, build and test the exported tree as well
 *   --keep    keep a temp directory (always kept with --dir)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** What stays private: the working notes. Everything else of HEAD is public. */
const EXCLUDED = [
  /^docs\/handoff-[^/]*\.md$/, // the session handoffs
  /^docs\/review-2026-09-30\.md$/, // the September review and the roadmap that worked it off
  /^docs\/roadmap[^/]*\.md$/, // the roadmaps (the public one is docs/after-1.0.md)
  /^docs\/api-review-1\.0\.md$/, // the API review's working document (its results are the code and the CHANGELOG)
  /^spikes\//, // experiments (SSR comes after 1.0)
];

/** Traces of the private work that must not be in a public file. */
const TRACES = [
  { pattern: /HolgerTheHuck\/Tsazor/i, what: "the old private repository" },
  { pattern: /\b[A-Za-z]:[\\/]{1,2}Own[\\/]|\/[a-z]\/Own\//, what: "a path on the maintainer's machine" },
  { pattern: /\bhandoff-(20\d\d|sleipnir|bench-perf|lsp-v2)/, what: "an internal handoff" },
  { pattern: /\broadmap(-1\.0|-sleipnir|-ssr|-tutorial)?\.md\b|\breview-2026-09-30\b|\bapi-review-1\.0\.md\b/, what: "an internal roadmap or review" },
  { pattern: /\(owner\b|\bowner,? 20\d\d-\d\d|\bthe owner's (word|decision|choice|company)/i, what: "a note about the owner" },
  { pattern: /\bfeedback(-2)?\.md\b/, what: "the private feedback notes" },
];

/** Files no trace check reads: generated, binary, or naming the traces themselves. */
const UNCHECKED = [/^pnpm-lock\.yaml$/, /^scripts\/public-tree\.mjs$/, /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz|wasm|mp3|wav)$/i];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const dirArg = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : undefined;

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8", maxBuffer: 1 << 30, shell: process.platform === "win32", ...options });
  if (result.error) throw result.error;
  return result;
}

function step(title) {
  console.log(`\n==== ${title} ====`);
}

// 1. Export.
const out = dirArg ?? mkdtempSync(join(tmpdir(), "tsazor-public-"));
if (dirArg) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
}
const head = run("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot }).stdout.trim();
step(`export ${head} into ${out}`);
const archive = spawnSync("git", ["archive", "--format=tar", "HEAD"], { cwd: repoRoot, maxBuffer: 1 << 30 });
if (archive.status !== 0) throw new Error(`git archive failed: ${archive.stderr}`);
const untar = spawnSync("tar", ["-x", "-C", out], { input: archive.stdout, maxBuffer: 1 << 30 });
if (untar.status !== 0) throw new Error(`tar failed: ${untar.stderr}`);

const all = run("git", ["ls-tree", "-r", "--name-only", "HEAD"], { cwd: repoRoot }).stdout.split("\n").filter(Boolean);
const excluded = all.filter((file) => EXCLUDED.some((pattern) => pattern.test(file)));
for (const file of excluded) rmSync(join(out, file), { force: true });
for (const dir of new Set(excluded.map((file) => posix.dirname(file)))) removeIfEmpty(join(out, dir));
const files = all.filter((file) => !excluded.includes(file));
console.log(`${files.length} files, ${excluded.length} left out (${summarize(excluded)})`);

function removeIfEmpty(dir) {
  if (existsSync(dir) && statSync(dir).isDirectory() && readdirSync(dir).length === 0) {
    rmSync(dir, { recursive: true });
    removeIfEmpty(dirname(dir));
  }
}

function summarize(paths) {
  const groups = new Map();
  for (const file of paths) {
    const key = file.startsWith("spikes/") ? file.split("/").slice(0, 2).join("/") + "/" : file;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups.keys()].length > 6 ? `${[...groups.keys()].slice(0, 6).join(", ")}, …` : [...groups.keys()].join(", ");
}

// 2. Traces.
step("traces of the private work");
const findings = [];
const texts = new Map();
for (const file of files) {
  if (UNCHECKED.some((pattern) => pattern.test(file))) continue;
  const buffer = readFileSync(join(out, file));
  if (buffer.includes(0)) continue; // binary
  const text = buffer.toString("utf8");
  texts.set(file, text);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { pattern, what } of TRACES) {
      if (pattern.test(line)) findings.push(`${file}:${index + 1}: ${what} — ${line.trim().slice(0, 140)}`);
    }
  });
}
report(findings, "no traces");

// 3. Markdown links.
step("relative links in Markdown");
const inTree = new Set(files);
const dirs = new Set(files.flatMap((file) => ancestors(file)));
const broken = [];
for (const [file, text] of texts) {
  if (!file.endsWith(".md")) continue;
  const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  for (const match of prose.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    const target = match[1];
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) continue; // a URL, an anchor, a site route
    const path = decodeURIComponent(target.split("#")[0].split("?")[0]);
    if (path === "") continue;
    const resolved = posix.normalize(posix.join(posix.dirname(file), path)).replace(/\/$/, "");
    if (!inTree.has(resolved) && !dirs.has(resolved)) broken.push(`${file}: ${target}`);
  }
}
report(broken, "every link's file is in the tree");

function ancestors(file) {
  const parts = file.split("/");
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}

function report(list, okText) {
  if (list.length === 0) {
    console.log(`PASS  ${okText}`);
    return;
  }
  for (const line of list.slice(0, 60)) console.log(`FAIL  ${line}`);
  if (list.length > 60) console.log(`FAIL  … and ${list.length - 60} more`);
}

// 4. Install, build, test.
let verified = true;
if (flag("--verify")) {
  for (const [title, command] of [
    ["install", ["install", "--frozen-lockfile"]],
    ["build", ["-r", "build"]],
    ["test", ["-r", "test"]],
  ]) {
    step(`pnpm ${command.join(" ")}`);
    const result = spawnSync("pnpm", command, { cwd: out, stdio: "inherit", shell: process.platform === "win32" });
    if (result.status !== 0) {
      console.log(`FAIL  ${title} in the exported tree`);
      verified = false;
      break;
    }
    console.log(`PASS  ${title}`);
  }
}

const green = findings.length === 0 && broken.length === 0 && verified;
console.log(`\npublic-tree: ${green ? "GREEN" : "RED"} — ${files.length} files of ${head}${flag("--verify") ? ", installed, built and tested" : ""}`);
if (!dirArg && !flag("--keep")) rmSync(out, { recursive: true, force: true });
else console.log(`the tree: ${out}`);
process.exit(green ? 0 : 1);
