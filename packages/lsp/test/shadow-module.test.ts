/**
 * Shadow-module tests over a temp workspace: pipeline parity with the vite
 * plugin (shared resolution, inherited @imports, code-behind) plus the v2
 * import rewrites.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildShadowModule, shadowPathFor, tsazorOfShadowPath, isShadowPath } from "../src/shadow-module";

let root = "";
let cleanup: () => Promise<void>;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-lsp-shadow-"));
  await mkdir(path.join(root, "Pages"), { recursive: true });
  await mkdir(path.join(root, "Shared"), { recursive: true });
  await writeFile(path.join(root, "_Imports.tsazor"), "@using ./Shared\n");
  await writeFile(
    path.join(root, "Shared", "Alert.tsazor"),
    '<div class="alert">@Variant</div>\n\n@code {\n    @Parameter() Variant?: string;\n}\n',
  );
  await writeFile(
    path.join(root, "Pages", "Demo.tsazor.ts"),
    "import { ComponentBase } from '@tsazor/runtime';\nexport default class DemoBase extends ComponentBase {}\n",
  );
  await writeFile(
    path.join(root, "Pages", "Demo.tsazor"),
    [
      "@page \"/demo\"",
      "",
      "<Alert Variant=\"@size\" />",
      "<p>@count</p>",
      "",
      "@code {",
      "    count = 3;",
      "    size = \"big\";",
      "}",
    ].join("\n"),
  );
  // Bare-package component stub: @fake/ui ships .tsazor sources (like
  // @tsazor/components) — the v2 rewrite must shadow from source.
  const pkg = path.join(root, "node_modules", "@fake", "ui");
  await mkdir(path.join(pkg, "src"), { recursive: true });
  // Its entry exports Badge — bare-package tags resolve only against the export list.
  writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@fake/ui", version: "1.0.0", main: "./index.js" }));
  writeFileSync(path.join(pkg, "index.js"), 'export { default as Badge } from "./dist/Badge.js";\nexport { default as Chip } from "./dist/Chip.js";\n');
  writeFileSync(path.join(pkg, "src", "Badge.tsazor"), '<span class="badge">@Text</span>\n\n@code {\n    @Parameter() Text?: string;\n}\n');
  writeFileSync(path.join(pkg, "src", "Chip.tsazor"), '<i class="chip">@Text</i>\n\n@code {\n    @Parameter() Text?: string;\n}\n');
  cleanup = async () => rm(root, { recursive: true, force: true });
});

afterAll(() => cleanup());

const build = () => buildShadowModule(path.join(root, "Pages", "Demo.tsazor"), demoSource, root);
const demoSource = ["<Alert Variant=\"@size\" />", "", "@code {", "    count = 3;", "}"].join("\n");

describe("buildShadowModule", () => {
  it("mirrors the build pipeline: runtime imports, code-behind import, runtime tags", async () => {
    const shadow = await buildShadowModule(
      path.join(root, "Pages", "Demo.tsazor"),
      [
        "@page \"/demo\"",
        "",
        "<NavLink href=\"x\">a</NavLink>",
        "",
        "@code {",
        "    count = 3;",
        "}",
      ].join("\n"),
      root,
    );
    expect(shadow).not.toBeNull();
    expect(shadow!.code).toContain('from "@tsazor/runtime"');
    expect(shadow!.code).toContain('import DemoBase from "./Demo.tsazor.ts";');
    expect(shadow!.code).toContain("extends DemoBase");
    expect(shadow!.code).toContain("export default class Demo extends DemoBase {");
    // NavLink is a runtime component tag: the compiler imports it itself.
    expect(shadow!.code).toContain('import { NavLink as __tsazor_comp_NavLink } from "@tsazor/runtime";');
  });

  it("rewrites sibling .tsazor component imports to their shadow", async () => {
    const shadow = await build();
    // Demo (Pages/) imports Alert (Shared/) → "../Shared/Alert.tsazor.gen".
    expect(shadow!.code).toContain('import __tsazor_comp_Alert from "../Shared/Alert.tsazor.gen";');
    expect(shadow!.code).not.toContain('from "../Shared/Alert.tsazor";');
  });

  it("rewrites bare-package components to their shipped .tsazor sources", async () => {
    // Bare `@using @fake/ui` must live in _Imports.tsazor: component resolution
    // consults the imports chain only (same as the build pipeline).
    const pkgRoot = path.join(root, "badge-ws");
    await mkdir(path.join(pkgRoot, "Pages"), { recursive: true });
    await writeFile(path.join(pkgRoot, "_Imports.tsazor"), "@using @fake/ui\n");
    const shadow = await buildShadowModule(path.join(pkgRoot, "Pages", "B.tsazor"), '<Badge Text="hi" />\n', root);
    expect(shadow).not.toBeNull();
    const badgeImport = shadow!.code.split("\n").find((l) => l.includes("__tsazor_comp_Badge"));
    expect(badgeImport).toBeDefined();
    expect(badgeImport!).toContain("node_modules");
    expect(badgeImport!).toContain(path.join("src", "Badge.tsazor.gen.ts").replace(/\\/g, "/"));
  });

  it("splits a multi-name package import into per-component shadows (found by the tarball gate)", async () => {
    // `{ Badge, Chip }` binds names from two different component files — the
    // earlier single-shadow rebinding made the second name a TS2724.
    const pkgRoot = path.join(root, "badge-ws");
    await writeFile(path.join(pkgRoot, "_Imports.tsazor"), "@using @fake/ui\n");
    await writeFile(path.join(pkgRoot, "Pages", "C.tsazor"), "");
    const shadow = await buildShadowModule(
      path.join(pkgRoot, "Pages", "C.tsazor"),
      '<Badge Text="hi" />\n<Chip Text="yo" />\n',
      root,
    );
    const code = shadow!.code;
    expect(code).toContain("import { Badge as __tsazor_comp_Badge }");
    expect(code).toContain("import { Chip as __tsazor_comp_Chip }");
    // Each name lands on its own component shadow…
    expect(code).toContain(path.join("src", "Badge.tsazor.gen.ts").replace(/\\/g, "/"));
    expect(code).toContain(path.join("src", "Chip.tsazor.gen.ts").replace(/\\/g, "/"));
    // …and nothing is imported from the package itself any more.
    expect(code).not.toContain('from "@fake/ui"');
  });

  it("keeps the real sidecar .ts import untouched (resolves to the real file)", async () => {
    const shadow = await build();
    expect(shadow!.code).toContain('from "./Demo.tsazor.ts";');
  });

  it("attaches the raw mappings for position translation", async () => {
    const shadow = await buildShadowModule(
      path.join(root, "Pages", "Demo.tsazor"),
      '<p>@count</p>\n\n@code {\n    count = 3;\n}\n',
      root,
    );
    expect(shadow!.map).toBeDefined();
    expect(shadow!.map.genToSrc(0, 0)).toBeNull(); // synthetic header lines
    const stmtLine = shadow!.code.split("\n").findIndex((l) => l.includes("this.count"));
    expect(stmtLine).toBeGreaterThan(0);
    // The @-statement maps back onto the `@` of `@count` (0-based line 0, col 3).
    expect(shadow!.map.genToSrc(stmtLine, 4)).toEqual({ line: 0, character: 3 });
    // Forward: source col 4 (the identifier) lands on its own generated token —
    // the synthetic `this.` prefix carries no source position.
    const fwd = shadow!.map.srcToGen(0, 4);
    const genLine = shadow!.code.split("\n")[fwd!.line]!;
    expect(genLine.slice(fwd!.column, fwd!.column + 10)).toBe("count);");
    expect(shadow!.map.genToSrc(fwd!.line, fwd!.column)).toEqual({ line: 0, character: 4 });
  });

  it("writes the shadow next to the real file", async () => {
    const shadow = await build();
    const real = path.join(root, "Pages", "Demo.tsazor");
    expect(shadow!.virtualPath).toBe(shadowPathFor(real));
    expect(shadow!.virtualPath.endsWith("Demo.tsazor.gen.ts")).toBe(true);
    expect(isShadowPath(shadow!.virtualPath)).toBe(true);
    expect(tsazorOfShadowPath(shadow!.virtualPath)?.replace(/\\/g, "/")).toContain("/Pages/Demo.tsazor");
  });

  it("maps the _Imports.tsazor chain to trivial modules", async () => {
    const importsShadow = await buildShadowModule(path.join(root, "_Imports.tsazor"), "@using ./Shared\n", root);
    expect(importsShadow!.code).toBe("export default null;\n");
  });

  it("stays graceful on broken markup (lenient parser; v1 layer carries diagnostics)", async () => {
    // The compiler never throws on unclosed markup — it parses leniently and
    // reports diagnostics instead, so the shadow also stays available (the
    // try/catch in buildShadowModule remains as a safety net for true
    // internal errors only).
    const broken = await buildShadowModule(path.join(root, "Pages", "Broken.tsazor"), '<p>unclosed', root);
    expect(broken).not.toBeNull();
    expect(broken!.code).toContain('openElement(0, "p")');
    // Unmapped generated regions degrade to null instead of mistranslating.
    expect(broken!.map.genToSrc(0, 0)).toBeNull();
  });
});