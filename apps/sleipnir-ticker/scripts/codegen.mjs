/**
 * Generates the typed TS client (sleipnir-codegen) into src/api from the API's committed
 * contract, api/contract.sleipnir.json — no running API needed. The API build keeps that file
 * honest: Sleipnir.Server.Codegen regenerates the contract on every `dotnet build` and fails
 * the build when it differs from the committed file.
 *
 *   node scripts/codegen.mjs              generate src/api from the contract file
 *   node scripts/codegen.mjs --check      exit 4 when src/api is stale against the file (CI)
 *   node scripts/codegen.mjs --contract   first rewrite the contract from the API's code
 *                                         (SLEIPNIR_REGEN_GOLDEN=1 dotnet build api), then generate
 *   node scripts/codegen.mjs --live       dev convenience: generate from the running API's live
 *                                         discovery (starts it when :5310 is down). Not for
 *                                         committed clients — the file is the contract.
 *
 * Run: pnpm --filter sleipnir-ticker codegen [--check|--contract|--live]
 */
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = "api/contract.sleipnir.json";
const DISCOVERY = "http://localhost:5310/api/sleipnir/discovery";
const OUT = "src"; // sleipnir-gen writes into <out>/api

const args = new Set(process.argv.slice(2));
// One command string through the shell (npx/dotnet resolve on Windows too); no argument has spaces.
const run = (command, commandArgs, env = process.env) =>
    spawnSync([command, ...commandArgs].join(" "), { cwd: APP, stdio: "inherit", shell: true, env }).status ?? 1;

function gen(discovery, extra = []) {
    return run("npx", ["sleipnir-gen", "--lang", "ts", "--discovery", discovery, "--out", OUT, "--transport", "rest", ...extra]);
}

async function reachable(url) {
    try {
        return (await fetch(url)).ok;
    } catch {
        return false;
    }
}

/** --live: start the API when it is down, generate, stop only what was started. */
async function live() {
    let api = null;
    if (!(await reachable(DISCOVERY))) {
        console.log("starting API on :5310 (synthetic mode) …");
        api = spawn("dotnet run --project api", {
            cwd: APP,
            env: { ...process.env, TICKER_MODE: "synthetic" },
            stdio: "ignore",
            shell: true,
        });
        const deadline = Date.now() + 60_000;
        while (!(await reachable(DISCOVERY))) {
            if (Date.now() > deadline) throw new Error("API did not come up within 60s (stale process on :5310?)");
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
    try {
        return gen(DISCOVERY);
    } finally {
        if (api !== null) {
            const kill = process.platform === "win32" ? `taskkill /pid ${api.pid} /T /F` : `kill -TERM ${api.pid}`;
            spawnSync(kill, { stdio: "ignore", shell: true });
        }
    }
}

let status;
if (args.has("--live")) {
    status = await live();
} else if (args.has("--check")) {
    status = gen(CONTRACT, ["--selfcheck"]);
} else {
    if (args.has("--contract")) {
        status = run("dotnet", ["build", "api"], { ...process.env, SLEIPNIR_REGEN_GOLDEN: "1" });
        if (status !== 0) {
            console.error(`dotnet build exited with ${status}`);
            process.exit(status);
        }
    }
    status = gen(CONTRACT);
}
if (status !== 0) console.error(`sleipnir-gen exited with ${status}`);
process.exitCode = status;
