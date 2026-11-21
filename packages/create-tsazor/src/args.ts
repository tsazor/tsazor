/**
 * The command line of `npm create tsazor`: an optional target directory and
 * the options below. Anything missing is asked for when stdin is a terminal.
 */
import { parseArgs } from "node:util";

export interface CreateArgs {
  /** The target directory, also the package name; asked for when missing. */
  dir: string | undefined;
  /** A component library: a registry name (with an optional version), a directory or a `.tgz`. */
  ui: string | undefined;
  /** Adds `@tsazor/dotnet` and an `api` script for the OpenAPI client. */
  dotnet: boolean;
  /** `false` with `--no-install`; `undefined` asks (or installs, without a terminal). */
  install: boolean | undefined;
  /** Writes into a directory that is not empty. */
  force: boolean;
  help: boolean;
  version: boolean;
}

/** A wrong command line: the message, then the usage. */
export class UsageError extends Error {}

export const USAGE = `Usage: npm create tsazor@latest [dir] [-- options]

Creates a Tsazor app in the shape of \`dotnet new blazorwasm\`: a layout with a
nav menu, the pages Home, Counter and Weather, a test, strict TypeScript.

Options:
  --ui <package>   a component library: any package that ships .tsazor components,
                   e.g. @tsazor/bootstrap or @tsazor/fluent; also a directory or a .tgz
  --dotnet         add @tsazor/dotnet, the client for an ASP.NET Core backend
  --no-install     write the files only
  --force          write into a directory that is not empty
  -h, --help       show this help
  -v, --version    show the version`;

/** Parses the arguments after `create-tsazor`; throws `UsageError` on a wrong command line. */
export function parseCreateArgs(argv: readonly string[]): CreateArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        ui: { type: "string" },
        dotnet: { type: "boolean" },
        install: { type: "boolean" },
        "no-install": { type: "boolean" },
        force: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (positionals.length > 1) throw new UsageError(`Expected one directory, got: ${positionals.join(" ")}`);
  if (values.ui !== undefined && values.ui.trim() === "") throw new UsageError("--ui needs a package name.");
  return {
    dir: positionals[0],
    ui: values.ui?.trim(),
    dotnet: values.dotnet ?? false,
    install: values["no-install"] ? false : values.install,
    force: values.force ?? false,
    help: values.help ?? false,
    version: values.version ?? false,
  };
}
