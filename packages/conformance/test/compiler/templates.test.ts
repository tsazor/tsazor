/**
 * Templated components (roadmap 2.3, review C13): child content elements,
 * RenderFragment<T> with @context / Context=, nested templates, and the
 * App.razor shapes over the built-in Router / AuthorizeRouteView /
 * AuthorizeView metadata. Assertions on rendered DOM and diagnostics.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ANONYMOUS,
  AuthenticationState,
  AuthenticationStateProvider,
  createTsazorApp,
  createUser,
  type AuthorizationRequirements,
  type ComponentBase,
  type Token,
  type TsazorApp,
} from "@tsazor/runtime";
import { compileFiles, diagnosticsOf, errorCodes, mount, normalizeHtml, type Files } from "../harness.js";
import { rendererOf } from "@tsazor/runtime/internal";

const grid = `@typeparam TItem
<table>@foreach (const item of Items) {<tr>@RowTemplate(item)</tr>}</table>
@code {
    @Parameter() Items: TItem[] = [];
    @Parameter() RowTemplate!: RenderFragment<TItem>;
}`;

describe("child content elements", () => {
  it("named RenderFragment slots render where the component places them", async () => {
    const m = await mount({
      "Test.tsazor": `<Card><Header><h1>@title</h1></Header><Footer>by @(author)</Footer></Card>\n@code { private title = "T"; private author = "A"; }`,
      "Card.tsazor": `<article>@Header<hr />@Footer</article>\n@code { @Parameter() Header?: RenderFragment; @Parameter() Footer?: RenderFragment; }`,
    });
    expect(m.html()).toBe("<article><h1>T</h1><hr>by A</article>");
  });

  it("RenderFragment<T> with @context, a type argument and member access", async () => {
    const m = await mount({
      "Test.tsazor": `<Grid TItem="Person" Items="people"><RowTemplate><td>@context.name</td><td>@suffix</td></RowTemplate></Grid>
@code { private suffix = "!"; private people = [{ name: "a" }, { name: "b" }]; }`,
      "Grid.tsazor": grid,
    });
    expect(m.html()).toBe("<table><tr><td>a</td><td>!</td></tr><tr><td>b</td><td>!</td></tr></table>");
  });

  it("Context= on the component names every template's context; on the slot it overrides", async () => {
    const m = await mount({
      "Test.tsazor": `<Pair Items="items" Context="x"><First>[@x]</First><Second Context="y">(@y)</Second></Pair>
@code { private items = ["a", "b"]; }`,
      "Pair.tsazor": `@foreach (const item of Items) {@First(item)@Second(item)}
@code { @Parameter() Items: string[] = []; @Parameter() First!: RenderFragment<string>; @Parameter() Second!: RenderFragment<string>; }`,
    });
    expect(m.text()).toBe("[a](a)[b](b)");
  });

  it("a RenderFragment<T> ChildContent takes the component's Context", async () => {
    const m = await mount({
      "Test.tsazor": `<Each Items="items" Context="n"><i>@(n * 2)</i></Each>\n@code { private items = [1, 2]; }`,
      "Each.tsazor": `@foreach (const item of Items) {@ChildContent(item)}
@code { @Parameter() Items: number[] = []; @Parameter() ChildContent!: (item: number) => RenderFragment; }`,
    });
    expect(m.html()).toBe("<i>2</i><i>4</i>");
  });

  it("nested templates keep their own contexts and re-render with the parent", async () => {
    const m = await mount({
      "Test.tsazor": `<Grid Items="rows"><RowTemplate Context="row"><Each Items="row.cells" Context="cell"><td>@row.id.@cell</td></Each></RowTemplate></Grid>
@code { rows = [{ id: 1, cells: [1, 2] }, { id: 2, cells: [3] }]; }`,
      "Grid.tsazor": grid,
      "Each.tsazor": `@foreach (const item of Items) {@ChildContent(item)}
@code { @Parameter() Items: number[] = []; @Parameter() ChildContent!: RenderFragment<number>; }`,
    });
    expect(m.html()).toBe("<table><tr><td>1.1</td><td>1.2</td></tr><tr><td>2.3</td></tr></table>");
    (m.instance as unknown as { rows: Array<{ id: number; cells: number[] }> }).rows[1]!.cells.push(4);
    await m.rerender();
    expect(m.html()).toBe("<table><tr><td>1.1</td><td>1.2</td></tr><tr><td>2.3</td><td>2.4</td></tr></table>");
  });

  it("a slot wins over a component of the same name inside its component (Razor precedence)", async () => {
    const m = await mount({
      "Test.tsazor": `<Card><Header>slot</Header></Card><Header>component</Header>`,
      "Card.tsazor": `<article>@Header</article>\n@code { @Parameter() Header?: RenderFragment; }`,
      "Header.tsazor": `<header>@ChildContent</header>\n@code { @Parameter() ChildContent?: RenderFragment; }`,
    });
    expect(m.html()).toBe("<article>slot</article><header>component</header>");
  });

  it("diagnostics: mixed loose content, duplicate slot, context clash, unknown and misplaced slot", async () => {
    const card = { "Card.tsazor": `@Header@ChildContent\n@code { @Parameter() Header?: RenderFragment; @Parameter() ChildContent?: RenderFragment; }` };
    expect(errorCodes(await diagnosticsOf(`<Card><Header>a</Header><p>loose</p></Card>`, card))).toEqual(["TZS027"]);
    expect(errorCodes(await diagnosticsOf(`<Card><Header>a</Header><Header>b</Header></Card>`, card))).toEqual(["TZS028"]);
    expect(errorCodes(await diagnosticsOf(`<Card><Headr>a</Headr></Card>`, card))).toEqual(["TZS025"]);
    expect(errorCodes(await diagnosticsOf(`<Card /><Header>a</Header>`, card))).toEqual(["TZS027"]);
    const clash = await diagnosticsOf(`<Grid Items="rows"><RowTemplate><Grid Items="rows"><RowTemplate>@context</RowTemplate></Grid></RowTemplate></Grid>\n@code { rows = []; }`, { "Grid.tsazor": grid });
    expect(errorCodes(clash)).toEqual(["TZS029"]);
    expect(clash[0]!.message).toContain(`Specify the parameter name like: '<RowTemplate Context="another_name">'`);
  });
});

describe("App.razor shapes over the built-in components", () => {
  let app: TsazorApp | undefined;
  afterEach(() => {
    app?.dispose();
    app = undefined;
    document.body.innerHTML = "";
  });

  class Provider extends AuthenticationStateProvider {
    constructor(private readonly state: AuthenticationState) {
      super();
    }
    getAuthenticationStateAsync(): Promise<AuthenticationState> {
      return Promise.resolve(this.state);
    }
  }

  /** Compiles `files`, starts the app with App.tsazor as root at `url` and returns its #app HTML. */
  async function start(files: Files, url: string, routes: Array<{ template: string; page: string; authorize?: AuthorizationRequirements }>, state = ANONYMOUS): Promise<string> {
    const compiled = await compileFiles(files);
    const errors = Object.entries(compiled.diagnostics).flatMap(([file, list]) => list.filter((d) => d.severity === "error").map((d) => `${file} ${d.code} ${d.message}`));
    expect(errors).toEqual([]);
    const load = async (name: string) => (await import(/* @vite-ignore */ compiled.modules[name]!)).default as abstract new () => ComponentBase;
    const root = document.createElement("div");
    root.id = "app";
    document.body.appendChild(root);
    history.replaceState(null, "", url);
    const entries = await Promise.all(routes.map(async (r) => ({ template: r.template, type: await load(r.page), ...(r.authorize ? { authorize: r.authorize } : {}) })));
    app = createTsazorApp({
      root: await load("App.tsazor"),
      routes: entries,
      services: (services) => services.registerValue(AuthenticationStateProvider as Token<AuthenticationStateProvider>, new Provider(state)),
    });
    await rendererOf(app).waitUntilIdle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await rendererOf(app).waitUntilIdle();
    return normalizeHtml(root.innerHTML);
  }

  const pages: Files = {
    "Home.tsazor": `<p>home</p>`,
    "Secret.tsazor": `<p>secret</p>`,
    "MainLayout.tsazor": `@inherits LayoutComponentBase\n<main>@Body</main>`,
  };

  it("<Router><Found Context=\"routeData\">…</Found><NotFound>…</NotFound></Router>", async () => {
    const files: Files = {
      ...pages,
      "App.tsazor": `@import MainLayout from "./MainLayout.tsazor"
<Router>
    <Found Context="routeData">
        <RouteView RouteData="@routeData" DefaultLayout="@MainLayout" />
    </Found>
    <NotFound>
        <p class="not-found">Page not found.</p>
    </NotFound>
</Router>`,
    };
    expect(await start(files, "/", [{ template: "/", page: "Home.tsazor" }])).toBe("<main><p>home</p></main>");
    app!.dispose();
    document.body.innerHTML = "";
    expect(await start(files, "/missing", [{ template: "/", page: "Home.tsazor" }])).toBe('<p class="not-found">Page not found.</p>');
  });

  it("<AuthorizeRouteView> with <NotAuthorized> and <Authorizing> inside <Found>", async () => {
    const files: Files = {
      ...pages,
      "App.tsazor": `@import MainLayout from "./MainLayout.tsazor"
<Router>
    <Found Context="routeData">
        <AuthorizeRouteView RouteData="@routeData" DefaultLayout="@MainLayout">
            <NotAuthorized><p class="denied">Please sign in.</p></NotAuthorized>
            <Authorizing><p>Checking…</p></Authorizing>
        </AuthorizeRouteView>
    </Found>
    <NotFound><p>Page not found.</p></NotFound>
</Router>`,
    };
    const routes = [{ template: "/secret", page: "Secret.tsazor", authorize: {} }];
    // In the default layout, as Blazor's AuthorizeRouteView renders NotAuthorized (RenderContentInDefaultLayout).
    expect(await start(files, "/secret", routes)).toBe('<main><p class="denied">Please sign in.</p></main>');
    app!.dispose();
    document.body.innerHTML = "";
    expect(await start(files, "/secret", routes, new AuthenticationState(createUser({ name: "alice" })))).toBe("<main><p>secret</p></main>");
  });

  it("<AuthorizeView> with <Authorized> (context = AuthenticationState) and <NotAuthorized>", async () => {
    const files: Files = {
      ...pages,
      "Home.tsazor": `<AuthorizeView>
    <Authorized><span>Hello, @context.user.name!</span></Authorized>
    <NotAuthorized><a href="login">Log in</a></NotAuthorized>
</AuthorizeView>`,
      "App.tsazor": `<Router><Found Context="routeData"><RouteView RouteData="@routeData" /></Found></Router>`,
    };
    const routes = [{ template: "/", page: "Home.tsazor" }];
    expect(await start(files, "/", routes)).toBe('<a href="login">Log in</a>');
    app!.dispose();
    document.body.innerHTML = "";
    expect(await start(files, "/", routes, new AuthenticationState(createUser({ name: "alice" })))).toBe("<span>Hello, alice!</span>");
  });

  it("<AuthorizeView> content without sections receives context too (Blazor: RenderFragment<AuthenticationState>)", async () => {
    const files: Files = {
      ...pages,
      "Home.tsazor": `<AuthorizeView><span>Hello, @context.user.name!</span></AuthorizeView>`,
      "App.tsazor": `<Router><Found Context="routeData"><RouteView RouteData="@routeData" /></Found></Router>`,
    };
    const routes = [{ template: "/", page: "Home.tsazor" }];
    expect(await start(files, "/", routes)).toBe("");
    app!.dispose();
    document.body.innerHTML = "";
    expect(await start(files, "/", routes, new AuthenticationState(createUser({ name: "alice" })))).toBe("<span>Hello, alice!</span>");
  });
});
