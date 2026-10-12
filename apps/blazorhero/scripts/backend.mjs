/**
 * The BlazorHero backend for the port (docs/port-blazorhero.md): upstream BlazorHero
 * (fullstackhero/blazor-starter-kit), unchanged, at the pinned commit — its ASP.NET Core server with the API,
 * Identity with JWT and refresh tokens, the SignalR hub and Hangfire, on SQL Server LocalDB.
 *
 *   node scripts/backend.mjs           clone and build once, run on :5350; BlazorHero's seeder creates the users
 *   node scripts/backend.mjs --reset   the same, from an empty database
 *
 * BlazorHero targets .NET 6, out of support since 2024, and builds only with its own SDK: a newer Razor compiler
 * names component parameters with `nameof(...)`, which turns MudBlazor 6.0.2's `[Obsolete(error: true)]`
 * parameters (MudMenu.Direction, OffsetX, …) into compile errors (port-blazorhero.md, B1). So the script installs
 * the .NET 6 SDK into .backend/dotnet with Microsoft's dotnet-install script (no admin, nothing system-wide) and
 * builds and runs BlazorHero with it. The clone lives in .backend/ too (git-ignored). The database is a LocalDB
 * database of its own (`TsazorBlazorHero`), set through the connection string, not in BlazorHero's files.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BACKEND = "http://localhost:5350";
/** BlazorHero's seeded users (DatabaseSeeder.cs, UserConstants.DefaultPassword). */
export const ADMIN = { email: "mukesh@blazorhero.com", password: "123Pa$$word!" };
export const BASIC = { email: "john@blazorhero.com", password: "123Pa$$word!" };

const UPSTREAM = "https://github.com/fullstackhero/blazor-starter-kit.git";
const COMMIT = "11f810d97cb66a251dfbee335b581fa9f1d1beab";
const DATABASE = "TsazorBlazorHero";
const SQL_SERVER = "(localdb)\\mssqllocaldb";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".backend");
const sdkDir = path.join(work, "dotnet");
const dotnet = path.join(sdkDir, process.platform === "win32" ? "dotnet.exe" : "dotnet");
/** Only the SDK in .backend/dotnet: no global SDK, no machine-wide workloads or global.json in the way. */
const dotnetEnv = { DOTNET_ROOT: sdkDir, DOTNET_MULTILEVEL_LOOKUP: "0", DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" };
const clone = path.join(work, "blazor-starter-kit");
const server = path.join(clone, "src", "Server");
const output = path.join(server, "bin", "Debug", "net6.0");
const dll = path.join(output, "BlazorHero.CleanArchitecture.Server.dll");

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

/** The .NET 6 SDK, from Microsoft's dotnet-install script, into .backend/dotnet. */
async function ensureSdk() {
  if (existsSync(dotnet)) return;
  console.log("backend: installing the .NET 6 SDK into .backend/dotnet (dotnet-install)");
  mkdirSync(sdkDir, { recursive: true });
  const windows = process.platform === "win32";
  const script = path.join(work, windows ? "dotnet-install.ps1" : "dotnet-install.sh");
  const response = await fetch(`https://dot.net/v1/${path.basename(script)}`);
  if (!response.ok) throw new Error(`backend: downloading ${path.basename(script)} failed (${response.status})`);
  writeFileSync(script, Buffer.from(await response.arrayBuffer()));
  if (windows) {
    run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Channel", "6.0", "-InstallDir", sdkDir], work);
  } else {
    run("bash", [script, "--channel", "6.0", "--install-dir", sdkDir], work);
  }
}

function ensureClone() {
  if (existsSync(path.join(clone, ".git"))) return;
  console.log(`backend: cloning BlazorHero ${COMMIT.slice(0, 7)}`);
  mkdirSync(clone, { recursive: true });
  run("git", ["init", "--quiet"], clone);
  run("git", ["config", "core.longpaths", "true"], clone);
  run("git", ["fetch", "--quiet", "--depth", "1", UPSTREAM, COMMIT], clone);
  run("git", ["checkout", "--quiet", "FETCH_HEAD"], clone);
}

function ensureBuild() {
  if (existsSync(dll)) return;
  console.log("backend: building BlazorHero with the .NET 6 SDK");
  run(dotnet, ["build", path.join(server, "Server.csproj"), "--nologo", "-v", "q"], clone, dotnetEnv);
  if (!existsSync(dll)) throw new Error(`backend: the build wrote no ${path.relative(root, dll)} (found: ${readdirSync(output).join(", ")})`);
}

/** Drops the database; the seeder fills a new one on the next start. */
function reset() {
  run("sqlcmd", ["-S", SQL_SERVER, "-Q", `IF DB_ID('${DATABASE}') IS NOT NULL BEGIN ALTER DATABASE [${DATABASE}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${DATABASE}]; END`], root);
  console.log(`backend: dropped the database ${DATABASE}`);
}

// BlazorHero answers `Accept-Language: *` (what Node's fetch sends) with a 500: its RequestCultureMiddleware makes a
// culture of it (port-blazorhero.md, U1). A browser sends real languages.
const LANGUAGE = { "accept-language": "en-US" };

async function reachable() {
  try {
    return (await fetch(`${BACKEND}/swagger/v1/swagger.json`, { redirect: "manual", headers: LANGUAGE })).ok;
  } catch {
    return false;
  }
}

/** Signs in through BlazorHero's API: the seeded users exist once this answers. */
async function signIn(user) {
  const response = await fetch(`${BACKEND}/api/identity/token`, {
    method: "POST",
    headers: { ...LANGUAGE, "content-type": "application/json" },
    body: JSON.stringify(user),
  });
  const result = await response.json();
  if (!response.ok || !result.succeeded) throw new Error(`backend: signing in as ${user.email} failed: ${JSON.stringify(result.messages ?? result)}`);
  return result.data;
}

async function main() {
  await ensureSdk();
  ensureClone();
  ensureBuild();
  if (process.argv.includes("--reset")) {
    if (await reachable()) throw new Error(`backend: stop the backend on ${BACKEND} before --reset`);
    reset();
  }

  if (await reachable()) {
    console.log(`backend: already running on ${BACKEND}`);
  } else {
    const child = spawn(dotnet, [dll], {
      cwd: server, // BlazorHero serves ./Files and reads its appsettings.json from here
      stdio: "inherit",
      env: {
        ...process.env,
        ...dotnetEnv,
        ASPNETCORE_ENVIRONMENT: "Development",
        ASPNETCORE_URLS: BACKEND,
        ConnectionStrings__DefaultConnection: `Data Source=${SQL_SERVER};Initial Catalog=${DATABASE};Integrated Security=True;MultipleActiveResultSets=True`,
        Logging__LogLevel__Default: "Warning",
        Serilog__MinimumLevel__Default: "Warning",
      },
    });
    child.on("exit", (code) => process.exit(code ?? 0));
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill());
    // The first start creates the database and runs the migrations and the seeder.
    const deadline = Date.now() + 180_000;
    while (!(await reachable())) {
      if (Date.now() > deadline) throw new Error(`backend: BlazorHero did not answer on ${BACKEND} within 180 s`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  await signIn(ADMIN);
  console.log(`backend: ready on ${BACKEND} — sign in as ${ADMIN.email} / ${ADMIN.password} (Swagger: ${BACKEND}/swagger)`);
}

// Run only when started directly; the verify script imports the constants.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
