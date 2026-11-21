/**
 * tsazor-dotnet CLI: OpenAPI ⇒ typed TS client.
 *
 *   tsazor-dotnet generate <openapi.json|https://…> --out <dir>
 *       [--name <ClientName>] [--envelope data,errors[,succeeded]] [--base-url <url>] [--path-value <name>=<value>]…
 *       [--string-primitives]
 *
 * Writes `models.ts` and `<client>.ts` to --out and prints the
 * generator warnings (documented subset). Exit: 0 green, 1 errors, 2
 * usage/fatal — like `tsazor`.
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateClient } from "./generate.js";
import { loadOpenApiDocument } from "./openapi.js";
import type { EnvelopeOptions } from "./http-result.js";

export { generateClient, type GenerateOptions, type Generation, type GeneratedFile } from "./generate.js";
export { loadOpenApiDocument } from "./openapi.js";

/** The package's own version (one for every package, design-release.md D-P1) — read when asked: a bundler that loads
 * this module (the tutorial's tests) has no file URL to read it from. */
function version(): string {
  return (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
}

const USAGE = `Usage: tsazor-dotnet generate <openapi.json|url> --out <dir> [options]
  --name <Name>        class name of the client (default from info.title)
  --envelope data,errors[,succeeded]  unwrap a response envelope (e.g. FluentCMS's data,errors;
                       BlazorHero's data,messages,succeeded — the success flag decides)
  --base-url <url>     default base URL of the generated client
  --path-value <name>=<value>  a path parameter with a fixed value, written into the URLs (URL-segment
                       API versioning: --path-value version=1 turns api/v{version}/brands into api/v1/brands);
                       repeatable
  --string-primitives  keep format decimal/date/duration/uuid as number/string instead of the
                       @tsazor/primitives value types (the mapping is on by default)
Exit: 0 green, 1 errors, 2 usage/fatal.`;

export async function main(argv: readonly string[], stdout: (line: string) => void): Promise<number> {
  const [command, source, ...extra] = argv.slice(2);
  if (command === "--version" || command === "-v") {
    stdout(`tsazor-dotnet ${version()}`);
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
  let stringPrimitives = false;
  const pathValues: Record<string, string> = {};
  const extraArgs = [...extra];
  while (extraArgs.length > 0) {
    const option = extraArgs.shift()!;
    const value = extraArgs.shift();
    switch (option) {
      case "--out":
        if (value === undefined) {
          stdout("tsazor-dotnet generate: --out requires a directory.");
          return 2;
        }
        out = value;
        break;
      case "--name":
        if (value === undefined) {
          stdout("tsazor-dotnet generate: --name requires a name.");
          return 2;
        }
        clientName = value;
        break;
      case "--envelope": {
        if (value === undefined) {
          stdout("tsazor-dotnet generate: --envelope requires `data[,errors[,succeeded]]`.");
          return 2;
        }
        const [data = "", errors = "", succeeded = ""] = value.split(",");
        envelope = {
          ...(data.length > 0 ? { data } : {}),
          ...(errors.length > 0 ? { errors } : {}),
          ...(succeeded.length > 0 ? { succeeded } : {}),
        };
        if (envelope.data === undefined && envelope.errors === undefined && envelope.succeeded === undefined) {
          stdout("tsazor-dotnet generate: --envelope without a valid key (`data[,errors[,succeeded]]`).");
          return 2;
        }
        break;
      }
      case "--base-url":
        if (value === undefined) {
          stdout("tsazor-dotnet generate: --base-url requires a URL.");
          return 2;
        }
        baseUrl = value;
        break;
      case "--path-value": {
        const separator = value?.indexOf("=") ?? -1;
        if (value === undefined || separator <= 0) {
          stdout("tsazor-dotnet generate: --path-value requires <name>=<value>.");
          return 2;
        }
        pathValues[value.slice(0, separator)] = value.slice(separator + 1);
        break;
      }
      case "--string-primitives":
        stringPrimitives = true;
        break;
      default:
        stdout(`tsazor-dotnet generate: unknown option "${option}".`);
        stdout(USAGE);
        return 2;
    }
  }
  if (out === undefined) {
    stdout("tsazor-dotnet generate: --out is missing.");
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
  const generation = generateClient(document, { clientName, envelope, baseUrl, pathValues, stringPrimitives });
  await mkdir(out, { recursive: true });
  for (const file of generation.files) {
    await writeFile(path.join(out, file.path), file.content, "utf8");
    stdout(`written: ${path.join(out, file.path)}`);
  }
  for (const warning of generation.warnings) {
    stdout(`warning: ${warning}`);
  }
  stdout(`tsazor-dotnet generate: ${generation.files.length} file(s) to ${out}`);
  return 0;
}