/**
 * Roadmap 2.4: typed shadow checks — the shadow layer (typedShadow option)
 * emits `satisfies`-checks on attribute values, typed slot contexts,
 * rebased type imports and typed `@ref` captures. Real builds without the
 * option stay byte-identical (except `@ref` on component tags, which lowers
 * to the ComponentReferenceCapture in both modes).
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
    items: {
      category: "value",
      type: "TItem[]",
      references: [
        { name: "TItem", kind: "typeParameter" },
        { name: "Person", kind: "import", specifier: "./person.model", file: "/lib/Grid.tsazor" },
      ],
    },
    rowTemplate: { category: "RenderFragment<T>", typeArgument: "TItem", references: [{ name: "TItem", kind: "typeParameter" }] },
    title: { category: "string", type: "string" },
    stamp: { category: "string", type: "Local", references: [{ name: "Local", kind: "local", file: "/lib/Grid.tsazor" }] },
  },
  { typeParameters: [{ name: "TItem" }] },
);
const list = metadataOf(
  "List",
  {
    items: { category: "value", optional: false, type: "Date", references: [{ name: "Date", kind: "runtime" }] },
    optionalCount: { category: "value", type: "number", optional: true },
  },
);
/** The runtime's untyped delegate placeholder (`typeArgument: "unknown"`). */
const virtualized = metadataOf(
  "Virtualized",
  {
    items: { category: "value", optional: false, type: "unknown[]", references: [] },
    itemTemplate: { category: "RenderFragment<T>", type: "(item: unknown) => RenderFragment", typeArgument: "unknown", references: [] },
  },
);

/** Compiles `source` (+ the shared `@code` prologue). */
function gen(
  source: string,
  components: Record<string, ComponentMetadata | null> = { Grid: grid, List: list },
  typedShadow?: Extract<Parameters<typeof generateCode>[1], object>["typedShadow"],
) {
  const diagnostics = new DiagnosticBag();
  const doc = parseDocument(`${source}\n@code { private people = []; private x = 1; }`, diagnostics);
  const result = generateCode(doc, {
    className: "Demo",
    resolveComponent: (tag) => (tag in components ? { specifier: `./${tag}.tsazor` } : null),
    resolveComponentMetadata: (tag) => components[tag] ?? null,
    ...(typedShadow !== undefined ? { typedShadow } : {}),
  }, diagnostics);
  return { result, diagnostics, errors: diagnostics.errors.map((d) => d.code) };
}

/** The typed builds rebase foreign type imports to this (consumer-resolvable) specifier. */
const REBASE = (ref: { name: string }): string | undefined => (ref.name === "Person" ? "./person.model" : undefined);
const typedShadow = { rebaseTypeImport: REBASE };

describe("satisfies checks on attribute values (shadow-only)", () => {
  it("checks a value parameter against its substituted type", () => {
    const { result } = gen('<Grid TItem="Person" Items="people" />', undefined, typedShadow);
    expect(result.code).toContain('"items", (this.people) satisfies Person[]');
    // The declaring module's type import is rebased into the shadow header.
    expect(result.code).toContain('import type Person from "./person.model";');
  });

  it("checks a string parameter's plain and expression values", () => {
    const plain = gen('<Grid TItem="Person" Title="hello" />', undefined, typedShadow).result.code;
    expect(plain).toContain('("hello") satisfies string');
    const expression = gen('<Grid TItem="Person" Title="@this.x" />', undefined, typedShadow).result.code;
    expect(expression).toContain('(this.x) satisfies string');
  });

  it("merges `| undefined` for optional parameters", () => {
    const { result } = gen('<List OptionalCount="1" />', undefined, typedShadow);
    expect(result.code).toContain("satisfies number | undefined");
  });

  it("routes runtime types through the hygienic alias (import stays shadow-only)", () => {
    const { result } = gen('<List Items="@this.when" />', undefined, typedShadow);
    expect(result.code).toContain("satisfies __tsazor_Date");
    expect(result.code).toContain("Date as __tsazor_Date");
  });

  it("drops the check for a declaring module's local type (not importable)", () => {
    const { result } = gen('<Grid TItem="Person" Stamp="@this.x" />', undefined, typedShadow);
    expect(result.code).not.toContain("satisfies");
  });

  it("emits nothing extra in a real build", () => {
    const { result } = gen('<Grid TItem="Person" Items="people" />');
    expect(result.code).not.toContain("satisfies");
    expect(result.code).not.toContain("import type Person");
  });
});

describe("plain-text values read as expressions (shadow-only)", () => {
  it("records a non-string parameter's plain value — not `@expr`, not string parameters", () => {
    const { result } = gen('<List OptionalCount="hello" />\n<List OptionalCount="@x" />\n<Grid TItem="Person" Title="text" />', undefined, typedShadow);
    expect(result.expressionValues).toEqual([
      { start: { line: 1, column: 21 }, end: { line: 1, column: 26 }, parameter: "optionalCount", tag: "List", type: "number" },
    ]);
  });

  it("records nothing in a real build", () => {
    expect(gen('<List OptionalCount="hello" />').result.expressionValues).toBeUndefined();
  });
});

describe("typed slot contexts (shadow-only)", () => {
  it("types the context from the substituted type argument", () => {
    const { result } = gen('<Grid TItem="Person"><RowTemplate><td>@context.name</td></RowTemplate></Grid>', undefined, typedShadow);
    expect(result.code).toContain('(context: Person) => (__builder: __tsazor_RenderTreeBuilder) => {');
  });

  it("the context stays `any` without a resolved argument", () => {
    const { result } = gen('<Grid Items="people"><RowTemplate>@context</RowTemplate></Grid>', undefined, typedShadow);
    expect(result.code).toContain("(context: any) =>");
  });

  it("the context stays `any` for the runtime's untyped delegate placeholder", () => {
    // The runtime manifests untyped delegates (e.g. Virtualize's ItemTemplate)
    // with the literal type argument `unknown` — not a slot to type, and the
    // shadow layer must not pretend otherwise (2.4).
    const { result } = gen('<Virtualized Items="people"><ItemTemplate>@context</ItemTemplate></Virtualized>', { Virtualized: virtualized }, typedShadow);
    expect(result.code).toContain("(context: any) =>");
  });
});

describe("TItem inference requests (shadow-only)", () => {
  it("requests the missing type parameter anchored on its attribute value", () => {
    const { result } = gen('<Grid Items="people"><RowTemplate>@context</RowTemplate></Grid>', undefined, typedShadow);
    expect(result.typedInference).toHaveLength(1);
    const request = result.typedInference![0]!;
    expect(request.tagName).toBe("Grid");
    expect(request.typeParameter).toBe("TItem");
    expect(request.parameterName).toBe("items");
    expect(request.parameterType).toBe("TItem[]");
    expect(request.value.line).toBe(1);
    expect(request.tagId.startsWith("1:")).toBe(true);
  });

  it("no requests when the tag's type arguments are complete", () => {
    expect(gen('<Grid TItem="Person" Items="people" />', undefined, typedShadow).result.typedInference).toBeUndefined();
  });

  it("injected typeArguments resolve the checks and the slot context", () => {
    const { result } = gen('<Grid Items="people"><RowTemplate>@context.name</RowTemplate></Grid>', undefined, {
      typeArguments: new Map([["1:0", new Map([["TItem", "Person"]])]]),
      rebaseTypeImport: REBASE,
    });
    // TItem is supplied — the value check and the context are typed, no request.
    expect(result.code).toContain("satisfies Person[]");
    expect(result.code).toContain("(context: Person) =>");
    expect(result.typedInference).toBeUndefined();
  });
});

describe("mixed attribute values", () => {
  it("the real build renders a nullish part as empty; the shadow leaves out the `??` (TS2869 on never-nullish values)", () => {
    const source = '<div style="width: @(x * 25)%"></div>';
    expect(gen(source).result.code).toContain('`width: ${(this.x * 25) ?? ""}%`');
    expect(gen(source, undefined, typedShadow).result.code).toContain("`width: ${(this.x * 25)}%`");
  });
});

describe("typed @ref captures", () => {
  it("casts the element to its interface in the shadow build", () => {
    const { result } = gen('<input @ref="box" />', undefined, typedShadow);
    expect(result.code).toContain('this.box = el as HTMLElementTagNameMap["input"];');
    const svg = gen('<circle @ref="dot" />', undefined, typedShadow).result.code;
    expect(svg).toContain('el as SVGElementTagNameMap["circle"];');
    const unknown = gen('<my-widget @ref="widget" />', undefined, typedShadow).result.code;
    expect(unknown).toContain("this.widget = el;");
  });

  it("keeps the real build's element ref untyped", () => {
    const { result } = gen('<input @ref="box" />');
    expect(result.code).toContain("this.box = el;");
  });

  it("captures the component instance with the tag's type arguments", () => {
    const { result } = gen('<Grid TItem="Person" Items="people" @ref="grid" />', undefined, typedShadow);
    expect(result.code).toContain("__builder.addComponentReferenceCapture(");
    expect(result.code).toContain("this.grid = comp as __tsazor_comp_Grid<Person>;");
  });

  it("casts to `never` without resolvable type arguments (in both builds)", () => {
    const shadow = gen('<Grid Items="people" @ref="grid" />', undefined, typedShadow).result.code;
    expect(shadow).toContain("this.grid = comp as unknown as never;");
    // The ComponentReferenceCapture lowering is real behavior: it appears in
    // real builds too — only the generic cast differs.
    const real = gen('<Grid TItem="Person" Items="people" @ref="grid" />').result.code;
    expect(real).toContain("__builder.addComponentReferenceCapture(");
    expect(real).toContain("this.grid = comp as unknown as never;");
  });
});