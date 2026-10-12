#!/usr/bin/env node
/**
 * A local npm registry (Verdaccio) for the prereleases (docs/design-release.md, D-P2): `@tsazor/*` and
 * `create-tsazor` come only from it, everything else is proxied from npm.
 *
 *   node scripts/registry.mjs          start it at http://localhost:4873 (storage ~/.tsazor/registry), until Ctrl+C
 *
 * Then `pnpm release:local` publishes the current version to it, and an app installs from it with an `.npmrc`:
 * `@tsazor:registry=http://localhost:4873/`.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Pinned, and at least two weeks old when it was chosen (2026-10-12). */
const VERDACCIO = "verdaccio@6.10.4";
export const LOCAL_REGISTRY = "http://localhost:4873/";
const LOCAL_STORAGE = path.join(homedir(), ".tsazor", "registry");
const USER = { name: "tsazor", password: "tsazor-local-registry" };

const CONFIG = `# Written by scripts/registry.mjs — a local registry for Tsazor's prereleases.
storage: ./storage
auth:
  htpasswd:
    file: ./htpasswd
    max_users: 1
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  "@tsazor/*":
    access: $all
    publish: $authenticated
    unpublish: $authenticated
  "create-tsazor":
    access: $all
    publish: $authenticated
    unpublish: $authenticated
  "**":
    access: $all
    proxy: npmjs
log:
  type: stdout
  format: pretty
  level: warn
`;

async function reachable(url) {
  try {
    return (await fetch(new URL("-/ping", url))).ok;
  } catch {
    return false;
  }
}

/**
 * Starts Verdaccio with its storage in `dir`, listening on `port`; resolves once it answers. `stop()` ends it.
 * `output: "inherit"` shows its log.
 */
export async function startRegistry({ dir, port, output = "ignore" }) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "config.yaml"), CONFIG);
  const url = `http://localhost:${port}/`;
  const config = path.join(dir, "config.yaml");
  const child = spawn(`npx --yes ${VERDACCIO} --config "${config}" --listen localhost:${port}`, {
    cwd: dir,
    shell: true,
    stdio: output === "inherit" ? "inherit" : "ignore",
    windowsHide: true,
    // Its own process group on Linux and macOS: stop() ends the shell, npx and Verdaccio together.
    detached: process.platform !== "win32",
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const deadline = Date.now() + 180_000;
  while (!(await reachable(url))) {
    if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Verdaccio did not come up at ${url}.`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const stop = async () => {
    if (child.exitCode !== null) return;
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    else process.kill(-child.pid, "SIGTERM");
    await exited;
  };
  return { url, stop };
}

/** Signs the registry's one user in (creating it the first time) and writes an npmrc with its token into `dir`. */
export async function userconfigFor(url, dir) {
  const signIn = (headers = {}) =>
    fetch(new URL(`-/user/org.couchdb.user:${USER.name}`, url), {
      method: "PUT",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ name: USER.name, password: USER.password, type: "user", roles: [], date: new Date().toISOString() }),
    });
  let response = await signIn();
  // 409: the user is there from an earlier start; with its credentials the same call signs it in (as npm login does).
  if (response.status === 409) {
    response = await signIn({ authorization: `Basic ${Buffer.from(`${USER.name}:${USER.password}`).toString("base64")}` });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.token) throw new Error(`The registry at ${url} refused the user (${response.status} ${JSON.stringify(body)}).`);
  const host = new URL(url).host;
  const file = path.join(dir, "npmrc");
  writeFileSync(file, `registry=${url}\n//${host}/:_authToken=${body.token}\n`);
  return file;
}

/** The npmrc for the local registry (`node scripts/registry.mjs` must be running). */
export async function localUserconfig() {
  if (!(await reachable(LOCAL_REGISTRY))) throw new Error(`No registry at ${LOCAL_REGISTRY}: start it with \`pnpm registry\`.`);
  return userconfigFor(LOCAL_REGISTRY, LOCAL_STORAGE);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (await reachable(LOCAL_REGISTRY)) {
    console.log(`A registry runs at ${LOCAL_REGISTRY} already.`);
  } else {
    const fresh = !existsSync(path.join(LOCAL_STORAGE, "storage"));
    await startRegistry({ dir: LOCAL_STORAGE, port: 4873, output: "inherit" });
    console.log(
      `Tsazor's local registry: ${LOCAL_REGISTRY} (storage ${LOCAL_STORAGE}${fresh ? ", new" : ""}).\n` +
        "  pnpm release:local                       publish the current version to it\n" +
        "  .npmrc in an app: @tsazor:registry=http://localhost:4873/\n" +
        "  npm create tsazor@next my-app --registry http://localhost:4873/\n" +
        "Ctrl+C stops it.",
    );
  }
}
