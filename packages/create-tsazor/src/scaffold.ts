/**
 * Writes a new app: the static files of `template/` (the shape of
 * `dotnet new blazorwasm`) and the files that depend on the options —
 * package.json, Program.ts, _Imports.tsazor, MainLayout.tsazor, README.md, AGENTS.md.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Library } from "./library.js";

export interface ScaffoldOptions {
  /** The target directory (absolute). */
  dir: string;
  /** The package name, also shown in the nav menu and the page title. */
  name: string;
  library: Library | undefined;
  dotnet: boolean;
  /** The versions of the `@tsazor/*` packages (dist/versions.json). */
  versions: Record<string, string>;
  /** The template directory; the package's own `template/` by default. */
  templateDir?: string;
}

/** The tools of a new app, the versions this repository builds and tests with. */
export const TOOL_VERSIONS = {
  "happy-dom": "^21.0.1",
  typescript: "^5.9.2",
  vite: "^7.1.7",
  vitest: "^3.2.7",
};

const DEFAULT_TEMPLATE = fileURLToPath(new URL("../template/", import.meta.url));

/** Files npm would drop or rename when the starter is packed, stored under another name. */
const RENAMED: Record<string, string> = { _gitignore: ".gitignore" };

const TEXT = /\.(tsazor|ts|css|html|json|md)$|^_gitignore$/;

/** Writes the app and returns the written files (relative, `/`-separated, sorted). */
export function scaffold(options: ScaffoldOptions): string[] {
  const written: string[] = [];
  const write = (relative: string, content: string) => {
    const target = path.join(options.dir, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    written.push(relative);
  };

  const templateDir = options.templateDir ?? DEFAULT_TEMPLATE;
  copyTemplate(templateDir, "", options.name, write);
  write("src/app.css", appCss(readFileSync(path.join(templateDir, "src", "app.css"), "utf8"), options.library));
  write("package.json", packageJson(options));
  write("src/Program.ts", programTs(options.library));
  write("src/_Imports.tsazor", importsTsazor(options.library));
  write("src/Layout/MainLayout.tsazor", mainLayout(options.library));
  write("README.md", readme(options));
  write("AGENTS.md", agents(readFileSync(path.join(templateDir, "AGENTS.md"), "utf8"), options));
  return [...new Set(written)].sort();
}

function copyTemplate(dir: string, relative: string, name: string, write: (relative: string, content: string) => void): void {
  for (const entry of readdirSync(path.join(dir, relative), { withFileTypes: true })) {
    const source = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      copyTemplate(dir, source, name, write);
      continue;
    }
    const target = path.posix.join(relative, RENAMED[entry.name] ?? entry.name);
    const content = readFileSync(path.join(dir, source), "utf8");
    write(target, TEXT.test(entry.name) ? content.replaceAll("%APP_NAME%", name) : content);
  }
}

/**
 * The template's app.css. A library that brings stylesheets brings its typeface too (a zero-weight `:where(body)`
 * rule, component-libraries.md), so the template's own font goes: in app.css, loaded after the library's styles, it
 * beat the library's for every text outside the components (F16).
 */
function appCss(template: string, library: Library | undefined): string {
  if ((library?.setup?.styles ?? []).length === 0) return template;
  return template.replace(/^[ \t]*font-family:[^\n]*\n/m, "");
}

function packageJson(options: ScaffoldOptions): string {
  const version = (name: string) => {
    const found = options.versions[name];
    if (found === undefined) throw new Error(`No version for ${name} in versions.json.`);
    return `^${found}`;
  };
  const dependencies: Record<string, string> = { "@tsazor/runtime": version("@tsazor/runtime") };
  if (options.library) {
    dependencies[options.library.name] = options.library.spec;
    Object.assign(dependencies, options.library.peers);
  }
  if (options.dotnet) dependencies["@tsazor/dotnet"] = version("@tsazor/dotnet");
  const devDependencies: Record<string, string> = {
    "@tsazor/cli": version("@tsazor/cli"),
    "@tsazor/testing": version("@tsazor/testing"),
    "@tsazor/vite-plugin": version("@tsazor/vite-plugin"),
    ...TOOL_VERSIONS,
  };
  const scripts: Record<string, string> = {
    dev: "vite",
    build: "tsazor check && vite build",
    preview: "vite preview",
    test: "vitest run",
    check: "tsazor check",
  };
  // The OpenAPI document of the ASP.NET Core backend (Swashbuckle's default URL).
  if (options.dotnet) scripts.api = "tsazor-dotnet generate http://localhost:5000/swagger/v1/swagger.json --out src/api";
  const manifest = {
    name: options.name,
    private: true,
    version: "0.0.0",
    type: "module",
    scripts,
    dependencies: sorted(dependencies),
    devDependencies: sorted(devDependencies),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function sorted(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

function programTs(library: Library | undefined): string {
  const setup = library?.setup;
  // The stylesheets in Blazor's order: the library's, app.css, then the components' scoped CSS,
  // which comes with App — so that each can adjust the one before.
  const imports = [...(setup?.styles ?? []).map((style) => `import "${style}";`), 'import "./app.css";'];
  imports.push('import { createTsazorApp, TsazorHttp } from "@tsazor/runtime";');
  if (library && setup?.services) imports.push(`import { ${setup.services} } from "${library.name}";`);
  imports.push('import routes from "virtual:tsazor-routes";', 'import App from "./App.tsazor";');
  const services = [
    "        // Blazor: builder.Services.AddScoped(sp => new HttpClient { BaseAddress = ... })",
    "        services.registerValue(TsazorHttp, new TsazorHttp({ baseUrl: document.baseURI }));",
  ];
  if (setup?.services) services.push(`        ${setup.services}(services);`);
  return `${imports.join("\n")}

createTsazorApp({
    root: App,
    routes,
    services: (services) => {
${services.join("\n")}
    },
});
`;
}

function importsTsazor(library: Library | undefined): string {
  const using = library ? `@using ${library.name}\n` : "";
  return `${using}@* The standard runtime set (Blazor: @using Microsoft.AspNetCore.Components.*). Unused imports are dropped by the build. *@
@import { ComponentBase, LayoutComponentBase, Parameter, CascadingParameter, EventCallback, inject } from "@tsazor/runtime"
@import { NavigationManager, Router, RouteView, LayoutView, NavLink, NavLinkMatch, PageTitle, FocusOnNavigate } from "@tsazor/runtime"
@import { EditContext, TsazorHttp } from "@tsazor/runtime"
@import type { RenderFragment, RouteData } from "@tsazor/runtime"
`;
}

function mainLayout(library: Library | undefined): string {
  const layout = (library?.setup?.layout ?? []).map((component) => `<${component} />\n`).join("");
  return `@inherits LayoutComponentBase

<div class="page">
    <div class="sidebar">
        <NavMenu />
    </div>

    <main>
        <div class="top-row">
            <a href="https://github.com/tsazor/tsazor" target="_blank">About</a>
        </div>

        <article class="content">
            @Body
        </article>
    </main>
</div>
${layout}`;
}

/** The template's AGENTS.md (notes for coding agents) with this app's name, packages and setup. */
function agents(template: string, options: ScaffoldOptions): string {
  const code = (text: string) => "`" + text + "`";
  const versions = Object.entries(options.versions)
    .filter(([name]) => name === "@tsazor/runtime" || name === options.library?.name || (options.dotnet && name === "@tsazor/dotnet"))
    .map(([name, version]) => code(`${name}@${version}`));
  const library = options.library;
  const lines = [
    "## This app",
    "",
    `- **Packages:** ${versions.join(", ")}; every ${code("@tsazor/*")} package at that one version.`,
    library
      ? `- **Components:** ${code(library.name)} — ${code(`@using ${library.name}`)} in ${code("src/_Imports.tsazor")}, so its tags ` +
        `work in every ${code(".tsazor")} file` +
        (library.setup ? `; its styles and services are set up in ${code("src/Program.ts")}, its hosts in ${code("src/Layout/MainLayout.tsazor")}` : "") +
        "."
      : `- **Components:** plain HTML and the runtime's (${code("NavLink")}, ${code("EditForm")}, ${code("InputText")}, …); ` +
        `${code("@tsazor/fluent")} or ${code("@tsazor/bootstrap")} adds a component library.`,
    options.dotnet
      ? `- **Backend:** an ASP.NET Core API through ${code("@tsazor/dotnet")}; ${code("npm run api")} regenerates the typed client in ` +
        `${code("src/api")} from its OpenAPI document. A call returns a result (${code("ok")}, ${code("body")}, ${code("problem")}, ` +
        `${code("validationErrors")}); it doesn't throw for an error status.`
      : `- **Backend:** none yet. For ASP.NET Core, ${code("@tsazor/dotnet")} generates a typed client from the OpenAPI document.`,
  ];
  return template.replaceAll("%APP_NAME%", options.name).replace("%APP_SETUP%", lines.join("\n"));
}

function readme(options: ScaffoldOptions): string {
  const library = options.library
    ? `\n## Component library\n\nThe app uses \`${options.library.name}\`: \`@using ${options.library.name}\` in \`src/_Imports.tsazor\`` +
      (options.library.setup ? ", its setup in `src/Program.ts` and `src/Layout/MainLayout.tsazor`" : "") +
      ". Its components work in every `.tsazor` file; see the library's documentation.\n"
    : "";
  const dotnet = options.dotnet
    ? "\n## Backend\n\n`npm run api` generates a typed client from the OpenAPI document of your ASP.NET Core backend into\n`src/api` (`@tsazor/dotnet`). Adjust the URL in `package.json` to your backend.\n"
    : "";
  return `# ${options.name}

A [Tsazor](https://github.com/tsazor/tsazor) app: Razor components in strict TypeScript.

| Command | |
|---|---|
| \`npm run dev\` | the dev server with hot reload |
| \`npm test\` | the tests (Vitest, \`@tsazor/testing\`) |
| \`npm run build\` | \`tsazor check\` and the production build into \`dist/\` |
| \`npm run preview\` | serves the production build |

The structure is that of \`dotnet new blazorwasm\`: \`src/Program.ts\` starts the app, \`src/App.tsazor\` routes,
\`src/Layout\` holds the layout and the nav menu, \`src/Pages\` the pages. Install the Tsazor extension for
VS Code when it asks: it brings completion, diagnostics and navigation for \`.tsazor\` files.
${library}${dotnet}`;
}
