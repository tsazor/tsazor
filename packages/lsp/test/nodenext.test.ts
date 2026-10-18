/**
 * `module`/`moduleResolution: nodenext` in an ESM package (`"type": "module"`): a relative ESM import needs its
 * extension, and the shadows import each other extensionless (`./Icon.tsazor.gen`) — a MudBlazor port met TS2307 on
 * every component import. Bare tags, default, named and type imports between components and a `.ts` helper's type
 * import of a component check clean.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkProject, type CheckDiagnostic } from "../src/check";

const runtimeDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../runtime/dist/index.js").replace(/\\/g, "/");

let root = "";
let diagnostics: CheckDiagnostic[] = [];

const FILES: Record<string, string> = {
  "src/Icon.tsazor": '<i class="@Name"></i>\n\n@code {\n    @Parameter() Name = "";\n    public describe(): string {\n        return this.Name;\n    }\n}\n',
  "src/BareTag.tsazor": '<Icon Name="home" />\n',
  "src/DefaultImport.tsazor": '@import Icon from "./Icon.tsazor"\n<Icon Name="x" @ref="icon" />\n\n@code {\n    private icon?: Icon;\n    private text(): string {\n        return this.icon?.describe() ?? "";\n    }\n}\n',
  "src/NamedImport.tsazor": '@import { Icon } from "./Icon.tsazor"\n<Icon Name="x" @ref="icon" />\n\n@code {\n    private icon?: Icon;\n}\n',
  "src/TypeImport.tsazor": '@import type { Icon } from "./Icon.tsazor"\n<p></p>\n\n@code {\n    private icon?: Icon;\n}\n',
  "src/base/describe.ts": 'import type Icon from "../Icon.tsazor";\nexport function describe(icon: Icon): string {\n    return icon.describe();\n}\n',
};

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-nodenext-"));
  const rt = path.join(root, "node_modules", "@tsazor", "runtime");
  mkdirSync(rt, { recursive: true });
  writeFileSync(path.join(rt, "package.json"), JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }));
  // The real runtime declarations (built by the gate before the tests run).
  writeFileSync(path.join(rt, "index.d.ts"), `export * from "${runtimeDist.replace(/\.js$/, "")}";\n`);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "probe", type: "module" }));
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "nodenext", moduleResolution: "nodenext", strict: true, lib: ["ES2022", "DOM"], skipLibCheck: true },
      include: ["src/**/*.ts", "src/**/*.tsazor"],
    }),
  );
  mkdirSync(path.join(root, "src", "base"), { recursive: true });
  for (const [name, text] of Object.entries(FILES)) await writeFile(path.join(root, name), text);
  diagnostics = (await checkProject(root)).diagnostics;
}, 60_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("tsazor check — nodenext", () => {
  it("components import each other — tag, default, named, type — and a .ts helper imports one's type", () => {
    expect(diagnostics.map((d) => `${path.basename(d.file)} ${d.code} ${d.message}`)).toEqual([]);
  });
});
