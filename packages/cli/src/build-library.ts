/**
 * `buildLibrary` (and `tsazor build-lib`): a component library's build, as an app's — the sources type-checked first
 * (`tsazor check`), then, as the Vite plugin compiles an app, each
 * `.tsazor` below `src/` (at the same path in `dist`) through the compiler with the workspace's resolution, its
 * standard decorators lowered; the plain
 * `.ts` helpers beside them; the component manifest (`tsazor-components.json`) and a declaration per component; the
 * index; and, if asked for, one stylesheet of the shared styles and the components' sidecars. esbuild's decorator
 * helpers go once into `_decorators.js`, which the components import (a copy per component was half their size). docs/component-libraries.md
 * describes the package around it.
 */
import { compactFieldDecorators, compile, DECORATOR_HELPER_PROBE, shareHelpers, sharedHelperModule } from "@tsazor/compiler";
import { checkProject, emitDeclarations } from "@tsazor/lsp";
import { buildPackageManifest, collectImports, componentTypeDeclarations, createFileContext, importKindOf, resolutionOptions } from "@tsazor/workspace";
import { transformSync } from "esbuild";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

/** What `buildLibrary` builds, and how. Every path is relative to `packageDir`. */
export interface BuildLibraryOptions {
  /** The package's directory, with its package.json. Default: the current directory. */
  packageDir?: string;
  /**
   * The sources: each `*.tsazor` but `_Imports.tsazor` is a component, each `*.ts` a helper — at any depth, built at
   * the same path in the output; two components of one name are an error (a tag finds a component by its name).
   * Default: `src`.
   */
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
  const packageJson = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8")) as { name?: string; tsazor?: { components?: unknown } };
  const packageName = packageJson.name ?? path.basename(packageDir);
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
  const releaseLock = await acquireBuildLock(outDir);
  if (typeof releaseLock === "string") {
    const shownOut = `${path.relative(packageDir, outDir).split(path.sep).join("/")}/`;
    log(`[${packageName}] ${shownOut}\n${releaseLock}`);
    return { components: [], errors: [{ file: shownOut, message: releaseLock }] };
  }
  try {
    return await writeOutput();
  } finally {
    await releaseLock();
  }

  /** Everything the build writes, under the lock. */
  async function writeOutput(): Promise<BuildLibraryResult> {
    // The components at any depth (a library laid out as MudBlazor's, a folder per component): each builds at its path
    // in `dist`. A tag finds a component by its name, so a name is one component — two in different folders are an error.
    const files = await componentSources(srcDir);
    const byName = new Map<string, string[]>();
    for (const file of files) {
      const name = path.posix.basename(file, ".tsazor");
      byName.set(name, [...(byName.get(name) ?? []), file]);
    }
    const duplicates = [...byName].filter(([, paths]) => paths.length > 1);
    if (duplicates.length > 0) {
      const duplicateErrors = duplicates.map(([name, paths]) => ({
        file: paths.join(", "),
        message: `  two components named ${name}: a tag finds a component by its name, so a library has one of each name`,
      }));
      for (const error of duplicateErrors) log(`[${packageName}] ${error.file}\n${error.message}`);
      return { components: [], errors: duplicateErrors };
    }
    /** Each component's path below src/ without `.tsazor` (`forms/Field`), by name: its path in `dist` too. */
    const componentStem = new Map([...byName].map(([name, [file]]) => [name, file!.slice(0, -".tsazor".length)]));
    // Each folder's `_Imports.tsazor` chain, as the Vite plugin resolves a component in it.
    const chains = new Map<string, Awaited<ReturnType<typeof collectImports>>>();
    const chainFor = async (dir: string) => {
      let chain = chains.get(dir);
      if (chain === undefined) chains.set(dir, (chain = await collectImports(dir, packageDir)));
      return chain;
    };
    // esbuild's decorator helpers, from a probe transformed as the components are: one module the components import.
    const helpers = sharedHelperModule(transformSync(DECORATOR_HELPER_PROBE, COMPONENT_TRANSFORM).code);
    await emit("_decorators.js", helpers.code);
    const errors: { file: string; message: string }[] = [];
    const sidecars: string[] = [];
    const exported: string[] = [];
    for (const file of files) {
      const filePath = path.join(srcDir, file);
      const className = path.posix.basename(file, ".tsazor");
      const toRoot = path.posix.relative(path.posix.dirname(file), ".") || ".";
      try {
        const sidecar = await readFile(`${filePath}.css`, "utf8").catch(() => null);
        if (sidecar !== null) sidecars.push(`/* ${className} (.tsazor.css) */\n${sidecar}`);
        // The Vite plugin's resolution: explicit @imports (own and inherited from _Imports.tsazor), tags and @inject
        // types resolved strictly.
        const chain = await chainFor(path.dirname(filePath));
        const layerErrors = chain.layers.flatMap((layer) =>
          layer.diagnostics.filter((d) => d.severity === "error").map((d) => `  ${d.code} (${d.pos.line}:${d.pos.column}): ${layer.file}: ${d.message}`),
        );
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
        await emit(`${componentStem.get(className)!}.js`, builtSpecifiers(shareHelpers(transpiled.code, helpers, `${toRoot}/_decorators`), path.dirname(filePath)));
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
    const needsProgram: { sourceFile: string; stem: string }[] = [];
    for (const name of await helperSources(srcDir)) {
      const sourceFile = path.join(srcDir, name);
      const source = await readFile(sourceFile, "utf8");
      const stem = name.slice(0, -".ts".length);
      const toRoot = path.posix.relative(path.posix.dirname(name), ".") || ".";
      const transpiled = transformSync(compactFieldDecorators(source, name), { ...COMPONENT_TRANSFORM, sourcefile: sourceFile });
      await emit(`${stem}.js`, builtSpecifiers(shareHelpers(transpiled.code, helpers, `${toRoot}/_decorators`), path.dirname(sourceFile)));
      const declaration = ts.transpileDeclaration(source, { fileName: name, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
      // Its imports as the module's: `../Paper.tsazor` is `../Paper.js` in dist, where Paper.d.ts is.
      if ((declaration.diagnostics ?? []).length === 0) await emit(`${stem}.d.ts`, builtSpecifiers(declaration.outputText, path.dirname(sourceFile)));
      else if (options.declarations?.[`${stem}.d.ts`] === undefined) needsProgram.push({ sourceFile, stem });
    }
    // A declaration the file alone can't give (an unannotated return type, a shorthand property, a component's type
    // through `./X.tsazor`) comes from the program `tsazor check` builds, every component's shadow in view; one that
    // can't be given either is an error — it was left out without a word, and an app's import lost its types.
    if (needsProgram.length > 0) {
      const declarations = await emitDeclarations(srcDir, needsProgram.map((helper) => helper.sourceFile));
      const declarationErrors: { file: string; message: string }[] = [];
      for (const { sourceFile, stem } of needsProgram) {
        const declaration = declarations.get(sourceFile);
        if (declaration?.text !== undefined) {
          await emit(`${stem}.d.ts`, builtSpecifiers(declaration.text, path.dirname(sourceFile)));
        } else {
          declarationErrors.push({
            file: path.relative(srcDir, sourceFile).replace(/\\/g, "/"),
            message: `  no declaration: ${(declaration?.errors ?? []).join("; ")} — annotate the exported types, or give the declaration with \`declarations\``,
          });
        }
      }
      if (declarationErrors.length > 0) {
        for (const error of declarationErrors) log(`[${packageName}] ${error.file}\n${error.message}`);
        return { components: [], errors: declarationErrors };
      }
    }

    // A hand-written component — `src/<Name>.ts` exporting its component class `<Name>`, file and class one name as
    // for a .tsazor — joins the manifest and the index like a compiled one (a Radzen port's F16/F18: its parameters
    // were unknown to every consumer, TZS026, and the index had no type for it). Its declaration is tsc's.
    const handWritten = new Map<string, "named" | "default">();
    for (const name of (await readdir(srcDir)).filter((name) => /^[A-Z]\w*\.ts$/.test(name))) {
      const stem = name.slice(0, -".ts".length);
      const kind = importKindOf(path.join(srcDir, name), stem);
      if (kind !== undefined && !componentStem.has(stem)) handWritten.set(stem, kind);
    }
    /** A compiled component's (or an alias's target's) path below src/ and in dist, without extension. */
    const stemOf = (name: string): string => componentStem.get(name) ?? componentStem.get(aliases[name] ?? "") ?? aliases[name] ?? name;

    // The parameters of every component: editors and `tsazor check` read them instead of the sources (package.json
    // `tsazor.components` points here), and a declaration per component is written from them.
    const manifest = buildPackageManifest({
      packageDir,
      packageName,
      entries: [
        ...exported.map((name) => ({ exportName: name, file: path.join(srcDir, `${stemOf(name)}.tsazor`) })),
        ...[...handWritten].filter(([name]) => !internal.has(name)).map(([name, kind]) => ({ exportName: name, file: path.join(srcDir, `${name}.ts`), localExport: kind === "named" ? name : "default" })),
        ...Object.keys(aliases).map((alias) => ({ exportName: alias, file: path.join(srcDir, `${stemOf(alias)}.tsazor`) })),
      ],
    });
    await emit("tsazor-components.json", `${JSON.stringify(manifest, null, 2)}\n`);
    const handWrittenComponents = [...handWritten].filter(([name]) => manifest.components[name] !== undefined);
    // `dist` mirrors `src`: a specifier a component wrote reaches the same module there, as built (`./base/x.js`,
    // `./Menu.js`) — not rebased to `dist`, which pointed back into `src/`. Each declaration lands in its component's
    // folder (an alias's in its target's).
    for (const [exportName, declaration] of Object.entries(componentTypeDeclarations(manifest, { packageDir }))) {
      if (handWritten.has(exportName)) continue;
      const dir = path.posix.dirname(stemOf(exportName));
      await emit(`${dir === "." ? "" : `${dir}/`}${exportName}.d.ts`, builtSpecifiers(declaration, path.join(srcDir, dir)));
    }
    for (const [file, text] of Object.entries(options.declarations ?? {})) await emit(file, text);

    // index.d.ts mirrors index.js: the type half of each re-export reads the sibling declaration. A name `exports`
    // exports itself isn't exported a second time (a duplicate export is a module that doesn't load).
    const explicit = exportedNames(options.exports ?? []);
    const index = [
      ...exported.filter((name) => !explicit.has(name)).map((name) => `export { default as ${name} } from "./${stemOf(name)}.js"`),
      ...handWrittenComponents.filter(([name]) => !explicit.has(name)).map(([name, kind]) => (kind === "named" ? `export { ${name} } from "./${name}.js"` : `export { default as ${name} } from "./${name}.js"`)),
      ...(options.exports ?? []),
      ...Object.keys(aliases).filter((alias) => !explicit.has(alias)).map((alias) => `export { default as ${alias} } from "./${stemOf(alias)}.js"`),
    ].map(statement);
    const typeIndex = [...index, ...referencedTypeExports(manifest, options), ...(options.typeExports ?? []).map(statement)];
    // Each relative export names a file the build wrote — a wrong path built green and failed in the consuming app.
    const unbuilt = [...unbuiltTargets(index, outDir, written, ".js"), ...unbuiltTargets(typeIndex, outDir, written, ".d.ts")];
    if (unbuilt.length > 0) {
      for (const error of unbuilt) log(`[${packageName}] ${error.file}\n${error.message}`);
      return { components: [], errors: unbuilt };
    }
    await emit("index.js", `${index.join("\n")}\n`);
    await emit("index.d.ts", `${typeIndex.join("\n")}\n`);

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
    const components = [...exported, ...handWrittenComponents.map(([name]) => name), ...Object.keys(aliases)];
    log(`[${packageName}] built ${files.length} component(s) -> ${path.relative(packageDir, outDir).replace(/\\/g, "/")}/`);
    // Without the pointer an app reads none of the components' parameters (TZS026 on every attribute). One that
    // points elsewhere is the package's choice: a second build (a package's templates) writes a second manifest.
    if (typeof packageJson.tsazor?.components !== "string") {
      const manifestPath = path.relative(packageDir, path.join(outDir, "tsazor-components.json")).replace(/\\/g, "/");
      log(
        `[${packageName}] warning: package.json has no "tsazor": { "components": … } pointing at ${manifestPath} — an app that ` +
          `installs the library reads none of its components' parameters (TZS026). Add "tsazor": { "components": "${manifestPath}" }.`,
      );
    }
    return { components, errors: [] };
  }
}

/** The names export statements export: `export { a, b as c } from "…"` exports `a` and `c`. */
function exportedNames(statements: readonly string[]): Set<string> {
  return new Set(
    statements.flatMap((line) => /\{([^}]*)\}/.exec(line)?.[1]?.split(",").map((name) => name.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()!).filter((name) => name !== "") ?? []),
  );
}

/**
 * The index statements whose relative specifier names no file this build wrote: `./x.js` is `x.js` in `outDir` (with
 * `extension` ".d.ts": `x.d.ts`).
 */
function unbuiltTargets(statements: readonly string[], outDir: string, written: ReadonlySet<string>, extension: ".js" | ".d.ts"): { file: string; message: string }[] {
  const indexFile = extension === ".js" ? "index.js" : "index.d.ts";
  const errors: { file: string; message: string }[] = [];
  for (const line of statements) {
    const specifier = /from\s*"(\.\.?\/[^"]*)"/.exec(line)?.[1];
    if (specifier === undefined) continue;
    const target = path.join(outDir, extension === ".js" ? specifier : specifier.replace(/\.js$/, ".d.ts"));
    if (!written.has(target)) {
      const built = path.relative(path.dirname(outDir), target).replace(/\\/g, "/");
      const declarationHint = extension === ".d.ts" && written.has(path.join(outDir, specifier)) ? " (the module is built, its declaration isn't: TypeScript couldn't derive it from the file alone — give it with `declarations`)" : "";
      errors.push({ file: indexFile, message: `  ${line}\n  exports from '${specifier}', but the build wrote no ${built}${declarationHint}` });
    }
  }
  return errors;
}

/** `reexportTypes`: one `export type` statement per package, of the names the components' signatures import from it. */
function referencedTypeExports(manifest: ReturnType<typeof buildPackageManifest>, options: BuildLibraryOptions): string[] {
  const packages = options.reexportTypes ?? [];
  if (packages.length === 0) return [];
  const exported = exportedNames([...(options.exports ?? []), ...(options.typeExports ?? [])]);
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
  // The specifiers TypeScript's scanner finds — imports, re-exports, `import("…")` types — not text in a comment (a
  // JSDoc example was rewritten). Back to front, so the positions hold.
  const specifiers = ts.preProcessFile(code, true, true).importedFiles.filter((file) => /^\.\.?\//.test(file.fileName));
  let built = code;
  for (const { fileName, pos } of specifiers.reverse()) {
    const start = built[pos] === '"' || built[pos] === "'" ? pos + 1 : pos;
    built = `${built.slice(0, start)}${builtSpecifier(fileName, fromDir)}${built.slice(start + fileName.length)}`;
  }
  return built;
}

function builtSpecifier(specifier: string, fromDir: string): string {
  // A component's typed shadow, in a declaration TypeScript inferred from the program: the component's module.
  if (specifier.endsWith(".tsazor.gen")) return `${specifier.slice(0, -".tsazor.gen".length)}.js`;
  if (specifier.endsWith(".tsazor")) return `${specifier.slice(0, -".tsazor".length)}.js`;
  if (specifier.endsWith(".ts")) return `${specifier.slice(0, -".ts".length)}.js`;
  if (/\.(m|c)?js$|\.json$|\.css$/.test(specifier)) return specifier;
  const target = path.resolve(fromDir, specifier);
  if (!existsSync(`${target}.ts`) && !existsSync(`${target}.tsazor`) && existsSync(path.join(target, "index.ts"))) return `${specifier}/index.js`;
  return `${specifier}.js`;
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

/** The `.tsazor` components below `dir` (subfolders included, no `_Imports.tsazor`), as paths relative to it, sorted. */
async function componentSources(dir: string, prefix = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") found.push(...(await componentSources(path.join(dir, entry.name), `${prefix}${entry.name}/`)));
    } else if (entry.name.endsWith(".tsazor") && entry.name !== "_Imports.tsazor") {
      found.push(`${prefix}${entry.name}`);
    }
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
    else if (!written.has(file) && entry.name !== LOCK_FILE) await rm(file);
  }
}

const LOCK_FILE = ".tsazor-build.lock";

/**
 * One build at a time per output: two builds into one `dist` (an agent's and a person's) removed what the other had
 * just written. The lock is a file in `outDir` naming the build's process; one whose process is gone is taken over.
 * Returns its release, or why the build can't run.
 */
async function acquireBuildLock(outDir: string): Promise<(() => Promise<void>) | string> {
  const file = path.join(outDir, LOCK_FILE);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(file, `${process.pid}\n`, { flag: "wx" });
      return () => rm(file, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const pid = Number((await readFile(file, "utf8").catch(() => "")).trim());
      if (Number.isInteger(pid) && pid > 0 && processAlive(pid)) {
        return `  another build is writing this output (process ${pid}${pid === process.pid ? ", this one" : ""}) — one build at a time per output (${LOCK_FILE})`;
      }
      await rm(file, { force: true }); // Its process is gone: a build that crashed.
    }
  }
  return `  the build lock ${LOCK_FILE} couldn't be taken`;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
