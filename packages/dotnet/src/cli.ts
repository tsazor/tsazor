/**
 * tsazor-dotnet CLI: OpenAPI ⇒ typed TS client.
 *
 *   tsazor-dotnet generate <openapi.json|https://…> --out <dir>
 *       [--name <ClientName>] [--envelope data,errors] [--base-url <url>]
 *
 * Writes `models.ts` and `<client>.ts` to --out and prints the
 * generator warnings (documented subset). Exit: 0 green, 1 errors, 2
 * usage/fatal — like `tsazor`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateClient } from "./generate.js";
import { loadOpenApiDocument } from "./openapi.js";
import type { EnvelopeOptions } from "./http-result.js";

export { generateClient, type GenerateOptions, type Generation, type GeneratedFile } from "./generate.js";
export { loadOpenApiDocument } from "./openapi.js";

const VERSION = "0.1.0";

const USAGE = `Usage: tsazor-dotnet generate <openapi.json|url> --out <dir> [options]
  --name <Name>        Klassenname des Clients (Default aus info.title)
  --envelope data,errors  Antwort-Envelope entschlüsseln (z. B. FluentCMS)
  --base-url <url>     Default-Basis-URL des generierten Clients
Exit: 0 grün, 1 Fehler, 2 Usage/fatal.`;

export async function main(argv: readonly string[], stdout: (line: string) => void): Promise<number> {
  const [command, source, ...extra] = argv.slice(2);
  if (command === "--version" || command === "-v") {
    stdout(`tsazor-dotnet ${VERSION}`);
    return 0;
  }
  if (source === "--help" || source === "-h" || command === "--help") {
    stdout(USAGE);
    return 0;
  }
  if (command !== "generate") {
    stdout(USAGE);
    return 2;
  }
  if (source === undefined || source === "--help" || source === "-h") {
    stdout(USAGE);
    return 2;
  }
  let out: string | undefined;
  let clientName: string | undefined;
  let envelope: EnvelopeOptions | undefined;
  let baseUrl: string | undefined;
  const extraArgs = [...extra];
  while (extraArgs.length > 0) {
    const option = extraArgs.shift()!;
    const value = extraArgs.shift();
    switch (option) {
      case "--out":
        if (value === undefined) {
          stdout("tsazor-dotnet generate: --out verlangt ein Verzeichnis.");
          return 2;
        }
        out = value;
        break;
      case "--name":
        if (value === undefined) {
          stdout("tsazor-dotnet generate: --name verlangt einen Namen.");
          return 2;
        }
        clientName = value;
        break;
      case "--envelope": {
        if (value === undefined) {
          stdout("tsazor-dotnet generate: --envelope verlangt `data[,errors]`.");
          return 2;
        }
        const [data = "", errors = ""] = value.split(",");
        envelope = {
          ...(data.length > 0 ? { data } : {}),
          ...(errors.length > 0 ? { errors } : {}),
        };
        if (envelope.data === undefined && envelope.errors === undefined) {
          stdout("tsazor-dotnet generate: --envelope ohne gültigen Schlüssel (`data[,errors]`).");
          return 2;
        }
        break;
      }
      case "--base-url":
        if (value === undefined) {
          stdout("tsazor-dotnet generate: --base-url verlangt eine URL.");
          return 2;
        }
        baseUrl = value;
        break;
      default:
        stdout(`tsazor-dotnet generate: unbekannte Option "${option}".`);
        stdout(USAGE);
        return 2;
    }
  }
  if (out === undefined) {
    stdout("tsazor-dotnet generate: --out fehlt.");
    stdout(USAGE);
    return 2;
  }

  let document;
  try {
    document = await loadOpenApiDocument(source);
  } catch (error) {
    stdout(`tsazor-dotnet generate: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const generation = generateClient(document, { clientName, envelope, baseUrl });
  await mkdir(out, { recursive: true });
  for (const file of generation.files) {
    await writeFile(path.join(out, file.path), file.content, "utf8");
    stdout(`geschrieben: ${path.join(out, file.path)}`);
  }
  for (const warning of generation.warnings) {
    stdout(`warnung: ${warning}`);
  }
  stdout(`tsazor-dotnet generate: ${generation.files.length} Datei(en) nach ${out}`);
  return 0;
}