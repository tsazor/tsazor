/**
 * Writes MIGRATION.md — the Blazor → Tsazor migration guide (docs/migration-guide.md) into the package, so an agent
 * or a developer who reads only node_modules has every mapping at hand. The guide's relative links point into the
 * repository's docs, which no installed package has: they become absolute.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(packageDir, "..", "..", "docs", "migration-guide.md");
const DOCS = "https://github.com/tsazor/tsazor/blob/main/docs/";

const guide = readFileSync(source, "utf8")
  // `[text](file.md)`, `[text](file.md#anchor)`: a page beside the guide in docs/.
  .replace(/\]\(([\w.-]+\.md(?:#[\w-]+)?)\)/g, (_, target) => `](${DOCS}${target})`);
writeFileSync(path.join(packageDir, "MIGRATION.md"), guide);
console.log("[tsazor/runtime] wrote MIGRATION.md");
