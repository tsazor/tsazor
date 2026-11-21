#!/usr/bin/env node
/**
 * The tree of the first public commit (docs/design-release.md, "The first public commit"): HEAD without the
 * internal notes, exported and checked. Nothing here touches the working tree.
 *
 *   1. exports HEAD (`git archive`) into the directory and removes what stays private (EXCLUDED),
 *   2. checks every text file for traces of the private work (scripts/traces.mjs, TRACES) — a path on this machine, the old
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
import { checkTree, isPrivate, report } from "./traces.mjs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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
// In the directory itself: GNU tar (Git Bash's) reads `C:` in a -C path as a remote host.
const untar = spawnSync("tar", ["-x"], { cwd: out, input: archive.stdout, maxBuffer: 1 << 30 });
if (untar.status !== 0) throw new Error(`tar failed: ${untar.stderr}`);

const all = run("git", ["ls-tree", "-r", "--name-only", "HEAD"], { cwd: repoRoot }).stdout.split("\n").filter(Boolean);
const excluded = all.filter(isPrivate);
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

// 2. Traces, 3. Markdown links (scripts/traces.mjs).
const { traces: findings, broken } = checkTree(files, (file) => readFileSync(join(out, file)));
step("traces of the private work");
report(findings, "no traces");
step("relative links in Markdown");
report(broken, "every link's file is in the tree");

// 4. Install, build, test.
let verified = true;
if (flag("--verify")) {
  // CI's order (ci.yml's check job): the packages' bins exist once they are built, so the apps link them on the
  // second install.
  for (const [title, command] of [
    ["install", ["install", "--frozen-lockfile"]],
    ["build of the packages", ["-r", "--filter", "./packages/*", "build"]],
    ["install with the packages' bins", ["install", "--frozen-lockfile"]],
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
console.log(`\npublic-tree: ${green ? "GREEN" : "RED"} — ${files.length} files of ${head}${flag("--verify") && verified ? ", installed, built and tested" : ""}`);
if (!dirArg && !flag("--keep")) rmSync(out, { recursive: true, force: true });
else console.log(`the tree: ${out}`);
process.exit(green ? 0 : 1);
