import { compile } from "@tsazor/compiler";
import { buildPackageManifest, collectImports, componentTypeDeclarations, createFileContext, resolutionOptions } from "@tsazor/workspace";
import { transformSync } from "esbuild";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const packageDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const srcDir = path.join(packageDir, "src");
const distDir = path.join(packageDir, "dist");

interface CompileError {
  file: string;
  details: string;
}

const errors: CompileError[] = [];
const exports: string[] = [];
const cssChunks: string[] = [];

// A running dev server keeps reading dist while it is rebuilt: files are overwritten in place, and only the ones
// this build didn't write are removed at the end. (Removing dist first left a dev server reading missing files and
// caching the errors — L7.)
const buildStart = Date.now();
await mkdir(distDir, { recursive: true });

// Design tokens ship first in fluent.css (component sidecars consume them).
try {
  const stylesDir = path.join(srcDir, "styles");
  for (const name of (await readdir(stylesDir)).filter((n) => n.endsWith(".css")).sort()) {
    cssChunks.push(`/* ${name} */\n` + (await readFile(path.join(stylesDir, name), "utf8")));
  }
} catch {
  throw new Error("[tsazor/fluent] src/styles/tokens.css is required (the token layer ships in fluent.css).");
}

/** Compiled for the components that use them, not exported (DataGrid's Defer). */
const INTERNAL: ReadonlySet<string> = new Set(["Defer", "TreeViewNode", "ChipContent", "WizardStepHeader", "WizardFormLink"]);

/** Extra export names (the shared vocabulary): Bootstrap's names for the menu button and the form. */
const ALIASES: Readonly<Record<string, string>> = { Dropdown: "Menu", DropdownItem: "MenuItem", Form: "FluentForm", MultiSplitter: "Splitter", MultiSplitterPane: "SplitterPane" };

const files = (await readdir(srcDir)).filter((name) => name.endsWith(".tsazor") && name !== "_Imports.tsazor").sort();

for (const file of files) {
  const filePath = path.join(srcDir, file);
  const className = path.basename(file, ".tsazor");
  try {
    const source = await readFile(filePath, "utf8");
    const sidecar = await readFile(`${filePath}.css`, "utf8").catch(() => null);
    if (sidecar) cssChunks.push(`/* ${className} (.tsazor.css) */\n${sidecar}`);

    const chain = await collectImports(srcDir, packageDir);
    const context = createFileContext(filePath, chain);

    // Same resolution as the Vite plugin: explicit @imports (own + inherited
    // from _Imports.tsazor), tags and @inject types resolved strictly.
    const compiled = compile(source, { ...resolutionOptions(context), generateSourceMap: false });
    const layerErrors = chain.layers.flatMap((layer) =>
      layer.diagnostics.filter((d) => d.severity === "error").map((d) => ({ ...d, message: `${layer.file}: ${d.message}` })),
    );

    const diagnostics = [...layerErrors, ...compiled.diagnostics.all.filter((d) => d.severity === "error")];
    if (diagnostics.length > 0) {
      errors.push({
        file,
        details: diagnostics.map((d) => `  ${d.code} (${d.pos.line}:${d.pos.column}): ${d.message}`).join("\n"),
      });
      continue;
    }

    const transpiled = transformSync(compiled.code, {
      loader: "ts",
      sourcefile: filePath,
      // Same emit as the Vite plugin: standard decorators, lowered.
      supported: { decorators: false },
      tsconfigRaw: { compilerOptions: { target: "es2022" } },
    });

    // Shared imports point at module sources (components, plain .ts helpers);
    // the built library ships compiled .js siblings, so rewrite the specifiers:
    // `./Alert.tsazor` -> `./Alert.js`, `./ids` -> `./ids.js`, `./x.ts` -> `./x.js`.
    const js = transpiled.code.replace(/(from\s*")(\.\.?\/[^"]*)(")/g, (_, from: string, spec: string, quote: string) => {
      if (spec.endsWith(".tsazor")) return `${from}${spec.slice(0, -".tsazor".length)}.js${quote}`;
      if (spec.endsWith(".ts")) return `${from}${spec.slice(0, -".ts".length)}.js${quote}`;
      return `${from}${spec}.js${quote}`;
    });
    await writeFile(path.join(distDir, `${className}.js`), js);
    if (!INTERNAL.has(className)) exports.push(`export { default as ${className} } from "./${className}.js"`);
  } catch (error) {
    errors.push({ file, details: `  ${error instanceof Error ? error.stack : String(error)}` });
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[tsazor/fluent] compile errors in ${error.file}\n${error.details}`);
  }
  process.exit(1);
}

// Shared plain-TS helpers (attributes/ids/form-state/datagrid) that compiled
// components import: transpile them beside the components so the dist imports
// ("./ids") resolve without the sources.
for (const name of (await readdir(srcDir)).filter((name) => name.endsWith(".ts")).sort()) {
  const source = await readFile(path.join(srcDir, name), "utf8");
  const transpiled = transformSync(source, {
    loader: "ts",
    sourcefile: path.join(srcDir, name),
    tsconfigRaw: { compilerOptions: { target: "es2022" } },
  });
  await writeFile(path.join(distDir, `${name.slice(0, -".ts".length)}.js`), transpiled.code);
}

// Parameter metadata of every component (roadmap 2.1): consumers (tag
// completion, codegen) read it instead of re-parsing the sources —
// package.json `tsazor.components` points here.
const manifest = buildPackageManifest({
  packageDir,
  packageName: "@tsazor/fluent",
  entries: [
    ...files.filter((file) => !INTERNAL.has(path.basename(file, ".tsazor"))).map((file) => ({ exportName: path.basename(file, ".tsazor"), file: path.join(srcDir, file) })),
    ...Object.entries(ALIASES).map(([alias, target]) => ({ exportName: alias, file: path.join(srcDir, `${target}.tsazor`) })),
  ],
});
await writeFile(path.join(distDir, "tsazor-components.json"), `${JSON.stringify(manifest, null, 2)}\n`);

// Real per-component type declarations (2.4, replacement for the permissive
// `export const X: any` stubs): parameters typed and documented from the
// manifest, `@inherits` base with its type arguments — editors and plain tsc
// see real classes.
const declarations = componentTypeDeclarations(manifest, { packageDir, declarationDir: distDir });
for (const [exportName, declaration] of Object.entries(declarations)) {
  await writeFile(path.join(distDir, `${exportName}.d.ts`), declaration);
}
// The toast service comes with the skin: register it, inject it, call show() (as in @tsazor/bootstrap).
exports.push('export { Toaster } from "@tsazor/ui"');
// An app's own icons (`icon(name, svg)`), so it needs no other package for them.
exports.push('export { icon } from "@tsazor/ui"');
// The DataGrid's sorting and paging state come with the skin too.
exports.push('export { GridSort, PaginationState } from "@tsazor/ui"');
// FileUpload's uploader (`uploadTo(url)`) and file sizes.
exports.push('export { formatFileSize, uploadFile, uploadTo } from "@tsazor/ui"');
// Plain helpers the package exports besides its components.
exports.push('export { tooltip } from "./tooltip-attachment.js"');
// What an Autocomplete's onOptionsSearch handler gets.
exports.push('export { OptionsSearchEventArgs } from "./autocomplete-search.js"');
// The services the components use, in one call (package.json `tsazor.setup` names it).
exports.push('export { addFluent } from "./services.js"');
for (const [alias, target] of Object.entries(ALIASES)) exports.push(`export { default as ${alias} } from "./${target}.js"`);
const index = `${exports.map((line) => `${line};`).join("\n")}\n`;
// index.d.ts mirrors index.js — the type half of each re-export reads the
// sibling `.d.ts` written above.
await writeFile(path.join(distDir, "index.js"), index);
// The shared vocabulary types come with the skin: `@import type { Intent } from "@tsazor/fluent"`.
await writeFile(path.join(distDir, "index.d.ts"), `${index}export type { Appearance, CalendarDay, CalendarLabels, CalendarSelectMode, CalendarView, ColumnAlign, FileUploadErrorEventArgs, FileUploadEventArgs, FileUploadLabels, FileUploadMode, FileUploader, GridColumn, GridItemsProvider, GridItemsProviderRequest, GridItemsProviderResult, HourCycle, IconValue, Intent, IsoDate, IsoTime, Orientation, OverlayCloseMode, Placement, ProgressFileDetails, SelectionMode, Size, SortableListEventArgs, SortableListLabels, SortDirection, SortedProperty, ToastOptions, TreeViewItem } from "@tsazor/ui";\n`);
// The plain helpers' declarations (they are transpiled without .d.ts).
await writeFile(
  path.join(distDir, "tooltip-attachment.d.ts"),
  `import type { Attachment } from "@tsazor/runtime";\nimport type { Placement } from "@tsazor/ui";\n/** A Fluent tooltip on any element: \`<button @attach="tooltip('Save')">\`; the same text gives the same attachment. */\nexport declare function tooltip(text: string, placement?: Placement): Attachment<HTMLElement>;\n`,
);
await writeFile(
  path.join(distDir, "autocomplete-search.d.ts"),
  [
    "/** What an Autocomplete's `onOptionsSearch` handler gets: the text; the handler sets `items`. `signal` aborts when a newer search starts. */",
    "export declare class OptionsSearchEventArgs<TOption> {",
    "  /** The options to show; set by the handler. */",
    "  items: readonly TOption[];",
    "  /** What the user typed. */",
    "  readonly text: string;",
    "  /** Aborts when a newer search starts. */",
    "  readonly signal: AbortSignal;",
    "  constructor(text: string, signal: AbortSignal);",
    "}",
    "",
  ].join("\n"),
);
await writeFile(
  path.join(distDir, "services.d.ts"),
  'import type { ServiceCollection } from "@tsazor/runtime";\n/** Registers the services the Fluent components use (the `Toaster`): `createTsazorApp({ services: addFluent })`. */\nexport declare function addFluent(services: ServiceCollection): void;\n',
);
await writeFile(path.join(distDir, "fluent.css"), `${cssChunks.join("\n")}\n`);

console.log(`[tsazor/fluent] built ${files.length} components + fluent.css -> dist/`);

/** Removes what an earlier build wrote and this one didn't (a component renamed or deleted). */
async function removeStale(dir: string, since: number): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await removeStale(file, since);
    else if ((await stat(file)).mtimeMs < since) await rm(file);
  }
}
await removeStale(distDir, buildStart);
