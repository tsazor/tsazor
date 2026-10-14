/**
 * `SupplyParameterFromQuery` — Blazor's QueryParameterValueSupplier through
 * RouteView's supply pass (roadmap 3.7): values from the current URI's query
 * string, refreshed on navigation, keys case-insensitive, repeated keys as
 * arrays, absent keys null, failed conversions Blazor's parse message, route
 * values win over the query for a field both supply.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  AuthenticationState,
  AuthenticationStateProvider,
  AuthorizeRouteView,
  ComponentBase,
  createTsazorApp,
  createUser,
  defineComponent,
  NavigationManager,
  Parameter,
  RouteView,
  Router,
  ServiceCollection,
  SupplyParameterFromQuery,
  type ComponentDefinition,
  type QueryParameterType,
  type RenderTreeBuilder,
  type RouteData,
  type RouteEntry,
} from "@tsazor/runtime";
import {
  matchRoute,
  Renderer,
} from "@tsazor/runtime/internal";

afterEach(() => {
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

/** A page rendering its query fields as JSON (a stable probe of the supply pass). */
class QueryPage extends ComponentBase {
  @Parameter() @SupplyParameterFromQuery() name: string | null = null;
  @Parameter() @SupplyParameterFromQuery({ type: "int" }) count: number | null = null;
  @Parameter() @SupplyParameterFromQuery({ type: "bool" }) active: boolean | null = null;
  @Parameter() @SupplyParameterFromQuery({ name: "id", type: "long" }) id: bigint | null = null;
  @Parameter() @SupplyParameterFromQuery({ multiple: true }) tag: string[] | null = null;
  @Parameter() @SupplyParameterFromQuery({ type: "unsupported-kind" as QueryParameterType }) broken: unknown = null;

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.addContent(0, JSON.stringify([this.name, this.count, this.active, String(this.id), this.tag, this.broken]));
  }
}

const pageFields = (): unknown => JSON.parse(document.body.querySelector("div")!.textContent ?? "[]");

/**
 * Renders RouteView for a page at `uri`; matchUri must match the template.
 * Render failures (a null NavigationManager is itself an error) surface
 * through the test renderer's collected errors at the final settle.
 */
async function renderQueryView(
  page: abstract new () => ComponentBase,
  uri: string,
  template = "/",
  matchUri = "/",
  navigation: NavigationManager | null = new NavigationManager(),
): Promise<void> {
  history.replaceState(null, "", uri);
  const services = new ServiceCollection();
  if (navigation) services.registerValue(NavigationManager as never, navigation);
  // A plain Renderer with a collector, like createTestRenderer, but with the
  // services; render failures rethrow at the settle below.
  const errors: unknown[] = [];
  const renderer = new Renderer(services.build());
  renderer.errorHandler = ({ error }) => errors.push(error);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const routeData = matchRoute([{ template, type: page } as RouteEntry], matchUri)!;

  class Host extends ComponentBase {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.openComponent(0, defineComponent(RouteView) as ComponentDefinition);
      b.addAttribute(1, "RouteData", routeData);
      b.closeComponent();
    }
  }
  renderer.renderInContainer(Host, container);
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
  if (errors.length > 0) throw errors.length === 1 ? errors[0] : new AggregateError(errors);
}

describe("SupplyParameterFromQuery (3.7)", () => {
  it("supplies string, typed, named and repeated-key parameters from the query", async () => {
    await renderQueryView(QueryPage, "/?name=anna&count=7&active=True&id=9007199254740993&tag=a&tag=b&tag=b");
    expect(pageFields()).toEqual(["anna", 7, true, "9007199254740993", ["a", "b", "b"], null]);
  });

  it("keys match case-insensitively (Blazor), absent keys and absent typed values are null", async () => {
    await renderQueryView(QueryPage, "/?NAME=anna&COUNT=7&ACTIVE=TRUE");
    expect(pageFields()).toEqual(["anna", 7, true, "null", null, null]);
  });

  it("a repeated key on a non-array field takes the first value (Blazor: values[0])", async () => {
    await renderQueryView(QueryPage, "/?name=anna&name=bert&count=1&count=2");
    expect(pageFields()).toEqual(["anna", 1, null, "null", null, null]);
  });

  it("a failed conversion throws Blazor's parse message for the parameter", async () => {
    await expect(renderQueryView(QueryPage, "/?count=x")).rejects.toThrow(
      // Blazor's QueryParameterValueSupplier text.
      "Cannot parse the value 'x' as type 'int' for 'count'.",
    );
  });

  it("an unsupported type throws Blazor's message", async () => {
    await expect(renderQueryView(QueryPage, "/?broken=true")).rejects.toThrow(
      "Querystring values cannot be parsed as type 'unsupported-kind'.",
    );
  });

  it("a long above 2^53 stays exact", async () => {
    await renderQueryView(QueryPage, "/?id=9223372036854775807");
    expect(pageFields()).toEqual([null, null, null, "9223372036854775807", null, null]);
  });
});

describe("SupplyParameterFromQuery — RouteView interactions", () => {
  it("a field the route template supplies keeps the route value (case-insensitive)", async () => {
    class MixedPage extends ComponentBase {
      @Parameter() @SupplyParameterFromQuery() id: string | null = null;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, this.id ?? "none");
      }
    }
    await renderQueryView(MixedPage, "/p/9?id=from-query", "/p/{id}", "/p/9");
    expect(document.body.querySelector("div")!.textContent).toBe("9");
  });

  it("@SupplyParameterFromQuery needs no @Parameter (Blazor 8)", async () => {
    class UndeclaredPage extends ComponentBase {
      @SupplyParameterFromQuery() name: string | null = null;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, String(this.name));
      }
    }
    await renderQueryView(UndeclaredPage, "/?name=ada", "/", "/");
    expect(document.body.querySelector("div")!.textContent).toBe("ada");
  });

  it("without a NavigationManager service it is an error", async () => {
    await expect(renderQueryView(QueryPage, "/", "/", "/", null)).rejects.toThrow(
      "@SupplyParameterFromQuery() needs a NavigationManager service",
    );
  });

  it("navigation re-supplies the values (the Router re-renders after each pass)", async () => {
    class CounterPage extends ComponentBase {
      @Parameter() @SupplyParameterFromQuery({ type: "int" }) page: number | null = null;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "output");
        b.addContent(1, String(this.page));
        b.closeElement();
      }
    }
    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Router));
        b.addAttribute(1, "Found", (routeData: RouteData) => (inner: RenderTreeBuilder) => {
          inner.openComponent(0, defineComponent(RouteView));
          inner.addAttribute(1, "RouteData", routeData);
          inner.closeComponent();
        });
        b.closeComponent();
      }
    }
    const root = document.createElement("div");
    root.id = "app";
    document.body.appendChild(root);
    const app = createTsazorApp({ root: App, routes: [{ template: "/", type: CounterPage } as RouteEntry] });
    await app.renderer.waitUntilIdle();
    expect(root.querySelector("output")?.textContent).toBe("null");

    app.navigationManager.navigateTo("/?page=2");
    await app.renderer.waitUntilIdle();
    expect(root.querySelector("output")?.textContent).toBe("2");

    app.navigationManager.navigateTo("/?page=5");
    await app.renderer.waitUntilIdle();
    expect(root.querySelector("output")?.textContent).toBe("5");

    app.navigationManager.navigateTo("/");
    await app.renderer.waitUntilIdle();
    expect(root.querySelector("output")?.textContent).toBe("null");
    app.dispose();
  });

  for (const view of ["RouteView", "AuthorizeRouteView"] as const) {
    it(`a query change keeps the page and runs its onParametersSet again, not onInitialized (${view})`, async () => {
      const calls: string[] = [];
      class FilterPage extends ComponentBase {
        @Parameter() @SupplyParameterFromQuery() state: string | null = null;
        protected override onInitialized(): void {
          calls.push(`init ${this.state}`);
        }
        protected override async onParametersSet(): Promise<void> {
          calls.push(`set ${this.state}`);
          await Promise.resolve();
        }
      }
      const viewType = view === "RouteView" ? RouteView : AuthorizeRouteView;
      class App extends ComponentBase {
        protected override buildRenderTree(b: RenderTreeBuilder): void {
          b.openComponent(0, defineComponent(Router));
          b.addAttribute(1, "Found", (routeData: RouteData) => (inner: RenderTreeBuilder) => {
            inner.openComponent(0, defineComponent(viewType));
            inner.addAttribute(1, "RouteData", routeData);
            inner.closeComponent();
          });
          b.closeComponent();
        }
      }
      class Provider extends AuthenticationStateProvider {
        getAuthenticationStateAsync(): Promise<AuthenticationState> {
          return Promise.resolve(new AuthenticationState(createUser({ name: "bea" })));
        }
      }
      const root = document.createElement("div");
      root.id = "app";
      document.body.appendChild(root);
      const app = createTsazorApp({
        root: App,
        routes: [{ template: "/orders", type: FilterPage } as RouteEntry],
        services: (services) => services.registerValue(AuthenticationStateProvider, new Provider()),
      });
      app.navigationManager.navigateTo("/orders");
      await new Promise((resolve) => setTimeout(resolve, 0));
      await app.renderer.waitUntilIdle();
      app.navigationManager.navigateTo("/orders?state=open");
      await new Promise((resolve) => setTimeout(resolve, 0));
      await app.renderer.waitUntilIdle();
      expect(calls).toEqual(["init null", "set null", "set open"]);
      app.dispose();
    });
  }
});

describe("SupplyParameterFromQuery on any component (Blazor 8)", () => {
  it("a component that is not a page gets the values, and new ones after a navigation its parent doesn't render for", async () => {
    const calls: string[] = [];
    class Editor extends ComponentBase {
      @SupplyParameterFromQuery({ name: "id" }) id: string | null = null;
      protected override onParametersSet(): void {
        calls.push(`set ${this.id}`);
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "output");
        b.addContent(1, String(this.id));
        b.closeElement();
      }
    }
    // A page that renders once: only the query supply can bring the editor a new id.
    class Shell extends ComponentBase {
      protected override shouldRender(): boolean {
        return false;
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Editor));
        b.closeComponent();
      }
    }
    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Router));
        b.addAttribute(1, "Found", (routeData: RouteData) => (inner: RenderTreeBuilder) => {
          inner.openComponent(0, defineComponent(RouteView));
          inner.addAttribute(1, "RouteData", routeData);
          inner.closeComponent();
        });
        b.closeComponent();
      }
    }
    history.replaceState(null, "", "/roles?id=7");
    const root = document.createElement("div");
    root.id = "app";
    document.body.appendChild(root);
    const app = createTsazorApp({ root: App, routes: [{ template: "/roles", type: Shell } as RouteEntry] });
    await app.renderer.waitUntilIdle();
    expect(root.querySelector("output")?.textContent).toBe("7");

    app.navigationManager.navigateTo("/roles?id=8");
    await app.renderer.waitUntilIdle();
    expect(root.querySelector("output")?.textContent).toBe("8");

    // A navigation that leaves its value alone doesn't set it again.
    app.navigationManager.navigateTo("/roles?id=8&tab=2");
    await app.renderer.waitUntilIdle();
    expect(calls).toEqual(["set 7", "set 8"]);
    app.dispose();
  });
});
