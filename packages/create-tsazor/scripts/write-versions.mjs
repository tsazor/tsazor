/**
 * Writes dist/versions.json: the version of every @tsazor package the starter
 * puts into a new app, read from this repository at build time — so a starter
 * always creates apps for the packages it was released with.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = path.dirname(packageDir);

const versions = {};
for (const dir of readdirSync(packagesDir)) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path.join(packagesDir, dir, "package.json"), "utf8"));
  } catch {
    continue;
  }
  if (!manifest.private && manifest.name.startsWith("@tsazor/")) versions[manifest.name] = manifest.version;
}

writeFileSync(path.join(packageDir, "dist", "versions.json"), `${JSON.stringify(versions, null, 2)}\n`);
