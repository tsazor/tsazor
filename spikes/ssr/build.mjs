/**
 * SSR spike, step 0: compiles app/*.tsazor with the Vite plugin's real pipeline (`transformTsazor`) into
 * .build/*.mjs that Node can import — `@tsazor/runtime` pointed at the built package, sibling components at their
 * compiled modules. Also writes the compiler's TypeScript output (.build/ts/*.ts) for the SharpTS step.
 *
 *   node spikes/ssr/build.mjs        (packages built: pnpm -r --filter "./packages/*" build)
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const app = path.join(here, "app");
const out = path.join(here, ".build");
const runtime = pathToFileURL(path.join(repo, "packages", "runtime", "dist", "index.js")).href;

const { transformTsazor } = await import(pathToFileURL(path.join(repo, "packages", "vite-plugin", "dist", "transform.js")).href);
const { compile } = await import(pathToFileURL(path.join(repo, "packages", "compiler", "dist", "index.js")).href);
const { collectImportsSync, createFileContext, resolutionOptions } = await import(pathToFileURL(path.join(repo, "packages", "workspace", "dist", "index.js")).href);

await mkdir(path.join(out, "ts"), { recursive: true });
const bundleParts = [];
for (const name of (await readdir(app)).filter((file) => file.endsWith(".tsazor") && file !== "_Imports.tsazor")) {
  const file = path.join(app, name);
  const source = await readFile(file, "utf8");
  const result = await transformTsazor(source, file, app, { sourceMap: false, hmr: false });
  const errors = result.diagnostics.all.filter((d) => d.severity === "error");
  if (errors.length > 0) throw new Error(`${name}: ${errors.map((d) => `${d.code} ${d.message}`).join("; ")}`);
  const js = result.code
    .replace(/(["'])@tsazor\/runtime\1/g, JSON.stringify(runtime))
    .replace(/(["'])(\.{1,2}\/[^"']+?)\.tsazor\1/g, "$1$2.tsazor.mjs$1");
  await writeFile(path.join(out, `${name}.mjs`), js);
  // The compiler's own output (TypeScript, before esbuild) for SharpTS.
  const context = createFileContext(file, collectImportsSync(app, app));
  const ts = compile(source, { ...resolutionOptions(context), generateSourceMap: false });
  await writeFile(path.join(out, "ts", `${name}.ts`), ts.code);
  // The same, against the spike's server slice of the runtime (sharpts/mini-runtime.ts), for SharpTS.
  await mkdir(path.join(out, "sharpts"), { recursive: true });
  const forSharpTs = ts.code
    .replace(/(["'])@tsazor\/runtime\1/g, '"../../sharpts/mini-runtime.js"')
    .replace(/(["'])(\.{1,2}\/[^"']+?)\.tsazor\1/g, "$1$2.tsazor.js$1")
    // SharpTS 1.0.12 gap: `declare` with a computed (symbol) name — type-only lines, dropped (sharpts/README).
    .replace(/^\s*declare private \[[^\]]+\]\?: .*;\r?\n/gm, "")
    // SharpTS 1.0.12 gap: one class imported twice (`X, X as __tsazor_X`) is two types to its checker — aliases resolved.
    .replace(/, (\w+) as __tsazor_\1\b/g, "")
    .replace(/\b__tsazor_(ComponentBase|EventCallback|RenderTreeBuilder)\b/g, "$1");
  await writeFile(path.join(out, "sharpts", `${name}.ts`), forSharpTs);
  bundleParts.push({ name, code: forSharpTs });
  console.log(`compiled ${name}`);
}

// SharpTS 1.0.12 orders imported classes wrongly ("Class 'ComponentBase' used before its declaration"): one file
// without imports — the server slice, then the components (children first), then the entry's render calls.
const stripModules = (code) =>
  code
    .replace(/^import [^;\n]*;?\r?\n/gm, "")
    .replace(/^export default class (\w+)/gm, "class $1")
    .replace(/^export /gm, "");
const order = ["Greeting.tsazor", "App.tsazor"];
const components = order.map((name) => {
  const part = bundleParts.find((candidate) => candidate.name === name);
  return stripModules(part.code).replace(/\b__tsazor_comp_(\w+)\b/g, "$1");
});
const runtimeSlice = stripModules(await readFile(path.join(here, "sharpts", "mini-runtime.ts"), "utf8"));
const entry = stripModules(await readFile(path.join(here, "sharpts", "render.ts"), "utf8"));
await writeFile(path.join(out, "sharpts", "bundle.ts"), [runtimeSlice, ...components, entry].join("\n"));
console.log("wrote .build/sharpts/bundle.ts");
