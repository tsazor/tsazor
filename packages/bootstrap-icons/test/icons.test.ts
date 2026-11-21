import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import * as Icons from "../dist/index.js";

const dist = path.resolve(import.meta.dirname, "..", "dist");

describe("@tsazor/bootstrap-icons", () => {
  it("writes an icon as Icons.<Name>, an IconValue on Bootstrap's 16px grid", () => {
    expect(Icons.Alarm).toEqual({ name: "alarm", viewBox: "0 0 16 16", content: expect.stringMatching(/^<path d="[^"]+"\/><path d="[^"]+"\/>$/) });
    expect(Icons.AlarmFill.name).toBe("alarm-fill");
  });

  it("a name that starts with a digit gets Number in front", () => {
    expect(Icons.Number0Circle.name).toBe("0-circle");
    expect(Icons.Number123.name).toBe("123");
  });

  it("has the whole set", () => {
    expect(Object.keys(Icons).length).toBeGreaterThan(2000);
  });

  it("a page that uses one icon ships only that one", async () => {
    const work = mkdtempSync(path.join(tmpdir(), "tsazor-bootstrap-icons-"));
    try {
      writeFileSync(
        path.join(work, "entry.js"),
        `import * as Icons from ${JSON.stringify(path.join(dist, "index.js").replaceAll("\\", "/"))};\nexport const used = Icons.Alarm;\n`,
      );
      await build({ root: work, logLevel: "silent", build: { lib: { entry: "entry.js", formats: ["es"], fileName: "out" }, outDir: "out", minify: false } });
      const output = readFileSync(path.join(work, "out", "out.mjs"), "utf8");
      expect(output).toContain(Icons.Alarm.content.slice(0, 40));
      expect(output).not.toContain(Icons.AlarmFill.content.slice(0, 40));
      expect(output.length).toBeLessThan(3000);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
