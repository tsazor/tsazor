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

  it("builds a library laid out in folders: helpers at any depth, NodeNext `.js` specifiers, folder imports, named component imports", async () => {
    // A port of Radzen found three gaps (F7–F9): `./x.js` became `./x.js.js`, helpers in subfolders were never
    // emitted, and a component imported by name resolved in the type check but not in the build.
    const root = await library({
      "src/Greeting.tsazor": '@import { shout } from "./utilities/text.js"\n@import { Tone } from "./enums"\n@import { Part } from "./Part.tsazor"\n<p>@shout(this.name) @Tone.Loud</p><Part />\n@code {\n    @Parameter() name = "world";\n}\n',
      "src/utilities/text.ts": 'import { exclaim } from "../helper";\n\n/** The text in capitals. */\nexport function shout(text: string): string {\n  return exclaim(text.toUpperCase());\n}\n',
      "src/helper.ts": "/** The text with an exclamation mark. */\nexport function exclaim(text: string): string {\n  return `${text}!`;\n}\n",
      "src/enums/index.ts": 'export { Tone } from "./tone.js";\n',
      "src/enums/tone.ts": 'export enum Tone {\n  Loud = "loud",\n}\n',
      "src/base/store.ts": "function logged(_target: unknown, _context: ClassAccessorDecoratorContext): void {}\n\nexport class Store {\n  @logged accessor count = 0;\n}\n",
    });
    const result = await buildLibrary({ packageDir: root, internal: ["Part"], log: () => {} });
    expect(result.errors).toEqual([]);

    const greeting = await read(root, "Greeting.js");
    expect(greeting).toContain('from "./utilities/text.js"');
    expect(greeting).toContain('from "./enums/index.js"');
    expect(greeting).not.toContain(".js.js");
    expect(await read(root, "utilities/text.js")).toContain('from "../helper.js"');
    expect(await read(root, "enums/index.js")).toContain('from "./tone.js"');
    // A decorator esbuild lowers takes the shared helpers from the package's root, a folder up here.
    expect(await read(root, "base/store.js")).toMatch(/from "\.\.\/_decorators\.js"/);
    expect(existsSync(path.join(root, "dist", "utilities", "text.d.ts"))).toBe(true);
    // The component exports its class by name as well: the named import resolves in the built module.
    expect(await read(root, "Part.js")).toMatch(/export \{[^}]*\bPart\b[^}]*\}/);
  });

  it("takes a hand-written component — src/<Name>.ts exporting <Name> — into the manifest and the index", async () => {
    // A Radzen port's F16/F18: a component written in TypeScript was in dist but in neither the manifest (its
    // parameters unknown to consumers, TZS026) nor the index's types. A helper module named otherwise stays a helper.
    const root = await library({
      "src/Badge.ts": 'import { ComponentBase, Parameter, type RenderTreeBuilder } from "@tsazor/runtime";\n\n/** A label. */\nexport class Badge extends ComponentBase {\n  /** Its text. */\n  @Parameter() text = "";\n\n  protected override buildRenderTree(b: RenderTreeBuilder): void {\n    b.openElement(0, "span");\n    b.addContent(1, this.text);\n    b.closeElement();\n  }\n}\n',
      "src/base/tinted.ts": 'import { ComponentBase } from "@tsazor/runtime";\n\nexport abstract class Tinted extends ComponentBase {}\n',
    });
    const result = await buildLibrary({ packageDir: root, internal: ["Part"], log: () => {} });
    expect(result.errors).toEqual([]);
    expect(result.components).toContain("Badge");
    const manifest = JSON.parse(await read(root, "tsazor-components.json")) as { components: Record<string, { parameters: { name: string }[] }> };
    expect(manifest.components["Badge"]?.parameters.map((parameter) => parameter.name)).toContain("text");
    expect(manifest.components["Tinted"]).toBeUndefined();
    expect(await read(root, "index.js")).toContain('export { Badge } from "./Badge.js";');
    expect(await read(root, "index.d.ts")).toContain('export { Badge } from "./Badge.js";');
    // Its declaration is tsc's, the class itself.
    expect(await read(root, "Badge.d.ts")).toContain("export declare class Badge extends ComponentBase");
  });

  it("refuses a component in a subfolder instead of leaving it out of dist", async () => {
    const root = await library({ "src/forms/Field.tsazor": "<input />\n" });
    const lines: string[] = [];
    const result = await buildLibrary({ packageDir: root, log: (line) => lines.push(line) });
    expect(result.errors.map((error) => error.file)).toEqual(["forms/Field.tsazor"]);
    expect(lines.join("\n")).toContain("a component in a subfolder is not built");
  });

  it("compiles a .ts helper's decorators as the components' are — none left raw for the browser (X9)", async () => {
    // A template's model module: its field rule was passed through as stage-3 decorator syntax, which no browser parses.
    const root = await library({
      "src/credentials.ts": 'import { Required } from "@tsazor/runtime";\n\n/** The sign-in form\'s model. */\nexport class Credentials {\n  @Required() email = "";\n}\n',
    });
    const result = await buildLibrary({ packageDir: root, log: () => {} });
    expect(result.errors).toEqual([]);
    const built = await read(root, "credentials.js");
    expect(built).not.toMatch(/^\s*@\w+\(/m);
    expect(built).toContain("Required");
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
