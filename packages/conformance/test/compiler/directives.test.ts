/**
 * Directives. Review §1: C19 (Blazor-only directives, @attribute, generic
 * @inherits), C21 (user-written buildRenderTree).
 */
import { describe, expect, it } from "vitest";
import {
  AuthenticationState,
  AuthenticationStateProvider,
  AuthorizeRouteView,
  ComponentBase,
  Renderer,
  ServiceCollection,
  createUser,
  defineComponent,
  matchRoute,
  type ClaimsPrincipal,
  type RenderTreeBuilder,
} from "@tsazor/runtime";
import { generateRoutesModule, scanRoutes } from "../../../vite-plugin/src/routes.js";
import { compileFiles, diagnosticsOf, errorCodes, mount } from "../harness.js";

describe("C19 — Blazor-only directives are accepted and ignored", () => {
  for (const directive of [
    "@namespace FluentCMS.Web.UI",
    "@rendermode InteractiveServer",
    "@implements IDisposable",
    "@preservewhitespace true",
  ]) {
    it(directive, async () => {
      const m = await mount(`${directive}\n<p>x</p>`);
      expect(errorCodes(m.diagnostics)).toEqual([]);
      expect(m.html()).toBe("<p>x</p>");
    });
  }
});

describe("C19 — multiple @page directives", () => {
  it("registers every template as a route of the page", async () => {
    const compiled = await compileFiles({ "Test.tsazor": `@page "/a"\n@page "/b/{id:int}"\n<p>x</p>` });
    expect(errorCodes(compiled.diagnostics["Test.tsazor"]!)).toEqual([]);
    const routes = await scanRoutes(compiled.dir);
    expect(routes.map((r) => r.template)).toEqual(["/a", "/b/{id:int}"]);
    const { default: Page } = await import(/* @vite-ignore */ compiled.modules["Test.tsazor"]!);
    const table = routes.map((r) => ({ template: r.template, type: Page }));
    expect(matchRoute(table, "/a")?.route.type).toBe(Page);
    expect(matchRoute(table, "/b/5")?.values.id).toBe(5);
  });
});

describe("C19 — directives only at document level", () => {
  for (const source of [`<div>\n@page "/x"\n</div>`, `<div>@code { private x = 1; }</div>`, `@if (true) {\n    @layout MainLayout\n}`]) {
    it(JSON.stringify(source), async () => {
      expect(errorCodes(await diagnosticsOf(source))).toContain("TZS013");
    });
  }
});

describe("C19 — @typeparam", () => {
  it("a C# constraint clause is TZS021 naming the TS form", async () => {
    const diagnostics = await diagnosticsOf(`@typeparam TItem where TItem : IItem\n<p>x</p>`);
    expect(errorCodes(diagnostics)).toEqual(["TZS021"]);
    expect(diagnostics[0]!.message).toContain("use '@typeparam TItem extends IItem'");
  });

  it("supports the TS constraint form", async () => {
    const m = await mount(`@typeparam T extends string\n<p>@label</p>\n@code { private label: T = "ok" as T; }`);
    expect(m.html()).toBe("<p>ok</p>");
  });
});

describe("C7 — C# constructs without a TS equivalent are errors", () => {
  for (const source of [
    `@using (var x = make()) {\n    <p>x</p>\n}`,
    `@lock (gate) {\n    <p>x</p>\n}`,
    `<p>@await load()</p>`,
    `@if (true) {\n    using (var x = make()) { }\n}`,
  ]) {
    it(JSON.stringify(source), async () => {
      expect(errorCodes(await diagnosticsOf(source))).toContain("TZS012");
    });
  }
});

describe("C19 — @attribute", () => {
  it("a C# attribute list is TZS021 naming the TS form", async () => {
    const diagnostics = await diagnosticsOf(
      `@attribute [Authorize(Roles = "A, B")]\n@attribute [AllowAnonymous]\n@attribute [StreamRendering]\n<p>x</p>\n@code { }`,
    );
    expect(diagnostics.map((d) => [d.code, d.severity, d.pos.line])).toEqual([
      ["TZS021", "error", 1],
      ["TZS021", "error", 2],
      ["TZS021", "error", 3],
    ]);
    expect(diagnostics[0]!.message).toContain(`use '@authorize({ roles: ["A", "B"] })'`);
    expect(diagnostics[1]!.message).toContain("a page is anonymous unless it declares @authorize");
    expect(diagnostics[2]!.message).toContain("use a TS class decorator ('@attribute @decorator(…)'), or remove it");
  });

  it("the TS form @attribute @decorator(…) decorates the class", async () => {
    const m = await mount({
      "Test.tsazor": `@import { label } from "./deco"\n@attribute @label("decorated")\n<p>@tag</p>`,
      "deco.ts": `export function label(text: string) { return (target: { prototype: { tag?: string } }) => { target.prototype.tag = text; }; }\n`,
    });
    expect(m.diagnostics).toEqual([]);
    expect(m.html()).toBe("<p>decorated</p>");
  });

  it("@authorize({ roles }) protects the route (through AuthorizeRouteView)", async () => {
    const compiled = await compileFiles({
      "Admin.tsazor": `@page "/admin"\n@authorize({ roles: ["admin"] })\n<h1>admin</h1>`,
      "Open.tsazor": `@page "/open"\n<h1>open</h1>`,
    });
    expect(errorCodes(compiled.diagnostics["Admin.tsazor"]!)).toEqual([]);
    const routes = await scanRoutes(compiled.dir);
    const admin = routes.find((r) => r.template === "/admin")!;
    expect(admin).toMatchObject({ authorize: true, authorizeRequirements: { roles: ["admin"] } });
    expect(routes.find((r) => r.template === "/open")!.authorize).toBe(false);
    expect(generateRoutesModule(compiled.dir, routes)).toContain(`{ template: "/admin", type: Admin, authorize: {"roles":["admin"]} }`);

    const { default: Page } = await import(/* @vite-ignore */ compiled.modules["Admin.tsazor"]!);
    const render = async (user: ClaimsPrincipal): Promise<string> => {
      class Provider extends AuthenticationStateProvider {
        getState(): Promise<AuthenticationState> {
          return Promise.resolve(new AuthenticationState(user));
        }
      }
      const services = new ServiceCollection();
      services.registerValue(AuthenticationStateProvider, new Provider());
      const renderer = new Renderer(services.build());
      const routeData = { route: { template: admin.template, type: Page, authorize: admin.authorizeRequirements ?? {} }, values: {} };
      class App extends ComponentBase {
        protected override buildRenderTree(b: RenderTreeBuilder): void {
          b.openComponent(0, defineComponent(AuthorizeRouteView));
          b.addAttribute(1, "RouteData", routeData as never);
          b.addAttribute(2, "NotAuthorized", ((inner: RenderTreeBuilder) => inner.addContent(0, "denied")) as never);
          b.closeComponent();
        }
      }
      const container = document.createElement("div");
      renderer.renderInContainer(App, container);
      await renderer.waitUntilIdle();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await renderer.waitUntilIdle();
      return container.textContent ?? "";
    };
    expect(await render(createUser({ name: "u", roles: ["editor"] }))).toBe("denied");
    expect(await render(createUser({ name: "a", roles: ["admin"] }))).toBe("admin");
  });
});

describe("C19 — generic @inherits", () => {
  it("inherits from a generic base class", async () => {
    const base = `import { ComponentBase } from "@tsazor/runtime";
export class Base<T> extends ComponentBase { protected label(v: T): string { return "[" + String(v) + "]"; } }
export default Base;
`;
    const m = await mount({
      "Test.tsazor": `@inherits Base<number>\n<p>@label(5)</p>`,
      "Base.ts": base,
    });
    expect(m.html()).toBe("<p>[5]</p>");
  });

  it("with a nested generic type argument (FluentCMS: Base<ICollection<TValue>>)", async () => {
    const base = `import { ComponentBase } from "@tsazor/runtime";
export class Base<T> extends ComponentBase { protected count(v: T): number { return (v as unknown as unknown[]).length; } }
export default Base;
`;
    const m = await mount({
      "Test.tsazor": `@inherits Base<Array<string>>\n<p>@count(["a", "b"])</p>`,
      "Base.ts": base,
    });
    expect(m.html()).toBe("<p>2</p>");
  });
});

describe("C21 — user-written buildRenderTree", () => {
  it("is reported instead of being silently replaced", async () => {
    const diagnostics = await diagnosticsOf(`
@code {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, "mine");
    }
}`);
    expect(errorCodes(diagnostics).length).toBeGreaterThan(0);
  });

  it("also in a file with markup, and in the code-behind", async () => {
    const withMarkup = await diagnosticsOf(`<p>x</p>\n@code {\n    protected override buildRenderTree(b: RenderTreeBuilder): void { }\n}`);
    expect(errorCodes(withMarkup)).toEqual(["TZS020"]);
    const codeBehind = await diagnosticsOf(`<p>x</p>`, {
      "Test.tsazor.ts": `import { ComponentBase } from "@tsazor/runtime";\nexport default class TestBase extends ComponentBase { protected override buildRenderTree(): void {} }\n`,
    });
    expect(errorCodes(codeBehind)).toEqual(["TZS020"]);
  });
});
