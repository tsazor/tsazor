/**
 * fullstackhero upstream (fullstackhero/dotnet-starter-kit, MIT) at the pinned commit, cloned into .backend/ (git-ignored):
 * the backend the port runs against (scripts/backend.mjs), the original admin as the reference, and its Playwright
 * suite as the port's acceptance test (scripts/acceptance.mjs).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM = "https://github.com/fullstackhero/dotnet-starter-kit.git";
export const COMMIT = "a967537526f3b769c7d268da3ed2a6920af65ce9";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const work = path.join(root, ".backend");
export const clone = path.join(work, "dotnet-starter-kit");
/** The original admin app (React 19, Vite, Tailwind, shadcn). */
export const admin = path.join(clone, "clients", "admin");

export function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, ...env }, shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

/** The clone at the pinned commit. */
export function ensureClone() {
  if (existsSync(path.join(clone, ".git"))) return;
  console.log(`upstream: cloning fullstackhero ${COMMIT.slice(0, 7)}`);
  mkdirSync(clone, { recursive: true });
  run("git", ["init", "--quiet"], clone);
  run("git", ["config", "core.longpaths", "true"], clone);
  run("git", ["fetch", "--quiet", "--depth", "1", UPSTREAM, COMMIT], clone);
  run("git", ["checkout", "--quiet", "FETCH_HEAD"], clone);
}

/** The original admin's packages (npm, its own lockfile): its Playwright for the acceptance run, React for the reference. */
export function ensureAdminPackages() {
  if (existsSync(path.join(admin, "node_modules", "@playwright", "test"))) return;
  console.log("upstream: installing the original admin's packages (npm ci)");
  run("npm", ["ci", "--no-audit", "--no-fund"], admin);
}
