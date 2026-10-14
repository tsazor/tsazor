/**
 * `buildLibrary` (and `tsazor build-lib`): a component library's build, as an app's — the sources type-checked first
 * (`tsazor check`), then, as the Vite plugin compiles an app, each
 * `src/*.tsazor` through the compiler with the workspace's resolution, its standard decorators lowered; the plain
 * `.ts` helpers beside them; the component manifest (`tsazor-components.json`) and a declaration per component; the
 * index; and, if asked for, one stylesheet of the shared styles and the components' sidecars. docs/component-libraries.md
 * describes the package around it.
 */
import { compile } from "@tsazor/compiler";
import { checkProject } from "@tsazor/lsp";
import { buildPackageManifest, collectImports, componentTypeDeclarations, createFileContext, resolutionOptions } from "@tsazor/workspace";
import { transformSync } from "esbuild";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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
  // ones this build didn't write are removed at the end.
  const buildStart = Date.now();
  await mkdir(outDir, { recursive: true });

  const files = (await readdir(srcDir)).filter((name) => name.endsWith(".tsazor") && name !== "_Imports.tsazor").sort();
  const chain = await collectImports(srcDir, packageDir);
  const layerErrors = chain.layers.flatMap((layer) =>
    layer.diagnostics.filter((d) => d.severity === "error").map((d) => `  ${d.code} (${d.pos.line}:${d.pos.column}): ${layer.file}: ${d.message}`),
  );
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
      const transpiled = transformSync(compiled.code, {
        loader: "ts",
        sourcefile: filePath,
        // Standard decorators, lowered: the Vite plugin's emit for an app.
        supported: { decorators: false },
        tsconfigRaw: { compilerOptions: { target: "es2022" } },
      });
      await writeFile(path.join(outDir, `${className}.js`), builtSpecifiers(transpiled.code));
      if (!internal.has(className)) exported.push(className);
    } catch (error) {
      errors.push({ file, message: `  ${error instanceof Error ? (error.stack ?? error.message) : String(error)}` });
    }
  }
  if (errors.length > 0) {
    for (const error of errors) log(`[${packageName}] compile errors in ${error.file}\n${error.message}`);
    return { components: [], errors };
  }

  // The helpers the components import, beside them, with the declarations TypeScript derives from each file alone.
  for (const name of (await readdir(srcDir)).filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts")).sort()) {
    const source = await readFile(path.join(srcDir, name), "utf8");
    const stem = name.slice(0, -".ts".length);
    const transpiled = transformSync(source, { loader: "ts", sourcefile: path.join(srcDir, name), tsconfigRaw: { compilerOptions: { target: "es2022" } } });
    await writeFile(path.join(outDir, `${stem}.js`), transpiled.code);
    const declaration = ts.transpileDeclaration(source, { fileName: name, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    if ((declaration.diagnostics ?? []).length === 0) await writeFile(path.join(outDir, `${stem}.d.ts`), declaration.outputText);
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
  await writeFile(path.join(outDir, "tsazor-components.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [exportName, declaration] of Object.entries(componentTypeDeclarations(manifest, { packageDir, declarationDir: outDir }))) {
    await writeFile(path.join(outDir, `${exportName}.d.ts`), declaration);
  }
  for (const [file, text] of Object.entries(options.declarations ?? {})) await writeFile(path.join(outDir, file), text);

  // index.d.ts mirrors index.js: the type half of each re-export reads the sibling declaration.
  const index = [
    ...exported.map((name) => `export { default as ${name} } from "./${name}.js"`),
    ...(options.exports ?? []),
    ...Object.entries(aliases).map(([alias, target]) => `export { default as ${alias} } from "./${target}.js"`),
  ].map(statement);
  await writeFile(path.join(outDir, "index.js"), `${index.join("\n")}\n`);
  await writeFile(path.join(outDir, "index.d.ts"), `${[...index, ...referencedTypeExports(manifest, options), ...(options.typeExports ?? []).map(statement)].join("\n")}\n`);

  if (options.stylesheet !== undefined) {
    const styles: string[] = [];
    const stylesDir = path.join(srcDir, "styles");
    const shared = await readdir(stylesDir).catch(() => [] as string[]);
    for (const name of shared.filter((name) => name.endsWith(".css")).sort()) {
      styles.push(`/* ${name} */\n${await readFile(path.join(stylesDir, name), "utf8")}`);
    }
    const header = options.stylesheet.header === undefined ? [] : [options.stylesheet.header];
    await writeFile(path.join(outDir, options.stylesheet.file), `${[...header, ...styles, ...sidecars].join("\n")}\n`);
  }

  await removeStale(outDir, buildStart);
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

/** A built module's relative imports point at the built siblings: `./Tab.tsazor`, `./ids` and `./x.ts` → `./….js`. */
function builtSpecifiers(code: string): string {
  return code.replace(/(from\s*")(\.\.?\/[^"]*)(")/g, (_, from: string, specifier: string, quote: string) => {
    if (specifier.endsWith(".tsazor")) return `${from}${specifier.slice(0, -".tsazor".length)}.js${quote}`;
    if (specifier.endsWith(".ts")) return `${from}${specifier.slice(0, -".ts".length)}.js${quote}`;
    return `${from}${specifier}.js${quote}`;
  });
}

function statement(line: string): string {
  return line.trimEnd().endsWith(";") ? line.trimEnd() : `${line.trimEnd()};`;
}

/** Removes what an earlier build wrote and this one didn't (a component renamed or deleted). */
async function removeStale(dir: string, since: number): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await removeStale(file, since);
    else if ((await stat(file)).mtimeMs < since) await rm(file);
  }
}
