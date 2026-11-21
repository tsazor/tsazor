/**
 * tsc lowers the decorators of the runtime's components (`@Parameter() href`) with helpers of its own — a copy per
 * module — and wraps each class in an IIFE with a static block: about 0.8 KB gzip per component in every app that
 * uses it, and a static block makes a bundler that targets Safari 16 lower the class's private members too. After
 * `tsc -b`, this step re-emits those modules from their source as an app's components are emitted: Tsazor's field
 * decorators applied after the class (`decorateFields`, @tsazor/compiler's `compactFieldDecorators`), everything
 * else as tsc emits it (`ts.transpileModule` with the package's options, a source map beside it). A module with
 * nothing to compact keeps tsc's output; its declarations are tsc's either way.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { compactFieldDecorators } from "@tsazor/compiler";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(packageDir, "src");
const distDir = path.join(packageDir, "dist");
const config = ts.getParsedCommandLineOfConfigFile(path.join(packageDir, "tsconfig.json"), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n")); } });

// The modules that declare the registering decorators (as the sources import them), and the one with decorateFields.
const DECORATOR_MODULES = ["components/parameter-metadata.js", "routing/supply-parameter-from-query.js", "forms/validation-attributes.js"].map((file) => path.join(srcDir, file));
const HELPER_MODULE = path.join(srcDir, "components", "parameter-metadata.js");

const specifierFrom = (dir, target) => {
  const relative = path.relative(dir, target).split(path.sep).join("/");
  return relative.startsWith(".") ? relative : `./${relative}`;
};

let compacted = 0;
for (const file of sources(srcDir)) {
  const code = readFileSync(file, "utf8");
  const dir = path.dirname(file);
  const compact = compactFieldDecorators(code, file, {
    isRuntime: (specifier) => specifier.startsWith(".") && DECORATOR_MODULES.includes(path.resolve(dir, specifier)),
    helperSpecifier: specifierFrom(dir, HELPER_MODULE),
  });
  if (compact === code) continue;
  const out = path.join(distDir, path.relative(srcDir, file)).replace(/\.ts$/, ".js");
  // ESM, as tsc emits the package (NodeNext under "type": "module", which a single-file transpile can't see).
  const compilerOptions = { ...config.options, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, sourceMap: true, declaration: false, declarationMap: false, composite: false, incremental: false };
  const { outputText, sourceMapText, diagnostics } = ts.transpileModule(compact, { fileName: file, compilerOptions, reportDiagnostics: true });
  if (diagnostics !== undefined && diagnostics.length > 0) throw new Error(`${file}: ${diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n")}`);
  // tsc's map names the source from the output's folder; the same here.
  const map = JSON.parse(sourceMapText);
  map.file = path.basename(out);
  map.sources = [specifierFrom(path.dirname(out), file).replace(/^\.\//, "")];
  writeFileSync(out, outputText.replace(/\/\/# sourceMappingURL=.*$/m, `//# sourceMappingURL=${path.basename(out)}.map`));
  writeFileSync(`${out}.map`, JSON.stringify(map));
  compacted++;
}
console.log(`[tsazor/runtime] re-emitted ${compacted} component module(s) with compact field decorators`);

function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(file);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) yield file;
  }
}
