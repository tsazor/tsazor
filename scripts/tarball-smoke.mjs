#!/usr/bin/env node
/**
 * Phase-5.1-Gate: Tarball-Smoke-Test.
 *
 * Packt jedes liefernde Paket (`pnpm pack`), installiert die Tarballs in ein
 * Scratch-Projekt mit eigenem node_modules (keine Workspace-Verlinkung — genau
 * die Auflösung, die ein externer Nutzer sieht) und fährt dort drei Prüfungen:
 *
 *   1. `vite build` gegen ein minimales .tsazor-Projekt (Plugin + Compiler +
 *      Runtime + Routes-Manifest, @tsazor/components über `@using`),
 *   2. einen Vitest-Lauf, der eine .tsazor-Komponente über @tsazor/testing rendert,
 *   3. `tsazor check` (die @tsazor/cli-Bin des installierten Tarballs).
 *
 * Das Script ist der CI-Gate: exit 0 nur, wenn jede Prüfung pro Paket-Kombination
 * grün ist. Ausführen nach `pnpm -r build` (die Tarballs müssen fertige dists
 * enthalten; das Script bricht mit klarer Meldung ab, wenn dist fehlt).
 *
 * Aufruf: node scripts/tarball-smoke.mjs [--keep] [--dir <pfad>]
 *   --keep   Scratch-Verzeichnis nicht löschen (Fehlersuche)
 *   --dir    festes Scratch-Verzeichnis statt OS-Tempdir
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** Die Pakete, die nach extern liefern (Reihenfolge: Blatt zuerst, egal — overrides regeln das). */
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

// 1. Packen -------------------------------------------------------------------

step("pnpm pack");
/** name -> relativer Pfad zum Tarball (aus dem Scratch-Projekt gesehen). */
const tarballByPkg = new Map();
for (const pkg of SHIPPED) {
  const pkgDir = join(repoRoot, "packages", pkg);
  const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  if (!existsSync(join(pkgDir, "dist", "index.js"))) {
    throw new Error(`packages/${pkg}/dist/index.js fehlt — zuerst „pnpm -r build“ ausführen.`);
  }
  const result = spawnSync("pnpm", ["pack", "--pack-destination", tarballs], {
    cwd: pkgDir, shell: true, encoding: "utf8",
  });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0) throw new Error(`pnpm pack (${pkg}) fehlgeschlagen:\n${out}`);
  // pnpm pack schreibt den Pfad des Tarballs (letzte Zeile) auf stdout.
  const raw = out.trim().split(/\r?\n/).filter((l) => l.trim().endsWith(".tgz")).pop()?.trim();
  if (!raw) throw new Error(`pnpm pack (${pkg}): Tarball-Name nicht erkennbar in:\n${out}`);
  const file = raw.replace(/\\/g, "/").split("/").pop();
  tarballByPkg.set(manifest.name, `file:../tarballs/${file}`);
  console.log(`  ${manifest.name} -> ${file}`);
}

// 2. Scratch-Projekt ----------------------------------------------------------

const tarballOf = (name) => tarballByPkg.get(name) ?? (() => { throw new Error(`Tarball für ${name} fehlt`); })();
const deps = {};
for (const name of ["@tsazor/runtime", "@tsazor/compiler", "@tsazor/workspace", "@tsazor/lsp", "@tsazor/cli", "@tsazor/vite-plugin", "@tsazor/testing", "@tsazor/components", "@tsazor/fluent"]) {
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
  // Transitive @tsazor-Abhängigkeiten (z. B. @tsazor/testing -> @tsazor/runtime,
  // @tsazor/lsp -> @tsazor/compiler) auf dieselben Tarballs legen — es gibt sie
  // nicht in der Registry.
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

// vite.config.ts — exakt die Getting-Started-Form
writeFileSync(join(app, "vite.config.ts"), `import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

export default defineConfig({
  plugins: [tsazor()],
});
`);

// vitest.config.ts — .tsazor-Importe im Test laufen durch denselben Plugin-Aufruf
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

// _Imports.tsazor — die Standard-Importe (Getting-Started) plus Paket-@using
writeFileSync(join(app, "src", "_Imports.tsazor"), `@import { ComponentBase, Parameter, CascadingParameter, EventCallback, RenderTreeBuilder, inject } from "@tsazor/runtime"
@import { Router, RouteView, NavLink, PageTitle } from "@tsazor/runtime"
@import { TsazorHttp, EditContext } from "@tsazor/runtime"
@import type { RenderFragment, RouteData } from "@tsazor/runtime"
@using @tsazor/components
`);

writeFileSync(join(app, "src", "App.tsazor"), `@import Home from "./Pages/Home.tsazor"

<Home />
`);

// Eine Seite, die einen Bootstrap-Baustein aus dem installierten
// @taazor/components-Tarball nutzt (Komponenten-Auflösung über das Paket-Manifest)
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

// Ein Vitest-Test über den installierten Tarball von @tsazor/testing
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

// 3. Install ------------------------------------------------------------------

step("pnpm install (Scratch-Projekt, isoliertes node_modules)");
run("pnpm", ["install", "--no-frozen-lockfile"], app);

// 4. Prüfungen ----------------------------------------------------------------

const vite = ["node", ["node_modules/vite/bin/vite.js", "build"], app];
const vitest = ["node", ["node_modules/vitest/vitest.mjs", "run"], app];
const check = ["node", ["node_modules/@tsazor/cli/dist/bin.js", "check", "."], app];

await gate("vite build", vite);
await gate("vitest", vitest);
await gate("tsazor check", check);

async function gate(name, [cmd, args, cwd]) {
  step(name);
  const result = run(cmd, args, cwd, { check: false });
  if (result.status !== 0) {
    failures.push(name);
    process.stderr.write(`\n!! ${name} scheiterte`);
  } else {
    console.log(`  ok`);
  }
}

// 5. Bericht ------------------------------------------------------------------

console.log(`\n==== Tarball-Smoke: ${failures.length === 0 ? "GRÜN" : `ROT (${failures.join(", ")})`} ====`);
console.log(`Scratch: ${scratchRoot}${keep ? "" : " (wird gelöscht)"}`);

if (failures.length > 0 && !keep) {
  console.log("Scratch bleibt für die Fehlersuche erhalten (--keep unterdrückt das Löschen nicht bei Fehlern).");
}
if (!keep && failures.length === 0) {
  rmSync(scratchRoot, { recursive: true, force: true });
  console.log("Scratch entfernt (grün).");
}
process.exit(failures.length === 0 ? 0 : 1);