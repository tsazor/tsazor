/**
 * Roadmap 2.2: component attributes lowered by the target parameter's
 * category (C12), unknown parameters (TZS025), unknown types (TZS026).
 */
import { describe, expect, it } from "vitest";
import { DiagnosticBag } from "../src/diagnostics";
import { generateCode } from "../src/codegen";
import { parseDocument } from "../src/parser";
import { metadataOf, withComponents } from "./component-metadata";

const probe = metadataOf("Probe", {
  title: "string",
  count: "value",
  enabled: "value",
  items: "value",
  onlyIf: "value",
  header: "RenderFragment",
  onClick: "EventCallback",
  changed: "EventCallback<T>",
  label: "string",
});

function gen(source: string, components: Parameters<typeof withComponents>[0] = { Probe: probe }) {
  const diagnostics = new DiagnosticBag();
  const doc = parseDocument(`${source}\n@code { private people = []; private a = 1; private x = ""; private frag = null; private handle() {} private item = { toggle() {} }; }`, diagnostics);
  const result = generateCode(doc, { className: "Demo", ...withComponents(components) }, diagnostics);
  return { code: result.code, diagnostics };
}

/** The value expression of the first attribute frame named `name`. */
function valueOf(code: string, name: string): string | undefined {
  const line = code.split("\n").find((l) => l.includes(`addAttribute(`) && l.includes(`, ${JSON.stringify(name)}, `));
  return line?.slice(line.indexOf(`${JSON.stringify(name)}, `) + name.length + 4).replace(/\);$/, "");
}

describe("string parameters", () => {
  it("keep plain text as a string, @expr and mixed text as written", () => {
    expect(valueOf(gen('<Probe Title="5" />').code, "title")).toBe('"5"');
    expect(valueOf(gen('<Probe Title="@x" />').code, "title")).toBe("this.x");
    expect(valueOf(gen('<Probe Title="n: @x" />').code, "title")).toBe('`n: ${(this.x) ?? ""}`');
  });

  it("emit the canonical member name (case-insensitive match)", () => {
    const { code, diagnostics } = gen('<Probe Label="a" />');
    expect(valueOf(code, "label")).toBe('"a"');
    expect(diagnostics.all).toEqual([]);
  });
});

describe("value parameters: the attribute value is a TypeScript expression", () => {
  it.each([
    ['Count="5"', "count", "5"],
    ['Enabled="true"', "enabled", "true"],
    ["Enabled", "enabled", "true"],
    ['Items="people"', "items", "this.people"],
    ['Count="@4000"', "count", "4000"],
    ['Count="@(a + 1)"', "count", "this.a + 1"],
    ['Count="@a + 1"', "count", "this.a + 1"],
    ["Count=5", "count", "5"],
    ['Header="@frag"', "header", "this.frag"],
    ['Header="frag"', "header", "this.frag"],
    // A delegate parameter is a value like any other (no EventCallback by name).
    ['onlyIf="(n) => n > a"', "onlyIf", "(n) => n > this.a"],
  ])("%s ⇒ %s = %s", (attribute, name, expected) => {
    const { code, diagnostics } = gen(`<Probe ${attribute} />`);
    expect(valueOf(code, name)).toBe(expected);
    expect(diagnostics.all).toEqual([]);
  });

  it("an empty value is TZS009", () => {
    const { diagnostics } = gen('<Probe Count="" />');
    expect(diagnostics.errors.map((d) => d.code)).toEqual(["TZS009"]);
  });

  it("a syntax error is located in the attribute value (TZS024)", () => {
    const { diagnostics } = gen('<Probe Count="1 +" />');
    expect(diagnostics.errors.map((d) => [d.code, d.pos])).toEqual([["TZS024", { line: 1, column: 16 }]]);
  });
});

describe("EventCallback parameters", () => {
  it.each([
    ['OnClick="handle"', "__tsazor_EventCallback.bind(this, this.handle)"],
    ['OnClick="@handle"', "__tsazor_EventCallback.bind(this, this.handle)"],
    ['OnClick="() => a++"', "__tsazor_EventCallback.bind(this, () => this.a++)"],
    // A method group on another receiver keeps it (A4/C18).
    ['OnClick="item.toggle"', "__tsazor_EventCallback.bind(this, __tsazor_bindMethod(this.item, this.item.toggle))"],
    // Any name: the category decides, not an On prefix.
    ['Changed="handle"', "__tsazor_EventCallback.bind(this, this.handle)"],
  ])("%s ⇒ %s", (attribute, expected) => {
    const { code } = gen(`<Probe ${attribute} />`);
    const name = /^OnClick/.test(attribute) ? "onClick" : "changed";
    expect(valueOf(code, name)).toBe(expected);
  });

  it("a minimized attribute needs a handler (TZS009)", () => {
    expect(gen("<Probe OnClick />").diagnostics.errors.map((d) => d.code)).toEqual(["TZS009"]);
  });
});

describe("unknown parameters (TZS025)", () => {
  it("is an error on a target with complete metadata, with a 'did you mean' fix", () => {
    const { diagnostics } = gen('<Probe Lable="x" />');
    expect(diagnostics.errors).toEqual([
      {
        code: "TZS025",
        severity: "error",
        message: "Unknown component parameter. Component 'Probe' does not have a parameter 'Lable'. Did you mean 'Label'?",
        pos: { line: 1, column: 7 },
        endPos: { line: 1, column: 16 },
        fix: { title: "Rename to 'Label'", edits: [{ pos: { line: 1, column: 7 }, endPos: { line: 1, column: 12 }, text: "Label" }] },
      },
    ]);
  });

  it("suggests the On-prefixed parameter and stays quiet without a close match", () => {
    expect(gen('<Probe Click="handle" />').diagnostics.errors[0]!.message).toContain("Did you mean 'OnClick'?");
    expect(gen('<Probe Zebra="1" />').diagnostics.errors[0]!.message).toBe("Unknown component parameter. Component 'Probe' does not have a parameter 'Zebra'.");
  });

  it("goes to a captureUnmatchedValues parameter, as written", () => {
    const { code, diagnostics } = gen('<Box data-x="1" Title="t" />', { Box: metadataOf("Box", { attributes: "captureUnmatchedValues" }) });
    expect(valueOf(code, "data-x")).toBe('"1"');
    expect(valueOf(code, "Title")).toBe('"t"');
    expect(diagnostics.all).toEqual([]);
  });

  it("covers @bind targets and @onclick on components", () => {
    const empty = { Box: metadataOf("Box", {}) };
    expect(gen('<Box @bind-Value="x" />', empty).diagnostics.errors.map((d) => d.message)).toEqual([
      "Unknown component parameter. Component 'Box' does not have a parameter 'Value'.",
      "Unknown component parameter. Component 'Box' does not have a parameter 'ValueChanged'.",
    ]);
    expect(gen('<Box @onclick="handle" />', empty).diagnostics.errors.map((d) => d.code)).toEqual(["TZS025"]);
  });
});

describe("unknown types (TZS026): lowered as written, with a warning", () => {
  it("an uncertain parameter keeps plain text a string and names the reason", () => {
    const uncertain = metadataOf("Probe", { count: { category: "value", uncertain: true, type: "Count", references: [{ name: "Count", kind: "import", specifier: "some-lib" }] } });
    const { code, diagnostics } = gen('<Probe Count="5" />', { Probe: uncertain });
    expect(valueOf(code, "count")).toBe('"5"');
    expect(diagnostics.all.map((d) => [d.code, d.severity])).toEqual([["TZS026", "warning"]]);
    expect(diagnostics.all[0]!.message).toContain("its type 'Count' comes from package 'some-lib'");
  });

  it("missing metadata warns once per tag; On* values stay EventCallbacks", () => {
    const { code, diagnostics } = gen('<Lib Count="5" OnClick="@handle" /><Lib />', { Lib: null });
    expect(valueOf(code, "Count")).toBe('"5"');
    expect(valueOf(code, "OnClick")).toBe("__tsazor_EventCallback.bind(this, this.handle)");
    expect(diagnostics.all.map((d) => [d.code, d.severity])).toEqual([["TZS026", "warning"]]);
    expect(diagnostics.all[0]!.message).toContain("neither a source file nor a package manifest describes it");
  });

  it("incomplete metadata (unresolved base class) warns for unmatched attributes instead of failing", () => {
    const partial = metadataOf("Derived", { count: "value" }, { incomplete: true, base: { name: "Base", resolved: false } });
    const { code, diagnostics } = gen('<Derived Count="5" Inherited="x" />', { Derived: partial });
    expect(valueOf(code, "count")).toBe("5");
    expect(valueOf(code, "Inherited")).toBe('"x"');
    expect(diagnostics.all.map((d) => [d.code, d.severity])).toEqual([["TZS026", "warning"]]);
  });

  it("without a metadata resolver nothing is reported (today's lowering)", () => {
    const diagnostics = new DiagnosticBag();
    const doc = parseDocument('<Probe Count="5" />', diagnostics);
    const { code } = generateCode(doc, { className: "Demo", resolveComponent: () => ({ specifier: "./Probe.tsazor" }) }, diagnostics);
    expect(valueOf(code, "Count")).toBe('"5"');
    expect(diagnostics.all).toEqual([]);
  });
});
