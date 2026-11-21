/**
 * Abstract components (the BlazorHero port's B38): a .tsazor whose `@code` declares an abstract member — or whose
 * code-behind class is abstract — compiles to an abstract class, as a C# class is abstract when one of its partial
 * parts says so (Razor's code-behind). BlazorHero's ExtendedAttributesBase is one: markup, four type parameters and
 * the policy names each entity's page gives.
 */
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile";
import { generateCode } from "../src/codegen";
import { DiagnosticBag } from "../src/diagnostics";
import { parseDocument } from "../src/parser";
import { extractTsazorMetadata, resolveComponentMetadata, type ComponentMetadata, type MetadataHost } from "../src/metadata";

const BASE: ComponentMetadata = { name: "ComponentBase", isComponent: true, abstract: true, typeParameters: [], parameters: [] };
const host: MetadataHost = {
  moduleAt: () => undefined,
  resolveModule: () => undefined,
  packageComponent: (specifier, exportName) => (specifier === "@tsazor/runtime" && exportName === "ComponentBase" ? BASE : undefined),
};

const base = '@typeparam TEntity\n<h1>@title</h1>\n@code {\n    @Parameter() title = "";\n    protected abstract get viewPolicy(): string;\n}\n';

describe("abstract components", () => {
  it("an abstract member in @code makes the class abstract", () => {
    const result = compile(base, { fileName: "ExtendedAttributesBase.tsazor", className: "ExtendedAttributesBase" });
    expect(result.diagnostics.errors).toEqual([]);
    expect(result.code).toMatch(/export default abstract class ExtendedAttributesBase<TEntity> extends /);
    const metadata = resolveComponentMetadata(extractTsazorMetadata(base, "/virtual/ExtendedAttributesBase.tsazor", { className: "ExtendedAttributesBase" }), undefined, host)!;
    expect([metadata.abstract, metadata.abstractMembers]).toEqual([true, [{ name: "viewPolicy" }]]);
  });

  it("an abstract code-behind class makes its .tsazor abstract", () => {
    const codeBehind = 'import { ComponentBase } from "@tsazor/runtime";\nexport default abstract class PanelBase extends ComponentBase {\n  protected abstract get heading(): string;\n}\n';
    const diagnostics = new DiagnosticBag();
    const result = generateCode(parseDocument("<h2>@heading</h2>\n", diagnostics), { className: "Panel", codeBehindClass: "PanelBase", codeBehindSource: codeBehind }, diagnostics);
    expect(result.code).toMatch(/export default abstract class Panel extends PanelBase/);
  });

  it("a component without abstract members stays concrete", () => {
    const result = compile('<p>@text</p>\n@code {\n    @Parameter() text = "";\n    // an abstract idea\n}\n', { fileName: "Note.tsazor", className: "Note" });
    expect(result.code).toMatch(/export default class Note extends /);
  });
});
