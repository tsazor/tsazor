/**
 * Collects the type environment of the in-browser `tsazor check` (Node,
 * build time): TypeScript's lib files reachable from es2023 + dom (es2023:
 * toSorted, findLast, …), and the declaration files of @tsazor/runtime,
 * @tsazor/components and @tsazor/dotnet with their package.json — keyed by
 * the absolute paths the in-memory host serves them under (see
 * src/engine/type-check.ts).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { LIB_ROOT, type TypeEnvironment } from "../src/engine/type-paths.js";

const ROOT_LIBS = ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"];
const PACKAGES = ["@tsazor/runtime", "@tsazor/components", "@tsazor/dotnet", "@tsazor/testing"];

export function loadTypeEnvironment(fromDir: string): TypeEnvironment {
  const require = createRequire(path.join(fromDir, "package.json"));
  const env: Record<string, string> = {};

  // Lib files: follow `/// <reference lib="…" />` from the configured roots.
  const libDir = path.dirname(require.resolve("typescript"));
  const queue = [...ROOT_LIBS];
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (`${LIB_ROOT}${name}` in env) continue;
    const text = readFileSync(path.join(libDir, name), "utf8");
    env[`${LIB_ROOT}${name}`] = text;
    for (const match of text.matchAll(/<reference\s+lib="([^"]+)"/g)) queue.push(`lib.${match[1]!.toLowerCase()}.d.ts`);
  }

  for (const name of PACKAGES) {
    // (package.json is not in the packages' export maps: walk up from the entry.)
    let packageDir = path.dirname(require.resolve(name));
    while (!existsSync(path.join(packageDir, "package.json"))) packageDir = path.dirname(packageDir);
    const prefix = `/node_modules/${name}`;
    env[`${prefix}/package.json`] = readFileSync(path.join(packageDir, "package.json"), "utf8");
    const walk = (dir: string): void => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith(".d.ts")) {
          env[`${prefix}/${path.relative(packageDir, full).replace(/\\/g, "/")}`] = readFileSync(full, "utf8");
        }
      }
    };
    walk(path.join(packageDir, "dist"));
  }
  // "vitest" in a lesson is the preview's runner: its source is its own declaration.
  env["/node_modules/vitest/package.json"] = JSON.stringify({ name: "vitest", types: "./index.ts" });
  env["/node_modules/vitest/index.ts"] = readFileSync(path.join(fromDir, "src", "preview", "mini-test.ts"), "utf8");
  return env;
}
