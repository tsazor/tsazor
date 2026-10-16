#!/usr/bin/env node
/**
 * The @tsazor/fluent Add-CLI: copy components into your app as real sources —
 * "the components belong to you".
 *
 *   npx @tsazor/fluent list
 *   npx @tsazor/fluent add Dialog
 *   npx @tsazor/fluent add ToastRegion --root path/to/app --overwrite --print
 *
 * Copy-in mode: writes <target>/src/components/<Name>.tsazor (+ sidecar CSS +
 * every sibling component the markup needs, and the helper modules they import:
 * attributes.ts, vocabulary.ts, core-icons.ts, …). The design tokens go once into
 * <target>/src/styles/. No auto-editing — the CLI prints the next steps.
 */
import { existsSync, mkdirSync, readFileSync, copyFileSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { availableComponents as componentsIn, collectClosure as closureIn } from "./closure.mjs";
const collectTemplateClosure = (name) => closureIn(FLUENT_TEMPLATES, name);

const FLUENT_SRC = fileURLToPath(new URL("../src", import.meta.url));
const FLUENT_TEMPLATES = fileURLToPath(new URL("../templates", import.meta.url));
const FLUENT_STYLES = fileURLToPath(new URL("../src/styles", import.meta.url));
/** The version the copies come from: @tsazor/ui is released in lockstep with it. */
const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const availableComponents = () => componentsIn(FLUENT_SRC);
const collectClosure = (name) => closureIn(FLUENT_SRC, name);

const argv = process.argv.slice(2);
let root = process.cwd();
let overwrite = false;
let printOnly = false;
let target = null;

for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
        root = resolve(argv[++i] ?? ".");
    } else if (arg === "--overwrite") {
        overwrite = true;
    } else if (arg === "--print") {
        printOnly = true;
    } else if (!arg.startsWith("-")) {
        target = arg;
    }
}

/**
 * The templates (design-extended-library.md §2.4) are the other copy-in kind:
 * a block the app owns in src/Pages — its .tsazor, its sidecar CSS and its
 * model modules, no more: the skin's own components stay npm (the copies
 * resolve them via the app's @using).
 */
function planTemplateAdd(name) {
    const files = [];
    const pages = join(root, "src", "Pages");
    for (const file of collectTemplateClosure(name)) {
        files.push({ from: file.path, to: join(pages, file.file) });
    }
    const sidecar = join(FLUENT_TEMPLATES, `${name}.tsazor.css`);
    if (existsSync(sidecar)) files.push({ from: sidecar, to: join(pages, `${name}.tsazor.css`) });
    if (existsSync(FLUENT_STYLES)) {
        for (const css of readdirSync(FLUENT_STYLES)) {
            files.push({ from: join(FLUENT_STYLES, css), to: join(root, "src", "styles", css), once: true });
        }
    }
    return files;
}

function planAdd(name) {
    if (existsSync(join(FLUENT_TEMPLATES, `${name}.tsazor`))) return planTemplateAdd(name);
    const components = collectClosure(name);
    const files = [];
    for (const component of components) {
        const dir = join(root, "src", "components");
        files.push({ from: component.path, to: join(dir, component.file) });
        const sidecar = `${component.file}.css`;
        if (component.file.endsWith(".tsazor") && existsSync(join(FLUENT_SRC, sidecar))) {
            files.push({ from: join(FLUENT_SRC, sidecar), to: join(dir, sidecar) });
        }
    }
    if (existsSync(FLUENT_STYLES)) {
        for (const css of readdirSync(FLUENT_STYLES)) {
            files.push({ from: join(FLUENT_STYLES, css), to: join(root, "src", "styles", css), once: true });
        }
    }
    return files;
}

function usage() {
    console.log(`@tsazor/fluent add — copy Fluent components into your app as sources

Usage:
  npx @tsazor/fluent list
  npx @tsazor/fluent add <Component> [--root <dir>] [--overwrite] [--print]

Flags:
  --root <dir>   project root (default: cwd)
  --overwrite    replace existing files
  --print        show the plan, write nothing`);
}

if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    usage();
    process.exit(argv.length === 0 ? 1 : 0);
}

const command = argv[0];

if (command === "list") {
    console.log("Available components:\n");
    for (const name of availableComponents().sort()) console.log(`  ${name}`);
    if (existsSync(FLUENT_TEMPLATES)) {
        const templates = readdirSync(FLUENT_TEMPLATES).filter((file) => file.endsWith(".tsazor") && file !== "_Imports.tsazor").map((file) => file.replace(/\.tsazor$/, "")).sort();
        if (templates.length > 0) {
            console.log("\nAvailable templates (copied into the app's src/Pages, then the app's):\n");
            for (const name of templates) console.log(`  ${name}`);
        }
    }
    console.log("\nUsage: npx @tsazor/fluent add <Name> [--root <dir>] [--overwrite] [--print]");
    process.exit(0);
}

if (command !== "add" || !target) {
    usage();
    process.exit(1);
}

const files = planAdd(target);
const skipped = [];
const writes = [];
const isTemplate = existsSync(join(FLUENT_TEMPLATES, `${target}.tsazor`));

for (const file of files) {
    if (!overwrite && existsSync(file.to)) {
        skipped.push(file);
    } else {
        writes.push(file);
    }
}

console.log(`\nAdding ${target} from @tsazor/fluent${isTemplate ? " (a template: it lands in your src/Pages and is yours)" : ""}:`);
for (const file of writes) console.log(`  ${file.to.replace(root, ".")}`);
for (const file of skipped) console.log(`  ${file.to.replace(root, ".")}  (exists, skipped — use --overwrite)`);

if (!printOnly) {
    for (const file of writes) {
        mkdirSync(resolve(file.to, ".."), { recursive: true });
        copyFileSync(file.from, file.to);
    }
}

const entry = isTemplate ? collectTemplateClosure(target)[0] : collectClosure(target)[0];
const styleImports = (existsSync(FLUENT_STYLES) ? readdirSync(FLUENT_STYLES).filter((css) => css.endsWith(".css")).sort() : [])
    .map((css) => `       import "./src/styles/${css}";`)
    .join("\n");
console.log(`
Next steps:
  1. Import the styles once in your entry file:
${styleImports}
     (tokens.css defines the --fui-* design tokens, controls.css the component chrome,
     avatar-colors.css the avatars' named colors.)
  2. The components use the behavior core (focus trap, Escape, roving focus, ids)
     and its kit (@tsazor/ui/kit), whose helpers may change in any release —
     install @tsazor/ui at exactly the version they were copied from:
       npm install --save-exact @tsazor/ui@${VERSION}
  3. Use <${entry.name} /> in your markup — app components resolve by name.
  4. The copy is yours: edit it freely. npm-shipped and copied components
     coexist because all classes are globally unique (fui-*).`);