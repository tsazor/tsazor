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

const FLUENT_SRC = fileURLToPath(new URL("../src", import.meta.url));
const FLUENT_STYLES = fileURLToPath(new URL("../src/styles", import.meta.url));

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

function sourceFiles() {
    return readdirSync(FLUENT_SRC).filter((name) => name.endsWith(".tsazor") && name !== "_Imports.tsazor");
}

function availableComponents() {
    const names = new Set();
    for (const file of sourceFiles()) names.add(basename(file, ".tsazor"));
    return [...names];
}

/** Sibling .tsazor components referenced as <Tag> in the markup. */
function markupDependencies(source) {
    const tags = new Set();
    const available = new Set(availableComponents());
    for (const match of source.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) {
        const tag = match[1];
        if (available.has(tag)) tags.add(tag);
    }
    return tags;
}

/**
 * Sibling files a source imports by a relative path: `@import { withAttributes } from "./attributes"`,
 * `@import type Menu from "./Menu.tsazor"`, `import … from "./vocabulary.js"` in a .ts helper.
 */
function moduleDependencies(source) {
    const files = new Set();
    for (const match of source.matchAll(/\bfrom\s+["']\.\/([^"']+)["']/g)) {
        const spec = match[1];
        const stem = spec.replace(/\.(js|ts)$/, "");
        for (const file of spec.endsWith(".tsazor") ? [spec] : [`${stem}.ts`, `${stem}.tsazor`]) {
            if (existsSync(join(FLUENT_SRC, file))) {
                files.add(file);
                break;
            }
        }
    }
    return files;
}

/** The component's file and every file it needs: sibling components in its markup, and the modules it imports. */
function collectClosure(entryName) {
    if (!existsSync(join(FLUENT_SRC, `${entryName}.tsazor`))) {
        throw new Error(`unknown component "${entryName}" — run "npx @tsazor/fluent list" for available ones`);
    }
    const closure = new Map();
    const queue = [`${entryName}.tsazor`];
    while (queue.length > 0) {
        const file = queue.shift();
        if (closure.has(file)) continue;
        const path = join(FLUENT_SRC, file);
        const source = readFileSync(path, "utf8");
        closure.set(file, { name: basename(file).replace(/\.(tsazor|ts)$/, ""), file, path, source });
        const deps = [...moduleDependencies(source)];
        if (file.endsWith(".tsazor")) deps.push(...[...markupDependencies(source)].map((tag) => `${tag}.tsazor`));
        for (const dep of deps) {
            if (!closure.has(dep)) queue.push(dep);
        }
    }
    return [...closure.values()];
}

function planAdd(name) {
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

for (const file of files) {
    if (!overwrite && existsSync(file.to)) {
        skipped.push(file);
    } else {
        writes.push(file);
    }
}

console.log(`\nAdding ${target} from @tsazor/fluent:`);
for (const file of writes) console.log(`  ${file.to.replace(root, ".")}`);
for (const file of skipped) console.log(`  ${file.to.replace(root, ".")}  (exists, skipped — use --overwrite)`);

if (!printOnly) {
    for (const file of writes) {
        mkdirSync(resolve(file.to, ".."), { recursive: true });
        copyFileSync(file.from, file.to);
    }
}

const entry = collectClosure(target)[0];
console.log(`
Next steps:
  1. Import the styles once in your entry file:
       import "./src/styles/tokens.css";
       import "./src/styles/controls.css";
     (tokens.css defines the --fui-* design tokens, controls.css the component chrome.)
  2. The components use the behavior core (focus trap, Escape, roving focus, ids):
       npm install @tsazor/ui
  3. Use <${entry.name} /> in your markup — app components resolve by name.
  4. The copy is yours: edit it freely. npm-shipped and copied components
     coexist because all classes are globally unique (fui-*).`);