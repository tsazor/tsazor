/**
 * M4-extension acceptance tests: the auth component family (AuthorizeView,
 * CascadingAuthenticationState, AuthorizeRouteView) over a test
 * AuthenticationStateProvider, mirroring Blazor's Components.Authorization.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANONYMOUS,
  AuthenticationState,
  AuthenticationStateProvider,
  AuthorizationService,
  AuthorizeRouteView,
  AuthorizeView,
  CascadingAuthenticationState,
  ComponentBase,
  LayoutComponentBase,
  type ClaimsPrincipal,
  defineComponent,
  CascadingParameter,
  ServiceCollection,
  StringLocalizer,
  type RenderFragment,
  type RenderTreeBuilder,
  createUser,
} from "../src/index";
import {
  Renderer,
} from "../src/internal";

/* Test provider ------------------------------------------------------------ */

class TestAuthProvider extends AuthenticationStateProvider {
  state: AuthenticationState = ANONYMOUS;
  /** When true, getAuthenticationStateAsync() stays pending until release() — Authorizing test. */
  pending = false;
  private resolvers: Array<(state: AuthenticationState) => void> = [];

  getAuthenticationStateAsync(): Promise<AuthenticationState> {
    if (this.pending) {
      return new Promise((resolve) => this.resolvers.push(resolve));
    }
    return Promise.resolve(this.state);
  }

  signIn(user: ClaimsPrincipal): void {
    this.state = new AuthenticationState(user);
    this.notifyAuthenticationStateChanged(this.state);
  }

  /** Blazor's NotifyAuthenticationStateChanged(Task): the state arrives later. */
  notifyLater(state: Promise<AuthenticationState>): void {
    this.notifyAuthenticationStateChanged(state);
  }

  /** Resolves all pending getAuthenticationStateAsync() calls with the current state. */
  release(): void {
    for (const resolve of this.resolvers.splice(0)) {
      resolve(this.state);
    }
  }
}

/* Consumers ---------------------------------------------------------------- */

class UserBadge extends ComponentBase {
  @CascadingParameter({ type: AuthenticationState }) authenticationState?: AuthenticationState;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.addContent(0, `user:${this.authenticationState?.user.name ?? "none"}`);
  }
}

class AdminPage extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "h1");
    b.addContent(1, "Admin area");
    b.closeElement();
  }
}

class PublicPage extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "h1");
    b.addContent(1, "Public area");
    b.closeElement();
  }
}

/* Harness ------------------------------------------------------------------ */

function buildApp(provider: AuthenticationStateProvider, extra?: (collection: ServiceCollection) => void): Renderer {
  const collection = new ServiceCollection();
  collection.registerValue(AuthenticationStateProvider, provider);
  extra?.(collection);
  return new Renderer(collection.build());
}

function container(): HTMLElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

/**
 * waitUntilIdle does not track the untracked provider.getAuthenticationStateAsync() promise
 * chains; one macrotask turn guarantees every microtask (and thus the queued
 * re-render) has flushed.
 */
async function settle(renderer: Renderer): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

function fragment(text: string): RenderFragment {
  return (b: RenderTreeBuilder) => {
    b.addContent(0, text);
  };
}

function stateFragment(text: string): (state: AuthenticationState) => RenderFragment {
  return (_state) => (b: RenderTreeBuilder) => {
    b.addContent(0, text);
  };
}

describe("AuthorizeView", () => {
  it("renders authorized content for the authenticated user and cascades the state", async () => {
    const provider = new TestAuthProvider();
    provider.signIn(createUser({ name: "alice" }));
    const renderer = buildApp(provider);

    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(AuthorizeView));
        b.addAttribute(1, "Authorized", (state: AuthenticationState) => {
          return (inner: RenderTreeBuilder) => {
            inner.openComponent(2, defineComponent(UserBadge));
            inner.closeComponent();
          };
        });
        b.addAttribute(3, "NotAuthorized", stateFragment("denied"));
        b.closeComponent();
      }
    }
    renderer.renderInContainer(App, container());
    await settle(renderer);

    expect(document.body.textContent).toContain("user:alice");
    expect(document.body.textContent).not.toContain("denied");
  });

  it("renders not-authorized content for an anonymous user", async () => {
    const provider = new TestAuthProvider();
    const renderer = buildApp(provider);

    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(AuthorizeView));
        b.addAttribute(1, "ChildContent", stateFragment("secret"));
        b.addAttribute(2, "NotAuthorized", stateFragment("denied"));
        b.closeComponent();
      }
    }
    renderer.renderInContainer(App, container());
    await settle(renderer);

    expect(document.body.textContent).toContain("denied");
    expect(document.body.textContent).not.toContain("secret");
  });

  it("enforces roles (array or comma-separated) and named policies", async () => {
    const service = new AuthorizationService();
    service.addPolicy("admin-only", (user) => user.roles.includes("admin"));
    const provider = new TestAuthProvider();
    provider.signIn(createUser({ name: "bob", roles: ["moderator"] }));

    function render(rules: Record<string, unknown>): Promise<void> {
      const renderer = buildApp(provider, (collection) => collection.registerValue(AuthorizationService, service));
      class App extends ComponentBase {
        protected override buildRenderTree(b: RenderTreeBuilder): void {
          b.openComponent(0, defineComponent(AuthorizeView));
          let sequence = 1;
          for (const [name, value] of Object.entries(rules)) {
            b.addAttribute(sequence++, name, value as never);
          }
          b.addAttribute(sequence, "ChildContent", stateFragment("granted"));
          b.addAttribute(sequence + 1, "NotAuthorized", stateFragment("denied"));
          b.closeComponent();
        }
      }
      renderer.renderInContainer(App, container());
      return settle(renderer);
    }

    await render({ Roles: ["admin", "moderator"] });
    expect(document.body.textContent).toContain("granted");
    document.body.innerHTML = "";

    await render({ Roles: "admin, moderator" });
    expect(document.body.textContent).toContain("granted");
    document.body.innerHTML = "";

    await render({ Roles: ["admin"] });
    expect(document.body.textContent).toContain("denied");
    document.body.innerHTML = "";

    await render({ Policy: "admin-only" });
    expect(document.body.textContent).toContain("denied");
    document.body.innerHTML = "";

    await render({ Policy: "does-not-exist" });
    expect(document.body.textContent).toContain("denied");
  });

  it("waits for an async policy: Authorizing meanwhile, then its decision (Blazor's AuthorizeAsync)", async () => {
    const service = new AuthorizationService();
    const decisions: ((granted: boolean) => void)[] = [];
    service.addPolicy("remote", () => new Promise<boolean>((resolve) => decisions.push(resolve)));
    const provider = new TestAuthProvider();
    provider.signIn(createUser({ name: "bob" }));
    const renderer = buildApp(provider, (collection) => collection.registerValue(AuthorizationService, service));
    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(AuthorizeView));
        b.addAttribute(1, "Policy", "remote");
        b.addAttribute(2, "ChildContent", stateFragment("granted"));
        b.addAttribute(3, "NotAuthorized", stateFragment("denied"));
        b.addAttribute(4, "Authorizing", ((t: RenderTreeBuilder) => t.addContent(0, "checking")) as never);
        b.closeComponent();
      }
    }
    renderer.renderInContainer(App, container());
    await settle(renderer);
    expect(document.body.textContent).toContain("checking");
    // A render meanwhile asks the policy no second time.
    expect(decisions).toHaveLength(1);
    decisions[0]!(true);
    await settle(renderer);
    expect(document.body.textContent).toContain("granted");
    expect(decisions).toHaveLength(1);
  });

  it("re-renders when the authentication state changes (login/logout)", async () => {
    const provider = new TestAuthProvider();
    const renderer = buildApp(provider);

    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(AuthorizeView));
        b.addAttribute(1, "ChildContent", stateFragment("secret"));
        b.addAttribute(2, "NotAuthorized", stateFragment("denied"));
        b.closeComponent();
      }
    }
    renderer.renderInContainer(App, container());
    await settle(renderer);
    expect(document.body.textContent).toContain("denied");

    provider.signIn(createUser({ name: "alice" }));
    await settle(renderer);
    expect(document.body.textContent).toContain("secret");

    provider.signIn(ANONYMOUS.user);
    await settle(renderer);
    expect(document.body.textContent).toContain("denied");
  });

  it("renders the authorizing fragment while the state resolves", async () => {
    const provider = new TestAuthProvider();
    provider.pending = true;
    const renderer = buildApp(provider);

    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(AuthorizeView));
        b.addAttribute(1, "ChildContent", stateFragment("secret"));
        b.addAttribute(2, "Authorizing", fragment("checking…"));
        b.closeComponent();
      }
    }
    renderer.renderInContainer(App, container());
    await settle(renderer);
    expect(document.body.textContent).toContain("checking…");
    expect(document.body.textContent).not.toContain("secret");

    provider.signIn(createUser({ name: "carol" }));
    provider.release();
    await settle(renderer);
    expect(document.body.textContent).toContain("secret");
    expect(document.body.textContent).not.toContain("checking…");
  });
});

describe("CascadingAuthenticationState", () => {
  it("cascades the state to a subtree and re-renders on login", async () => {
    const provider = new TestAuthProvider();
    const renderer = buildApp(provider);

    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(CascadingAuthenticationState));
        b.addAttribute(1, "ChildContent", (inner: RenderTreeBuilder) => {
          inner.openComponent(2, defineComponent(UserBadge));
          inner.closeComponent();
        });
        b.closeComponent();
      }
    }
    renderer.renderInContainer(App, container());
    await settle(renderer);
    // Anonymous until the provider resolves; a login must reach the badge.
    expect(document.body.textContent).toContain("user:");
    expect(document.body.textContent).not.toContain("user:dave");

    provider.signIn(createUser({ name: "dave" }));
    await settle(renderer);
    expect(document.body.textContent).toContain("user:dave");
  });
});

describe("AuthorizeRouteView", () => {
  it("guards routes by the entry's authorize metadata", async () => {
    const provider = new TestAuthProvider();
    const renderer = buildApp(provider);

    class App extends ComponentBase {
      routeData: {
        route: { template: string; type: abstract new (...args: never[]) => ComponentBase; authorize?: { roles?: string[]; policy?: string } };
        values: Record<string, string | number | boolean>;
      } = {
        route: { template: "/admin", type: AdminPage, authorize: { roles: ["admin"] } },
        values: {},
      };

      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(AuthorizeRouteView));
        b.addAttribute(1, "RouteData", this.routeData as never);
        b.addAttribute(2, "NotAuthorized", stateFragment("denied"));
        b.closeComponent();
      }
    }
    renderer.renderInContainer(App, container());
    await settle(renderer);
    // Anonymous: denied, page not rendered.
    expect(document.body.textContent).toContain("denied");
    expect(document.querySelector("h1")).toBeNull();

    provider.signIn(createUser({ name: "erin", roles: ["admin"] }));
    await settle(renderer);
    expect(document.querySelector("h1")?.textContent).toBe("Admin area");
  });

  it("renders public routes without requirements", async () => {
    const provider = new TestAuthProvider();
    const renderer = buildApp(provider);

    class App extends ComponentBase {
      routeData: {
        route: { template: "/public"; type: abstract new (...args: never[]) => ComponentBase };
        values: Record<string, string | number | boolean>;
      } = { route: { template: "/public", type: PublicPage }, values: {} };

      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(AuthorizeRouteView));
        b.addAttribute(1, "RouteData", this.routeData as never);
        b.addAttribute(2, "NotAuthorized", stateFragment("denied"));
        b.closeComponent();
      }
    }
    renderer.renderInContainer(App, container());
    await settle(renderer);
    expect(document.querySelector("h1")?.textContent).toBe("Public area");
  });

  it("renders Authorizing and NotAuthorized in the default layout, Blazor's texts when none is given, and keeps the layout on sign-in", async () => {
    // BlazorHero's login sits in MainLayout this way (port-blazorhero.md, B14).
    class Frame extends LayoutComponentBase {
      static made = 0;
      constructor() {
        super();
        Frame.made++;
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "div");
        b.addAttribute(1, "class", "frame");
        b.addContent(2, this.Body);
        b.closeElement();
      }
    }
    const provider = new TestAuthProvider();
    provider.pending = true;
    const renderer = buildApp(provider);
    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(AuthorizeRouteView));
        b.addAttribute(1, "RouteData", { route: { template: "/admin", type: AdminPage, authorize: { roles: ["admin"] } }, values: {} } as never);
        b.addAttribute(2, "DefaultLayout", Frame);
        b.closeComponent();
      }
    }
    renderer.renderInContainer(App, container());
    await settle(renderer);
    expect(document.querySelector(".frame")?.textContent).toBe("Authorizing...");

    provider.release();
    await settle(renderer);
    expect(document.querySelector(".frame")?.textContent).toBe("Not authorized");

    provider.pending = false;
    provider.signIn(createUser({ name: "erin", roles: ["admin"] }));
    await settle(renderer);
    expect(document.querySelector(".frame h1")?.textContent).toBe("Admin area");
    expect(Frame.made).toBe(1);
  });

  it("translates its default texts by the reserved tsazor.auth.* keys of a registered StringLocalizer", async () => {
    const provider = new TestAuthProvider();
    provider.pending = true;
    const localizer = new StringLocalizer({
      tables: { de: { "tsazor.auth.authorizing": "Berechtigung wird geprüft…", "tsazor.auth.notAuthorized": "Nicht berechtigt" } },
      defaultCulture: "de",
    });
    const renderer = buildApp(provider, (collection) => collection.registerValue(StringLocalizer, localizer));
    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(AuthorizeRouteView));
        b.addAttribute(1, "RouteData", { route: { template: "/admin", type: AdminPage, authorize: { roles: ["admin"] } }, values: {} } as never);
        b.closeComponent();
      }
    }
    const host = container();
    renderer.renderInContainer(App, host);
    await settle(renderer);
    expect(host.textContent).toBe("Berechtigung wird geprüft…");

    provider.release();
    await settle(renderer);
    expect(host.textContent).toBe("Nicht berechtigt");
  });
});

describe("notifyAuthenticationStateChanged with a promise (Blazor's Task)", () => {
  /** A promise settled by hand. */
  function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  /** AuthorizeView for the admin role, and AuthorizeRouteView for an admin page, side by side. */
  function renderGuards(provider: TestAuthProvider): Renderer {
    const renderer = buildApp(provider);
    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(AuthorizeView));
        b.addAttribute(1, "roles", "admin");
        b.addAttribute(2, "ChildContent", stateFragment("[view: admin]"));
        b.addAttribute(3, "NotAuthorized", stateFragment("[view: denied]"));
        b.addAttribute(4, "Authorizing", fragment("[view: checking]"));
        b.closeComponent();
        b.openComponent(5, defineComponent(AuthorizeRouteView));
        b.addAttribute(6, "RouteData", { route: { template: "/admin", type: AdminPage, authorize: { roles: ["admin"] } }, values: {} } as never);
        b.addAttribute(7, "NotAuthorized", stateFragment("[route: denied]"));
        b.addAttribute(8, "Authorizing", fragment("[route: checking]"));
        b.closeComponent();
      }
    }
    renderer.renderInContainer(App, container());
    return renderer;
  }

  it("shows Authorizing until it resolves; no in-between user reaches a subscriber", async () => {
    const provider = new TestAuthProvider();
    provider.state = new AuthenticationState(createUser({ name: "carol" }));
    const renderer = renderGuards(provider);
    await settle(renderer);
    expect(document.body.textContent).toBe("[view: denied][route: denied]");
    const heard: string[] = [];
    provider.subscribe((state) => heard.push(`${state.user.name}:${state.user.roles.join()}`));

    // Signed in by name now, the role is still on its way (a profile request).
    const later = deferred<AuthenticationState>();
    provider.notifyLater(later.promise);
    await settle(renderer);
    expect(document.body.textContent).toBe("[view: checking][route: checking]");

    later.resolve(new AuthenticationState(createUser({ name: "carol", roles: ["admin"] })));
    await settle(renderer);
    expect(document.body.textContent).toBe("[view: admin]Admin area");
    expect(heard).toEqual(["carol:admin"]);
    expect(provider.peekState()?.user.roles).toEqual(["admin"]);
  });

  it("a newer notification wins over a pending promise", async () => {
    const provider = new TestAuthProvider();
    const renderer = renderGuards(provider);
    await settle(renderer);
    const heard: string[] = [];
    provider.subscribe((state) => heard.push(state.user.name));

    const stale = deferred<AuthenticationState>();
    provider.notifyLater(stale.promise);
    provider.signIn(createUser({ name: "dave", roles: ["admin"] }));
    stale.resolve(new AuthenticationState(createUser({ name: "erin" })));
    await settle(renderer);

    expect(heard).toEqual(["dave"]);
    expect(document.body.textContent).toBe("[view: admin]Admin area");
  });

  it("a rejected promise counts as signed out", async () => {
    const provider = new TestAuthProvider();
    provider.state = new AuthenticationState(createUser({ name: "carol", roles: ["admin"] }));
    const renderer = renderGuards(provider);
    await settle(renderer);
    expect(document.body.textContent).toBe("[view: admin]Admin area");
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    provider.notifyLater(Promise.reject(new Error("profile unavailable")));
    await settle(renderer);

    expect(document.body.textContent).toBe("[view: denied][route: denied]");
    expect(errors).toHaveBeenCalledOnce();
    errors.mockRestore();
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});