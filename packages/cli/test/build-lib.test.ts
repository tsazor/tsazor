/**
 * D9: `buildLibrary` / `tsazor build-lib` — a component library's build without Tsazor's internal packages: the
 * components compiled as the Vite plugin compiles them, the helpers beside them, the manifest and the declarations,
 * the index and one stylesheet; a stale output removed, a compile error reported (exit 1).
 */
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLibrary } from "../src/index";
import { main } from "../src/main";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/** A small library: a component with a sidecar, an internal part, a helper, a shared stylesheet. */
async function library(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "tsazor-build-lib-"));
  roots.push(root);
  const sources: Record<string, string> = {
    "package.json": JSON.stringify({ name: "my-lib", type: "module", tsazor: { components: "./dist/tsazor-components.json" } }),
    "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, target: "ES2022", module: "ESNext", moduleResolution: "bundler", noEmit: true }, include: ["src"] }),
    "src/Greeting.tsazor": '@import { shout } from "./helper"\n<p class="greeting">@shout(this.name)</p><Part />\n@code {\n    /** Who is greeted. */\n    @Parameter() name = "world";\n}\n',
    "src/Greeting.tsazor.css": ".greeting { color: teal; }\n",
    "src/Part.tsazor": "<span>part @count</span>\n@code {\n    @State() accessor count = 0;\n}\n",
    "src/helper.ts": "/** The text in capitals. */\nexport function shout(text: string): string {\n  return text.toUpperCase();\n}\n",
    "src/styles/base.css": ":root { --my-lib-gap: 4px; }\n",
    ...files,
  };
  for (const [file, text] of Object.entries(sources)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  }
  // The library's @tsazor/runtime: the workspace's own package, linked as pnpm links it (the check reports a
  // runtime it can't resolve).
  await mkdir(path.join(root, "node_modules", "@tsazor"), { recursive: true });
  await symlink(fileURLToPath(new URL("../../runtime", import.meta.url)), path.join(root, "node_modules", "@tsazor", "runtime"), "junction");
  return root;
}

const read = (root: string, file: string) => readFile(path.join(root, "dist", file), "utf8");

describe("buildLibrary (D9)", () => {
  it("builds the components, the helpers, the manifest, the declarations, the index and the stylesheet", async () => {
    const root = await library();
    await mkdir(path.join(root, "dist"), { recursive: true });
    await writeFile(path.join(root, "dist", "Removed.js"), "// an earlier build's\n");
    const lines: string[] = [];
    const result = await buildLibrary({
      packageDir: root,
      internal: ["Part"],
      aliases: { Hello: "Greeting" },
      exports: ['export { shout } from "./helper.js"'],
      typeExports: ['export type { RenderFragment } from "@tsazor/runtime"'],
      stylesheet: { file: "my-lib.css", header: "/* my-lib */" },
      log: (line) => lines.push(line),
    });
    expect(result).toEqual({ components: ["Greeting", "Hello"], errors: [] });
    expect(lines).toEqual(["[my-lib] built 2 component(s) -> dist/"]);

    const greeting = await read(root, "Greeting.js");
    expect(greeting).toContain('from "./helper.js"');
    // Tsazor's field decorators applied after the class: no decorator lowering, no helpers.
    expect(greeting).toContain("__tsazor_decorateFields(Greeting, { name: [Parameter()] });");
    expect(greeting).not.toContain("__decorateElement");
    // A decorator esbuild lowers (an accessor's) takes the helpers from one module, not a copy in each component.
    const part = await read(root, "Part.js");
    expect(part).toMatch(/^import \{ __[\w, ]+ \} from "\.\/_decorators\.js";/);
    expect(part).not.toContain("var __decorateElement");
    expect(await read(root, "_decorators.js")).toContain("export { ");
    expect(greeting).toContain('from "./Part.js"');
    expect(greeting).not.toMatch(/from "[^"]*\.tsazor"/);
    // The source named from the package, no build machine's path.
    expect(greeting).toContain("/* @code (src/Greeting.tsazor:");
    expect(greeting).not.toContain(path.basename(root));
    expect(existsSync(path.join(root, "dist", "Part.js"))).toBe(true);
    expect(await read(root, "index.js")).toBe(
      'export { default as Greeting } from "./Greeting.js";\nexport { shout } from "./helper.js";\nexport { default as Hello } from "./Greeting.js";\n',
    );
    expect(await read(root, "index.d.ts")).toContain('export type { RenderFragment } from "@tsazor/runtime";\n');
    const manifest = JSON.parse(await read(root, "tsazor-components.json")) as { package: string; components: Record<string, { parameters: { name: string; doc?: string }[] }> };
    expect(manifest.package).toBe("my-lib");
    expect(Object.keys(manifest.components)).toEqual(["Greeting", "Hello"]);
    expect(manifest.components.Greeting!.parameters[0]).toMatchObject({ name: "name", doc: "Who is greeted." });
    expect(await read(root, "Greeting.d.ts")).toContain("name: string;");
    expect(await read(root, "helper.d.ts")).toContain("export declare function shout(text: string): string;");
    expect(await read(root, "my-lib.css")).toBe(
      "/* my-lib */\n/* base.css */\n:root { --my-lib-gap: 4px; }\n\n/* Greeting (.tsazor.css) */\n.greeting { color: teal; }\n\n",
    );
    expect(existsSync(path.join(root, "dist", "Removed.js"))).toBe(false);
  });

  it("keeps what it wrote though the clock stepped back during the build (WSL's does when it syncs)", async () => {
    const root = await library();
    // The build starts a minute later than the files it writes are stamped.
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
    try {
      const result = await buildLibrary({ packageDir: root, internal: ["Part"], log: () => {} });
      expect(result.errors).toEqual([]);
    } finally {
      now.mockRestore();
    }
    for (const file of ["_decorators.js", "Greeting.js", "Part.js", "index.js", "index.d.ts", "tsazor-components.json"]) {
      expect(existsSync(path.join(root, "dist", file)), file).toBe(true);
    }
  });

  it("is `tsazor build-lib [dir] [--stylesheet <file>]`: 0 when it built, 1 on a compile error, 2 on a wrong option", async () => {
    const out: string[] = [];
    const ok = await library();
    expect(await main(["node", "tsazor", "build-lib", ok, "--stylesheet", "my-lib.css"], (line) => out.push(line))).toBe(0);
    expect(existsSync(path.join(ok, "dist", "my-lib.css"))).toBe(true);

    const broken = await library({ "src/Broken.tsazor": "<p>@(1 + </p>\n" });
    expect(await main(["node", "tsazor", "build-lib", broken], (line) => out.push(line))).toBe(1);
    expect(out.join("\n")).toContain("src/Broken.tsazor(1,4) TZS003");
    expect(out.join("\n")).toContain("[my-lib] tsazor check: 2 error(s) — nothing was built");
    expect(existsSync(path.join(broken, "dist"))).toBe(false);
    // Without the check the compiler reports it.
    expect(await main(["node", "tsazor", "build-lib", broken, "--no-check"], (line) => out.push(line))).toBe(1);
    expect(out.join("\n")).toContain("[my-lib] compile errors in Broken.tsazor");

    const mistyped = await library({ "src/Count.tsazor": "<p>@this.count.toFixed(1)</p>\n@code {\n    @Parameter() count?: number;\n}\n" });
    expect(await main(["node", "tsazor", "build-lib", mistyped], (line) => out.push(line))).toBe(1);
    expect(out.join("\n")).toMatch(/src\/Count\.tsazor\(1,\d+\) TS2532/);

    expect(await main(["node", "tsazor", "build-lib", ok, "--minify"], (line) => out.push(line))).toBe(2);
  });
});
