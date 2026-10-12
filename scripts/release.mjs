#!/usr/bin/env node
/**
 * Publishing (docs/design-release.md): one version for every published package, tarballs that are checked before
 * they leave, and a registry to send them to.
 *
 *   node scripts/release.mjs version <version>   set the version of every published package (D-P1) and open its
 *                                                 CHANGELOG section; commit it
 *   node scripts/release.mjs pack                pack every published package into .release/ and check the tarballs
 *                                                 (D-P5); run `pnpm -r build` first
 *   node scripts/release.mjs publish --registry <url> [--userconfig <npmrc>] [--tag <tag>] [--provenance]
 *                                                 pack, check, and `npm publish` every tarball (D-P4); nothing goes
 *                                                 out when any of them is published already
 *   node scripts/release.mjs publish --local     the same to the local registry (`pnpm registry`, D-P2)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(REPO, ".release");
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Runs `command args…` through the shell (npm and pnpm are .cmd scripts on Windows), the arguments quoted: Node
 * deprecates passing them separately with `shell`.
 */
export function shell(command, args, options = {}) {
  const quote = (arg) => (/^[\w@/.:=,+^-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`);
  return spawnSync([command, ...args.map(quote)].join(" "), { shell: true, encoding: "utf8", windowsHide: true, ...options });
}

/** The published packages: every package that isn't private, but the VS Code extension (the marketplace's). */
export function publishedPackages() {
  const packages = [];
  for (const dir of readdirSync(path.join(REPO, "packages")).sort()) {
    const file = path.join(REPO, "packages", dir, "package.json");
    if (!existsSync(file) || dir === "vscode") continue;
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    if (!manifest.private) packages.push({ dir: path.join(REPO, "packages", dir), file, manifest });
  }
  return packages;
}

/** The dist-tag a version goes out under: `next` for a prerelease, else `latest`. */
export function distTag(version) {
  return version.includes("-") ? "next" : "latest";
}

/* version -------------------------------------------------------------------- */

export function setVersion(version) {
  if (!SEMVER.test(version)) throw new Error(`"${version}" is not a version (1.0.0, 1.0.0-next.2, …).`);
  for (const { file, manifest } of publishedPackages()) {
    manifest.version = version;
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const changelog = path.join(REPO, "CHANGELOG.md");
  const text = readFileSync(changelog, "utf8");
  const heading = /^## Unreleased\r?\n/m;
  if (!heading.test(text)) throw new Error("CHANGELOG.md has no '## Unreleased' section.");
  const date = new Date().toISOString().slice(0, 10);
  writeFileSync(changelog, text.replace(heading, `## Unreleased\n\n## ${version} (${date})\n`));
}

/* pack ----------------------------------------------------------------------- */

/** The files of a .tgz: name → content. */
export function readTarball(file) {
  const tar = gunzipSync(readFileSync(file));
  const entries = new Map();
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const text = (start, length) => {
      const raw = header.subarray(start, start + length);
      const end = raw.indexOf(0);
      return raw.subarray(0, end < 0 ? raw.length : end).toString("utf8");
    };
    const name = [text(345, 155), text(0, 100)].filter(Boolean).join("/");
    const size = parseInt(text(124, 12).trim() || "0", 8);
    const start = offset + 512;
    if (text(156, 1) === "0" || text(156, 1) === "") entries.set(name, tar.subarray(start, start + size));
    offset = start + Math.ceil(size / 512) * 512;
  }
  return entries;
}

const FORBIDDEN = [
  [/(^|\/)(test|tests|__tests__)\//, "a test directory"],
  [/\.test\.[cm]?[jt]sx?$/, "a test file"],
  [/\.tsbuildinfo$/, "a tsbuildinfo"],
  [/(^|\/)node_modules\//, "node_modules"],
];

/** What is wrong with one packed package (D-P5); empty when nothing is. */
export function checkTarball(entries, version) {
  const problems = [];
  const files = new Set([...entries.keys()].map((name) => name.replace(/^package\//, "")));
  const manifest = JSON.parse(entries.get("package/package.json").toString("utf8"));
  if (manifest.version !== version) problems.push(`version ${manifest.version}, the others ${version}`);
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"]) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (String(range).startsWith("workspace:")) problems.push(`${field}.${name} is still ${range}`);
    }
  }
  for (const required of ["package.json", "README.md", "LICENSE"]) {
    if (!files.has(required)) problems.push(`no ${required}`);
  }
  const targets = [];
  const collect = (value) => {
    if (typeof value === "string") targets.push(value);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(manifest.main);
  collect(manifest.types);
  collect(manifest.bin);
  collect(manifest.exports);
  for (const target of targets) {
    if (target.includes("*")) continue;
    if (!files.has(path.posix.normalize(target))) problems.push(`no ${target} (package.json points at it)`);
  }
  for (const file of files) {
    // create-tsazor's template is an app, test included.
    if (manifest.name === "create-tsazor" && file.startsWith("template/")) continue;
    const hit = FORBIDDEN.find(([pattern]) => pattern.test(file));
    if (hit) problems.push(`${file} is ${hit[1]}`);
  }
  return problems;
}

/** Packs every published package into `out` and checks the tarballs; throws with every problem found. */
export function packAll(out = OUT) {
  const packages = publishedPackages();
  const version = packages.find(({ manifest }) => manifest.name === "@tsazor/runtime").manifest.version;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const tarballs = [];
  const problems = [];
  for (const { dir, manifest } of packages) {
    const result = shell("pnpm", ["pack", "--pack-destination", out], { cwd: dir });
    if (result.status !== 0) throw new Error(`pnpm pack (${manifest.name}) failed:\n${result.stdout}${result.stderr}`);
    const file = readdirSync(out).map((name) => path.join(out, name)).find((name) => !tarballs.some((t) => t.file === name));
    const entries = readTarball(file);
    for (const problem of checkTarball(entries, version)) problems.push(`${manifest.name}: ${problem}`);
    tarballs.push({ name: manifest.name, file, files: entries.size });
  }
  if (problems.length > 0) throw new Error(`The tarballs are not ready:\n  ${problems.join("\n  ")}`);
  return { version, tarballs };
}

/* publish -------------------------------------------------------------------- */

function npm(args, options = {}) {
  return shell("npm", args, options);
}

/** Packs, checks and publishes every package to `registry`; refuses when any of them has this version there. */
export function publishAll({ registry, userconfig, tag, provenance = false, out = OUT }) {
  const { version, tarballs } = packAll(out);
  const auth = userconfig ? ["--userconfig", userconfig] : [];
  const published = tarballs.filter(({ name }) => npm(["view", `${name}@${version}`, "version", "--registry", registry, ...auth]).stdout.trim() === version);
  if (published.length > 0) {
    throw new Error(`${version} is in ${registry} already (${published.map(({ name }) => name).join(", ")}). A version goes out once: \`pnpm release:version\` first.`);
  }
  const distTagName = tag ?? distTag(version);
  for (const { name, file } of tarballs) {
    const args = ["publish", file, "--registry", registry, "--tag", distTagName, "--access", "public", ...auth];
    if (provenance) args.push("--provenance");
    const result = npm(args);
    if (result.status !== 0) throw new Error(`npm publish ${name} failed:\n${result.stdout}${result.stderr}`);
    console.log(`published ${name}@${version} (${distTagName})`);
  }
  return { version, tag: distTagName, tarballs };
}

/* the command line ----------------------------------------------------------- */

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(args) {
  const [command] = args;
  if (command === "version") {
    setVersion(args[1] ?? "");
    console.log(`Every published package is at ${args[1]} now; CHANGELOG.md has its section. Build (pnpm -r build: the starter's versions.json follows), then commit.`);
  } else if (command === "pack") {
    const { version, tarballs } = packAll();
    for (const { name, files } of tarballs) console.log(`${name}@${version}  ${files} files`);
    console.log(`${tarballs.length} tarballs in .release/, all checked.`);
  } else if (command === "publish") {
    if (args.includes("--local")) {
      const { LOCAL_REGISTRY, localUserconfig } = await import("./registry.mjs");
      publishAll({ registry: LOCAL_REGISTRY, userconfig: await localUserconfig(), tag: option(args, "--tag") });
    } else {
      const registry = option(args, "--registry");
      if (!registry) throw new Error("publish needs --registry <url> (or --local).");
      publishAll({ registry, userconfig: option(args, "--userconfig"), tag: option(args, "--tag"), provenance: args.includes("--provenance") });
    }
  } else {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
    process.exitCode = command ? 1 : 0;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`release: ${error.message}`);
    process.exit(1);
  });
}
