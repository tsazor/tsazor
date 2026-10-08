/**
 * `npm create tsazor` from start to finish: the arguments, the questions for
 * what is missing, the library's setup, the files, the install, and what to
 * type next. Returns the exit code — 0 done, 1 failed, 2 wrong usage.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseCreateArgs, USAGE, UsageError } from "./args.js";
import { resolveLibrary, type Library, type RegistryView } from "./library.js";
import { detectPackageManager, runCommand, runNpm, runScript, type PackageManager } from "./npm.js";
import type { Prompter } from "./prompt.js";
import { scaffold } from "./scaffold.js";

/** A component library the registry lists under the keyword `tsazor-components`. */
export interface FoundLibrary {
  name: string;
  description: string;
}

export interface CreateIo {
  stdout: (line: string) => void;
  /** Present when stdin is a terminal: missing answers are asked. */
  prompter?: Prompter | undefined;
  cwd?: string;
  /** The `@tsazor/*` versions; dist/versions.json by default. */
  versions?: Record<string, string>;
  /** Replaces `npm view` (tests). */
  view?: RegistryView;
  /** Replaces the registry search (tests). */
  search?: () => FoundLibrary[];
  /** Replaces the install (tests); returns whether it succeeded. */
  install?: (manager: PackageManager, dir: string) => boolean;
}

export async function main(argv: readonly string[], io: CreateIo): Promise<number> {
  let args;
  try {
    args = parseCreateArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.stdout(error.message);
    io.stdout(USAGE);
    return 2;
  }
  if (args.help) {
    io.stdout(USAGE);
    return 0;
  }
  if (args.version) {
    io.stdout(`create-tsazor ${ownVersion()}`);
    return 0;
  }
  const { prompter } = io;

  const dirArgument = args.dir ?? (prompter ? await prompter.text("Project name", "tsazor-app") : "tsazor-app");
  const dir = path.resolve(io.cwd ?? process.cwd(), dirArgument);
  const name = packageName(path.basename(dir));
  if (!isEmptyDirectory(dir) && !args.force) {
    const proceed = prompter ? await prompter.confirm(`${dirArgument} is not empty. Write into it anyway?`, false) : false;
    if (!proceed) {
      io.stdout(`${dirArgument} is not empty; pass --force to write into it.`);
      return 1;
    }
  }

  const uiSpec = args.ui ?? (prompter ? await chooseLibrary(prompter, io.search ?? searchLibraries) : undefined);
  let library: Library | undefined;
  if (uiSpec !== undefined) {
    try {
      library = resolveLibrary(uiSpec, dir, io.view, io.cwd);
    } catch (error) {
      io.stdout(error instanceof Error ? error.message : String(error));
      return 1;
    }
    for (const warning of library.warnings) io.stdout(`warning: ${library.name}: ${warning}`);
    if (library.setup === undefined) {
      io.stdout(`note: ${library.name} declares no setup (tsazor.setup); it is added with @using — see its docs for styles and services.`);
    }
  }

  const files = scaffold({ dir, name, library, dotnet: args.dotnet, versions: io.versions ?? readVersions() });
  io.stdout(`Created ${name} in ${dir}: ${files.length} files${library ? `, with ${library.name}` : ""}.`);

  const manager = detectPackageManager();
  const install = args.install ?? (prompter ? await prompter.confirm(`Install the dependencies with ${manager} now?`, true) : true);
  let installed = false;
  if (install) {
    io.stdout(`${manager} install …`);
    installed = (io.install ?? installWith)(manager, dir);
    if (!installed) io.stdout(`${manager} install failed — run it again in ${dirArgument}.`);
  }

  io.stdout("");
  io.stdout("Next:");
  const relative = path.relative(io.cwd ?? process.cwd(), dir);
  if (relative !== "") io.stdout(`  cd ${relative.includes(" ") ? `"${relative}"` : relative}`);
  if (!installed) io.stdout(`  ${manager} install`);
  io.stdout(`  ${runScript(manager, "dev")}`);
  io.stdout("Open the folder in VS Code and install the recommended Tsazor extension.");
  return install && !installed ? 1 : 0;
}

async function chooseLibrary(prompter: Prompter, search: () => FoundLibrary[]): Promise<string | undefined> {
  const found = search();
  const options = ["none", ...found.map((library) => (library.description ? `${library.name} — ${library.description}` : library.name)), "another package…"];
  const index = await prompter.choose("Component library:", options);
  if (index === 0) return undefined;
  if (index === options.length - 1) {
    const spec = await prompter.text("Package name (or a directory, or a .tgz)", "");
    return spec === "" ? undefined : spec;
  }
  return found[index - 1]!.name;
}

/** The registry's packages under the keyword `tsazor-components`; none when offline. */
function searchLibraries(): FoundLibrary[] {
  const result = runNpm(["search", "keywords:tsazor-components", "--json"]);
  if (result.status !== 0) return [];
  try {
    const found = JSON.parse(result.stdout) as unknown;
    if (!Array.isArray(found)) return [];
    return found
      .filter((entry): entry is { name: string; description?: unknown } => typeof entry?.name === "string")
      .map((entry) => ({ name: entry.name, description: typeof entry.description === "string" ? entry.description : "" }));
  } catch {
    return [];
  }
}

function installWith(manager: PackageManager, dir: string): boolean {
  return runCommand(manager, ["install"], { cwd: dir }).status === 0;
}

/** A valid npm package name from a folder name: lowercase, other characters as `-`. */
export function packageName(folder: string): string {
  const name = folder
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/^[._-]+|-+$/g, "");
  return name === "" ? "tsazor-app" : name;
}

function isEmptyDirectory(dir: string): boolean {
  return !existsSync(dir) || readdirSync(dir).filter((entry) => entry !== ".git").length === 0;
}

function readVersions(): Record<string, string> {
  return JSON.parse(readFileSync(new URL("./versions.json", import.meta.url), "utf8")) as Record<string, string>;
}

function ownVersion(): string {
  return (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
}
