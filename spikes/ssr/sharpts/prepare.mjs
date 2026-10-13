/**
 * SSR spike, part 3 (SharpTS): copies the runtime's TypeScript sources to .build/runtime-src and rewrites the
 * constructs SharpTS 1.0.12 can't parse yet, each listed (the spike's finding is that list). The SharpTS entries
 * import the runtime from there.
 *
 *   node spikes/ssr/sharpts/prepare.mjs
 */
import { cp, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const target = path.resolve(here, "..", ".build", "runtime-src");
await cp(path.join(repo, "packages", "runtime", "src"), target, { recursive: true });

/** SharpTS gaps, each a mechanical rewrite with the same meaning. */
const REWRITES = [
  {
    gap: "logical assignment to a private field (`this.#x ??= v`)",
    pattern: /(this\.#[A-Za-z_$][\w$]*) \?\?= /g,
    replace: "$1 = $1 ?? ",
  },
];

const counts = new Map();
async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (entry.name.endsWith(".ts")) {
      let source = await readFile(file, "utf8");
      for (const rewrite of REWRITES) {
        source = source.replace(rewrite.pattern, (...match) => {
          counts.set(rewrite.gap, (counts.get(rewrite.gap) ?? 0) + 1);
          return rewrite.replace.replace(/\$1/g, match[1]);
        });
      }
      await writeFile(file, source);
    }
  }
}
await visit(target);
for (const rewrite of REWRITES) console.log(`${counts.get(rewrite.gap) ?? 0}× ${rewrite.gap}`);
