import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import * as Icons from "../dist/index.js";

const dist = path.resolve(import.meta.dirname, "..", "dist");

describe("@tsazor/fluent-icons", () => {
  it("writes an icon as Fluent UI Blazor does: Icons.<Variant>.Size<N>.<Name>, an IconValue", () => {
    expect(Icons.Regular.Size20.Add).toEqual({
      name: "add",
      viewBox: "0 0 20 20",
      content: expect.stringMatching(/^<path d="[^"]+"\/>$/),
    });
    expect(Icons.Filled.Size24.Delete.viewBox).toBe("0 0 24 24");
    expect(Icons.Regular.Size16.ArrowLeft.name).toBe("arrow-left");
  });

  it("has the variants and the sizes of the source set", () => {
    expect(Object.keys(Icons).sort()).toEqual(["Color", "Filled", "Light", "Regular"]);
    expect(Object.keys(Icons.Regular)).toEqual(expect.arrayContaining(["Size10", "Size12", "Size16", "Size20", "Size24", "Size28", "Size32", "Size48"]));
    expect(Object.keys(Icons.Regular.Size20).length).toBeGreaterThan(2000);
  });

  it("a page that uses one icon ships only that one (the bundler drops the rest)", async () => {
    const work = mkdtempSync(path.join(tmpdir(), "tsazor-fluent-icons-"));
    try {
      writeFileSync(
        path.join(work, "entry.js"),
        `import * as Icons from ${JSON.stringify(path.join(dist, "index.js").replaceAll("\\", "/"))};\nexport const used = Icons.Regular.Size20.Add;\n`,
      );
      await build({
        root: work,
        logLevel: "silent",
        build: { lib: { entry: "entry.js", formats: ["es"], fileName: "out" }, outDir: "out", minify: false },
      });
      const output = readFileSync(path.join(work, "out", "out.mjs"), "utf8");
      expect(output).toContain(Icons.Regular.Size20.Add.content.slice(0, 40));
      expect(output).not.toContain(Icons.Regular.Size20.Delete.content.slice(0, 40));
      expect(output).not.toContain(Icons.Regular.Size24.Add.content.slice(0, 40));
      expect(output.length).toBeLessThan(2000);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
