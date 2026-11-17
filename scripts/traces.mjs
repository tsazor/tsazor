#!/usr/bin/env node
/**
 * What may not be public, and the check for it (docs/design-release.md, "The first public commit" and "Kept
 * public"). Two users:
 *
 *   - scripts/public-tree.mjs imports it to check the exported tree of the first public commit;
 *   - run directly, it checks the repository in place: every tracked file of the working tree. That is the check
 *     `.github/workflows/traces.yml` runs on every push and pull request of the public repository, so nothing of
 *     the private work lands there later either.
 *
 * Run directly, a file that should stay private (EXCLUDED) is a finding of its own: in the public repository it
 * must not exist. In this private working repository the check is therefore red by design.
 *
 * Usage: node scripts/traces.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

/** What stays private: the working notes. Everything else is public. */
export const EXCLUDED = [
  /^docs\/handoff-[^/]*\.md$/, // the session handoffs
  /^docs\/review-2026-09-30\.md$/, // the September review and the roadmap that worked it off
  /^docs\/roadmap[^/]*\.md$/, // the roadmaps (the public one is docs/after-1.0.md)
  /^docs\/api-review-1\.0\.md$/, // the API review's working document (its results are the code and the CHANGELOG)
  /^spikes\//, // experiments (SSR comes after 1.0)
  /(^|\/)feedback(-\d+)?\.md$/, // the private feedback notes
];

/** Traces of the private work that must not be in a public file. */
export const TRACES = [
  { pattern: /HolgerTheHuck\/Tsazor/i, what: "the old private repository" },
  { pattern: /\b[A-Za-z]:[\\/]{1,2}Own[\\/]|\/[a-z]\/Own\//, what: "a path on the maintainer's machine" },
  { pattern: /\bhandoff-(20\d\d|sleipnir|bench-perf|lsp-v2)/, what: "an internal handoff" },
  { pattern: /\broadmap(-1\.0|-sleipnir|-ssr|-tutorial)?\.md\b|\breview-2026-09-30\b|\bapi-review-1\.0\.md\b/, what: "an internal roadmap or review" },
  // In prose only: code names its owners (`EventCallback.bind(owner, …)`).
  { pattern: /\(owner(,? 20\d\d|\)|:)|\bowner,? 20\d\d-\d\d|\bthe owner's (word|decision|choice|company)|\b(by|for) the owner\b/i, what: "a note about the owner", only: /\.md$/ },
  { pattern: /\bfeedback(-2)?\.md\b/, what: "the private feedback notes" },
];

/** Links that are no file of the tree: the tutorial's lessons link its routes; the build writes MIGRATION.md. */
export const LINKS_UNCHECKED = [/^apps\/tutorial\/content\//];
export const BUILT = ["packages/runtime/MIGRATION.md"];

/** Files no trace check reads: generated, binary, or naming the traces themselves. */
export const UNCHECKED = [
  /^pnpm-lock\.yaml$/,
  /^scripts\/traces\.mjs$/,
  /^scripts\/public-tree\.mjs$/,
  /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz|wasm|mp3|wav)$/i,
];

/** True when the file stays out of the public repository. */
export const isPrivate = (file) => EXCLUDED.some((pattern) => pattern.test(file));

/**
 * Checks the given files (paths relative to the tree, with `/`) for traces and their Markdown links.
 * `read(file)` returns the file's bytes. Returns the findings as lines: `traces` and `broken` links.
 */
export function checkTree(files, read) {
  const traces = [];
  const texts = new Map();
  for (const file of files) {
    if (UNCHECKED.some((pattern) => pattern.test(file))) continue;
    const buffer = read(file);
    if (buffer.includes(0)) continue; // binary
    const text = buffer.toString("utf8");
    texts.set(file, text);
    text.split(/\r?\n/).forEach((line, index) => {
      for (const { pattern, what, only } of TRACES) {
        if ((only === undefined || only.test(file)) && pattern.test(line)) traces.push(`${file}:${index + 1}: ${what} — ${line.trim().slice(0, 140)}`);
      }
    });
  }

  const inTree = new Set([...files, ...BUILT]);
  const dirs = new Set(files.flatMap((file) => ancestors(file)));
  const broken = [];
  for (const [file, text] of texts) {
    if (!file.endsWith(".md") || LINKS_UNCHECKED.some((pattern) => pattern.test(file))) continue;
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
  return { traces, broken };
}

function ancestors(file) {
  const parts = file.split("/");
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}

/** Prints a check's findings (the first 60) or its PASS line. */
export function report(list, okText) {
  if (list.length === 0) {
    console.log(`PASS  ${okText}`);
    return;
  }
  for (const line of list.slice(0, 60)) console.log(`FAIL  ${line}`);
  if (list.length > 60) console.log(`FAIL  … and ${list.length - 60} more`);
}

// Run directly: the repository in place.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const listed = spawnSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 1 << 30 });
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
  // A tracked file deleted in the working tree is not part of it.
  const tracked = listed.stdout.split("\0").filter((file) => file && existsSync(join(repoRoot, file)));
  const privateFiles = tracked.filter(isPrivate);
  const files = tracked.filter((file) => !isPrivate(file));

  console.log(`==== private files ====`);
  report(privateFiles.map((file) => `${file}: stays private (scripts/traces.mjs, EXCLUDED)`), "none in the tree");
  console.log(`\n==== traces of the private work ====`);
  const { traces, broken } = checkTree(files, (file) => readFileSync(join(repoRoot, file)));
  report(traces, "no traces");
  console.log(`\n==== relative links in Markdown ====`);
  report(broken, "every link's file is in the tree");

  const green = privateFiles.length === 0 && traces.length === 0 && broken.length === 0;
  console.log(`\ntraces: ${green ? "GREEN" : "RED"} — ${files.length} files`);
  process.exit(green ? 0 : 1);
}
