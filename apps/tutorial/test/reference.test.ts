/**
 * Gate for the reference (`/reference`): every component of the documented
 * packages has a doc comment and every parameter a JSDoc (D-R3); every
 * `#section` link of the language page has its anchor; anchors are unique.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LANGUAGE_PATH, loadReference, slugify } from "../build/reference";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const reference = loadReference(repoRoot);

describe("components", () => {
  for (const pkg of reference.packages) {
    it(`${pkg.name}: every component and parameter is documented`, () => {
      expect(pkg.components.length).toBeGreaterThan(0);
      const undocumented = pkg.components.flatMap((component) => [
        ...(component.doc ? [] : [`${component.name} (component)`]),
        ...component.parameters.filter((parameter) => !parameter.doc).map((parameter) => `${component.name}.${parameter.name}`),
      ]);
      expect(undocumented).toEqual([]);
    });
  }

  it("shows parameters as markup names with their defaults", () => {
    const button = reference.packages.find((pkg) => pkg.slug === "bootstrap")!.components.find((component) => component.name === "Button")!;
    const intent = button.parameters.find((parameter) => parameter.name === "Intent")!;
    expect(intent).toMatchObject({ type: "Intent", default: '"primary"', required: false });
    expect(button.summary).not.toMatch(/<p>/);
  });

  it("shows a tag named in a doc as text", () => {
    const summary = reference.packages.find((pkg) => pkg.slug === "runtime")!.components.find((component) => component.name === "ValidationSummary")!;
    expect(summary.parameters.find((parameter) => parameter.name === "AdditionalAttributes")!.doc).toContain("&lt;ul&gt;");
  });
});

describe("language page", () => {
  const { html, headings } = reference.language;

  it("has unique anchors for every heading", () => {
    expect(headings.length).toBeGreaterThan(15);
    expect(new Set(headings.map((heading) => heading.id)).size).toBe(headings.length);
  });

  it("resolves every #section link", () => {
    const ids = new Set(headings.map((heading) => heading.id));
    const targets = [...html.matchAll(new RegExp(`href="${LANGUAGE_PATH}#([^"]+)"`, "g"))].map((match) => match[1]!);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.filter((target) => !ids.has(target))).toEqual([]);
  });

  it("slugifies like GitHub", () => {
    expect(slugify("@authorize and @attribute")).toBe("authorize-and-attribute");
    expect(slugify("Two-way parameters: <code>@Bindable()</code> (Tsazor extension)")).toBe("two-way-parameters-bindable-tsazor-extension");
    expect(slugify("Compatibility .razor ↔ .tsazor")).toBe("compatibility-razor--tsazor");
  });
});

describe("diagnostics page", () => {
  it("lists every code of the compiler's catalog with a unique anchor, a description and a fix", () => {
    const { diagnostics } = reference;
    expect(diagnostics.length).toBeGreaterThan(25);
    expect(new Set(diagnostics.map((diagnostic) => diagnostic.id)).size).toBe(diagnostics.length);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.id).toMatch(/^tzs\d{3}$/);
      expect(diagnostic.title.length, diagnostic.code).toBeGreaterThan(5);
      expect(diagnostic.description, diagnostic.code).toMatch(/<p>/);
      expect(diagnostic.fix, diagnostic.code).toMatch(/<(p|pre)/);
    }
  });
});

describe("API pages", () => {
  for (const pkg of reference.api) {
    it(`${pkg.name}: every export and member is documented`, () => {
      expect(pkg.symbols.length).toBeGreaterThan(0);
      const undocumented = pkg.symbols.flatMap((symbol) => [
        ...(symbol.doc ? [] : [`${symbol.name} (export)`]),
        ...symbol.members.filter((member) => !member.doc).map((member) => `${symbol.name}.${member.name}`),
      ]);
      expect(undocumented).toEqual([]);
    });
  }

  it("prints signatures without export/declare and without private members", () => {
    const runtime = reference.api.find((pkg) => pkg.slug === "runtime")!;
    const navigation = runtime.symbols.find((symbol) => symbol.name === "NavigationManager")!;
    const text = (html: string): string => html.replace(/<[^>]*>/g, "");
    expect(text(navigation.signature)).toBe("class NavigationManager");
    expect(navigation.members.map((member) => member.name)).toContain("navigateTo");
    expect(navigation.members.map((member) => member.name)).not.toContain("scrollTarget");
    expect(runtime.symbols.every((symbol) => !/^(export|declare)\b/.test(text(symbol.signature)))).toBe(true);
  });

  it("links component classes to their component page", () => {
    const runtime = reference.api.find((pkg) => pkg.slug === "runtime")!;
    expect(runtime.symbols.find((symbol) => symbol.name === "NavLink")!.component).toBe("reference/components/runtime/NavLink");
    const pages = new Set(reference.packages.flatMap((pkg) => pkg.components.map((component) => `reference/components/${pkg.slug}/${component.name}`)));
    for (const symbol of reference.api.flatMap((pkg) => pkg.symbols)) {
      if (symbol.component) expect(pages.has(symbol.component), symbol.name).toBe(true);
    }
  });
});
