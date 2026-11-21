/**
 * The typed API client, from FluentCMS's OpenAPI document (Swashbuckle, its defaults).
 *
 *   node scripts/codegen.mjs   # needs the backend (pnpm --filter fluentcms backend)
 *
 * The document is checked in as src/api/openapi.json next to the generated files, so the build
 * needs no backend. The responses come in FluentCMS's envelope ({ data, errors }); the client
 * unwraps it.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BACKEND } from "./backend.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = path.join(root, "src", "api", "openapi.json");

const response = await fetch(`${BACKEND}/swagger/v1/swagger.json`).catch(() => undefined);
if (!response?.ok) {
  console.error(`codegen: no OpenAPI document at ${BACKEND} — start the backend first (pnpm --filter fluentcms backend).`);
  process.exit(1);
}
writeFileSync(contract, `${JSON.stringify(await response.json(), null, 2)}\n`);

const result = spawnSync(
  "pnpm",
  ["exec", "tsazor-dotnet", "generate", "src/api/openapi.json", "--out", "src/api", "--name", "FluentCms", "--envelope", "data,errors"],
  { cwd: root, stdio: "inherit", shell: true },
);
process.exit(result.status ?? 1);
