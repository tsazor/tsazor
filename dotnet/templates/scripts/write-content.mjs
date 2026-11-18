#!/usr/bin/env node
/**
 * Writes the content of the `dotnet new tsazor` template (docs/design-aspnetcore.md, D-A8) into --out:
 *
 *   content/tsazor/            the solution, the server, .vscode, the template's configuration — copied
 *   MyApp.Client.<ui>/         one client per --ui choice, written by create-tsazor's own scaffold (with --dotnet),
 *                              then the template's changes: the Weather page asks the server, a sign-up form with the
 *                              server's validation, the .esproj, the typed client in src/api
 *
 * The client is never a copy of create-tsazor's files: each pack writes it anew from the starter in this repository,
 * so the two can't drift. A change of the starter that a patch below no longer fits fails the pack.
 *
 *   node dotnet/templates/scripts/write-content.mjs --out <dir>      (after `pnpm -r build`)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.resolve(HERE, "..");
const REPO = path.resolve(TEMPLATES, "../..");
const STARTER = path.join(REPO, "packages", "create-tsazor", "dist");

const { values } = parseArgs({ options: { out: { type: "string" } } });
if (!values.out) throw new Error("--out <dir> is missing.");
const out = path.resolve(values.out);

if (!existsSync(path.join(STARTER, "scaffold.js"))) {
  throw new Error(`${STARTER} is not built: run \`pnpm -r --filter "./packages/*" build\` first.`);
}
const { scaffold } = await import(pathToFileURL(path.join(STARTER, "scaffold.js")).href);
const { libraryFromManifest } = await import(pathToFileURL(path.join(STARTER, "library.js")).href);
const versions = JSON.parse(readFileSync(path.join(STARTER, "versions.json"), "utf8"));
const version = versions["@tsazor/runtime"];

/** The --ui choices: the template's symbol value → the package in this repository. */
const LIBRARIES = { bootstrap: "bootstrap", fluent: "fluent", none: undefined };

rmSync(out, { recursive: true, force: true });
const content = path.join(out, "tsazor");
cpSync(path.join(TEMPLATES, "content", "tsazor"), content, { recursive: true });

const serverProject = path.join(content, "MyApp.Server", "MyApp.Server.csproj");
writeFileSync(serverProject, readFileSync(serverProject, "utf8").replace("TSAZOR_VERSION", version));

for (const [ui, dir] of Object.entries(LIBRARIES)) {
  const client = path.join(content, `MyApp.Client.${ui}`);
  const library = dir
    ? libraryFromManifest(JSON.parse(readFileSync(path.join(REPO, "packages", dir, "package.json"), "utf8")), `^${version}`)
    : undefined;
  // "MyApp" is the template's sourceName: dotnet new puts the app's name in its place.
  scaffold({ dir: client, name: "MyApp", library, dotnet: true, versions });
  customize(client);
}

/** The template's changes to the starter's app. */
function customize(client) {
  const edit = (relative, change) => {
    const file = path.join(client, relative);
    // A checkout with CRLF (Windows) reads as LF; the patches below are written with \n.
    const before = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const after = change(before);
    if (after === before) throw new Error(`${relative}: the starter changed, the template's patch no longer fits.`);
    writeFileSync(file, after);
  };
  const replace = (relative, search, replacement) =>
    edit(relative, (text) => {
      if (!text.includes(search)) throw new Error(`${relative}: no "${search}" — the starter changed, adjust write-content.mjs.`);
      return text.replace(search, replacement);
    });

  // npm wants a lower-case package name; "myapp" is the sourceName's lower-case form.
  edit("package.json", (text) => {
    const manifest = JSON.parse(text);
    manifest.name = "myapp.client";
    // The server's build writes the client (TsazorGenerateApiClient); by hand from its last OpenAPI document.
    manifest.scripts.api = "tsazor-dotnet generate ../MyApp.Server/obj/MyApp.Server.json --out src/api --name Server";
    // The generated models use the .NET value types (DateOnly for a date).
    manifest.dependencies = sortKeys({ ...manifest.dependencies, "@tsazor/primitives": `^${version}` });
    return `${JSON.stringify(manifest, null, 2)}\n`;
  });

  // Weather asks the server, as in Blazor's hosted template.
  replace("src/Pages/Weather.tsazor", '"sample-data/weather.json"', '"api/weatherforecast"');
  replace("src/Pages/WeatherForecast.ts", "the sample forecast in public/sample-data/weather.json", "the forecast from the server's /api/weatherforecast");
  rmSync(path.join(client, "public", "sample-data"), { recursive: true });

  replace(
    "src/Layout/NavMenu.tsazor",
    '<NavLink class="nav-link" Href="weather">Weather</NavLink>\n        </div>\n',
    '<NavLink class="nav-link" Href="weather">Weather</NavLink>\n        </div>\n' +
      '        <div class="nav-item">\n            <NavLink class="nav-link" Href="signup">Sign up</NavLink>\n        </div>\n',
  );

  edit("README.md", (text) => {
    const at = text.indexOf("\n## Backend\n");
    if (at < 0) throw new Error("README.md: no Backend section — the starter changed, adjust write-content.mjs.");
    return `${text.slice(0, at)}
## Backend

The app is the client of \`MyApp.Server\`, which serves it: in development behind the Vite dev server, which it
starts, and from \`wwwroot\` once published. \`src/api\` is the typed client of the server's API (\`@tsazor/dotnet\`):
the server's build writes it anew from its OpenAPI document, so a changed C# record changes it on the next build.
`;
  });

  // Vite's dependency scan reads no .tsazor file: the packages only the pages import (the API client's) would be found
  // when the first page loads, and the re-optimization then fails that load (504 "Outdated Optimize Dep").
  replace(
    "vite.config.ts",
    "    plugins: [tsazor()],\n",
    "    plugins: [tsazor()],\n" +
      "    // Imported only from .tsazor files, which Vite's dependency scan doesn't read: optimized up front.\n" +
      '    optimizeDeps: { include: ["@tsazor/dotnet", "@tsazor/primitives"] },\n',
  );

  // The solution folder has the editor settings.
  rmSync(path.join(client, ".vscode"), { recursive: true, force: true });

  cpSync(path.join(TEMPLATES, "client"), client, { recursive: true });
}

function sortKeys(record) {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

mkdirSync(out, { recursive: true });
console.log(`write-content: the template for ${version} in ${out}`);
