/**
 * E5 lazy routes, end to end through Vite: the dashboard pages (matched by
 * the config's `lazyRoutes`) build to chunks of their own, the main chunk
 * does not contain their code, and the routes manifest loads them with
 * dynamic imports.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("lazy routes in the build", () => {
  it("puts each lazy dashboard page into its own chunk", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "gallery-lazy-"));
    try {
      await build({ root, logLevel: "silent", build: { outDir, emptyOutDir: true } });
      const assets = readdirSync(path.join(outDir, "assets")).filter((file) => file.endsWith(".js"));
      for (const page of ["DashboardHome", "OrdersPage", "SettingsPage"]) {
        assert.ok(assets.some((file) => file.startsWith(`${page}-`)), `${page} has a chunk (${assets.join(", ")})`);
      }
      const main = assets.find((file) => file.startsWith("index-"));
      assert.ok(main, `a main chunk (${assets.join(", ")})`);
      const mainCode = readFileSync(path.join(outDir, "assets", main), "utf8");
      assert.doesNotMatch(mainCode, /Admin dashboard/, "the dashboard's text is not in the main chunk");
      assert.match(mainCode, /\/dashboard\/orders/, "the main chunk knows the lazy routes' templates");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
