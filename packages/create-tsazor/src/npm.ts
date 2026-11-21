/**
 * Running npm (and the other package managers) from the starter. On Windows
 * they are `.cmd` scripts, which Node starts only through a shell — and in
 * cmd.exe a `^` (as in `^1.2.0`) is an escape character unless it is quoted.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

/** Runs `npm <args>` and returns its output; never throws for a failing npm. */
export function runNpm(args: readonly string[], cwd?: string): SpawnSyncReturns<string> {
  return runCommand("npm", args, { cwd, capture: true });
}

/** Runs a command through the shell, arguments quoted; `capture` returns the output instead of showing it. */
export function runCommand(
  command: string,
  args: readonly string[],
  options: { cwd?: string | undefined; capture?: boolean; timeout?: number } = {},
): SpawnSyncReturns<string> {
  const line = [command, ...args.map(quote)].join(" ");
  return spawnSync(line, {
    cwd: options.cwd,
    shell: true,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    timeout: options.timeout,
    windowsHide: true,
  });
}

function quote(arg: string): string {
  return /^[\w@/.:=,+-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`;
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/** The package manager that started the starter (`npm create`, `pnpm create`, …), from `npm_config_user_agent`. */
export function detectPackageManager(userAgent = process.env.npm_config_user_agent ?? ""): PackageManager {
  const name = userAgent.split("/")[0];
  return name === "pnpm" || name === "yarn" || name === "bun" ? name : "npm";
}

/** `npm run dev`, `pnpm dev`, `yarn dev`, `bun run dev`. */
export function runScript(manager: PackageManager, script: string): string {
  return manager === "npm" || manager === "bun" ? `${manager} run ${script}` : `${manager} ${script}`;
}
