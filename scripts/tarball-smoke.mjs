#!/usr/bin/env node
/**
 * Phase 5.1 gate: tarball smoke test.
 *
 * Packs every shipped package (`pnpm pack`), installs the tarballs into a
 * scratch project with its own node_modules (no workspace linking — exactly
 * the resolution an external user sees) and runs these checks there:
 *
 *   1. `vite build` against a minimal .tsazor project (plugin + compiler +
 *      runtime + routes manifest, @tsazor/components via `@using`),
 *   2. a Vitest run that renders a .tsazor component via @tsazor/testing,
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
  "components",
  "fluent",
  "dotnet",
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

// 2. Scratch project ----------------------------------------------------------

const tarballOf = (name) => tarballByPkg.get(name) ?? (() => { throw new Error(`tarball for ${name} is missing`); })();
const deps = {};
for (const name of ["@tsazor/runtime", "@tsazor/compiler", "@tsazor/workspace", "@tsazor/lsp", "@tsazor/cli", "@tsazor/vite-plugin", "@tsazor/testing", "@tsazor/components", "@tsazor/fluent", "@tsazor/dotnet"]) {
  deps[name] = tarballOf(name);
}
const overrides = {};
for (const [name, spec] of Object.entries(deps)) overrides[name] = spec;

const scratchManifest = {
  name: "tsazor-tarball-smoke",
  private: true,
  version: "0.0.0",
  type: "module",
  dependencies: deps,
  // Point transitive @tsazor dependencies (e.g. @tsazor/testing -> @tsazor/runtime,
  // @tsazor/lsp -> @tsazor/compiler) at the same tarballs — they are not in
  // the registry.
  pnpm: { overrides },
  devDependencies: {
    vite: "^7.1.7",
    vitest: "^3.2.7",
    "happy-dom": "^18.0.1",
    typescript: "^5.9.2",
    "@types/node": "^20.17.0",
  },
};
writeFileSync(join(app, "package.json"), JSON.stringify(scratchManifest, null, 2) + "\n");

const tsconfig = {
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "bundler",
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: ["vite/client", "@tsazor/vite-plugin/client"],
  },
  include: ["src", "vite.config.ts", "vitest.config.ts"],
};
writeFileSync(join(app, "tsconfig.json"), JSON.stringify(tsconfig, null, 2) + "\n");

// vite.config.ts — exactly the Getting Started form
writeFileSync(join(app, "vite.config.ts"), `import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

export default defineConfig({
  plugins: [tsazor()],
});
`);

// vitest.config.ts — .tsazor imports in the test go through the same plugin call
writeFileSync(join(app, "vitest.config.ts"), `import { defineConfig } from "vitest/config";
import tsazor from "@tsazor/vite-plugin";

export default defineConfig({
  plugins: [tsazor()],
  test: { environment: "happy-dom" },
});
`);

mkdirSync(join(app, "src", "Pages"), { recursive: true });
mkdirSync(join(app, ".vscode"), { recursive: true });

writeFileSync(join(app, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Tsazor tarball smoke</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/Program.ts"></script>
  </body>
</html>
`);

// _Imports.tsazor — the standard imports (Getting Started) plus a package @using
writeFileSync(join(app, "src", "_Imports.tsazor"), `@import { ComponentBase, Parameter, CascadingParameter, EventCallback, RenderTreeBuilder, inject } from "@tsazor/runtime"
@import { Router, RouteView, NavLink, PageTitle } from "@tsazor/runtime"
@import { TsazorHttp, EditContext } from "@tsazor/runtime"
@import type { RenderFragment, RouteData } from "@tsazor/runtime"
@using @tsazor/components
`);

writeFileSync(join(app, "src", "App.tsazor"), `@import Home from "./Pages/Home.tsazor"

<Home />
`);

// A page that uses a Bootstrap building block from the installed
// @tsazor/components tarball (component resolution via the package manifest)
writeFileSync(join(app, "src", "Pages", "Home.tsazor"), `@page "/"

@import { Accordion, AccordionItem } from "@tsazor/components"

<h1>Smoke</h1>

<Accordion>
    <AccordionItem Title="A">a</AccordionItem>
    <AccordionItem Title="B">b</AccordionItem>
</Accordion>

<p role="status">Count: <strong>@count</strong></p>
<button class="smoke-add" @onclick="increment">+</button>

@code {
    private count = 0;

    private increment() {
        this.count++;
    }
}
`);

writeFileSync(join(app, "src", "Program.ts"), `import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import routes from "virtual:tsazor-routes";

createTsazorApp({ root: App, routes });
`);

// A Vitest test via the installed @tsazor/testing tarball
mkdirSync(join(app, "src", "test"), { recursive: true });
writeFileSync(join(app, "src", "test", "counter.test.ts"), `import { describe, expect, it } from "vitest";
import { render } from "@tsazor/testing";
import Home from "../Pages/Home.tsazor";

describe("tarball smoke", () => {
    it("renders the Home page and increments the counter", async () => {
        const { container, renderer } = await render(Home as never);
        container.querySelector("button.smoke-add")!.click();
        await renderer.waitUntilIdle();
        expect(container.querySelector("strong")?.textContent).toBe("1");
        expect(container.textContent).toContain("Smoke");
    });
});
`);

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