/**
 * The ABI (api/abi.json; docs/support-policy.md, D-S7): what compiled .tsazor code calls in @tsazor/runtime. A library
 * compiled with 1.x must run on every later 1.y, so the compiler may emit only what the list declares, and the runtime
 * must declare all of it — in its published declarations, where `stripInternal` would drop an `@internal` member.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile";

const repo = path.resolve(import.meta.dirname, "..", "..", "..");
const abi = JSON.parse(readFileSync(path.join(repo, "api", "abi.json"), "utf8")) as {
  imports: string[];
  builder: string[];
  statics: string[];
  overrides: string[];
};

function tsazorFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) tsazorFiles(file, out);
    else if (name.endsWith(".tsazor") && name !== "_Imports.tsazor") out.push(file);
  }
  return out;
}

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
const outside = (values: Iterable<string>, list: readonly string[]) => sorted(values).filter((value) => !list.includes(value));

describe("the ABI the compiler emits (api/abi.json)", () => {
  it("is what the components of the repository compile to: the skins, the libraries, the apps", () => {
    const corpus = [
      ...["bootstrap", "fluent", "charts", "markdown"].flatMap((name) => tsazorFiles(path.join(repo, "packages", name, "src"))),
      ...readdirSync(path.join(repo, "apps"))
        .filter((app) => app !== "fluentcms-admin" && statSync(path.join(repo, "apps", app)).isDirectory())
        .flatMap((app) => (statSync(path.join(repo, "apps", app, "src"), { throwIfNoEntry: false })?.isDirectory() ? tsazorFiles(path.join(repo, "apps", app, "src")) : [])),
    ];
    expect(corpus.length).toBeGreaterThan(400);
    const builder: string[] = [];
    const statics: string[] = [];
    const imports: string[] = [];
    let renders = 0;
    for (const file of corpus) {
      const { code } = compile(readFileSync(file, "utf8"), { className: "Component", fileName: file, generateSourceMap: false });
      for (const match of code.matchAll(/\b__builder\d*\.(\w+)\(/g)) builder.push(match[1]!);
      for (const match of code.matchAll(/\b__tsazor_(?!comp_)(\w+)\.(\w+)\(/g)) statics.push(`${match[1]}.${match[2]}`);
      for (const match of code.matchAll(/\b(\w+) as __tsazor_(?!comp_)\w+/g)) imports.push(match[1]!);
      if (/\boverride buildRenderTree\(/.test(code)) renders++;
    }
    expect(renders).toBeGreaterThan(400);
    expect(outside(builder, abi.builder), "RenderTreeBuilder methods emitted but not in api/abi.json").toEqual([]);
    expect(outside(statics, abi.statics), "static calls emitted but not in api/abi.json").toEqual([]);
    expect(outside(imports, abi.imports), "runtime imports emitted but not in api/abi.json").toEqual([]);
  });

  it("is everything the code generator can emit, the rare paths too (transitions, @animate, @bind formats)", () => {
    const codegen = readFileSync(path.join(import.meta.dirname, "..", "src", "codegen.ts"), "utf8");
    const imports = [...codegen.matchAll(/\bruntime(?:Imports|Aliases)\.add\("(\w+)"\)/g)].map((match) => match[1]!);
    // What the generated module declares itself (`declare const __tsazor_deferred`, a shadow's marker) is no import.
    const declared = new Set([...codegen.matchAll(/declare const \$\{alias\("(\w+)"\)\}/g)].map((match) => match[1]!));
    const aliases = [...codegen.matchAll(/\balias\("(\w+)"\)/g)].map((match) => match[1]!).filter((name) => /^[a-zA-Z]{3,}$/.test(name) && !declared.has(name));
    const builder = [...codegen.matchAll(/\$\{BUILDER\}\.(\w+)\(/g)].map((match) => match[1]!);
    expect(imports.length).toBeGreaterThan(10);
    expect(outside(imports, abi.imports), "runtime imports in codegen.ts but not in api/abi.json").toEqual([]);
    expect(outside(aliases, abi.imports), "hygienic aliases in codegen.ts but not in api/abi.json").toEqual([]);
    expect(outside(builder, abi.builder), "builder calls in codegen.ts but not in api/abi.json").toEqual([]);
  });

  it("is declared by the runtime's published declarations (the API snapshots)", () => {
    const runtime = ["runtime.api.d.ts", "runtime.internal.api.d.ts"].map((file) => readFileSync(path.join(repo, "api", file), "utf8")).join("\n");
    const classBody = (name: string) => {
      const start = runtime.search(new RegExp(`export declare (?:abstract )?class ${name}\\b`));
      expect(start, `class ${name} in the runtime's snapshot`).toBeGreaterThanOrEqual(0);
      return runtime.slice(start, runtime.indexOf("\n}\n", start));
    };
    const missing = [
      ...abi.imports.filter((name) => !new RegExp(`^// ${name}$`, "m").test(runtime)),
      ...abi.builder.filter((method) => !new RegExp(`\\n {4}${method}[<(]`).test(classBody("RenderTreeBuilder"))).map((method) => `RenderTreeBuilder.${method}`),
      ...abi.statics.filter((member) => {
        const [owner, name] = member.split(".") as [string, string];
        return !new RegExp(`\\n {4}static ${name}[<(]`).test(classBody(owner));
      }),
      ...abi.overrides.filter((hook) => !new RegExp(`\\n {4}protected ${hook}\\(`).test(classBody("ComponentBase"))).map((hook) => `ComponentBase.${hook}`),
    ];
    expect(missing).toEqual([]);
  });
});
