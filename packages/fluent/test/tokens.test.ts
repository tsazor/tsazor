import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const sheet = readFileSync(path.resolve(import.meta.dirname, "..", "src", "styles", "tokens.css"), "utf8").replace(/\r\n/g, "\n");

/** The declarations of the first rule whose selector list starts with `selector`, comments dropped. */
function declarations(selector: string): Map<string, string> {
  const start = sheet.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = sheet.indexOf("{", start);
  const body = sheet.slice(open + 1, sheet.indexOf("}", open)).replace(/\/\*[\s\S]*?\*\//g, "");
  const result = new Map<string, string>();
  for (const declaration of body.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    result.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
  }
  return result;
}

describe("tokens.css themes", () => {
  const light = declarations(":root,\n[data-fluent-theme=\"light\"]");
  const dark = declarations("[data-fluent-theme=\"dark\"] {");
  const osDark = declarations("  :root:not([data-fluent-theme]),\n  :root[data-fluent-theme=\"system\"]");

  it("gives the OS's dark mode the values of the explicit dark theme", () => {
    expect(Object.fromEntries(osDark)).toEqual(Object.fromEntries(dark));
  });

  it("pins light with every token the dark theme changes", () => {
    // A light subtree under a dark document or OS re-declares all of them.
    expect([...dark.keys()].filter((name) => !light.has(name))).toEqual([]);
  });

  it("flips the theme toggles the aliases read", () => {
    expect([light.get("--fui-if-light"), light.get("--fui-if-dark")]).toEqual(["initial", ""]);
    expect([dark.get("--fui-if-light"), dark.get("--fui-if-dark")]).toEqual(["", "initial"]);
  });
});
