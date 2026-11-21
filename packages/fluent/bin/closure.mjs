/**
 * What `npx @tsazor/fluent add <Component>` copies: the component, the sibling components in its markup and the
 * modules it imports, transitively. A module of its own, so a test checks every component without a process each.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

function sourceFiles(srcDir) {
    return readdirSync(srcDir).filter((name) => name.endsWith(".tsazor") && name !== "_Imports.tsazor");
}

export function availableComponents(srcDir) {
    const names = new Set();
    for (const file of sourceFiles(srcDir)) names.add(basename(file, ".tsazor"));
    return [...names];
}

/** Sibling .tsazor components referenced as <Tag> in the markup. */
function markupDependencies(srcDir, source) {
    const tags = new Set();
    const available = new Set(availableComponents(srcDir));
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
function moduleDependencies(srcDir, source) {
    const files = new Set();
    for (const match of source.matchAll(/\bfrom\s+["']\.\/([^"']+)["']/g)) {
        const spec = match[1];
        const stem = spec.replace(/\.(js|ts)$/, "");
        for (const file of spec.endsWith(".tsazor") ? [spec] : [`${stem}.ts`, `${stem}.tsazor`]) {
            if (existsSync(join(srcDir, file))) {
                files.add(file);
                break;
            }
        }
    }
    return files;
}

/** The component's file and every file it needs: sibling components in its markup, and the modules it imports. */
export function collectClosure(srcDir, entryName) {
    if (!existsSync(join(srcDir, `${entryName}.tsazor`))) {
        throw new Error(`unknown component "${entryName}" — run "npx @tsazor/fluent list" for available ones`);
    }
    const closure = new Map();
    const queue = [`${entryName}.tsazor`];
    while (queue.length > 0) {
        const file = queue.shift();
        if (closure.has(file)) continue;
        const path = join(srcDir, file);
        const source = readFileSync(path, "utf8");
        closure.set(file, { name: basename(file).replace(/\.(tsazor|ts)$/, ""), file, path, source });
        const deps = [...moduleDependencies(srcDir, source)];
        if (file.endsWith(".tsazor")) deps.push(...[...markupDependencies(srcDir, source)].map((tag) => `${tag}.tsazor`));
        for (const dep of deps) {
            if (!closure.has(dep)) queue.push(dep);
        }
    }
    return [...closure.values()];
}
