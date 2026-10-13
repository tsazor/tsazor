/**
 * fullstackhero's backend for the port (docs/port-fullstackhero.md): upstream unchanged at the pinned commit, run the
 * way its README says — the .NET Aspire AppHost, which starts Postgres (+ pgAdmin), Valkey, RustFS, the migrator, the
 * demo seeder, the API (http://localhost:5030, https://localhost:7030, /scalar) and both original React apps (the
 * admin on :5173 is the reference). The port's dev server (:5372) proxies /api to :5030.
 *
 *   node scripts/backend.mjs
 *
 * Needs the .NET 10 SDK (global.json: 10.0.100, rollForward latestFeature) and a running Docker. The Aspire dashboard
 * prints its URL; the seeded demo login is superadmin@root.com / Password123! (tenant root).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { admin, clone, ensureClone, run } from "./upstream.mjs";

ensureClone();

const docker = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8", shell: process.platform === "win32" });
if (docker.status !== 0) {
  console.error("backend: Docker isn't running (docker info failed) — Aspire runs Postgres, Valkey and RustFS in it.");
  console.error((docker.stderr || docker.stdout || "").trim());
  process.exit(1);
}

// The AppHost starts both React apps with npm; their packages first, as the README's one-time step.
for (const app of [admin, path.join(clone, "clients", "dashboard")]) {
  if (!existsSync(path.join(app, "node_modules"))) run("npm", ["ci", "--no-audit", "--no-fund"], app);
}

const appHost = path.join(clone, "src", "Host", "FSH.Starter.AppHost");
console.log("backend: dotnet run --project src/Host/FSH.Starter.AppHost");
const child = spawn("dotnet", ["run", "--project", appHost], {
  cwd: clone,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
