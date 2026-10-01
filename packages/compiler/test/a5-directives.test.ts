/**
 * Roadmap A5: bind targets over the TS AST (C17), component bind modifiers
 * (C16), event modifiers with values (C15), `@attribute` (C19) and a
 * user-written buildRenderTree (C21).
 */
import { describe, expect, it } from "vitest";
import { csharpString, parseAttributeLists } from "../src/attributes";
import { DiagnosticBag } from "../src/diagnostics";
import { generateCode } from "../src/codegen";
import { parseDocument } from "../src/parser";
import { checkBindTarget } from "../src/rewrite";

function gen(source: string, options?: Partial<Parameters<typeof generateCode>[1]>) {
  const diagnostics = new DiagnosticBag();
  const doc = parseDocument(source, diagnostics);
  const result = generateCode(doc, { className: "Demo", ...options }, diagnostics);
  return { code: result.code, metadata: result.metadata, diagnostics };
}

const component = { resolveComponent: (tag: string) => (tag === "Field" ? { specifier: "./Field.tsazor" } : null) };

describe("checkBindTarget (C17)", () => {
  it.each([
    ["name", "name"],
    ["this.model.name", "name"],
    ["Model!.Title", "Title"],
    ["a.b!.c", "c"],
    ["Model!.Items![0]!.Name", "Name"],
    ["items[i].name", "name"],
    ["map[key]", undefined],
    ['map["title"]', "title"],
    ["(model.name)", "name"],
    ["(model as any).name", "name"],
    ["getModel().name", "name"],
  ])("accepts %s", (code, field) => {
    const { identifier: _, ...target } = checkBindTarget(code) as { identifier?: string };
    expect(target).toEqual({ ok: true, field });
  });

  it("names a bare identifier target (A7: read-only locals are checked by codegen)", () => {
    expect(checkBindTarget("item")).toEqual({ ok: true, field: "item", identifier: "item" });
    expect(checkBindTarget("(item!)")).toMatchObject({ identifier: "item" });
    expect(checkBindTarget("item.name")).toEqual({ ok: true, field: "name" });
  });

  it.each(["a?.b", "a?.b.c", "a.b?.[0]", "f?.().x", "a?.b!.c"])("rejects optional chaining: %s", (code) => {
    const result = checkBindTarget(code);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/optional chaining/);
  });

  it.each(["a + b", "f()", "this", "'x'", "a = b", "a, b", "x =>"])("rejects non-lvalues: %s", (code) => {
    expect(checkBindTarget(code).ok).toBe(false);
  });
});

describe("@bind codegen (C16, C17)", () => {
  it("assigns exactly the bound target (non-null, element access)", () => {
    const { code, diagnostics } = gen('<input @bind="Model!.Title" /><input @bind="items[i].name" />\n@code { Model: { Title: string } | null = null; items: { name: string }[] = []; i = 0; }');
    expect(diagnostics.hasErrors).toBe(false);
    expect(code).toContain("this.Model!.Title = (__event.target as HTMLInputElement).value;");
    expect(code).toContain("this.items[this.i].name = (__event.target as HTMLInputElement).value;");
  });

  it("rejects optional chaining with a precise diagnostic", () => {
    const { diagnostics } = gen('<Field @bind-Value="Model?.Title" />', component);
    expect(diagnostics.errors.map((d) => d.code)).toEqual(["TZS008"]);
    expect(diagnostics.errors[0]!.message).toContain("'@bind-Value' target 'Model?.Title' uses optional chaining");
  });

  it("derives ValueExpression through non-null assertions", () => {
    const { code } = gen('<Field @bind-Value="Model!.Title" />', component);
    expect(code).toContain('"ValueExpression", "Title"');
    expect(code).toContain("(__value) => { this.Model!.Title = __value; }");
  });

  it("@bind-Value:after awaits the after hook", () => {
    const { code, diagnostics } = gen('<Field @bind-Value="v" @bind-Value:after="changed" />', component);
    expect(diagnostics.hasErrors).toBe(false);
    expect(code).toContain('"ValueChanged", __tsazor_EventCallback.bind(this, async (__value) => { this.v = __value; await this.changed(); })');
  });

  it("@bind-Value:get/:set replace the assignment", () => {
    const { code, diagnostics } = gen('<Field @bind-Value:get="v" @bind-Value:set="store" />', component);
    expect(diagnostics.hasErrors).toBe(false);
    expect(code).toContain('__builder.addAttribute(1, "Value", this.v);');
    expect(code).toContain('"ValueChanged", __tsazor_EventCallback.bind(this, async (__value) => { await (this.store)(__value); })');
  });

  it("@bind-Value:event names the change callback parameter on components", () => {
    const { code } = gen('<Field @bind-Value="v" @bind-Value:event="OnChanged" />', component);
    expect(code).toContain('"OnChanged", __tsazor_EventCallback.bind(this,');
    expect(code).not.toContain('"ValueChanged"');
    expect(gen('<Field @bind-Value="v" @bind-Value:event="on-x" />', component).diagnostics.errors.map((d) => d.code)).toEqual(["TZS008"]);
  });

  it("applies the .NET 7 combination rules to component binds", () => {
    expect(gen('<Field @bind-Value:get="v" @bind-Value:set="s" @bind-Value:after="a" />', component).diagnostics.errors[0]!.message)
      .toContain("'@bind-Value:after' can't be used with '@bind-Value:set'");
    expect(gen('<Field @bind-Value="v" @bind-Value:get="g" @bind-Value:set="s" />', component).diagnostics.errors[0]!.message)
      .toContain("'@bind-Value' can't be used together with '@bind-Value:get'");
  });

  it("A7: @bind-<attr> on an element binds that attribute (Razor), not a component parameter", () => {
    const { code, diagnostics } = gen('<input @bind-value="name" @bind-value:event="oninput" /><input type="checkbox" @bind-checked="done" />');
    expect(diagnostics.all).toEqual([]);
    expect(code).toContain('__builder.addAttribute(1, "value", this.name);');
    expect(code).toContain('__builder.addEventHandler(2, "oninput", __tsazor_EventCallback.bind(this, (__event) => { this.name = (__event.target as HTMLInputElement).value; }));');
    expect(code).toContain('__builder.addAttribute(5, "checked", this.done);');
    expect(code).toContain("this.done = (__event.target as HTMLInputElement).checked;");
    expect(code).not.toContain("ValueChanged");
    expect(code).not.toContain('"valueChanged"');
  });

  it("A7: @bind on a loop variable or another read-only local is a compile error (C#: CS1656)", () => {
    const errorsOf = (source: string): string[] => gen(source, component).diagnostics.errors.map((d) => d.message);
    expect(errorsOf("@foreach (const item of items) { <input @bind=\"item\" /> }")).toEqual([
      "Unsupported directive attribute. '@bind' cannot bind to the const loop variable 'item' — bind to a member like 'item.name', or loop over indices and bind the element ('xs[i]').",
    ]);
    expect(errorsOf("@foreach (let item of items) { <Field @bind-Value=\"item\" /> }")[0]).toContain("'@bind-Value' cannot bind to the loop variable 'item'");
    expect(errorsOf("@foreach (var x in xs) { <input @bind=\"x\" /> }").filter((m) => m.includes("cannot bind"))).toHaveLength(1);
    expect(errorsOf("@{ const label = \"a\"; }\n<input @bind=\"label\" />")[0]).toContain("cannot bind to the const local 'label'");
    expect(errorsOf("@{ function f() {} }\n<input @bind=\"f\" />")[0]).toContain("cannot bind to the function declaration 'f'");
    expect(errorsOf("@import { shared } from \"./state\"\n<input @bind=\"shared\" />")[0]).toContain("cannot bind to the import 'shared'");
  });

  it("A7: assignable targets stay accepted (members, member paths of loop variables, let/catch locals, counting loops)", () => {
    for (const source of [
      "@foreach (const item of items) { <input @bind=\"item.name\" /> }",
      "@for (let i = 0; i < items.length; i++) { <input @bind=\"items[i].name\" /> }",
      "@for (let i = 0; i < 3; i++) { <input @bind=\"i\" /> }",
      "@{ let draft = \"\"; }\n<input @bind=\"draft\" />",
      "@foreach (const item of items) { }\n<input @bind=\"item\" />",
      "@import { shared } from \"./state\"\n<input @bind=\"shared\" />\n@code { shared = \"\"; }",
    ]) {
      expect(gen(source).diagnostics.errors, source).toEqual([]);
    }
  });

  it("A7: element @bind-value keeps the number coercion and the modifier rules; the label names the attribute", () => {
    const { code } = gen('<input type="number" @bind-Value="count" />');
    expect(code).toContain('"value", this.count');
    expect(code).toContain("Number((__event.target as HTMLInputElement).value)");
    expect(gen('<input @bind-value:after="f" />').diagnostics.errors[0]!.message).toContain("'@bind-value:after' was used but no '@bind-value' was found");
    expect(gen('<input @bind-value="a?.b" />').diagnostics.errors[0]!.message).toContain("'@bind-value' target 'a?.b'");
  });
});

describe("event modifiers (C15)", () => {
  it("emits Blazor's __internal_* attributes, with a value or true", () => {
    const { code, diagnostics } = gen('<a @onclick="go" @onclick:preventDefault="prevent" @onclick:stopPropagation>x</a>');
    expect(diagnostics.hasErrors).toBe(false);
    expect(code).toContain('__builder.addAttribute(2, "__internal_preventDefault_onclick", this.prevent);');
    expect(code).toContain('__builder.addAttribute(3, "__internal_stopPropagation_onclick", true);');
    // Exactly one handler.
    expect(code.match(/addEventHandler/g)).toHaveLength(1);
  });

  it("allows a modifier without a handler", () => {
    const { code, diagnostics } = gen("<form @onsubmit:preventDefault></form>");
    expect(diagnostics.hasErrors).toBe(false);
    expect(code).toContain('"__internal_preventDefault_onsubmit", true');
    expect(code).not.toContain("addEventHandler");
  });

  it("passes modifiers on a component as attributes (splatted by the component, as in Blazor)", () => {
    const { code, diagnostics } = gen('<Field @onclick:stopPropagation="true" />', component);
    expect(diagnostics.hasErrors).toBe(false);
    expect(code).toContain('__builder.addAttribute(1, "__internal_stopPropagation_onclick", true);');
  });

  it("reports unknown and duplicate modifiers", () => {
    expect(gen("<a @onclick:once></a>").diagnostics.errors[0]!.message).toContain("Unknown event modifier ':once'");
    expect(gen("<a @onclick:preventDefault @onclick:preventDefault></a>").diagnostics.errors[0]!.message).toContain("Duplicate modifier");
  });
});

describe("@attribute (C19)", () => {
  it("parses C# attribute lists", () => {
    expect(parseAttributeLists('[Authorize(Roles = "A,B")]')).toEqual([
      { name: "Authorize", written: "Authorize", args: [{ name: "Roles", value: '"A,B"' }] },
    ]);
    expect(parseAttributeLists("[CascadingTypeParameter(nameof(TItem)), StreamRendering][Microsoft.AspNetCore.Authorization.AuthorizeAttribute]")!.map((a) => a.name))
      .toEqual(["CascadingTypeParameter", "StreamRendering", "Authorize"]);
    expect(parseAttributeLists("Authorize")).toBeNull();
    expect(parseAttributeLists('[Authorize("x"')).toBeNull();
    expect(csharpString('"a\\"b"')).toBe('a"b');
    expect(csharpString('@"a""b"')).toBe('a"b');
    expect(csharpString("Roles.Admin")).toBeNull();
  });

  it("bare @authorize protects the route", () => {
    const { code, metadata, diagnostics } = gen('@page "/x"\n@authorize\n<p>x</p>');
    expect(diagnostics.all).toEqual([]);
    expect(metadata.authorize).toBe(true);
    expect(metadata.authorizeData).toBeUndefined();
    expect(code).toContain("export const routeAuthorize = true;");
  });

  it("@authorize({ roles, policy }) becomes the route's requirements", () => {
    const { code, metadata, diagnostics } = gen('@page "/x"\n@authorize({ roles: ["Admin", "Editor"], policy: "CanEdit" })\n<p>x</p>');
    expect(diagnostics.all).toEqual([]);
    expect(metadata.authorizeData).toEqual({ roles: ["Admin", "Editor"], policy: "CanEdit" });
    expect(code).toContain('export const routeAuthorize = {"roles":["Admin","Editor"],"policy":"CanEdit"};');
    expect(gen('@page "/x"\n@authorize({ policy: "CanEdit" })\n<p>x</p>').metadata.authorizeData).toEqual({ policy: "CanEdit" });
    // An empty object (or no argument) is authentication only.
    const empty = gen('@page "/x"\n@authorize({})\n<p>x</p>').metadata;
    expect([empty.authorize, empty.authorizeData]).toEqual([true, undefined]);
  });

  it("@authorize's object literal may span lines", () => {
    const { metadata, diagnostics, code } = gen('@page "/x"\n@authorize({\n    roles: ["A",\n        "B"],\n})\n<p>x</p>');
    expect(diagnostics.all).toEqual([]);
    expect(metadata.authorizeData).toEqual({ roles: ["A", "B"] });
    expect(code).toContain('addContent(1, "x")');
    expect(code).not.toContain("roles: [");
  });

  it("refuses requirements it cannot combine and non-literal values", () => {
    const codes = (source: string) => gen(source).diagnostics.errors.map((d) => d.code);
    expect(codes('@authorize({ roles: ["A"] })\n@authorize({ roles: ["B"] })\n<p/>')).toEqual(["TZS019"]);
    expect(codes("@authorize({ roles: [RoleNames.Admin] })\n<p/>")).toEqual(["TZS019"]);
    expect(codes('@authorize({ roles: "A, B" })\n<p/>')).toEqual(["TZS019"]);
    expect(codes('@authorize({ schemes: ["x"] })\n<p/>')).toEqual(["TZS019"]);
    expect(codes('@authorize("P")\n<p/>')).toEqual(["TZS019"]);
    expect(codes("@authorize({ roles: [\"A\"] \n<p/>")).toEqual(["TZS019"]);
  });

  it("a C# attribute list is TZS021 naming the TS form", () => {
    const messages = (source: string) => gen(source).diagnostics.all.map((d) => [d.code, d.severity, d.message]);
    expect(messages('@page "/x"\n@attribute [Authorize]\n<p/>')).toEqual([
      ["TZS021", "error", "C# form — use the TypeScript form. C# attribute '[Authorize]' — use '@authorize'."],
    ]);
    expect(messages('@attribute [Authorize(Roles = "Admin, Editor", Policy = "CanEdit")]\n<p/>')[0]![2]).toContain(
      `use '@authorize({ roles: ["Admin", "Editor"], policy: "CanEdit" })'`,
    );
    expect(messages('@attribute [Authorize("CanEdit")]\n<p/>')[0]![2]).toContain(`use '@authorize({ policy: "CanEdit" })'`);
    expect(messages("@attribute [Authorize(Roles = RoleNames.Admin)]\n<p/>")[0]![2]).toContain("with string literals");
    expect(messages("@attribute [AllowAnonymous]\n<p/>")[0]![2]).toContain("a page is anonymous unless it declares @authorize");
    expect(messages('@attribute [Route("/x")]\n<p/>')[0]![2]).toContain(`use '@page "…"'`);
    // One error per attribute of a list; nothing reaches the route metadata.
    const { diagnostics, metadata, code } = gen('@page "/x"\n@attribute [CascadingTypeParameter(nameof(TItem)), Microsoft.AspNetCore.Authorization.AuthorizeAttribute]\n<p/>');
    expect(diagnostics.errors.map((d) => d.code)).toEqual(["TZS021", "TZS021"]);
    expect(diagnostics.errors[0]!.message).toContain("'[CascadingTypeParameter]' — use a TS class decorator");
    expect(metadata.authorize).toBeUndefined();
    expect(code).not.toContain("CascadingTypeParameter");
  });

  it("emits a TS decorator on the class", () => {
    const { code, diagnostics } = gen('@import { tracked } from "./decorators"\n@attribute @tracked("x")\n<p/>');
    expect(diagnostics.all).toEqual([]);
    expect(code).toContain('@tracked("x")\nexport default class Demo');
  });

  it("reports an invalid form", () => {
    expect(gen("@attribute Authorize\n<p/>").diagnostics.errors.map((d) => d.code)).toEqual(["TZS019"]);
  });
});

describe("user-written buildRenderTree (C21)", () => {
  it("is an error in @code — with or without markup", () => {
    for (const markup of ["", "<p>x</p>\n"]) {
      const { diagnostics } = gen(`${markup}@code {\n    protected override buildRenderTree(b: RenderTreeBuilder): void { }\n}`);
      expect(diagnostics.errors.map((d) => d.code)).toEqual(["TZS020"]);
      expect(diagnostics.errors[0]!.pos).toEqual({ line: markup ? 3 : 2, column: 23 });
    }
  });

  it("is an error in the code-behind class", () => {
    const codeBehindSource = "export default class DemoBase extends ComponentBase { protected override buildRenderTree(): void {} }";
    const { diagnostics } = gen("<p>x</p>", { codeBehindClass: "DemoBase", codeBehindSource });
    expect(diagnostics.errors.map((d) => d.code)).toEqual(["TZS020"]);
  });

  it("leaves other members alone", () => {
    expect(gen("<p>x</p>\n@code { protected renderTreeBuilder = 1; }").diagnostics.errors).toEqual([]);
  });
});
