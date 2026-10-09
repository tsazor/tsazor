/**
 * Roadmap 2.3: templated components (C13) — child content elements (named
 * slots) decided by the parent's metadata, RenderFragment<T> with
 * `@context` / `Context="x"`, type argument attributes, and the Razor
 * diagnostics around them (counterparts to RZ9995–RZ9999/RZ10002 in the Razor
 * component compiler).
 */
import { describe, expect, it } from "vitest";
import { DiagnosticBag } from "../src/diagnostics";
import { generateCode } from "../src/codegen";
import { parseDocument } from "../src/parser";
import type { ComponentMetadata } from "../src/metadata";
import { metadataOf } from "./component-metadata";

const grid = metadataOf(
  "Grid",
  {
    items: "value",
    rowTemplate: { category: "RenderFragment<T>", typeArgument: "TItem" },
    header: "RenderFragment",
    title: "string",
  },
  { typeParameters: [{ name: "TItem" }] },
);
const list = metadataOf("List", { items: "value", childContent: { category: "RenderFragment<T>", typeArgument: "TItem" } }, { typeParameters: [{ name: "TItem" }] });
const panel = metadataOf("Panel", { header: "RenderFragment", childContent: "RenderFragment" });
const plain = metadataOf("Plain", { title: "string" });
const header = metadataOf("Header", { childContent: "RenderFragment" });

/** Resolves every tag in `components` (null metadata = resolvable, parameters unknown). */
function gen(source: string, components: Record<string, ComponentMetadata | null> = { Grid: grid, List: list, Panel: panel, Plain: plain }) {
  const diagnostics = new DiagnosticBag();
  const doc = parseDocument(`${source}\n@code { private people = []; private x = 1; }`, diagnostics);
  const result = generateCode(doc, {
    className: "Demo",
    staticMarkup: false, // element-frame emission
    resolveComponent: (tag) => (tag in components ? { specifier: `./${tag}.tsazor` } : null),
    resolveComponentMetadata: (tag) => components[tag] ?? null,
  }, diagnostics);
  return { code: result.code, diagnostics, errors: diagnostics.errors.map((d) => d.code) };
}

const lines = (code: string): string[] => code.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("__builder."));

describe("child content elements (named slots)", () => {
  it("a RenderFragment slot becomes the parameter, under its canonical name", () => {
    const { code, diagnostics } = gen("<Panel><Header><h1>H</h1></Header></Panel>");
    expect(lines(code)).toEqual([
      "__builder.openComponent(0, __tsazor_comp_Panel);",
      '__builder.addAttribute(1, "header", this[__tsazor_f0] ??= (__builder) => {',
      '__builder.openElement(0, "h1");',
      '__builder.addContent(1, "H");',
      "__builder.closeElement();",
      "__builder.closeComponent();",
    ]);
    expect(diagnostics.all).toEqual([]);
  });

  it("a RenderFragment<T> slot takes `context`, a local of its body", () => {
    const { code, diagnostics } = gen("<Grid Items=\"people\"><RowTemplate><td>@context.name</td></RowTemplate></Grid>");
    expect(code).toContain('__builder.addAttribute(2, "rowTemplate", this[__tsazor_f0] ??= (context: any) => (__builder: __tsazor_RenderTreeBuilder) => {');
    expect(code).toContain("__builder.addContent(1, context.name);");
    expect(diagnostics.all).toEqual([]);
  });

  it("Context on the slot overrides Context on the component", () => {
    const onComponent = gen('<Grid Context="row"><RowTemplate>@row</RowTemplate></Grid>');
    expect(onComponent.code).toContain("(row: any) => (__builder: __tsazor_RenderTreeBuilder) => {");
    expect(onComponent.code).not.toContain('"Context"');
    const onSlot = gen('<Grid Context="row"><RowTemplate Context="item">@item</RowTemplate></Grid>');
    expect(onSlot.code).toContain("(item: any) =>");
    expect(onSlot.diagnostics.all).toEqual([]);
  });

  it("a slot wins over a component of the same name (Razor: child content tag helpers bind first)", () => {
    const { code } = gen("<Panel><Header>x</Header></Panel><Header>y</Header>", { Panel: panel, Header: header });
    expect(code).toContain('__builder.addAttribute(1, "header", this[__tsazor_f0] ??= (__builder) => {');
    // Outside Panel the same tag is the Header component.
    expect(code).toContain("__builder.openComponent(2, __tsazor_comp_Header);");
  });

  it("whitespace between slots is not content", () => {
    const { errors, code } = gen("<Panel> <Header>a</Header> <ChildContent>b</ChildContent> </Panel>");
    expect(errors).toEqual([]);
    expect(code).toContain('"childContent", this[__tsazor_f1] ??= (__builder) => {');
    expect(code).not.toContain('addContent(1, " ")');
  });

  it("a RenderFragment<T> ChildContent takes the component's Context", () => {
    const { code, diagnostics } = gen('<List Items="people" Context="person"><b>@person</b></List>');
    expect(code).toContain('__builder.addAttribute(2, "childContent", this[__tsazor_f0] ??= (person: any) => (__builder: __tsazor_RenderTreeBuilder) => {');
    expect(diagnostics.all).toEqual([]);
    expect(gen("<List><b>@context</b></List>").code).toContain("(context: any) =>");
  });

  it("nested templates with distinct context names", () => {
    const { code, errors } = gen('<Grid><RowTemplate Context="row"><List Context="cell">@row/@cell</List></RowTemplate></Grid>');
    expect(errors).toEqual([]);
    expect(code).toContain("(row: any) =>");
    expect(code).toContain("(cell: any) =>");
  });

  it("a plain RenderFragment ChildContent keeps the 2.2 emission (addContent)", () => {
    expect(gen("<Panel><p>x</p></Panel>").code).toContain("__builder.addContent(1, this[__tsazor_f0] ??= (__builder) => {");
  });

  it("@context outside any template stays a member (this.context)", () => {
    expect(gen("<Panel><p>@context</p></Panel>").code).toContain("this.context");
  });

  it("without metadata a slot-like tag stays a component/element (2.2 behaviour)", () => {
    const { code, diagnostics } = gen("<Grid><RowTemplate>@context</RowTemplate></Grid>", { Grid: null });
    expect(code).toContain('__builder.openElement(0, "RowTemplate");');
    expect(diagnostics.all.map((d) => d.code)).toEqual(["TZS005"]);
  });
});

describe("type argument attributes (TItem)", () => {
  it("are consumed: no runtime attribute, no TZS025", () => {
    const { code, diagnostics } = gen('<Grid TItem="Person" Items="people" />');
    expect(code).not.toContain('"TItem"');
    expect(diagnostics.all).toEqual([]);
    expect(gen('<Grid TItem="Map<string, Person[]>" />').diagnostics.all).toEqual([]);
  });

  it("must be a TypeScript type (TZS024) and not empty (TZS009)", () => {
    expect(gen('<Grid TItem="Person[" />').errors).toEqual(["TZS024"]);
    expect(gen('<Grid TItem="" />').errors).toEqual(["TZS009"]);
  });

  it("on a non-generic component it is an unknown parameter", () => {
    expect(gen('<Panel TItem="Person" />').errors).toEqual(["TZS025"]);
  });
});

describe("diagnostics", () => {
  it("TZS027: loose content mixed with child content elements (Razor RZ9996)", () => {
    const { diagnostics } = gen("<Panel><Header>a</Header><p>loose</p></Panel>");
    expect(diagnostics.errors.map((d) => [d.code, d.pos])).toEqual([["TZS027", { line: 1, column: 25 }]]);
    expect(diagnostics.errors[0]!.message).toContain("Unrecognized child content inside component 'Panel'");
  });

  it("TZS028: a slot used twice, or set by attribute and body (RZ9995)", () => {
    expect(gen("<Panel><Header>a</Header><Header>b</Header></Panel>").errors).toEqual(["TZS028"]);
    expect(gen('<Panel Header="@x"><Header>b</Header></Panel>').errors).toEqual(["TZS028"]);
    expect(gen('<Panel ChildContent="@x"><p>b</p></Panel>').errors).toEqual(["TZS028"]);
  });

  it("TZS028: attributes on a slot other than Context on a RenderFragment<T> (RZ9997), non-literal Context (RZ9998)", () => {
    expect(gen('<Panel><Header class="x">a</Header></Panel>').errors).toEqual(["TZS028"]);
    expect(gen('<Panel><Header Context="c">a</Header></Panel>').errors).toEqual(["TZS028"]);
    expect(gen('<Grid><RowTemplate Context="@x">a</RowTemplate></Grid>').errors).toEqual(["TZS028"]);
    expect(gen('<Grid Context="a b" />').errors).toEqual(["TZS028"]);
  });

  it("TZS029: a nested template reusing the context name (RZ9999), with the Context suggestion", () => {
    const { diagnostics } = gen("<Grid><RowTemplate><List>@context</List></RowTemplate></Grid>");
    expect(diagnostics.errors.map((d) => d.code)).toEqual(["TZS029"]);
    expect(diagnostics.errors[0]!.message).toContain("uses the same parameter name ('context') as enclosing child content element 'RowTemplate' of component 'Grid'");
    expect(diagnostics.errors[0]!.message).toContain("'<ChildContent Context=\"another_name\">'");
  });

  it("TZS025: an unknown slot under a component with complete metadata, with a rename fix", () => {
    const { diagnostics } = gen("<Grid><RowTemplat>x</RowTemplat></Grid>");
    expect(diagnostics.errors).toEqual([
      {
        code: "TZS025",
        severity: "error",
        message: "Unknown component parameter. Component 'Grid' does not have a child content parameter 'RowTemplat' (and no component 'RowTemplat' resolves). Did you mean 'RowTemplate'?",
        pos: { line: 1, column: 7 },
        endPos: { line: 1, column: 17 },
        fix: {
          title: "Rename to 'RowTemplate'",
          edits: [
            { pos: { line: 1, column: 7 }, endPos: { line: 1, column: 17 }, text: "RowTemplate" },
            { pos: { line: 1, column: 21 }, endPos: { line: 1, column: 31 }, text: "RowTemplate" },
          ],
        },
      },
    ]);
  });

  it("TZS025: element content on a component without ChildContent", () => {
    const { diagnostics } = gen("<Plain><p>x</p></Plain>");
    expect(diagnostics.errors.map((d) => d.code)).toEqual(["TZS025"]);
    expect(diagnostics.errors[0]!.message).toContain("does not have a parameter 'ChildContent'");
  });

  it("TZS028: a non-fragment parameter written as an element", () => {
    const { diagnostics } = gen("<Grid><Title>x</Title></Grid>");
    expect(diagnostics.errors.map((d) => d.code)).toEqual(["TZS028"]);
    expect(diagnostics.errors[0]!.message).toContain("'title' is a string parameter of '<Grid>'");
  });

  it("TZS027: a slot outside its component, or nested below it", () => {
    expect(gen("<Grid /><RowTemplate>x</RowTemplate>").errors).toEqual(["TZS027"]);
    const nested = gen("<Panel><div><Header>x</Header></div></Panel>");
    expect(nested.errors).toEqual(["TZS027"]);
    expect(nested.diagnostics.errors[0]!.message).toContain("must be its direct child");
  });
});

describe("@ref on a component with child content", () => {
  // The parameter view is the run of attribute frames after the component
  // frame (Blazor's ParameterView): a reference capture before a fragment
  // attribute cut the fragment off — `<ErrorBoundary @ref="b"><ChildContent>…`
  // rendered nothing. Blazor emits the capture last.
  const capture = (code: string): number => lines(code).findIndex((l) => l.startsWith("__builder.addComponentReferenceCapture("));
  const lastFragment = (code: string): number =>
    // A plain ChildContent is written as `addContent` in the component frame
    // (the builder turns it into the ChildContent attribute, in place).
    lines(code).reduce((last, l, i) => (/^__builder\.(addAttribute\(\d+, "(header|childContent)"|addContent\(\d+, (?:this\[__tsazor_f\d+\] \?\?= )?\(__builder\))/.test(l) ? i : last), -1);

  it("named slots come before the capture", () => {
    const { code, diagnostics } = gen('<Panel @ref="x"><Header><h1>H</h1></Header><ChildContent><p>b</p></ChildContent></Panel>');
    expect(diagnostics.all).toEqual([]);
    expect(lastFragment(code)).toBeGreaterThan(0);
    expect(capture(code)).toBeGreaterThan(lastFragment(code));
  });

  it("implicit child content comes before the capture", () => {
    const { code, diagnostics } = gen('<Panel @ref="x"><p>b</p></Panel>');
    expect(diagnostics.all).toEqual([]);
    expect(lastFragment(code)).toBeGreaterThan(0);
    expect(capture(code)).toBeGreaterThan(lastFragment(code));
  });
});
