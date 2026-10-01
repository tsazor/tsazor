/**
 * Writes dist/tsazor-components.json — the parameter metadata of the runtime's
 * built-in components, extracted from src/ by @tsazor/workspace (the same
 * extractor every package manifest uses; package.json `tsazor.components`
 * points here). The workspace embeds the identical manifest
 * (runtime-manifest.generated.ts); a workspace test keeps both in sync.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRuntimeManifest } from "@tsazor/workspace";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = buildRuntimeManifest(packageDir);
mkdirSync(path.join(packageDir, "dist"), { recursive: true });
writeFileSync(path.join(packageDir, "dist", "tsazor-components.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[tsazor/runtime] wrote dist/tsazor-components.json (${Object.keys(manifest.components).length} components)`);
