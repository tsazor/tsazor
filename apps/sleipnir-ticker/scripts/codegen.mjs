/**
 * Regenerates the typed TS client (sleipnir-codegen) from the running API's
 * discovery payload. Starts the API itself when unreachable (synthetic mode
 * — the discovery payload is identical in every TICKER_MODE), runs
 * sleipnir-gen against it, then kills only what it spawned.
 *
 * The generated files are committed; `--selfcheck` (exit 4) detects drift
 * between src/api and the contract.
 *
 * Run: pnpm --filter sleipnir-ticker codegen
 */
import { spawn, spawnSync } from "node:child_process";

const DISCOVERY = "http://localhost:5310/api/sleipnir/discovery";
const OUT = "src";

let spawned = [];

async function reachable(url) {
    try {
        const res = await fetch(url);
        return res.ok || (res.status < 500 && res.status >= 200);
    } catch {
        return false;
    }
}

async function ensureApi() {
    if (await reachable(DISCOVERY)) return;
    console.log("starting API on :5310 (synthetic mode) …");
    spawned.push(spawn("dotnet", ["run", "--project", "api"], {
        env: { ...process.env, TICKER_MODE: "synthetic" },
        stdio: "ignore",
        shell: true,
    }));
    const deadline = Date.now() + 60_000;
    while (!(await reachable(DISCOVERY))) {
        if (Date.now() > deadline) throw new Error("API did not come up within 60s (stale process on :5310? dotnet build first?)");
        await new Promise((r) => setTimeout(r, 1000));
    }
    // Give runtime discovery a settled moment after first response.
    await new Promise((r) => setTimeout(r, 500));
}

function stopSpawned() {
    for (const child of spawned) {
        try {
            spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: true });
        } catch {
            /* best effort */
        }
    }
}

try {
    await ensureApi();
    console.log("running sleipnir-gen …");
    const result = spawnSync("npx", [
        "sleipnir-gen", "--lang", "ts",
        "--discovery", DISCOVERY,
        "--out", OUT,
        "--transport", "rest",
    ], { stdio: "inherit", shell: true });
    if (result.status !== 0) {
        console.error(`sleipnir-gen exited with ${result.status}`);
        process.exitCode = result.status ?? 1;
    }
} finally {
    // Best effort; the pizza scripts note that /T /F kills the process tree.
    stopSpawned();
}