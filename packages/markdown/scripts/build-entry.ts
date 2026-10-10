/**
 * Library build for @tsazor/markdown, as the skins build: each src/*.tsazor through the real compiler and the
 * workspace resolution, the .ts helpers transpiled beside them (with their declarations), the component manifest and
 * the per-component declarations, and the stylesheet.
 */
import { compile } from "@tsazor/compiler";
import { buildPackageManifest, collectImports, componentTypeDeclarations, createFileContext, resolutionOptions } from "@tsazor/workspace";
import { transformSync } from "esbuild";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const packageDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const srcDir = path.join(packageDir, "src");
const distDir = path.join(packageDir, "dist");
const NAME = "@tsazor/markdown";

// A running dev server keeps reading dist while it is rebuilt: files are overwritten in place, and only the ones
// this build didn't write are removed at the end. (Removing dist first left a dev server reading missing files and
// caching the errors — L7.)
const buildStart = Date.now();
await mkdir(distDir, { recursive: true });

/** `./x.tsazor` and `./x` (a .ts helper) become the built `./x.js`. */
const rewriteImports = (code: string): string =>
  code.replace(/(from\s*")(\.\.?\/[^"]*)(")/g, (_, from: string, spec: string, quote: string) => {
    if (spec.endsWith(".tsazor")) return `${from}${spec.slice(0, -".tsazor".length)}.js${quote}`;
    if (spec.endsWith(".ts")) return `${from}${spec.slice(0, -".ts".length)}.js${quote}`;
    return `${from}${spec}.js${quote}`;
  });

const files = (await readdir(srcDir)).filter((name) => name.endsWith(".tsazor") && name !== "_Imports.tsazor").sort();
const failures: string[] = [];
for (const file of files) {
  const filePath = path.join(srcDir, file);
  const className = path.basename(file, ".tsazor");
  const chain = await collectImports(srcDir, packageDir);
  const compiled = compile(await readFile(filePath, "utf8"), { ...resolutionOptions(createFileContext(filePath, chain)), generateSourceMap: false });
  const errors = compiled.diagnostics.all.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    failures.push(`${file}\n${errors.map((d) => `  ${d.code} (${d.pos.line}:${d.pos.column}): ${d.message}`).join("\n")}`);
    continue;
  }
  const transpiled = transformSync(compiled.code, {
    loader: "ts",
    sourcefile: filePath,
    // Standard decorators: lowered, as the Vite plugin does for an app.
    supported: { decorators: false },
    tsconfigRaw: { compilerOptions: { target: "es2022" } },
  });
  await writeFile(path.join(distDir, `${className}.js`), rewriteImports(transpiled.code));
}
if (failures.length > 0) {
  for (const failure of failures) console.error(`[${NAME}] compile errors in ${failure}`);
  process.exit(1);
}

// The .ts helpers, with declarations the published types read.
for (const name of (await readdir(srcDir)).filter((name) => name.endsWith(".ts")).sort()) {
  const source = await readFile(path.join(srcDir, name), "utf8");
  const stem = name.slice(0, -".ts".length);
  const transpiled = transformSync(source, { loader: "ts", sourcefile: path.join(srcDir, name), tsconfigRaw: { compilerOptions: { target: "es2022" } } });
  await writeFile(path.join(distDir, `${stem}.js`), transpiled.code);
  const declaration = ts.transpileDeclaration(source, { fileName: name, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  await writeFile(path.join(distDir, `${stem}.d.ts`), declaration.outputText);
}

const manifest = buildPackageManifest({
  packageDir,
  packageName: NAME,
  entries: files.map((file) => ({ exportName: path.basename(file, ".tsazor"), file: path.join(srcDir, file) })),
});
const declarations = componentTypeDeclarations(manifest, { packageDir, declarationDir: distDir });
for (const [exportName, declaration] of Object.entries(declarations)) {
  await writeFile(path.join(distDir, `${exportName}.d.ts`), declaration);
}
await writeFile(path.join(distDir, "tsazor-components.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const index = [
  ...files.map((file) => `export { default as ${path.basename(file, ".tsazor")} } from "./${path.basename(file, ".tsazor")}.js";`),
  // The rendering on its own, for an app that needs the HTML (a tooltip's text, a preview).
  'export { renderMarkdown } from "./render-markdown.js";',
].join("\n");
await writeFile(path.join(distDir, "index.js"), `${index}\n`);
await writeFile(path.join(distDir, "index.d.ts"), `${index}\nexport type { MarkdownOptions } from "./render-markdown.js";\n`);
// Written, not copied: a copy keeps the source's time, and removeStale would take it for stale.
await writeFile(path.join(distDir, "markdown.css"), await readFile(path.join(srcDir, "markdown.css"), "utf8"));
console.log(`[${NAME}] built ${files.length} component(s) -> dist/`);

/** Removes what an earlier build wrote and this one didn't (a component renamed or deleted). */
async function removeStale(dir: string, since: number): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await removeStale(file, since);
    else if ((await stat(file)).mtimeMs < since) await rm(file);
  }
}
await removeStale(distDir, buildStart);
