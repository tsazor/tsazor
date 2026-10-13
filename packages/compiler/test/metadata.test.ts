/**
 * Parameter metadata (roadmap 2.1): syntactic extraction, categories,
 * inheritance flattening and type-argument substitution over an in-memory
 * host (the file-system host and caches are tested in @tsazor/workspace).
 */
import { describe, expect, it } from "vitest";
import {
  extractModuleMetadata,
  extractTsazorMetadata,
  resolveComponentMetadata,
  type ComponentMetadata,
  type ComponentParameter,
  type MetadataHost,
  type ModuleMetadata,
} from "../src/metadata";

/** Host over `/virtual/*.ts` sources; packages from a component table. */
function hostFor(files: Record<string, string>, packages: Record<string, Record<string, ComponentMetadata>> = {}): MetadataHost {
  const modules = new Map<string, ModuleMetadata>();
  const moduleAt = (file: string): ModuleMetadata | undefined => {
    if (!(file in files)) return undefined;
    if (!modules.has(file)) modules.set(file, extractModuleMetadata(files[file]!, file));
    return modules.get(file);
  };
  return {
    moduleAt,
    resolveModule: (specifier, fromFile) => {
      if (!specifier.startsWith("./")) return undefined;
      const dir = fromFile.slice(0, fromFile.lastIndexOf("/"));
      const base = `${dir}/${specifier.slice(2).replace(/\.js$/, "")}`;
      return moduleAt(base.endsWith(".ts") ? base : `${base}.ts`);
    },
    packageComponent: (specifier, exportName) => packages[specifier]?.[exportName],
  };
}

const RT = 'import { ComponentBase, Parameter, CascadingParameter, EventCallback, type RenderFragment } from "@tsazor/runtime";\n';

function component(source: string, extra: Record<string, string> = {}, className?: string, packages: Record<string, Record<string, ComponentMetadata>> = {}): ComponentMetadata {
  const files = { "/virtual/C.ts": source, ...extra };
  const host = hostFor(files, packages);
  const module = host.moduleAt("/virtual/C.ts")!;
  return resolveComponentMetadata(module, className, host)!;
}

const param = (metadata: ComponentMetadata, name: string): ComponentParameter => {
  const found = metadata.parameters.find((p) => p.name === name);
  if (!found) throw new Error(`no parameter ${name} in ${metadata.parameters.map((p) => p.name).join(", ")}`);
  return found;
};

/** Minimal runtime package table: ComponentBase (root) and a generic InputBase. */
const RUNTIME_PACKAGES: Record<string, Record<string, ComponentMetadata>> = {
  "@tsazor/runtime": {
    ComponentBase: { name: "ComponentBase", isComponent: true, abstract: true, typeParameters: [], parameters: [] },
    InputBase: {
      name: "InputBase",
      isComponent: true,
      abstract: true,
      typeParameters: [{ name: "TValue" }],
      parameters: [
        { name: "Value", category: "value", type: "TValue", optional: true, hasInitializer: false, member: "field", declaredBy: "InputBase", references: [{ name: "TValue", kind: "typeParameter" }] },
        {
          name: "ValueChanged",
          category: "EventCallback<T>",
          typeArgument: "TValue",
          type: "EventCallback<TValue>",
          optional: true,
          hasInitializer: false,
          member: "field",
          declaredBy: "InputBase",
          references: [{ name: "EventCallback", kind: "runtime", imported: "EventCallback" }, { name: "TValue", kind: "typeParameter" }],
        },
      ],
    },
  },
};

describe("parameter categories", () => {
  const metadata = component(
    RT +
      `import { EventCallback as EC } from "@tsazor/runtime";
import * as rt from "@tsazor/runtime";
type Handler = EventCallback<string>;
type Size = "s" | "m" | "l";
export default class C<TItem> extends ComponentBase {
  @Parameter() title = "";
  @Parameter() label?: string;
  @Parameter() kind: "a" | "b" = "a";
  @Parameter() size?: Size;
  @Parameter() id: \`x-\${string}\` = "x-1";
  @Parameter() mixed?: string | number;
  @Parameter() count = 0;
  @Parameter() enabled: boolean = true;
  @Parameter() items: TItem[] = [];
  @Parameter() onClick?: EventCallback;
  @Parameter() onPick?: EventCallback<TItem>;
  @Parameter() onRenamed?: EC<string>;
  @Parameter() onNs?: rt.EventCallback<number>;
  @Parameter() onAlias?: Handler;
  @Parameter() onEither?: EventCallback<Event> | ((e: Event) => void);
  @Parameter() onPlain?: (e: MouseEvent) => void;
  @Parameter() childContent?: RenderFragment;
  @Parameter() header: RenderFragment | null = null;
  @Parameter() rowTemplate?: (item: TItem) => RenderFragment;
  @Parameter() generic?: RenderFragment<TItem>;
  @Parameter({ captureUnmatchedValues: true }) attrs?: Record<string, unknown>;
  @Parameter() opaque = defaultLabel();
  plainField = "not a parameter";
}`,
  );

  it.each([
    ["title", "string"],
    ["label", "string"],
    ["kind", "string"],
    ["size", "string"],
    ["id", "string"],
    ["mixed", "string"],
    ["count", "value"],
    ["enabled", "value"],
    ["items", "value"],
    ["onClick", "EventCallback"],
    ["onPick", "EventCallback<T>"],
    ["onRenamed", "EventCallback<T>"],
    ["onNs", "EventCallback<T>"],
    ["onAlias", "EventCallback<T>"],
    ["onEither", "EventCallback<T>"],
    ["onPlain", "value"],
    ["childContent", "RenderFragment"],
    ["header", "RenderFragment"],
    ["rowTemplate", "RenderFragment<T>"],
    ["generic", "RenderFragment<T>"],
    ["attrs", "captureUnmatchedValues"],
    ["opaque", "value"],
  ])("%s ⇒ %s", (name, category) => {
    expect(param(metadata, name).category).toBe(category);
  });

  it("marks function-typed value parameters as delegates (method groups get bound)", () => {
    expect(param(metadata, "onPlain").delegate).toBe(true);
    for (const name of ["count", "items", "onClick", "onEither", "rowTemplate", "childContent", "opaque"]) {
      expect(param(metadata, name).delegate).toBeUndefined();
    }
  });

  it("records type arguments, source types and literal-initializer types", () => {
    expect(param(metadata, "onPick").typeArgument).toBe("TItem");
    expect(param(metadata, "onRenamed").typeArgument).toBe("string");
    expect(param(metadata, "onAlias").typeArgument).toBe("string");
    expect(param(metadata, "rowTemplate").typeArgument).toBe("TItem");
    expect(param(metadata, "generic").typeArgument).toBe("TItem");
    expect(param(metadata, "onRenamed").type).toBe("EC<string>");
    expect(param(metadata, "title")).toMatchObject({ inferredType: "string", hasInitializer: true, optional: false });
    expect(param(metadata, "count").inferredType).toBe("number");
    expect(param(metadata, "opaque").uncertain).toBe(true);
    expect(metadata.typeParameters).toEqual([{ name: "TItem" }]);
    expect(metadata.parameters.map((p) => p.name)).not.toContain("plainField");
  });

  it("records the import context of each type", () => {
    expect(param(metadata, "onRenamed").references).toEqual([{ name: "EC", kind: "runtime", imported: "EventCallback" }]);
    expect(param(metadata, "size").references).toEqual([{ name: "Size", kind: "local", file: "/virtual/C.ts" }]);
    expect(param(metadata, "onPick").references).toEqual([
      { name: "EventCallback", kind: "runtime", imported: "EventCallback" },
      { name: "TItem", kind: "typeParameter" },
    ]);
  });

  it("marks `?:` and `| undefined` as optional", () => {
    const m = component(RT + `export default class C extends ComponentBase {
  @Parameter() a?: string;
  @Parameter() b: string | undefined;
  @Parameter() c!: string;
}`);
    expect([param(m, "a").optional, param(m, "b").optional, param(m, "c").optional]).toEqual([true, true, false]);
  });

  it("follows type aliases imported from relative modules; unknown ones are uncertain values", () => {
    const m = component(
      RT +
        `import type { Status, Callback, Model } from "./types";
import type { Theme } from "some-ui";
export default class C extends ComponentBase {
  @Parameter() status?: Status;
  @Parameter() onDone?: Callback;
  @Parameter() model?: Model;
  @Parameter() theme?: Theme;
}`,
      {
        "/virtual/types.ts":
          'import { EventCallback } from "@tsazor/runtime";\nexport type Status = "open" | "closed";\nexport type Callback = EventCallback<number>;\nexport interface Model { id: number }\n',
      },
    );
    expect(param(m, "status").category).toBe("string");
    expect(param(m, "onDone")).toMatchObject({ category: "EventCallback<T>", typeArgument: "number" });
    expect(param(m, "model").category).toBe("value");
    expect(param(m, "model").uncertain).toBeUndefined();
    expect(param(m, "theme")).toMatchObject({ category: "value", uncertain: true });
  });

  it("lowers computed types as text without @ — not uncertain: `tsazor check` checks them (F1)", () => {
    const m = component(
      RT +
        `import type { VariantProps } from "class-variance-authority";
import { buttonVariants, pick } from "./variants";
type Maybe = "a" | "b" | undefined;
interface Model { id: number; name: string }
type Flags = "x" | "y";
export default class C extends ComponentBase {
  @Parameter() variant?: VariantProps<typeof buttonVariants>["variant"];
  @Parameter() size?: NonNullable<VariantProps<typeof buttonVariants>["size"]>;
  @Parameter() key?: keyof Model;
  @Parameter() conditional?: Flags extends string ? "s" : number;
  @Parameter() mapped?: { [K in Flags]?: boolean };
  @Parameter() query?: typeof buttonVariants;
  @Parameter() returned?: ReturnType<typeof pick>;
  @Parameter() narrowed!: NonNullable<Maybe>;
  @Parameter() excluded!: Exclude<Maybe, undefined>;
  @Parameter() callback?: NonNullable<EventCallback<number>>;
  @Parameter() frozen?: Readonly<Model>;
  @Parameter() upper?: Uppercase<Flags>;
  @Parameter() record?: Record<string, number>;
  @Parameter() list?: readonly string[];
}`,
      { "/virtual/variants.ts": "export const buttonVariants = {};\nexport function pick(): string { return \"\"; }\n" },
    );
    for (const name of ["variant", "size", "key", "conditional", "mapped", "query", "returned"]) {
      expect(param(m, name), name).toMatchObject({ category: "string" });
      expect(param(m, name).uncertain, name).toBeUndefined();
    }
    expect(param(m, "narrowed")).toMatchObject({ category: "string", optional: false });
    expect(param(m, "excluded")).toMatchObject({ category: "string", optional: false });
    expect(param(m, "callback")).toMatchObject({ category: "EventCallback<T>", typeArgument: "number" });
    expect(param(m, "upper").category).toBe("string");
    for (const name of ["frozen", "record", "list"]) expect(param(m, name).category, name).toBe("value");
  });

  it("covers accessor fields, setters, cascading options and JSDoc; skips static/private/foreign decorators", () => {
    const m = component(
      RT +
        `import { Parameter as Param } from "./my-decorators";
class EditContext {}
export default class C extends ComponentBase {
  /** The heading. */
  @Parameter() accessor heading = "";
  @Parameter() set width(value: number) {}
  @CascadingParameter({ name: "theme" }) theme?: string;
  @CascadingParameter({ type: EditContext }) editContext?: EditContext;
  @Parameter() static nope = 1;
  @Param() foreign?: string;
}`,
    );
    expect(param(m, "heading")).toMatchObject({ member: "accessor", category: "string", doc: "The heading." });
    expect(param(m, "width")).toMatchObject({ member: "setter", type: "number", category: "value" });
    expect(param(m, "theme").cascading).toEqual({ name: "theme" });
    expect(param(m, "editContext").cascading).toEqual({ type: "EditContext" });
    expect(m.parameters.map((p) => p.name)).toEqual(["heading", "width", "theme", "editContext"]);
  });

  it("reads defineParameter() calls of decorator-free components", () => {
    const m = component(
      `import { ComponentBase, defineParameter } from "@tsazor/runtime";
export default class C extends ComponentBase { label = ""; }
defineParameter(C, "label");
defineParameter(C, "extra", { captureUnmatchedValues: true });`,
    );
    expect(m.parameters.map((p) => [p.name, p.category])).toEqual([["label", "string"], ["extra", "captureUnmatchedValues"]]);
  });
});

describe("inheritance", () => {
  it("flattens base classes across files; a re-declaration wins at the base's position", () => {
    const m = component(
      RT +
        `import { Base } from "./base";
export default class C extends Base {
  @Parameter() b?: number;
  @Parameter() own?: string;
}`,
      {
        "/virtual/base.ts": RT + `export class Base extends ComponentBase {\n  @Parameter() a?: string;\n  @Parameter() b?: string;\n}\n`,
      },
      undefined,
      RUNTIME_PACKAGES,
    );
    expect(m.isComponent).toBe(true);
    expect(m.parameters.map((p) => [p.name, p.declaredBy, p.category])).toEqual([
      ["a", "Base", "string"],
      ["b", "C", "value"],
      ["own", "C", "string"],
    ]);
  });

  it("substitutes base type arguments (InputBase<string> from the runtime manifest)", () => {
    const m = component(RT + `import { InputBase } from "@tsazor/runtime";\nexport default class C extends InputBase<string> {}`, {}, undefined, RUNTIME_PACKAGES);
    expect(param(m, "Value")).toMatchObject({ type: "string", category: "string" });
    expect(param(m, "ValueChanged")).toMatchObject({ type: "EventCallback<string>", category: "EventCallback<T>", typeArgument: "string" });
    const u = component(RT + `import { InputBase } from "@tsazor/runtime";\nexport default class C extends InputBase<number | string> {}`, {}, undefined, RUNTIME_PACKAGES);
    expect(param(u, "Value")).toMatchObject({ type: "number | string", category: "string" });
  });

  it("marks components with an unresolvable base as incomplete", () => {
    const m = component(RT + `import { Missing } from "./missing";\nexport default class C extends Missing {\n  @Parameter() x?: string;\n}`);
    expect(m.incomplete).toBe(true);
    expect(m.base).toEqual({ name: "Missing", resolved: false });
    expect(m.parameters.map((p) => p.name)).toEqual(["x"]);
  });
});

describe(".tsazor extraction", () => {
  const host = (files: Record<string, string> = {}): MetadataHost => hostFor(files, RUNTIME_PACKAGES);

  it("takes a leading @** … *@ as the component's doc; a plain @* *@ or a later one is not", () => {
    const docOf = (source: string): string | undefined =>
      resolveComponentMetadata(extractTsazorMetadata(source, "/virtual/Card.tsazor", { className: "Card" }), undefined, host())!.doc;
    expect(docOf("@**\n * A card with a header.\n * Wraps `.card`.\n *@\n<div></div>")).toBe("A card with a header.\nWraps `.card`.");
    expect(docOf("﻿  @** One line. *@\n<div></div>")).toBe("One line.");
    expect(docOf("@* Implementation note. *@\n<div></div>")).toBeUndefined();
    expect(docOf("<div></div>\n@** Too late. *@")).toBeUndefined();
    expect(docOf("@**@ <div></div>")).toBeUndefined();
  });

  it("takes the class JSDoc as the doc of a TS component", () => {
    const module = extractModuleMetadata(`${RT}/** A plain-TS counter. */\nexport default class Counter extends ComponentBase {}\n`, "/virtual/Counter.ts");
    expect(resolveComponentMetadata(module, undefined, host())!.doc).toBe("A plain-TS counter.");
  });

  it("records the initializer as written as the parameter default", () => {
    const module = extractModuleMetadata(
      `${RT}export default class Chip extends ComponentBase {\n  @Parameter() variant = "primary";\n  @Parameter() items: string[] = [];\n  @Parameter() label?: string;\n}\n`,
      "/virtual/Chip.ts",
    );
    const parameters = resolveComponentMetadata(module, undefined, host())!.parameters;
    expect(parameters.map((p) => [p.name, p.default])).toEqual([["variant", '"primary"'], ["items", "[]"], ["label", undefined]]);
  });

  it("reads @code parameters, @typeparam and inherited @imports; compiler-imported runtime names count", () => {
    const module = extractTsazorMetadata(
      [
        "@typeparam TRow extends object",
        '@import type { Status } from "./types"',
        "<p></p>",
        "@code {",
        "  @Parameter() rows: TRow[] = [];",
        "  @Parameter() rowContent?: (row: TRow) => RenderFragment;",
        "  @Parameter() onSelect?: EventCallback<TRow>;",
        "  @Parameter() status?: Status;",
        "  @Parameter() theme?: Theme;",
        "  count = 0;",
        "}",
      ].join("\n"),
      "/virtual/Grid.tsazor",
      {
        className: "Grid",
        inheritedImports: [{ specifier: "./theme", bindings: [{ local: "Theme", imported: "Theme", typeOnly: true }] }],
      },
    );
    const m = resolveComponentMetadata(module, undefined, host({
      "/virtual/types.ts": 'export type Status = "a" | "b";\n',
      "/virtual/theme.ts": 'export type Theme = "light" | "dark";\n',
    }))!;
    expect(m.typeParameters).toEqual([{ name: "TRow", constraint: "object" }]);
    expect(m.isComponent).toBe(true);
    expect(m.parameters.map((p) => [p.name, p.category, p.typeArgument])).toEqual([
      ["rows", "value", undefined],
      ["rowContent", "RenderFragment<T>", "TRow"],
      ["onSelect", "EventCallback<T>", "TRow"],
      ["status", "string", undefined],
      ["theme", "string", undefined],
    ]);
  });

  it("extends the code-behind class (its parameters first) and @inherits bases", () => {
    const files = {
      "/virtual/Page.tsazor.ts": RT + "export default class PageBase extends ComponentBase {\n  @Parameter() id = 0;\n}\n",
    };
    const page = extractTsazorMetadata("@code { @Parameter() title = \"\"; }", "/virtual/Page.tsazor", { className: "Page", codeBehind: true });
    const m = resolveComponentMetadata(page, undefined, host(files))!;
    expect(m.base).toMatchObject({ codeBehind: true, resolved: true });
    expect(m.parameters.map((p) => [p.name, p.declaredBy])).toEqual([["id", "PageBase"], ["title", "Page"]]);

    const input = extractTsazorMetadata("@inherits InputBase<string>\n<input />", "/virtual/MyInput.tsazor", {
      className: "MyInput",
      resolveType: (name) => (name === "InputBase" ? { specifier: "@tsazor/runtime", exportName: "InputBase" } : null),
    });
    const resolved = resolveComponentMetadata(input, undefined, host())!;
    expect(param(resolved, "Value").category).toBe("string");
    expect(param(resolved, "ValueChanged").typeArgument).toBe("string");
  });
});

describe("public methods", () => {
  const host = (files: Record<string, string> = {}): MetadataHost => hostFor(files, RUNTIME_PACKAGES);

  it("lists the public methods a component declares, typed as a declaration writes them", () => {
    const module = extractTsazorMetadata(
      [
        "@typeparam TItem",
        '@import type { Column } from "./types"',
        "<p></p>",
        "@code {",
        "  @Parameter() items: TItem[] = [];",
        "  /** Shows it. */",
        "  async show(): Promise<void> {}",
        "  close(returnFocus = true, delay = 0, reason = \"code\"): void {}",
        "  sortBy(column: Column<TItem>, direction?: \"asc\" | \"desc\"): Promise<void> { return Promise.resolve(); }",
        "  async reload() {}",
        "  pick<T extends TItem>(...items: T[]) { return items[0]; }",
        "  setOptions({ dense }: { dense: boolean }): void {}",
        "  /** @internal For the child component. */",
        "  register(item: TItem): void {}",
        "  private helper(): void {}",
        "  protected override onInitialized(): void {}",
        "  static create(): void {}",
        "}",
      ].join("\n"),
      "/virtual/List.tsazor",
      { className: "List" },
    );
    const m = resolveComponentMetadata(module, undefined, host({ "/virtual/types.ts": "export type Column<T> = { key: keyof T };\n" }))!;
    expect(m.methods?.map((method) => `${method.name}${method.typeParameters ?? ""}(${method.parameters}): ${method.returnType}`)).toEqual([
      "show(): Promise<void>",
      "close(returnFocus?: boolean, delay?: number, reason?: string): void",
      'sortBy(column: Column<TItem>, direction?: "asc" | "desc"): Promise<void>',
      "reload(): Promise<unknown>",
      "pick<T extends TItem>(...items: T[]): unknown",
      "setOptions(arg0: { dense: boolean }): void",
    ]);
    expect(m.methods?.[0]).toMatchObject({ doc: "Shows it.", declaredBy: "List" });
    const sortBy = m.methods?.find((method) => method.name === "sortBy");
    expect(sortBy?.references?.map((ref) => [ref.name, ref.kind])).toEqual([["Column", "import"], ["TItem", "typeParameter"], ["Promise", "global"]]);
  });

  it("leaves the methods out when there are none", () => {
    const module = extractModuleMetadata(`${RT}export default class Plain extends ComponentBase {\n  @Parameter() label = "";\n}\n`, "/virtual/Plain.ts");
    expect(resolveComponentMetadata(module, undefined, host())!.methods).toBeUndefined();
  });
});
