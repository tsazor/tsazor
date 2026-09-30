#!/usr/bin/env node
/**
 * Razor corpus probe — roadmap Phase 0.5.
 *
 * Compiles every .razor file of a real Blazor code base with the Tsazor
 * compiler and reports how much of the markup survives: compile errors by
 * diagnostic code, plus heuristically detected *silent* miscompilations
 * (output that compiles but is wrong). The metric tracks framework progress
 * across roadmap phases; the corpus itself is never committed.
 *
 *   pnpm --filter @tsazor/compiler build          # the probe uses compiler/dist
 *   node scripts/probe-razor-corpus.mjs           # FluentCMS (default corpus)
 *   node scripts/probe-razor-corpus.mjs --json out.json --top 15
 *   node scripts/probe-razor-corpus.mjs --repo https://github.com/org/repo --name repo
 *
 * C# inside @code/@functions blocks is stripped first (it is not TypeScript);
 * the probe measures markup-level compatibility only.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------- arguments ----------
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const repo = option("repo", "https://github.com/fluentcms/FluentCMS");
const name = option("name", path.basename(repo).replace(/\.git$/, ""));
const ref = option("ref", undefined);
const jsonOut = option("json", undefined);
const top = Number(option("top", "10"));
const corpusDir = path.resolve(option("dir", path.join(repoRoot, ".probe", name)));

// ---------- compiler ----------
const compilerEntry = path.join(repoRoot, "packages/compiler/dist/index.js");
if (!existsSync(compilerEntry)) {
  console.error("compiler not built — run: pnpm --filter @tsazor/compiler build");
  process.exit(2);
}
const { compile } = await import(pathToFileURL(compilerEntry).href);

// ---------- corpus ----------
if (!existsSync(corpusDir)) {
  mkdirSync(path.dirname(corpusDir), { recursive: true });
  console.log(`cloning ${repo} → ${path.relative(repoRoot, corpusDir)}`);
  const cloneArgs = ["-c", "core.longpaths=true", "clone", "--depth", "1", "-q"];
  if (ref) cloneArgs.push("--branch", ref);
  execFileSync("git", [...cloneArgs, repo, corpusDir], { stdio: "inherit" });
}
const corpusCommit = execFileSync("git", ["-C", corpusDir, "rev-parse", "--short", "HEAD"]).toString().trim();

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === ".git" || entry === "bin" || entry === "obj" || entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".razor")) files.push(full);
  }
})(corpusDir);

// Component names the resolver accepts: every .razor in the corpus plus the
// Blazor built-ins Tsazor ships. Anything else surfaces as unresolved (TZS005)
// — which is how named slots (<ChildContent>, <Found>) show up today.
const BUILTINS = [
  "CascadingValue", "Router", "RouteView", "LayoutView", "NavLink", "PageTitle", "Virtualize",
  "EditForm", "InputText", "InputTextArea", "InputNumber", "InputCheckbox", "InputDate", "InputSelect",
  "ValidationMessage", "ValidationSummary", "AuthorizeView", "CascadingAuthenticationState", "AuthorizeRouteView",
];
const known = new Set([...files.map((f) => path.basename(f, ".razor")), ...BUILTINS]);

// ---------- helpers ----------
const BACKSLASH = String.fromCharCode(92);

/** Blanks @code/@functions blocks (C#-aware brace scan), keeping line numbers. */
function stripCodeBlocks(src) {
  const re = /@(code|functions)\s*\{/g;
  let out = "";
  let last = 0;
  let match;
  while ((match = re.exec(src))) {
    let i = match.index + match[0].length;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === "/" && src[i + 1] === "/") {
        while (i < src.length && src[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && src[i + 1] === "*") {
        const end = src.indexOf("*/", i + 2);
        i = end < 0 ? src.length : end + 2;
        continue;
      }
      if (c === '"') {
        const verbatim = src[i - 1] === "@";
        i++;
        while (i < src.length) {
          if (!verbatim && src[i] === BACKSLASH) { i += 2; continue; }
          if (src[i] === '"') {
            if (verbatim && src[i + 1] === '"') { i += 2; continue; }
            break;
          }
          i++;
        }
        i++;
        continue;
      }
      if (c === "'") {
        i++;
        while (i < src.length && src[i] !== "'") { if (src[i] === BACKSLASH) i++; i++; }
        i++;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      i++;
    }
    out += src.slice(last, match.index) + src.slice(match.index, i).replace(/[^\n]/g, "");
    last = i;
    re.lastIndex = i;
  }
  return out + src.slice(last);
}

/**
 * Heuristic detectors for miscompilations that produce no error. Each returns
 * the number of hits in one file. They look at source + generated code, so
 * they stay meaningful while the compiler is rewritten.
 */
const SILENT = {
  "blazor-only directive rendered as content": (src, code) =>
    (code.match(/addContent\(\d+, this\.(namespace|rendermode|implements|preservewhitespace)\b/g) ?? []).length,
  "@context compiled to this.context": (src, code) => (code.match(/this\.context\b/g) ?? []).length,
  "attribute value \"@<digit>…\" passed as string": (src, code) => (code.match(/"@\d[^"]*"/g) ?? []).length,
  "Razor comment @* *@ rendered": (src, code) => (/@\*/.test(src) && /addContent\(\d+, "[^"]*(@|\*)/.test(code) ? 1 : 0),
  "email-like text split into an expression": (src, code) =>
    [...src.matchAll(/[A-Za-z0-9._%+-]@([A-Za-z0-9-]+)\.[A-Za-z]{2,}/g)].filter((m) => code.includes(`this.${m[1]}`)).length,
  "event modifier value bound as handler": (src, code) =>
    (code.match(/EventCallback\.bind\(this, (this\.)?(true|false)\b/g) ?? []).length,
};

// ---------- run ----------
const rows = [];
for (const file of files) {
  const rel = path.relative(corpusDir, file).split(BACKSLASH).join("/");
  const src = stripCodeBlocks(readFileSync(file, "utf8").replace(/^﻿/, ""));
  let diagnostics = [];
  let code = "";
  let crash = null;
  try {
    const result = compile(src, {
      className: "X",
      fileName: rel,
      generateSourceMap: false,
      resolveComponent: (tag) => (known.has(tag.split(".").pop()) ? { specifier: `./${tag}.tsazor` } : null),
      resolveType: () => null,
    });
    code = result.code;
    diagnostics = result.diagnostics.all.map((d) => ({
      code: d.code,
      severity: d.severity,
      line: d.pos.line,
      message: d.message,
      text: src.split("\n")[d.pos.line - 1]?.trim().slice(0, 100),
    }));
  } catch (error) {
    crash = String(error?.stack ?? error).split("\n")[0];
  }
  const silent = {};
  if (!crash) {
    for (const [label, detect] of Object.entries(SILENT)) {
      const hits = detect(src, code);
      if (hits > 0) silent[label] = hits;
    }
  }
  const errors = diagnostics.filter((d) => d.severity === "error");
  const unresolved = diagnostics.filter((d) => d.code === "TZS005").map((d) => d.message.match(/<([^>]+)>/)?.[1] ?? "?");
  rows.push({ file: rel, crash, diagnostics, errors: errors.length, unresolved, silent });
}

// ---------- report ----------
const count = (pred) => rows.filter(pred).length;
const tally = (items) => {
  const map = new Map();
  for (const item of items) map.set(item, (map.get(item) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};
const hasSilent = (r) => Object.keys(r.silent).length > 0;
const summary = {
  corpus: `${name}@${corpusCommit}`,
  files: rows.length,
  crashes: count((r) => r.crash),
  withErrors: count((r) => r.errors > 0),
  noErrors: count((r) => !r.crash && r.errors === 0),
  withSilentIssues: count((r) => !r.crash && r.errors === 0 && hasSilent(r)),
  withUnresolvedTags: count((r) => r.unresolved.length > 0),
  clean: count((r) => !r.crash && r.errors === 0 && !hasSilent(r) && r.unresolved.length === 0),
};

const pad = (s, n) => String(s).padStart(n);
console.log(`\nRazor corpus probe — ${summary.corpus} (${summary.files} files)\n`);
console.log(`  clean (no errors, no silent issues, all tags resolved) ${pad(summary.clean, 5)}`);
console.log(`  compile without errors                                 ${pad(summary.noErrors, 5)}`);
console.log(`    … but with detected silent issues                    ${pad(summary.withSilentIssues, 5)}`);
console.log(`  files with compile errors                              ${pad(summary.withErrors, 5)}`);
console.log(`  files with unresolved tags (TZS005, e.g. named slots)  ${pad(summary.withUnresolvedTags, 5)}`);
console.log(`  compiler crashes                                       ${pad(summary.crashes, 5)}`);

const errorCodes = tally(rows.flatMap((r) => r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code)));
console.log("\nErrors by code:");
for (const [code, n] of errorCodes) {
  const sample = rows.flatMap((r) => r.diagnostics.filter((d) => d.code === code && d.severity === "error").map((d) => ({ ...d, file: r.file })))[0];
  console.log(`  ${code} ×${pad(n, 4)}  e.g. ${sample.file}:${sample.line}  ${sample.text ?? ""}`);
}

const silentTotals = tally(rows.flatMap((r) => Object.keys(r.silent)));
console.log("\nSilent issues (heuristic, files affected):");
for (const [label, n] of silentTotals) console.log(`  ${pad(n, 4)}  ${label}`);

const unresolvedTags = tally(rows.flatMap((r) => r.unresolved));
console.log(`\nTop ${top} unresolved tags:`);
for (const [tag, n] of unresolvedTags.slice(0, top)) console.log(`  ${pad(n, 4)}  <${tag}>`);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ summary, rows }, null, 1));
  console.log(`\nfull results → ${jsonOut}`);
}
