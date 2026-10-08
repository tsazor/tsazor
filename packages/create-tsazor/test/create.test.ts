/**
 * create-tsazor: the command line, the library contract (registry, directory,
 * tarball), the files it writes, and the whole run with fakes for npm.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCreateArgs, UsageError } from "../src/args.js";
import { main, packageName, type CreateIo } from "../src/cli.js";
import { isLocalSpec, libraryFromManifest, readTarballManifest, resolveLibrary, splitSpec } from "../src/library.js";
import { detectPackageManager, runScript } from "../src/npm.js";
import type { Prompter } from "../src/prompt.js";
import { scaffold, TOOL_VERSIONS } from "../src/scaffold.js";

const repo = path.resolve(import.meta.dirname, "../../..");
const VERSIONS = { "@tsazor/runtime": "0.1.0", "@tsazor/cli": "0.2.0", "@tsazor/testing": "0.1.0", "@tsazor/vite-plugin": "0.1.0", "@tsazor/dotnet": "0.1.0" };

const LIBRARY_MANIFEST = {
  name: "@acme/ui",
  version: "2.3.4",
  tsazor: { components: "./dist/tsazor-components.json", setup: { styles: ["@acme/ui/acme.css", "acme-css/dist/base.css"], services: "addAcme", layout: ["ToastHost", "PopoverHost"] } },
  peerDependencies: { "@tsazor/runtime": "^0.1.0", "acme-css": "^4.0.0" },
};

const scratch: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "create-tsazor-test-"));
  scratch.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const read = (dir: string, file: string) => readFileSync(path.join(dir, file), "utf8");

describe("the command line", () => {
  it("reads the directory and the options", () => {
    expect(parseCreateArgs(["my-app", "--ui", "@tsazor/bootstrap", "--dotnet", "--no-install"])).toEqual({
      dir: "my-app", ui: "@tsazor/bootstrap", dotnet: true, install: false, force: false, help: false, version: false,
    });
    expect(parseCreateArgs([])).toMatchObject({ dir: undefined, ui: undefined, install: undefined });
    expect(parseCreateArgs(["--install"]).install).toBe(true);
  });

  it("rejects a second directory, an unknown option and an empty --ui", () => {
    expect(() => parseCreateArgs(["a", "b"])).toThrow(UsageError);
    expect(() => parseCreateArgs(["--template", "x"])).toThrow(UsageError);
    expect(() => parseCreateArgs(["--ui", " "])).toThrow(UsageError);
  });

  it("knows the package manager that started it", () => {
    expect(detectPackageManager("pnpm/10.34.5 npm/? node/v22.23.3 win32 x64")).toBe("pnpm");
    expect(detectPackageManager("yarn/4.5.0 npm/? node/v22")).toBe("yarn");
    expect(detectPackageManager("")).toBe("npm");
    expect([runScript("npm", "dev"), runScript("pnpm", "dev"), runScript("bun", "dev")]).toEqual(["npm run dev", "pnpm dev", "bun run dev"]);
  });

  it("makes a package name of a folder name", () => {
    expect(packageName("My App")).toBe("my-app");
    expect(packageName("_.Shop")).toBe("shop");
    expect(packageName("!!!")).toBe("tsazor-app");
  });
});

describe("the library contract", () => {
  it("splits name and range, scoped names too, and tells local packages apart", () => {
    expect(splitSpec("@scope/ui@^1.2.0")).toEqual({ name: "@scope/ui", range: "^1.2.0" });
    expect(splitSpec("@scope/ui")).toEqual({ name: "@scope/ui", range: undefined });
    expect(splitSpec("ui@2")).toEqual({ name: "ui", range: "2" });
    expect(["./ui", "../ui", "file:ui", "ui-1.0.0.tgz", "/abs/ui"].map(isLocalSpec)).toEqual([true, true, true, true, true]);
    expect(["@scope/ui", "ui@2"].map(isLocalSpec)).toEqual([false, false]);
  });

  it("reads the setup and the peers, without @tsazor peers", () => {
    const library = libraryFromManifest(LIBRARY_MANIFEST, "^2.3.4");
    expect(library).toEqual({
      name: "@acme/ui",
      spec: "^2.3.4",
      setup: { styles: ["@acme/ui/acme.css", "acme-css/dist/base.css"], services: "addAcme", layout: ["ToastHost", "PopoverHost"] },
      peers: { "acme-css": "^4.0.0" },
      warnings: [],
    });
  });

  it("drops what is not valid and says so; a library without setup has none", () => {
    const library = libraryFromManifest({ name: "x", tsazor: { setup: { styles: ["ok.css", 'bad".css'], services: "not a name", layout: ["lower", "Fine"] } } }, "^1");
    expect(library.setup).toEqual({ styles: ["ok.css"], services: undefined, layout: ["Fine"] });
    expect(library.warnings).toHaveLength(3);
    expect(libraryFromManifest({ name: "plain" }, "^1").setup).toBeUndefined();
  });

  it("asks the registry and takes the newest version a range matches", () => {
    const view = (spec: string) => (spec === "@acme/ui@^2" ? [{ ...LIBRARY_MANIFEST, version: "2.0.0" }, LIBRARY_MANIFEST] : LIBRARY_MANIFEST);
    expect(resolveLibrary("@acme/ui@^2", "/app", view).spec).toBe("^2");
    expect(resolveLibrary("@acme/ui", "/app", view).spec).toBe("^2.3.4");
    expect(() => resolveLibrary("@acme/none", "/app", () => ({}))).toThrow(/no such package/);
  });

  it("reads a local directory and a tarball, with a file: spec relative to the app", () => {
    const dir = tempDir();
    mkdirSync(path.join(dir, "ui"));
    writeFileSync(path.join(dir, "ui", "package.json"), JSON.stringify(LIBRARY_MANIFEST));
    writeFileSync(path.join(dir, "ui-2.3.4.tgz"), tarball({ "package/README.md": "# ui", "package/package.json": JSON.stringify(LIBRARY_MANIFEST) }));
    const app = path.join(dir, "app");
    expect(resolveLibrary("./ui", app, undefined, dir)).toMatchObject({ name: "@acme/ui", spec: "file:../ui" });
    expect(resolveLibrary("ui-2.3.4.tgz", app, undefined, dir)).toMatchObject({ name: "@acme/ui", spec: "file:../ui-2.3.4.tgz" });
    expect(readTarballManifest(path.join(dir, "ui-2.3.4.tgz"))).toMatchObject({ name: "@acme/ui" });
  });

  it("works with the setup @tsazor/bootstrap and @tsazor/fluent declare — like any other library", () => {
    for (const skin of ["bootstrap", "fluent"]) {
      const manifest = JSON.parse(read(path.join(repo, "packages", skin), "package.json"));
      const library = libraryFromManifest(manifest, "^0.1.0");
      expect(library.warnings).toEqual([]);
      expect(library.setup?.services).toBe(skin === "bootstrap" ? "addBootstrap" : "addFluent");
      expect(library.setup?.layout).toEqual(["ToastRegion"]);
    }
  });
});

describe("the files", () => {
  it("writes the shape of dotnet new blazorwasm", () => {
    const dir = tempDir();
    const files = scaffold({ dir, name: "shop", library: undefined, dotnet: false, versions: VERSIONS });
    expect(files).toEqual([
      ".gitignore",
      ".vscode/extensions.json",
      "README.md",
      "index.html",
      "package.json",
      "public/sample-data/weather.json",
      "src/App.tsazor",
      "src/Layout/MainLayout.tsazor",
      "src/Layout/MainLayout.tsazor.css",
      "src/Layout/NavMenu.tsazor",
      "src/Layout/NavMenu.tsazor.css",
      "src/Pages/Counter.test.ts",
      "src/Pages/Counter.tsazor",
      "src/Pages/Home.tsazor",
      "src/Pages/Weather.tsazor",
      "src/Pages/WeatherForecast.ts",
      "src/Program.ts",
      "src/_Imports.tsazor",
      "src/app.css",
      "tsconfig.json",
      "vite.config.ts",
      "vitest.config.ts",
    ]);
    expect(read(dir, "index.html")).toContain("<title>shop</title>");
    expect(read(dir, "src/Layout/NavMenu.tsazor")).toContain('<a class="brand" href="">shop</a>');
    expect(JSON.parse(read(dir, "tsconfig.json")).compilerOptions.strict).toBe(true);
    const manifest = JSON.parse(read(dir, "package.json"));
    expect(manifest.dependencies).toEqual({ "@tsazor/runtime": "^0.1.0" });
    expect(manifest.devDependencies).toEqual({ "@tsazor/cli": "^0.2.0", "@tsazor/testing": "^0.1.0", "@tsazor/vite-plugin": "^0.1.0", ...TOOL_VERSIONS });
    expect(manifest.scripts.build).toBe("tsazor check && vite build");
    expect(read(dir, "src/Program.ts")).not.toContain("@acme");
    expect(read(dir, "src/_Imports.tsazor")).not.toMatch(/^@using /m);
    expect(read(dir, "src/Layout/MainLayout.tsazor").trimEnd().endsWith("</div>")).toBe(true);
  });

  it("writes a library's setup: @using, its styles before app.css and the components, its services, its layout components, its peers", () => {
    const dir = tempDir();
    scaffold({ dir, name: "shop", library: libraryFromManifest(LIBRARY_MANIFEST, "^2.3.4"), dotnet: false, versions: VERSIONS });
    const program = read(dir, "src/Program.ts");
    expect(program).toContain('import { addAcme } from "@acme/ui";');
    expect(program.indexOf('import "@acme/ui/acme.css";')).toBeLessThan(program.indexOf('import "./app.css";'));
    // Blazor's order: the library's CSS, app.css, then the components' scoped CSS that comes with App.
    expect(program.indexOf('import "./app.css";')).toBeLessThan(program.indexOf('import App from "./App.tsazor";'));
    expect(program).toContain('import "acme-css/dist/base.css";');
    expect(program).toContain("        addAcme(services);");
    expect(read(dir, "src/_Imports.tsazor").startsWith("@using @acme/ui\n")).toBe(true);
    expect(read(dir, "src/Layout/MainLayout.tsazor")).toContain("</div>\n<ToastHost />\n<PopoverHost />\n");
    expect(JSON.parse(read(dir, "package.json")).dependencies).toEqual({ "@acme/ui": "^2.3.4", "@tsazor/runtime": "^0.1.0", "acme-css": "^4.0.0" });
    expect(read(dir, "README.md")).toContain("`@acme/ui`");
  });

  it("adds @tsazor/dotnet and the api script with --dotnet", () => {
    const dir = tempDir();
    scaffold({ dir, name: "shop", library: undefined, dotnet: true, versions: VERSIONS });
    const manifest = JSON.parse(read(dir, "package.json"));
    expect(manifest.dependencies["@tsazor/dotnet"]).toBe("^0.1.0");
    expect(manifest.scripts.api).toContain("tsazor-dotnet generate");
  });

  it("uses the tool versions the repository builds with", () => {
    const root = JSON.parse(read(repo, "package.json"));
    const skins = JSON.parse(read(path.join(repo, "apps", "skins"), "package.json"));
    const worker = JSON.parse(read(path.join(repo, "packages", "worker"), "package.json"));
    expect(TOOL_VERSIONS.typescript).toBe(root.devDependencies.typescript);
    expect(TOOL_VERSIONS["happy-dom"]).toBe(root.devDependencies["happy-dom"]);
    expect(TOOL_VERSIONS.vite).toBe(skins.devDependencies.vite);
    expect(TOOL_VERSIONS.vitest).toBe(worker.devDependencies.vitest);
  });
});

describe("a whole run", () => {
  // As if started by `npm create`, whatever runs the tests.
  beforeEach(() => {
    vi.stubEnv("npm_config_user_agent", "npm/10.9.0 node/v22.23.3");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function io(overrides: Partial<CreateIo> = {}): CreateIo & { lines: string[]; installs: string[] } {
    const lines: string[] = [];
    const installs: string[] = [];
    return {
      lines,
      installs,
      stdout: (line) => lines.push(line),
      versions: VERSIONS,
      view: () => LIBRARY_MANIFEST,
      install: (_manager, dir) => {
        installs.push(dir);
        return true;
      },
      ...overrides,
    };
  }

  it("creates the app, installs, and says what to type next", async () => {
    const cwd = tempDir();
    const run = io({ cwd });
    expect(await main(["shop", "--ui", "@acme/ui"], run)).toBe(0);
    expect(run.installs).toEqual([path.join(cwd, "shop")]);
    expect(run.lines.join("\n")).toMatch(/Created shop .*22 files, with @acme\/ui\./);
    expect(run.lines).toContain("  cd shop");
    expect(run.lines).not.toContain("  npm install");
  });

  it("refuses a directory that is not empty, unless --force", async () => {
    const cwd = tempDir();
    mkdirSync(path.join(cwd, "shop"));
    writeFileSync(path.join(cwd, "shop", "notes.txt"), "mine");
    const run = io({ cwd });
    expect(await main(["shop", "--no-install"], run)).toBe(1);
    expect(run.lines[0]).toContain("is not empty");
    expect(await main(["shop", "--no-install", "--force"], io({ cwd }))).toBe(0);
    expect(read(path.join(cwd, "shop"), "notes.txt")).toBe("mine");
  });

  it("stops on a library the registry doesn't know, before writing anything", async () => {
    const cwd = tempDir();
    const run = io({ cwd, view: () => ({}) });
    expect(await main(["shop", "--ui", "@acme/none", "--no-install"], run)).toBe(1);
    expect(run.lines[0]).toMatch(/no such package/);
    expect(() => readFileSync(path.join(cwd, "shop", "package.json"))).toThrow();
  });

  it("asks for what is missing in a terminal and lists the libraries the registry finds", async () => {
    const cwd = tempDir();
    const asked: string[] = [];
    const prompter: Prompter = {
      text: async (question, fallback) => (asked.push(question), question === "Project name" ? "Shop App" : fallback),
      confirm: async (question) => (asked.push(question), false),
      choose: async (question, options) => {
        asked.push(`${question} ${options.join(" | ")}`);
        return 1;
      },
      close: () => {},
    };
    const run = io({ cwd, prompter, search: () => [{ name: "@acme/ui", description: "Acme components" }] });
    expect(await main([], run)).toBe(0);
    expect(asked).toEqual([
      "Project name",
      "Component library: none | @acme/ui — Acme components | another package…",
      "Install the dependencies with npm now?",
    ]);
    expect(read(path.join(cwd, "Shop App"), "src/_Imports.tsazor")).toContain("@using @acme/ui");
    expect(JSON.parse(read(path.join(cwd, "Shop App"), "package.json")).name).toBe("shop-app");
    expect(run.lines).toContain("  npm install");
  });

  it("prints the usage for --help and on a wrong command line", async () => {
    const help = io();
    expect(await main(["--help"], help)).toBe(0);
    expect(help.lines[0]).toContain("Usage: npm create tsazor@latest");
    const wrong = io();
    expect(await main(["a", "b"], wrong)).toBe(2);
  });
});

/** A gzipped tar with the given files (ustar headers, as npm pack writes them). */
function tarball(files: Record<string, string>): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const body = Buffer.from(content, "utf8");
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, "utf8");
    header.write("0000644\0", 100, 8, "ascii");
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
    header.write("0", 156, 1, "ascii");
    header.write("ustar\0", 257, 6, "ascii");
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}
