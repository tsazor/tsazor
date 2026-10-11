/**
 * M4-extension acceptance tests: the auth component family (AuthorizeView,
 * CascadingAuthenticationState, AuthorizeRouteView) over a test
 * AuthenticationStateProvider, mirroring Blazor's Components.Authorization.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ANONYMOUS,
  AuthenticationState,
  AuthenticationStateProvider,
  AuthorizationService,
  AuthorizeRouteView,
  AuthorizeView,
  CascadingAuthenticationState,
  ComponentBase,
  type ClaimsPrincipal,
  defineComponent,
  CascadingParameter,
  Renderer,
  ServiceCollection,
  type RenderFragment,
  type RenderTreeBuilder,
  createUser,
} from "../src/index";

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
    service.policies["admin-only"] = (user) => user.roles.includes("admin");
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
});

afterEach(() => {
  document.body.innerHTML = "";
});