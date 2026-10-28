/**
 * esbuild's decorator helpers, shared (src/shared-helpers.ts): a component imports them from one module instead of
 * declaring its own copy, keeps every line where it was (its source map stays right), keeps a helper the shared module
 * lacks, and runs the same.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { transformSync } from "esbuild";
import { describe, expect, it } from "vitest";
import { DECORATOR_HELPER_PROBE, shareHelpers, sharedHelperModule } from "../src/shared-helpers";

const lower = (code: string) => transformSync(code, { loader: "ts", supported: { decorators: false }, tsconfigRaw: { compilerOptions: { target: "es2022" } } }).code;

const component = `
const seen: string[] = [];
const Parameter = () => (_value: unknown, context: ClassFieldDecoratorContext) => {
  seen.push(String(context.name));
  (context.metadata as Record<string, unknown>)[String(context.name)] = true;
};
export class Badge {
  @Parameter() variant = "default";
  @Parameter() size?: string;
}
export { seen };
`;

describe("shared decorator helpers", () => {
  const helpers = sharedHelperModule(lower(DECORATOR_HELPER_PROBE));

  it("are the probe's whole helper set, exported", () => {
    for (const name of ["__decorateElement", "__runInitializers", "__decoratorStart", "__decoratorMetadata", "__publicField", "__privateGet"]) {
      expect([...helpers.declarations].some((declaration) => declaration.startsWith(`var ${name} = `)), name).toBe(true);
    }
    expect(helpers.code).toMatch(/\nexport \{ __[\w, ]+ \};\n$/);
  });

  it("replace a component's own copy with an import, every line where it was", () => {
    const lowered = lower(component);
    const shared = shareHelpers(lowered, helpers, "./helpers.mjs");
    expect(shared).toMatch(/^import \{ __[\w, ]+ \} from "\.\/helpers\.mjs";/);
    expect(shared).not.toContain("var __decorateElement");
    expect(shared.split("\n")).toHaveLength(lowered.split("\n").length);
  });

  it("keep a helper the shared module lacks", () => {
    const lowered = lower(component);
    const without = { ...helpers, declarations: new Set([...helpers.declarations].filter((declaration) => !declaration.startsWith("var __runInitializers = "))) };
    const shared = shareHelpers(lowered, without, "./helpers.mjs");
    expect(shared).toContain("var __runInitializers");
    expect(shared).not.toContain("var __decorateElement");
  });

  it("keep a helper another esbuild wrote differently, though the name is the same", () => {
    const lowered = lower(component).replace("var __runInitializers = ", "var __runInitializers = /* another esbuild */ ");
    const shared = shareHelpers(lowered, helpers, "./helpers.mjs");
    expect(shared).toContain("var __runInitializers");
    expect(shared).not.toContain("var __decorateElement");
  });

  it("run the same: the decorators run and the metadata is the class's", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tsazor-helpers-"));
    try {
      await writeFile(path.join(dir, "helpers.mjs"), helpers.code);
      await writeFile(path.join(dir, "badge.mjs"), shareHelpers(lower(component), helpers, "./helpers.mjs"));
      // In a Node process of its own: the module as an app loads it, helpers imported.
      await writeFile(path.join(dir, "run.mjs"), `import { Badge, seen } from "./badge.mjs";
const metadata = Badge[Symbol.metadata ?? Symbol.for("Symbol.metadata")];
console.log(JSON.stringify({ seen, variant: new Badge().variant, metadata: { ...metadata } }));
`);
      const run = spawnSync(process.execPath, [path.join(dir, "run.mjs")], { encoding: "utf8" });
      expect(run.stderr).toBe("");
      expect(JSON.parse(run.stdout)).toEqual({ seen: ["variant", "size"], variant: "default", metadata: { variant: true, size: true } });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    // A child process: well under a second alone, over vitest's 5 s with every package testing at once.
  }, 60_000);
});
