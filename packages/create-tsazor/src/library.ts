/**
 * `--ui <package>`: what a component library needs in a new app, read from
 * the library's own package.json (docs/component-libraries.md) before any
 * file is written. No library is known in advance — @tsazor/bootstrap and
 * @tsazor/fluent go through exactly this path.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { runNpm } from "./npm.js";

/** `tsazor.setup` of a library's package.json, validated. */
export interface LibrarySetup {
  /** Module specifiers `Program.ts` imports (the library's CSS or a peer's). */
  styles: string[];
  /** A named export `(services) => void` that `createTsazorApp({ services })` calls. */
  services: string | undefined;
  /** Components without parameters that `MainLayout` renders once. */
  layout: string[];
}

export interface Library {
  name: string;
  /** The app's dependency spec: a version range, or `file:` for a local package. */
  spec: string;
  setup: LibrarySetup | undefined;
  /** Peers the app installs as well (all but `@tsazor/*`): name → range. */
  peers: Record<string, string>;
  /** What was wrong with the package's declaration (shown, then ignored). */
  warnings: string[];
}

/** The fields `npm view` returns for a package (or one version of it). */
export type RegistryView = (spec: string) => unknown;

/** Splits `name@range` (scoped names too): `@scope/ui@^1` → `@scope/ui`, `^1`. */
export function splitSpec(spec: string): { name: string; range: string | undefined } {
  const at = spec.lastIndexOf("@");
  return at > 0 ? { name: spec.slice(0, at), range: spec.slice(at + 1) || undefined } : { name: spec, range: undefined };
}

/** True for a directory or a tarball rather than a registry name. */
export function isLocalSpec(spec: string): boolean {
  return spec.startsWith("file:") || spec.startsWith(".") || path.isAbsolute(spec) || /\.t(ar\.)?gz$/i.test(spec);
}

/** Reads the library behind `spec` — from the registry, a directory or a `.tgz` (relative to `cwd`) — for an app in `appDir`. */
export function resolveLibrary(spec: string, appDir: string, view: RegistryView = npmView, cwd = process.cwd()): Library {
  if (isLocalSpec(spec)) {
    const location = path.resolve(cwd, spec.replace(/^file:/, ""));
    if (!existsSync(location)) throw new Error(`--ui ${spec}: no such directory or file.`);
    const manifest = statSync(location).isDirectory()
      ? (JSON.parse(readFileSync(path.join(location, "package.json"), "utf8")) as unknown)
      : readTarballManifest(location);
    const relative = path.relative(appDir, location).split(path.sep).join("/");
    return libraryFromManifest(manifest, `file:${relative}`);
  }
  const { range } = splitSpec(spec);
  const viewed = view(spec);
  // A range that matches several versions gives one entry per version; the last is the newest.
  const manifest = Array.isArray(viewed) ? (viewed[viewed.length - 1] as unknown) : viewed;
  if (!isRecord(manifest) || typeof manifest.version !== "string") throw new Error(`--ui ${spec}: the registry has no such package.`);
  return libraryFromManifest(manifest, range ?? `^${manifest.version}`);
}

/** The library a package.json describes; `spec` is the app's dependency spec for it. */
export function libraryFromManifest(manifest: unknown, spec: string): Library {
  if (!isRecord(manifest) || typeof manifest.name !== "string") throw new Error("The package has no package.json name.");
  const warnings: string[] = [];
  const tsazor = isRecord(manifest.tsazor) ? manifest.tsazor : {};
  const peers: Record<string, string> = {};
  if (isRecord(manifest.peerDependencies)) {
    for (const [name, range] of Object.entries(manifest.peerDependencies)) {
      if (!name.startsWith("@tsazor/") && typeof range === "string") peers[name] = range;
    }
  }
  return { name: manifest.name, spec, setup: readSetup(tsazor.setup, warnings), peers, warnings };
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const COMPONENT = /^[A-Z][A-Za-z0-9_]*$/;
const MODULE_SPECIFIER = /^[^\s"'`\\]+$/;

function readSetup(value: unknown, warnings: string[]): LibrarySetup | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    warnings.push("tsazor.setup is not an object.");
    return undefined;
  }
  const services = value.services;
  if (services !== undefined && (typeof services !== "string" || !IDENTIFIER.test(services))) {
    warnings.push("tsazor.setup.services is not the name of an export.");
  }
  return {
    styles: stringList(value.styles, "styles", MODULE_SPECIFIER, warnings),
    services: typeof services === "string" && IDENTIFIER.test(services) ? services : undefined,
    layout: stringList(value.layout, "layout", COMPONENT, warnings),
  };
}

function stringList(value: unknown, field: string, pattern: RegExp, warnings: string[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push(`tsazor.setup.${field} is not a list.`);
    return [];
  }
  const valid = value.filter((entry): entry is string => typeof entry === "string" && pattern.test(entry));
  if (valid.length !== value.length) warnings.push(`tsazor.setup.${field} has entries that are not valid.`);
  return valid;
}

/** `npm view <spec> name version tsazor peerDependencies --json`, with the user's npm configuration (their registry). */
function npmView(spec: string): unknown {
  const result = runNpm(["view", spec, "name", "version", "tsazor", "peerDependencies", "--json"]);
  if (result.status !== 0 || result.stdout.trim() === "") {
    const reason = result.stderr.split("\n").find((line) => line.includes("404") || line.includes("ERR")) ?? result.stderr.trim();
    throw new Error(`--ui ${spec}: npm view failed${reason ? ` (${reason.trim()})` : ""}.`);
  }
  return JSON.parse(result.stdout) as unknown;
}

/** The package.json inside a package tarball (`npm pack` puts every file below `package/`). */
export function readTarballManifest(file: string): unknown {
  const tar = gunzipSync(readFileSync(file));
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = field(header, 0, 100);
    const prefix = field(header, 345, 155);
    const size = parseInt(field(header, 124, 12).trim() || "0", 8);
    const entry = prefix ? `${prefix}/${name}` : name;
    const start = offset + 512;
    if (/^[^/]+\/package\.json$/.test(entry)) return JSON.parse(tar.subarray(start, start + size).toString("utf8")) as unknown;
    offset = start + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${file}: no package.json in the tarball.`);
}

function field(header: Buffer, start: number, length: number): string {
  const raw = header.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end < 0 ? raw.length : end).toString("utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
