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
    expect(checkBindTarget(code)).toEqual({ ok: true, field });
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

  it("[Authorize] is @authorize", () => {
    const { code, metadata, diagnostics } = gen('@page "/x"\n@attribute [Authorize]\n<p>x</p>');
    expect(diagnostics.all).toEqual([]);
    expect(metadata.authorize).toBe(true);
    expect(metadata.authorizeData).toBeUndefined();
    expect(code).toContain("export const routeAuthorize = true;");
  });

  it("[Authorize(Roles = …, Policy = …)] become the route's requirements", () => {
    const { code, metadata } = gen('@page "/x"\n@attribute [Authorize(Roles = "Admin, Editor", Policy = "CanEdit")]\n<p>x</p>');
    expect(metadata.authorizeData).toEqual({ roles: ["Admin", "Editor"], policy: "CanEdit" });
    expect(code).toContain('export const routeAuthorize = {"roles":["Admin","Editor"],"policy":"CanEdit"};');
    expect(gen('@page "/x"\n@attribute [Authorize("CanEdit")]\n<p>x</p>').metadata.authorizeData).toEqual({ policy: "CanEdit" });
  });

  it("[AllowAnonymous] wins over [Authorize]", () => {
    const { metadata, code } = gen('@page "/x"\n@authorize\n@attribute [AllowAnonymous]\n<p>x</p>');
    expect(metadata.authorize).toBeUndefined();
    expect(code).not.toContain("routeAuthorize");
  });

  it("refuses requirements it cannot combine and non-literal roles", () => {
    expect(gen('@attribute [Authorize(Roles = "A")]\n@attribute [Authorize(Roles = "B")]\n<p/>').diagnostics.errors.map((d) => d.code)).toEqual(["TZS019"]);
    expect(gen("@attribute [Authorize(Roles = RoleNames.Admin)]\n<p/>").diagnostics.errors.map((d) => d.code)).toEqual(["TZS019"]);
  });

  it("ignores other C# attributes with TZS014", () => {
    const { code, diagnostics } = gen("@attribute [CascadingTypeParameter(nameof(TItem))]\n<p/>");
    expect(diagnostics.errors).toEqual([]);
    expect(diagnostics.all.map((d) => [d.code, d.severity])).toEqual([["TZS014", "warning"]]);
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
