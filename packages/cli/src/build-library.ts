/**
 * `buildLibrary` (and `tsazor build-lib`): a component library's build, as an app's — the sources type-checked first
 * (`tsazor check`), then, as the Vite plugin compiles an app, each
 * `src/*.tsazor` through the compiler with the workspace's resolution, its standard decorators lowered; the plain
 * `.ts` helpers beside them; the component manifest (`tsazor-components.json`) and a declaration per component; the
 * index; and, if asked for, one stylesheet of the shared styles and the components' sidecars. esbuild's decorator
 * helpers go once into `_decorators.js`, which the components import (a copy per component was half their size). docs/component-libraries.md
 * describes the package around it.
 */
import { compactFieldDecorators, compile, DECORATOR_HELPER_PROBE, shareHelpers, sharedHelperModule } from "@tsazor/compiler";
import { checkProject } from "@tsazor/lsp";
import { buildPackageManifest, collectImports, componentTypeDeclarations, createFileContext, resolutionOptions } from "@tsazor/workspace";
import { transformSync } from "esbuild";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

/** What `buildLibrary` builds, and how. Every path is relative to `packageDir`. */
export interface BuildLibraryOptions {
  /** The package's directory, with its package.json. Default: the current directory. */
  packageDir?: string;
  /** The sources: each `*.tsazor` but `_Imports.tsazor` is a component, each `*.ts` a helper. Default: `src`. */
  srcDir?: string;
  /** The output. Default: `dist`. */
  outDir?: string;
  /** Components compiled for the others but not exported (a DataGrid's row part). */
  internal?: readonly string[];
  /** More names for components: `{ Modal: "Dialog" }` exports Dialog as Modal too. */
  aliases?: Readonly<Record<string, string>>;
  /** Index statements besides the components: `export { addMyLib } from "./services.js"`. */
  exports?: readonly string[];
  /** Index statements of the declarations only: `export type { Intent } from "@tsazor/ui"`. */
  typeExports?: readonly string[];
  /**
   * Packages whose types the components' parameters and methods name, re-exported from the index as types — an app
   * imports `Intent` from the library, not from its dependency. Names `exports` already exports are left out.
   */
  reexportTypes?: readonly string[];
  /**
   * Declarations written as given (file name → text), over what the build derived: a helper whose declaration
   * TypeScript can't derive from its file alone (a return type it would have to infer).
   */
  declarations?: Readonly<Record<string, string>>;
  /**
   * One stylesheet of the library in the output: `src/styles/*.css` first, then each component's sidecar
   * (`X.tsazor.css`), under `header` (a comment). Without it the sidecars stay unjoined.
   */
  stylesheet?: { readonly file: string; readonly header?: string };
  /**
   * Type-checks the sources first, as `tsazor check` (and an app's build) does: an error stops the build. The
   * package needs a strict tsconfig.json for it. Default: true.
   */
  check?: boolean;
  /** Where the build reports. Default: the console. */
  log?: (line: string) => void;
}

/** What a build did. With errors, nothing but the components that compiled was written. */
export interface BuildLibraryResult {
  /** The exported components, aliases included. */
  readonly components: readonly string[];
  /** A component that didn't type-check or compile: its file and the errors. */
  readonly errors: readonly { readonly file: string; readonly message: string }[];
}

/** Builds a component library: `await buildLibrary({ stylesheet: { file: "my-lib.css" } })` in its build script. */
export async function buildLibrary(options: BuildLibraryOptions = {}): Promise<BuildLibraryResult> {
  const packageDir = path.resolve(options.packageDir ?? ".");
  const srcDir = path.resolve(packageDir, options.srcDir ?? "src");
  const outDir = path.resolve(packageDir, options.outDir ?? "dist");
  const log = options.log ?? ((line: string) => console.log(line));
  const packageName = (JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8")) as { name?: string }).name ?? path.basename(packageDir);
  const internal = new Set(options.internal ?? []);
  const aliases = options.aliases ?? {};

  if (options.check !== false) {
    const checked = await checkProject(srcDir);
    const shown = (file: string) => path.relative(packageDir, file).replace(/\\/g, "/");
    for (const d of checked.diagnostics) log(`${shown(d.file)}(${d.line},${d.column}) ${d.code} ${d.message}`);
    const failed = checked.diagnostics.filter((d) => d.severity === "error");
    if (failed.length > 0) {
      log(`[${packageName}] tsazor check: ${failed.length} error(s) — nothing was built`);
      return { components: [], errors: failed.map((d) => ({ file: shown(d.file), message: `  ${d.code} (${d.line}:${d.column}): ${d.message}` })) };
    }
  }

  // A running dev server keeps reading the output while it is rebuilt: files are overwritten in place, and only the
  // ones this build didn't write are removed at the end — known by name, not by time (a clock that stepped back
  // mid-build, as WSL's does when it syncs, made an mtime test remove what the build had just written).
  const written = new Set<string>();
  const emit = async (file: string, text: string): Promise<void> => {
    const target = path.join(outDir, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
    written.add(target);
  };
  await mkdir(outDir, { recursive: true });

  const files = (await readdir(srcDir)).filter((name) => name.endsWith(".tsazor") && name !== "_Imports.tsazor").sort();
  // A component in a subfolder was left out of `dist` without a word: the build says so instead.
  const nested = await nestedComponents(srcDir);
  if (nested.length > 0) {
    const nestedErrors = nested.map((file) => ({ file, message: "  a component in a subfolder is not built: a library's components live at the top level of its src/ (subfolders hold the .ts helpers)" }));
    for (const error of nestedErrors) log(`[${packageName}] ${error.file}
${error.message}`);
    return { components: [], errors: nestedErrors };
  }
  const chain = await collectImports(srcDir, packageDir);
  const layerErrors = chain.layers.flatMap((layer) =>
    layer.diagnostics.filter((d) => d.severity === "error").map((d) => `  ${d.code} (${d.pos.line}:${d.pos.column}): ${layer.file}: ${d.message}`),
  );
  // esbuild's decorator helpers, from a probe transformed as the components are: one module the components import.
  const helpers = sharedHelperModule(transformSync(DECORATOR_HELPER_PROBE, COMPONENT_TRANSFORM).code);
  await emit("_decorators.js", helpers.code);
  const errors: { file: string; message: string }[] = [];
  const sidecars: string[] = [];
  const exported: string[] = [];
  for (const file of files) {
    const filePath = path.join(srcDir, file);
    const className = path.basename(file, ".tsazor");
    try {
      const sidecar = await readFile(`${filePath}.css`, "utf8").catch(() => null);
      if (sidecar !== null) sidecars.push(`/* ${className} (.tsazor.css) */\n${sidecar}`);
      // The Vite plugin's resolution: explicit @imports (own and inherited from _Imports.tsazor), tags and @inject
      // types resolved strictly.
      const compiled = compile(await readFile(filePath, "utf8"), { ...resolutionOptions(createFileContext(filePath, chain)), generateSourceMap: false });
      const fileErrors = [
        ...layerErrors,
        ...compiled.diagnostics.all.filter((d) => d.severity === "error").map((d) => `  ${d.code} (${d.pos.line}:${d.pos.column}): ${d.message}`),
      ];
      if (fileErrors.length > 0) {
        errors.push({ file, message: fileErrors.join("\n") });
        continue;
      }
      // Tsazor's field decorators applied after the class (`decorateFields`), as an app's build does.
      const transpiled = transformSync(compactFieldDecorators(packageRelativeSources(compiled.code, packageDir), filePath), { ...COMPONENT_TRANSFORM, sourcefile: filePath });
      await emit(`${className}.js`, builtSpecifiers(shareHelpers(transpiled.code, helpers, "./_decorators"), srcDir));
      if (!internal.has(className)) exported.push(className);
    } catch (error) {
      errors.push({ file, message: `  ${error instanceof Error ? (error.stack ?? error.message) : String(error)}` });
    }
  }
  if (errors.length > 0) {
    for (const error of errors) log(`[${packageName}] compile errors in ${error.file}\n${error.message}`);
    return { components: [], errors };
  }

  // The helpers the components import, beside them, with the declarations TypeScript derives from each file alone
  // — compiled as the components are: registering field decorators (@Required(), …) compacted first, the rest
  // lowered by esbuild (supported.decorators: false does that; the plain ts transform passed decorators through raw,
  // which the browser rejects: a template's model module was invalid syntax in the dev server).
  // Subfolders included (`base/`, `utilities/`, `enums/`): each helper lands at its own path in `dist`.
  for (const name of await helperSources(srcDir)) {
    const sourceFile = path.join(srcDir, name);
    const source = await readFile(sourceFile, "utf8");
    const stem = name.slice(0, -".ts".length);
    const toRoot = path.posix.relative(path.posix.dirname(name), ".") || ".";
    const transpiled = transformSync(compactFieldDecorators(source, name), { ...COMPONENT_TRANSFORM, sourcefile: sourceFile });
    await emit(`${stem}.js`, builtSpecifiers(shareHelpers(transpiled.code, helpers, `${toRoot}/_decorators`), path.dirname(sourceFile)));
    const declaration = ts.transpileDeclaration(source, { fileName: name, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    if ((declaration.diagnostics ?? []).length === 0) await emit(`${stem}.d.ts`, declaration.outputText);
  }

  // The parameters of every component: editors and `tsazor check` read them instead of the sources (package.json
  // `tsazor.components` points here), and a declaration per component is written from them.
  const manifest = buildPackageManifest({
    packageDir,
    packageName,
    entries: [
      ...exported.map((name) => ({ exportName: name, file: path.join(srcDir, `${name}.tsazor`) })),
      ...Object.entries(aliases).map(([alias, target]) => ({ exportName: alias, file: path.join(srcDir, `${target}.tsazor`) })),
    ],
  });
  await emit("tsazor-components.json", `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [exportName, declaration] of Object.entries(componentTypeDeclarations(manifest, { packageDir, declarationDir: outDir }))) {
    await emit(`${exportName}.d.ts`, declaration);
  }
  for (const [file, text] of Object.entries(options.declarations ?? {})) await emit(file, text);

  // index.d.ts mirrors index.js: the type half of each re-export reads the sibling declaration.
  const index = [
    ...exported.map((name) => `export { default as ${name} } from "./${name}.js"`),
    ...(options.exports ?? []),
    ...Object.entries(aliases).map(([alias, target]) => `export { default as ${alias} } from "./${target}.js"`),
  ].map(statement);
  await emit("index.js", `${index.join("\n")}\n`);
  await emit("index.d.ts", `${[...index, ...referencedTypeExports(manifest, options), ...(options.typeExports ?? []).map(statement)].join("\n")}\n`);

  if (options.stylesheet !== undefined) {
    const styles: string[] = [];
    const stylesDir = path.join(srcDir, "styles");
    const shared = await readdir(stylesDir).catch(() => [] as string[]);
    for (const name of shared.filter((name) => name.endsWith(".css")).sort()) {
      styles.push(`/* ${name} */\n${await readFile(path.join(stylesDir, name), "utf8")}`);
    }
    const header = options.stylesheet.header === undefined ? [] : [options.stylesheet.header];
    await emit(options.stylesheet.file, `${[...header, ...styles, ...sidecars].join("\n")}\n`);
  }

  await removeStale(outDir, written);
  const components = [...exported, ...Object.keys(aliases)];
  log(`[${packageName}] built ${files.length} component(s) -> ${path.relative(packageDir, outDir).replace(/\\/g, "/")}/`);
  return { components, errors: [] };
}

/** `reexportTypes`: one `export type` statement per package, of the names the components' signatures import from it. */
function referencedTypeExports(manifest: ReturnType<typeof buildPackageManifest>, options: BuildLibraryOptions): string[] {
  const packages = options.reexportTypes ?? [];
  if (packages.length === 0) return [];
  const exported = new Set(
    [...(options.exports ?? []), ...(options.typeExports ?? [])].flatMap((line) => /\{([^}]*)\}/.exec(line)?.[1]?.split(",").map((name) => name.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()!) ?? []),
  );
  const names = new Map<string, Set<string>>(packages.map((name) => [name, new Set<string>()]));
  for (const component of Object.values(manifest.components)) {
    for (const member of [...component.parameters, ...(component.methods ?? [])]) {
      for (const reference of member.references ?? []) {
        if (reference.kind !== "import" || reference.specifier === undefined) continue;
        const imported = reference.imported ?? reference.name;
        if (imported === "default" || imported === "*" || exported.has(imported)) continue;
        names.get(reference.specifier)?.add(imported);
      }
    }
  }
  return [...names].filter(([, set]) => set.size > 0).map(([name, set]) => `export type { ${[...set].sort().join(", ")} } from "${name}";`);
}

/** How a compiled component becomes JS: standard decorators lowered, the Vite plugin's emit for an app. */
const COMPONENT_TRANSFORM = { loader: "ts", supported: { decorators: false }, tsconfigRaw: { compilerOptions: { target: "es2022" } } } as const;

/** A built module's relative imports point at the built siblings: `./Tab.tsazor`, `./ids` and `./x.ts` → `./….js`. */
/**
 * The relative specifiers of a built module, as the files in `dist` are named: `.tsazor` and `.ts` become `.js`, a
 * specifier that names its file already (`./x.js`, NodeNext's form) stays, a folder (`./enums`) is its `index.js`,
 * and a bare name gets `.js`. `fromDir` is the source module's folder.
 */
function builtSpecifiers(code: string, fromDir: string): string {
  return code.replace(/(from\s*")(\.\.?\/[^"]*)(")/g, (_, from: string, specifier: string, quote: string) => {
    if (specifier.endsWith(".tsazor")) return `${from}${specifier.slice(0, -".tsazor".length)}.js${quote}`;
    if (specifier.endsWith(".ts")) return `${from}${specifier.slice(0, -".ts".length)}.js${quote}`;
    if (/\.(m|c)?js$|\.json$|\.css$/.test(specifier)) return `${from}${specifier}${quote}`;
    const target = path.resolve(fromDir, specifier);
    if (!existsSync(`${target}.ts`) && !existsSync(`${target}.tsazor`) && existsSync(path.join(target, "index.ts"))) {
      return `${from}${specifier}/index.js${quote}`;
    }
    return `${from}${specifier}.js${quote}`;
  });
}

/** The `.ts` sources below `dir` (subfolders included, no declarations), as paths relative to it. */
async function helperSources(dir: string, prefix = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") found.push(...(await helperSources(path.join(dir, entry.name), `${prefix}${entry.name}/`)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      found.push(`${prefix}${entry.name}`);
    }
  }
  return found;
}

/** The `.tsazor` components in subfolders of `dir`: a library's components live at its top level. */
async function nestedComponents(dir: string, prefix = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules") continue;
    const sub = path.join(dir, entry.name);
    for (const name of await readdir(sub)) {
      if (name.endsWith(".tsazor") && name !== "_Imports.tsazor") found.push(`${prefix}${entry.name}/${name}`);
    }
    found.push(...(await nestedComponents(sub, `${prefix}${entry.name}/`)));
  }
  return found.sort();
}

/** The compiler's `@code (file:line)` comments name the source from the package: no build machine's path in `dist`. */
function packageRelativeSources(code: string, packageDir: string): string {
  return code.replace(/\/\* @code \((.+?):(\d+)\) \*\//g, (_, file: string, line: string) => `/* @code (${path.relative(packageDir, file).replace(/\\/g, "/")}:${line}) */`);
}

function statement(line: string): string {
  return line.trimEnd().endsWith(";") ? line.trimEnd() : `${line.trimEnd()};`;
}

/** Removes what an earlier build wrote and this one didn't (a component renamed or deleted). */
async function removeStale(dir: string, written: ReadonlySet<string>): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await removeStale(file, written);
    else if (!written.has(file)) await rm(file);
  }
}
