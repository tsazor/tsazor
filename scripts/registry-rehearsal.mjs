#!/usr/bin/env node
/**
 * The release rehearsal (docs/design-release.md): what a user gets from a registry, before anything goes to npm.
 *
 *   a fresh Verdaccio in a temp directory → every package packed, checked and published to it (release.mjs), the
 *   SBOM written → the dist-tags → `npm create tsazor@<version>` with @tsazor/fluent and --dotnet, from that
 *   registry → `npm install` (the starter's) → the installed versions → tsazor check, vite build, the app's test
 *
 * Unlike the tarball smoke it goes through a registry: npm resolving the packages and their ranges, the dist-tag,
 * `npm create`, and the starter asking the registry for the library's setup.
 *
 *   node scripts/registry-rehearsal.mjs [--keep]      (after `pnpm -r build`)
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { distTag, publishAll, shell } from "./release.mjs";
import { startRegistry, userconfigFor } from "./registry.mjs";

const PORT = 4874;
const keep = process.argv.includes("--keep");
const scratch = mkdtempSync(path.join(tmpdir(), "tsazor-rehearsal-"));

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};

/**
 * The environment of a user's shell: without the `npm_*` variables of a package manager that started the rehearsal.
 * npm takes `npm_config_*` as its configuration, so under `pnpm rehearsal` (CI) pnpm's `npm_config_user_agent`
 * reached the starter, which then installed with pnpm (whose layout has no @tsazor/ui at the top).
 */
const shellEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^npm_/i.test(name)));

function run(command, args, cwd, env, label) {
  const result = shell(command, args, { cwd, env: { ...shellEnv, ...env } });
  if (result.status !== 0) throw new Error(`${label} failed:\n${result.stdout}${result.stderr}`);
  return result.stdout;
}

const registry = await startRegistry({ dir: path.join(scratch, "registry"), port: PORT });
try {
  const userconfig = await userconfigFor(registry.url, scratch);
  // Every npm below asks this registry only, with the rehearsal's user.
  const env = { npm_config_registry: registry.url, npm_config_userconfig: userconfig };

  const { version, tag, tarballs, sbom } = publishAll({ registry: registry.url, userconfig, out: path.join(scratch, "tarballs") });
  check(true, `${tarballs.length} packages packed, checked and published as ${version} (${tag})`);
  const bom = JSON.parse(readFileSync(sbom, "utf8"));
  const listed = tarballs.filter(({ name }) => bom.components.some((c) => c.name === name && c.version === version && c.hashes?.length));
  check(bom.bomFormat === "CycloneDX" && listed.length === tarballs.length, `the SBOM lists the ${listed.length} packages with their hashes (${bom.components.length} components)`);
  const tags = JSON.parse(run("npm", ["view", "@tsazor/runtime", "dist-tags", "--json"], scratch, env, "npm view dist-tags"));
  check(tags[distTag(version)] === version, `the dist-tag ${distTag(version)} is ${version}`);

  run("npm", ["create", `tsazor@${version}`, "app", "--", "--ui", "@tsazor/fluent", "--dotnet"], scratch, env, "npm create tsazor");
  const app = path.join(scratch, "app");
  check(existsSync(path.join(app, "node_modules", "@tsazor", "fluent")), "npm create tsazor wrote the app with @tsazor/fluent and installed it");
  const installed = (name) => {
    const manifest = path.join(app, "node_modules", ...name.split("/"), "package.json");
    if (existsSync(manifest)) return JSON.parse(readFileSync(manifest, "utf8")).version;
    // Not where npm hoists it: where it is instead, so a failing run shows why (2026-10-14: a pnpm layout).
    const ls = shell("npm", ["ls", name, "--all"], { cwd: app, env: { ...shellEnv, ...env } });
    return `missing; npm ls: ${`${ls.stdout}${ls.stderr}`.trim().replace(/\s+/g, " ")}`;
  };
  const names = ["@tsazor/runtime", "@tsazor/fluent", "@tsazor/ui", "@tsazor/dotnet", "@tsazor/cli", "@tsazor/vite-plugin"];
  const versions = new Map(names.map((name) => [name, installed(name)]));
  const wrong = names.filter((name) => versions.get(name) !== version);
  check(wrong.length === 0, `the app installed ${version} of ${names.join(", ")}${wrong.length ? ` — not of ${wrong.map((name) => `${name} (${versions.get(name)})`).join(", ")}` : ""}`);

  run("node", ["node_modules/@tsazor/cli/dist/bin.js", "check", "."], app, env, "tsazor check");
  check(true, "tsazor check");
  run("node", ["node_modules/vite/bin/vite.js", "build", "--logLevel", "warn"], app, env, "vite build");
  check(existsSync(path.join(app, "dist", "index.html")), "vite build");
  run("node", ["node_modules/vitest/vitest.mjs", "run"], app, env, "the app's test");
  check(true, "the app's test (vitest)");
} catch (error) {
  check(false, error.message);
} finally {
  await registry.stop();
  if (keep) console.log(`kept: ${scratch}`);
  else rmSync(scratch, { recursive: true, force: true });
}

console.log(failed === 0 ? "rehearsal: all checks passed" : `rehearsal: ${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
