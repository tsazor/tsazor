/**
 * Gallery smoke tests (node --test): structural checks that the app and the
 * fluent library it depends on are wired up as the layout expects.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const read = (rel) => readFileSync(path.join(root, rel), "utf8");

describe("gallery app structure", () => {
  it("bootstraps Tsazor with Program -> App -> Router wiring", () => {
    assert.ok(existsSync(path.join(root, "src", "Program.ts")));
    assert.ok(existsSync(path.join(root, "src", "App.tsazor")));
    assert.ok(existsSync(path.join(root, "src", "_Imports.tsazor")));
    const app = read("src/App.tsazor");
    assert.match(app, /Router/);
    assert.match(app, /RouteView/);
    const program = read("src/Program.ts");
    assert.match(program, /createTsazorApp/);
  });

  it("mounts the theme state on <html data-fluent-theme>", () => {
    const themeState = read("src/ThemeState.ts");
    assert.match(themeState, /documentElement/);
    assert.match(themeState, /fluentTheme/);
    const layout = read("src/MainLayout.tsazor");
    assert.match(layout, /FluentProvider/);
  });

  it("pulls in the fluent stylesheet via the opt-in export", () => {
    assert.match(read("src/Program.ts"), /@tszor\/fluent\/fluent\.css|@tsazor\/fluent\/fluent\.css/);
    assert.ok(existsSync(path.join(root, "node_modules", "@tsazor", "fluent", "dist", "fluent.css")));
  });
});