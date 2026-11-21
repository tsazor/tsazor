/**
 * `@EditorRequired()` (Blazor's `[EditorRequired]`, RZ2012): a tag that leaves such a parameter out gets the warning
 * TZS037 — an attribute, a `@bind-`, a child content element or element content supplies it; a tag with `@attributes`
 * may supply it through the splat and isn't checked. The metadata reads the marker from TS and `.tsazor` components.
 */
import { describe, expect, it } from "vitest";
import { DiagnosticBag } from "../src/diagnostics";
import { generateCode } from "../src/codegen";
import { extractModuleMetadata, extractTsazorMetadata, resolveComponentMetadata, type MetadataHost } from "../src/metadata";
import { parseDocument } from "../src/parser";
import { metadataOf, withComponents } from "./component-metadata";

const field = metadataOf("Field", {
  label: { category: "string", editorRequired: true },
  value: "value",
  valueChanged: "EventCallback<T>",
  childContent: "RenderFragment",
  hint: "string",
});
const picker = metadataOf("Picker", {
  value: { category: "value", editorRequired: true },
  valueChanged: "EventCallback<T>",
  itemTemplate: { category: "RenderFragment", editorRequired: true },
  childContent: { category: "RenderFragment", editorRequired: true },
});

function warnings(source: string): string[] {
  const diagnostics = new DiagnosticBag();
  const doc = parseDocument(`${source}\n@code { private x = 1; private extra = {}; }`, diagnostics);
  generateCode(doc, { className: "Demo", ...withComponents({ Field: field, Picker: picker }) }, diagnostics);
  return diagnostics.all.filter((d) => d.code === "TZS037").map((d) => `${d.severity}: ${d.message}`);
}

describe("TZS037: an editor-required parameter the tag leaves out", () => {
  it("is a warning on the tag, as Blazor's RZ2012", () => {
    expect(warnings('<Field Hint="h" />')).toEqual([
      "warning: Editor-required parameter not provided. Component 'Field' expects a value for the parameter 'Label', but a value may not have been provided.",
    ]);
    const diagnostics = new DiagnosticBag();
    generateCode(parseDocument('<p></p>\n<Field />', diagnostics), { className: "Demo", ...withComponents({ Field: field }) }, diagnostics);
    expect(diagnostics.all.map((d) => [d.code, d.pos, d.endPos])).toEqual([["TZS037", { line: 2, column: 1 }, { line: 2, column: 6 }]]);
  });

  it("is quiet when an attribute, in any case, supplies it", () => {
    expect(warnings('<Field Label="Name" />')).toEqual([]);
    expect(warnings('<Field label="@x" />')).toEqual([]);
  });

  it("counts @bind- (the value and its Changed callback), child content elements and element content", () => {
    expect(warnings('<Picker @bind-Value="x"><ItemTemplate>i</ItemTemplate><ChildContent>c</ChildContent></Picker>')).toEqual([]);
    expect(warnings('<Picker @bind-Value="x"><ItemTemplate>i</ItemTemplate></Picker>')).toEqual([
      "warning: Editor-required parameter not provided. Component 'Picker' expects a value for the parameter 'ChildContent', but a value may not have been provided.",
    ]);
    expect(warnings('<Picker Value="@x" ItemTemplate="@null">content</Picker>')).toEqual([]);
    expect(warnings('<Picker Value="@x" ItemTemplate="@null">   </Picker>').map((w) => w.slice(w.lastIndexOf("parameter")))).toEqual([
      "parameter 'ChildContent', but a value may not have been provided.",
    ]);
  });

  it("leaves a tag with @attributes alone: the splat may supply it", () => {
    expect(warnings('<Field @attributes="extra" />')).toEqual([]);
  });
});

describe("the metadata of @EditorRequired()", () => {
  const host = (files: Record<string, string>): MetadataHost => ({
    moduleAt: (file) => (file in files ? extractModuleMetadata(files[file]!, file) : undefined),
    resolveModule: () => undefined,
    packageComponent: (specifier, name) =>
      specifier === "@tsazor/runtime" && name === "ComponentBase"
        ? { name, isComponent: true, abstract: true, typeParameters: [], parameters: [] }
        : undefined,
  });

  it("marks the parameter of a TS component; an EditorRequired of the app's own is not the marker", () => {
    const source = `import { ComponentBase, Parameter, EditorRequired } from "@tsazor/runtime";
import { EditorRequired as Mine } from "./mine";
export default class C extends ComponentBase {
  @EditorRequired() @Parameter() label = "";
  @Parameter() @EditorRequired() value?: number;
  @Mine() @Parameter() hint = "";
}`;
    const module = extractModuleMetadata(source, "/virtual/C.ts");
    const metadata = resolveComponentMetadata(module, undefined, host({ "/virtual/C.ts": source }))!;
    expect(metadata.parameters.map((p) => [p.name, p.editorRequired ?? false])).toEqual([
      ["label", true],
      ["value", true],
      ["hint", false],
    ]);
  });

  it("marks a .tsazor @code parameter: the compiler imports EditorRequired itself", () => {
    const module = extractTsazorMetadata(
      ["<p></p>", "@code {", "  @EditorRequired() @Parameter() label = \"\";", "  @Parameter() hint = \"\";", "}"].join("\n"),
      "/virtual/Field.tsazor",
      { className: "Field" },
    );
    const metadata = resolveComponentMetadata(module, undefined, host({}))!;
    expect(metadata.parameters.map((p) => [p.name, p.editorRequired ?? false])).toEqual([
      ["label", true],
      ["hint", false],
    ]);
  });
});
