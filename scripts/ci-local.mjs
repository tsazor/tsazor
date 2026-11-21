/**
 * `pnpm ci:local [ref]` — CI's check job on a fresh clone in Linux
 * (scripts/ci-local.sh). On Windows it runs in WSL: the default distribution,
 * or the one named by `TSAZOR_WSL_DISTRO`.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = ["scripts/ci-local.sh", ...process.argv.slice(2)];
const distro = process.env.TSAZOR_WSL_DISTRO;

const result = process.platform === "win32"
  ? spawnSync("wsl.exe", [...(distro ? ["-d", distro] : []), "--", "bash", ...args], { cwd: root, stdio: "inherit" })
  : spawnSync("bash", args, { cwd: root, stdio: "inherit" });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
