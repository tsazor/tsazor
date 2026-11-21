/**
 * `@Bindable()` (Tsazor extension) in the 2.1 metadata and the generated
 * code: one accessor contributes the value parameter and its change
 * callback (`EventCallback<T>`), so `@bind-Value` resolves against the pair.
 */
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile";
import { bindableMembers, bindablePairs } from "../src/bindable";
import {
  extractModuleMetadata,
  extractTsazorMetadata,
  resolveComponentMetadata,
  type ComponentMetadata,
  type MetadataHost,
  type ModuleMetadata,
} from "../src/metadata";

const BASE: ComponentMetadata = { name: "ComponentBase", isComponent: true, abstract: true, typeParameters: [], parameters: [] };

function hostFor(files: Record<string, string>): MetadataHost {
  const modules = new Map<string, ModuleMetadata>();
  const moduleAt = (file: string): ModuleMetadata | undefined => {
    if (!(file in files)) return undefined;
    if (!modules.has(file)) modules.set(file, extractModuleMetadata(files[file]!, file));
    return modules.get(file);
  };
  return {
    moduleAt,
    resolveModule: (specifier, fromFile) => moduleAt(`${fromFile.slice(0, fromFile.lastIndexOf("/"))}/${specifier.slice(2).replace(/\.js$/, "")}.ts`),
    packageComponent: (specifier, exportName) => (specifier === "@tsazor/runtime" && exportName === "ComponentBase" ? BASE : undefined),
  };
}

function tsComponent(source: string, extra: Record<string, string> = {}, className?: string): ComponentMetadata {
  const host = hostFor({ "/virtual/C.ts": source, ...extra });
  return resolveComponentMetadata(host.moduleAt("/virtual/C.ts")!, className, host)!;
}

function tsazorComponent(source: string, className = "Stepper"): ComponentMetadata {
  const host = hostFor({});
  return resolveComponentMetadata(extractTsazorMetadata(source, `/virtual/${className}.tsazor`, { className }), undefined, host)!;
}

describe("2.1 metadata", () => {
  it("a .tsazor @Bindable() accessor contributes the value and the EventCallback<T> callback", () => {
    const metadata = tsazorComponent("@code { @Bindable() accessor Value = 0; }");
    expect(metadata.parameters.map((p) => [p.name, p.category, p.typeArgument, p.member])).toEqual([
      ["Value", "value", undefined, "accessor"],
      ["ValueChanged", "EventCallback<T>", "number", "field"],
    ]);
    const [value, changed] = metadata.parameters;
    expect(value!.bindable).toEqual({ changed: "ValueChanged" });
    expect(value!.inferredType).toBe("number");
    expect(changed!.synthesizedBy).toBe("Value");
    expect(changed!.optional).toBe(true);
    expect(changed!.type).toBe("EventCallback<number>");
    expect(changed!.references).toEqual([{ name: "EventCallback", kind: "runtime", imported: "EventCallback" }]);
  });

  it("honours `changed` and `expression`", () => {
    const metadata = tsazorComponent('@code { @Bindable({ changed: "OnPick", expression: true }) accessor Value: string = ""; }');
    expect(metadata.parameters.map((p) => [p.name, p.category, p.type])).toEqual([
      ["Value", "string", "string"],
      ["OnPick", "EventCallback<T>", "EventCallback<string>"],
      ["ValueExpression", "string", "string"],
    ]);
  });

  it("a plain .ts component imports Bindable — the synthesized callback is the runtime's EventCallback without importing it", () => {
    const metadata = tsComponent(
      'import { ComponentBase, Bindable } from "@tsazor/runtime";\nimport type { Person } from "./person";\n' +
        "export default class Picker extends ComponentBase { @Bindable() accessor selected: Person | null = null; }",
      { "/virtual/person.ts": "export interface Person { name: string }" },
    );
    const changed = metadata.parameters.find((p) => p.name === "selectedChanged")!;
    expect(changed.category).toBe("EventCallback<T>");
    expect(changed.typeArgument).toBe("Person | null");
    expect(changed.references?.map((r) => [r.name, r.kind])).toEqual([["EventCallback", "runtime"], ["Person", "import"]]);
  });

  it("a type parameter flows into the callback and is substituted through `extends Base<Args>`", () => {
    const metadata = tsComponent(
      'import { ComponentBase, Bindable } from "@tsazor/runtime";\n' +
        "export class Select<T> extends ComponentBase { @Bindable() accessor value!: T; }\n" +
        "export default class NumberSelect extends Select<number> {}",
    );
    const changed = metadata.parameters.find((p) => p.name === "valueChanged")!;
    expect(changed.type).toBe("EventCallback<number>");
    expect(changed.typeArgument).toBe("number");
  });

  it("an unrelated decorator named Bindable is not the runtime's", () => {
    const metadata = tsComponent(
      'import { ComponentBase, Parameter } from "@tsazor/runtime";\nimport { Bindable } from "./other";\n' +
        "export default class C extends ComponentBase { @Bindable() accessor value = 0; @Parameter() size = 1; }",
      { "/virtual/other.ts": "export function Bindable() { return () => {}; }" },
    );
    expect(metadata.parameters.map((p) => p.name)).toEqual(["size"]);
  });
});

describe("@code helpers", () => {
  it("bindableMembers reads accessor, type and options", () => {
    expect(bindableMembers('@Bindable({ changed: "onPick" }) accessor value: string = "";\n@Bindable() count = 0;')).toEqual([
      { name: "value", nameOffset: 42, accessor: true, type: "string", changed: "onPick" },
      { name: "count", nameOffset: 74, accessor: false, inferredType: "number", changed: "countChanged" },
    ]);
  });

  it("bindablePairs finds explicit pairs only", () => {
    const body = "\n    @Parameter() Value = 0;\n    @Parameter() ValueChanged?: EventCallback<number>;\n    @Parameter() Other = 1;\n";
    const pairs = bindablePairs(body);
    expect(pairs.map((p) => [p.name, p.replacement])).toEqual([["Value", "@Bindable() accessor Value = 0;"]]);
    expect(body.slice(pairs[0]!.changed.start, pairs[0]!.changed.end)).toBe("    @Parameter() ValueChanged?: EventCallback<number>;\n");
    expect(bindablePairs("@Parameter() Value = 0; @Parameter() ValueChanged = 1;")).toEqual([]);
  });
});

describe("generated code", () => {
  it("imports Bindable and declares the synthesized members (typed, no field emitted)", () => {
    const result = compile('<p>@Value</p>\n@code { @Bindable({ expression: true }) accessor Value: string = ""; }', { fileName: "Field.tsazor" });
    expect(result.diagnostics.all.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.code).toMatch(/import \{[^}]*\bBindable\b[^}]*\} from "@tsazor\/runtime"/);
    expect(result.code).toContain("declare ValueChanged?: __tsazor_EventCallback<string>;");
    expect(result.code).toContain("declare ValueExpression?: string;");
  });

  it("does not redeclare a member the @code declares itself", () => {
    const result = compile("@code { @Bindable() accessor Value = 0; declare ValueChanged?: EventCallback<number>; }", { fileName: "Field.tsazor" });
    expect(result.code.match(/ValueChanged\?/g)).toHaveLength(1);
  });

  it("markup free names resolve the synthesized member to this.X", () => {
    const result = compile("<p>@(ValueChanged ? 1 : 0)</p>\n@code { @Bindable() accessor Value = 0; }", { fileName: "Field.tsazor" });
    expect(result.code).toContain("this.ValueChanged");
  });
});

describe("@State (F6)", () => {
  const errors = (code: string) => compile(code, { fileName: "Clock.tsazor" }).diagnostics.errors.map((d) => `${d.code} ${d.message}`);

  it("imports State itself and compiles an accessor without diagnostics", () => {
    const result = compile("<p>@seconds</p>\n@code { @State() accessor seconds = 0; }", { fileName: "Clock.tsazor" });
    expect(result.diagnostics.errors).toEqual([]);
    expect(result.code).toMatch(/import \{[^}]*\bState\b[^}]*\} from "@tsazor\/runtime"/);
  });

  it("reports a plain field (with the 'accessor' fix) and a parameter as TZS030", () => {
    const plain = compile("@code { @State() seconds = 0; }", { fileName: "Clock.tsazor" }).diagnostics.errors;
    expect(plain.map((d) => d.code)).toEqual(["TZS030"]);
    expect(plain[0]!.message).toContain("write 'accessor seconds'");
    expect(plain[0]!.fixes?.[0]?.title ?? (plain[0] as { fix?: { title: string } }).fix?.title).toBe("Insert 'accessor'");
    expect(errors("@code { @State() @Parameter() accessor Seconds = 0; }")).toEqual([expect.stringMatching(/^TZS030 .*@State\(\) and @Parameter\(\) on 'Seconds'/)]);
  });
});
