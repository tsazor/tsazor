#!/usr/bin/env node
/**
 * Phase 5.1 gate: tarball smoke test.
 *
 * Packs every shipped package (`pnpm pack`), lets the packed `create-tsazor`
 * write a new app (`--ui` the @tsazor/bootstrap tarball, `--dotnet`), installs
 * the tarballs there with its own node_modules (no workspace linking — exactly
 * the resolution an external user sees) and runs these checks:
 *
 *   1. `vite build` of the starter's app (plugin + compiler + runtime + routes
 *      manifest, the library's setup: @using, styles, services, layout),
 *   2. the starter's Vitest test, which renders a page via @tsazor/testing,
 *   3. `tsazor check` (the @tsazor/cli bin of the installed tarball),
 *   4. the @tsazor/dotnet entry points, CLI generation and a type check of
 *      the generated output.
 *
 * The script is the CI gate: exit 0 only when every check is green.
 * Run it after `pnpm -r build` (the tarballs must contain finished dists;
 * the script aborts with a clear message when dist is missing).
 *
 * Usage: node scripts/tarball-smoke.mjs [--keep] [--dir <path>]
 *   --keep   do not delete the scratch directory (debugging)
 *   --dir    fixed scratch directory instead of the OS temp dir
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** The packages that ship externally (order: leaves first, irrelevant anyway — overrides take care of it). */
const SHIPPED = [
  "compiler",
  "workspace",
  "runtime",
  "lsp",
  "cli",
  "vite-plugin",
  "testing",
  "ui",
  "worker",
  "bootstrap",
  "bootstrap-icons",
  "fluent",
  "fluent-icons",
  "markdown",
  "dotnet",
  "create-tsazor",
];

const keep = process.argv.includes("--keep");
const dirFlag = process.argv.indexOf("--dir");
const scratchRoot = dirFlag >= 0 && process.argv[dirFlag + 1]
  ? process.argv[dirFlag + 1]
  : mkdtempSync(join(tmpdir(), "tsazor-tarball-smoke-"));

const tarballs = join(scratchRoot, "tarballs");
const app = join(scratchRoot, "app");
mkdirSync(tarballs, { recursive: true });
mkdirSync(app, { recursive: true });

const failures = [];
function step(label) {
  process.stdout.write(`\n== ${label}\n`);
}
function run(cmd, args, cwd, { check = true, env = {} } = {}) {
  const result = spawnSync(cmd, args, { cwd, shell: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
  if (result.stdout?.trim()) process.stdout.write(indent(result.stdout));
  if (result.stderr?.trim()) process.stderr.write(indent(result.stderr));
  if (check && result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} in ${cwd} exit ${result.status}`);
  }
  return result;
}
function indent(text) {
  return text.replace(/^/gm, "  | ");
}

// 1. Pack ---------------------------------------------------------------------

step("pnpm pack");
/** name -> relative path to the tarball (as seen from the scratch project). */
const tarballByPkg = new Map();
for (const pkg of SHIPPED) {
  const pkgDir = join(repoRoot, "packages", pkg);
  const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  if (!existsSync(join(pkgDir, "dist", "index.js"))) {
    throw new Error(`packages/${pkg}/dist/index.js is missing — run "pnpm -r build" first.`);
  }
  const result = spawnSync("pnpm", ["pack", "--pack-destination", tarballs], {
    cwd: pkgDir, shell: true, encoding: "utf8",
  });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0) throw new Error(`pnpm pack (${pkg}) failed:\n${out}`);
  // pnpm pack writes the tarball's path (last line) to stdout.
  const raw = out.trim().split(/\r?\n/).filter((l) => l.trim().endsWith(".tgz")).pop()?.trim();
  if (!raw) throw new Error(`pnpm pack (${pkg}): tarball name not recognizable in:\n${out}`);
  const file = raw.replace(/\\/g, "/").split("/").pop();
  tarballByPkg.set(manifest.name, `file:../tarballs/${file}`);
  console.log(`  ${manifest.name} -> ${file}`);
}

// 2. Scratch project — written by the packed starter, as a user gets it --------

const tarballOf = (name) => tarballByPkg.get(name) ?? (() => { throw new Error(`tarball for ${name} is missing`); })();
const tarballFile = (name) => join(tarballs, tarballOf(name).replace("file:../tarballs/", ""));

step("create-tsazor (packed) app --ui <the @tsazor/bootstrap tarball> --dotnet");
const starter = join(scratchRoot, "starter");
extractTarball(tarballFile("create-tsazor"), starter);
rmSync(app, { recursive: true, force: true });
run("node", [join(starter, "package", "dist", "index.js"), "app", "--ui", tarballFile("@tsazor/bootstrap"), "--dotnet", "--no-install"], scratchRoot);

// What npm pack drops or renames (.gitignore, dot folders) must arrive in the app.
for (const file of [".gitignore", ".vscode/extensions.json", "src/Pages/Counter.test.ts", "public/sample-data/weather.json"]) {
  if (!existsSync(join(app, file))) failures.push(`starter: ${file} is missing`);
}

// Every shipped package from its tarball — the starter's @tsazor/* ranges are not in the
// registry yet, and the transitive ones (@tsazor/testing -> @tsazor/runtime) need overrides.
const manifest = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
const overrides = {};
for (const name of tarballByPkg.keys()) {
  if (name === "create-tsazor") continue;
  overrides[name] = tarballOf(name);
  if (!manifest.devDependencies[name]) manifest.dependencies[name] = tarballOf(name);
  else manifest.devDependencies[name] = tarballOf(name);
}
manifest.pnpm = { overrides };
manifest.devDependencies["@types/node"] = "^20.17.0";
writeFileSync(join(app, "package.json"), JSON.stringify(manifest, null, 2) + "\n");

/** Extracts a package tarball (`package/…`) into `dir` — no tar binary needed. */
function extractTarball(file, dir) {
  const tar = gunzipSync(readFileSync(file));
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
    if (text(156, 1) === "0" || text(156, 1) === "") {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), tar.subarray(start, start + size));
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
}

// The @tsazor/dotnet smoke: a mini OpenAPI document ...
writeFileSync(join(app, "dotnet-openapi.json"), JSON.stringify({
  openapi: "3.0.1",
  info: { title: "SmokeApi", version: "1.0.0" },
  paths: {
    "/api/things/{id}": {
      get: {
        operationId: "getThing",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": {
            description: "The thing",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { id: { type: "integer" }, name: { type: "string", minLength: 1 } },
                  required: ["id", "name"],
                },
              },
            },
          },
        },
      },
    },
  },
  components: { schemas: {} },
}, null, 2) + "\n");

// ... the check of both package entry points (browser "." without node:*,
// generator entry with the CLI code) ...
writeFileSync(join(app, "dotnet-entries.mjs"), `const runtime = await import("@tsazor/dotnet");
const generator = await import("@tsazor/dotnet/generator");
for (const missing of [
    typeof runtime.OpenApiClient !== "function" && "OpenApiClient",
    typeof runtime.problemMessage !== "function" && "problemMessage",
    typeof generator.generateClient !== "function" && "generateClient",
].filter(Boolean)) {
    console.error(\`@tsazor/dotnet: \${missing} is missing\`);
    process.exit(1);
}
`);

// ... and CLI generation from within the installed tarball.
mkdirSync(join(app, "src", "dotnet-api"), { recursive: true });

// 3. Install ------------------------------------------------------------------

step("pnpm install (scratch project, isolated node_modules)");
run("pnpm", ["install", "--no-frozen-lockfile"], app);

// 4. Checks -------------------------------------------------------------------

const vite = ["node", ["node_modules/vite/bin/vite.js", "build"], app];
const vitest = ["node", ["node_modules/vitest/vitest.mjs", "run"], app];
const check = ["node", ["node_modules/@tsazor/cli/dist/bin.js", "check", "."], app];

await gate("vite build", vite);
await gate("vitest", vitest);
await gate("tsazor check", check);
await gate("dotnet entry points", ["node", ["dotnet-entries.mjs"], app]);
await gate("tsazor-dotnet generate", ["node", ["node_modules/@tsazor/dotnet/dist/bin.js", "generate", "dotnet-openapi.json", "--out", "src/dotnet-api", "--name", "SmokeApi"], app]);
// The copy-in CLI ships with the package (L8: it didn't, so `npx @tsazor/fluent add` had nothing to run).
// (Read with zlib: a tar on Windows may be GNU tar, which takes "C:" for a host.)
writeFileSync(join(app, "fluent-cli.mjs"), `import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
const tar = gunzipSync(readFileSync(${JSON.stringify(tarballFile("@tsazor/fluent"))})).toString("latin1");
const missing = ["package/bin/fluent.mjs", "package/bin/closure.mjs", '"tsazor-fluent": "./bin/fluent.mjs"'].filter((entry) => !tar.includes(entry));
if (missing.length > 0) {
  console.error("missing: " + missing.join(", "));
  process.exit(1);
}
`);
await gate("@tsazor/fluent ships its copy-in CLI", ["node", ["fluent-cli.mjs"], app]);
await gate("dotnet output type check", ["node", ["node_modules/typescript/bin/tsc", "--noEmit", "--strict", "--target", "ES2022", "--moduleResolution", "bundler", "--module", "ESNext", "src/dotnet-api/models.ts", "src/dotnet-api/smoke-api.ts"], app]);

async function gate(name, [cmd, args, cwd]) {
  step(name);
  const result = run(cmd, args, cwd, { check: false });
  if (result.status !== 0) {
    failures.push(name);
    process.stderr.write(`\n!! ${name} failed`);
  } else {
    console.log(`  ok`);
  }
}

// 5. Report -------------------------------------------------------------------

console.log(`\n==== Tarball smoke: ${failures.length === 0 ? "GREEN" : `RED (${failures.join(", ")})`} ====`);
console.log(`Scratch: ${scratchRoot}${keep ? "" : " (will be deleted)"}`);

if (failures.length > 0 && !keep) {
  console.log("Scratch is kept for debugging (on failure it is never deleted, even without --keep).");
}
if (!keep && failures.length === 0) {
  rmSync(scratchRoot, { recursive: true, force: true });
  console.log("Scratch removed (green).");
}
process.exit(failures.length === 0 ? 0 : 1);