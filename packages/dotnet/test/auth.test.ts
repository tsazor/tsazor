/**
 * Auth integration (5.2): local JWT decoding (Microsoft claim URIs,
 * string/array roles, UTF-8 safety), provider notifications and the
 * stateful cookie-route path via a stubbed fetch (401 ⇒ anonymous).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANONYMOUS,
  AuthenticationStateProvider,
  AuthorizeRouteView,
  ComponentBase,
  defineComponent,
  Renderer,
  ServiceCollection,
  TsazorHttp,
  type ClaimsPrincipal,
  type RenderTreeBuilder,
} from "@tsazor/runtime";
import {
  CookieAuthenticationStateProvider,
  JwtAuthenticationStateProvider,
  attachJwtAuth,
  decodeJwt,
  principalFromJwt,
  type JwtClaims,
} from "../src/auth.js";

/** Builds a hand-made JWT (header.payload.signature, Base64URL). */
function makeJwt(payload: object): string {
  const encode = (part: object) =>
    Buffer.from(JSON.stringify(part), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "HS256" })}.${encode(payload)}.sig`;
}

describe("decodeJwt / principalFromJwt", () => {
  it("decodes the payload UTF-8-safely and throws on non-JWT input", () => {
    const claims = decodeJwt(makeJwt({ sub: "u1", name: "Hölger Üßbach", role: ["admin", "staff"], "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name": "Hölger Üßbach" }));
    expect(claims.name).toBe("Hölger Üßbach");
    expect(() => decodeJwt("not-a-jwt")).toThrow(/Not a JWT/);
  });

  it("maps Microsoft claim URIs to name/roles (name in both short and long form)", () => {
    const longName = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name";
    const longRole = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";
    const principal = principalFromJwt(makeJwtClaims({ [longName]: "Ada", [longRole]: ["admin", "staff"] }));
    expect(principal.name).toBe("Ada");
    expect(principal.isAuthenticated).toBe(true);
    expect([...principal.roles]).toEqual(["admin", "staff"]);
    // Short forms
    expect(principalFromJwt(makeJwtClaims({ name: "Bob", role: "reader" })).name).toBe("Bob");
    expect([...principalFromJwt(makeJwtClaims({ name: "Bob", role: "reader" })).roles]).toEqual(["reader"]);
    // Fallback to sub
    expect(principalFromJwt(makeJwtClaims({ sub: "sub-9" })).name).toBe("sub-9");
    expect(principalFromJwt(makeJwtClaims({ sub: "sub-9" })).isAuthenticated).toBe(true);
  });

  it("names the user by the short `nameid` (JwtSecurityTokenHandler's NameIdentifier, as FluentCMS issues it)", () => {
    // The claims of a real FluentCMS login: no name, no sub, no role.
    const principal = principalFromJwt(
      makeJwtClaims({
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/sid": "3c8e7c4b-e856-4efb-be2d-dc1b2b86e303",
        nameid: "admin",
        email: "ADMIN@EXAMPLE.COM",
        iss: "FluentCMS",
      }),
    );
    expect(principal.name).toBe("admin");
    expect(principal.isAuthenticated).toBe(true);
    expect([...principal.roles]).toEqual([]);
  });

  it("signs in a token without any name claim, as .NET does (Name null there, empty here)", async () => {
    const principal = principalFromJwt(makeJwtClaims({ oid: "7f3c", scp: "orders.read" }));
    expect(principal.isAuthenticated).toBe(true);
    expect(principal.name).toBe("");
    expect(principal.claims).toContainEqual({ type: "oid", value: "7f3c" });
    const provider = new JwtAuthenticationStateProvider(makeJwt({ oid: "7f3c" }));
    expect((await provider.getAuthenticationStateAsync()).user.isAuthenticated).toBe(true);
  });
});

// Helper: decodeJwt expects a token — feed the claims straight into the mapping.
function makeJwtClaims(payload: Record<string, unknown>): Record<string, string> {
  const jwt = decodeJwt(makeJwt(payload));
  return jwt as unknown as Record<string, string>;
}

describe("JwtAuthenticationStateProvider", () => {
  it("starts with the token, reports setToken/logout and falls back to anonymous on a broken token", async () => {
    const provider = new JwtAuthenticationStateProvider(makeJwt({ name: "Ada", role: "admin" }));
    const states: string[] = [];
    const stop = provider.subscribe((state) => states.push(state.user.name));
    expect((await provider.getAuthenticationStateAsync()).user.name).toBe("Ada");

    provider.setToken(makeJwt({ name: "Bob" }));
    expect((await provider.getAuthenticationStateAsync()).user.name).toBe("Bob");
    provider.logout();
    expect((await provider.getAuthenticationStateAsync()).user.isAuthenticated).toBe(false);
    expect((await provider.getAuthenticationStateAsync()).user).toEqual(ANONYMOUS.user);
    stop();
    expect(states).toEqual(["Bob", ""]);

    const broken = new JwtAuthenticationStateProvider("garbage.parts.x");
    expect((await broken.getAuthenticationStateAsync()).user.isAuthenticated).toBe(false);
  });

  it("attachJwtAuth adds the Bearer header (and does not overwrite existing ones)", async () => {
    const provider = new JwtAuthenticationStateProvider(makeJwt({ name: "Ada" }));
    const http = new TsazorHttp();
    const detach = attachJwtAuth(http, provider);
    const seen: string[] = [];
    const fetchMock = vi.fn(async (request: Request) => {
      seen.push(request.headers.get("authorization") ?? "(none)");
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await http.getJson("/orders");
    provider.setToken(makeJwt({ name: "Bob" }));
    await http.getJson("/orders");

    expect(seen[0]).toMatch(/^Bearer ey/);
    expect(seen[1]).toMatch(/^Bearer ey/);
    detach();
  });

  it("attachJwtAuth keeps the request's other headers and its body (a POST stays JSON)", async () => {
    const provider = new JwtAuthenticationStateProvider(makeJwt({ name: "Ada" }));
    const http = new TsazorHttp({ defaultHeaders: { "x-site": "bakery" } });
    attachJwtAuth(http, provider);
    const seen: { type: string | null; site: string | null; auth: string | null; body: string }[] = [];
    vi.stubGlobal("fetch", async (request: Request) => {
      const { headers } = request;
      seen.push({ type: headers.get("content-type"), site: headers.get("x-site"), auth: headers.get("authorization"), body: await request.text() });
      return new Response("{}", { status: 200 });
    });

    await http.postJson("http://localhost/orders", { loaves: 2 });

    expect(seen[0]).toMatchObject({ type: "application/json", site: "bakery", body: '{"loaves":2}' });
    expect(seen[0]!.auth).toMatch(/^Bearer ey/);
  });

  it("attachJwtAuth logs out when the server rejects the token (401, not 403); the call still fails", async () => {
    const provider = new JwtAuthenticationStateProvider(makeJwt({ name: "Ada" }));
    const http = new TsazorHttp();
    attachJwtAuth(http, provider);
    const notified: boolean[] = [];
    provider.subscribe((state) => notified.push(state.user.isAuthenticated));

    vi.stubGlobal("fetch", async () => new Response("", { status: 403 }));
    await expect(http.getJson("http://localhost/admin")).rejects.toMatchObject({ name: "TsazorHttpError", status: 403 });
    expect(provider.getToken()).toBeDefined();

    vi.stubGlobal("fetch", async () => new Response("", { status: 401 }));
    await expect(http.getJson("http://localhost/orders")).rejects.toMatchObject({ name: "TsazorHttpError", status: 401 });
    expect(provider.getToken()).toBeUndefined();
    expect((await provider.getAuthenticationStateAsync()).user.isAuthenticated).toBe(false);
    expect(notified).toEqual([false]);
  });

  it("attachJwtAuth keeps a newer login and a request's own authorization through a 401", async () => {
    const provider = new JwtAuthenticationStateProvider(makeJwt({ name: "Ada" }));
    const http = new TsazorHttp();
    attachJwtAuth(http, provider);
    const bob = makeJwt({ name: "Bob" });

    // Bob signs in while Ada's request is on its way; its 401 is about Ada's token.
    vi.stubGlobal("fetch", async () => {
      provider.setToken(bob);
      return new Response("", { status: 401 });
    });
    await expect(http.getJson("http://localhost/orders")).rejects.toMatchObject({ status: 401 });
    expect(provider.getToken()).toBe(bob);

    vi.stubGlobal("fetch", async () => new Response("", { status: 401 }));
    await expect(http.getJson("http://localhost/partner", { headers: { authorization: "Bearer partner" } })).rejects.toMatchObject({
      status: 401,
    });
    expect(provider.getToken()).toBe(bob);
  });

  it("attachJwtAuth: after a 401 a guarded page shows NotAuthorized (AuthorizeRouteView)", async () => {
    const provider = new JwtAuthenticationStateProvider(makeJwt({ name: "Ada" }));
    const http = new TsazorHttp();
    attachJwtAuth(http, provider);
    const services = new ServiceCollection();
    services.registerValue(AuthenticationStateProvider, provider);
    const renderer = new Renderer(services.build());
    class Orders extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, "Orders");
      }
    }
    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(AuthorizeRouteView));
        b.addAttribute(1, "RouteData", { route: { template: "/orders", type: Orders, authorize: {} }, values: {} } as never);
        b.addAttribute(2, "NotAuthorized", () => (inner: RenderTreeBuilder) => inner.addContent(0, "Please sign in"));
        b.closeComponent();
      }
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    // The provider's state arrives after a macrotask (see the runtime's auth tests).
    const settle = async () => {
      await renderer.waitUntilIdle();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await renderer.waitUntilIdle();
    };
    renderer.renderInContainer(App, host);
    await settle();
    expect(host.textContent).toBe("Orders");

    vi.stubGlobal("fetch", async () => new Response("", { status: 401 }));
    await expect(http.getJson("http://localhost/api/orders")).rejects.toMatchObject({ status: 401 });
    await settle();
    expect(host.textContent).toBe("Please sign in");
    host.remove();
  });

  it("attachJwtAuth's unsubscribe removes both interceptors", async () => {
    const provider = new JwtAuthenticationStateProvider(makeJwt({ name: "Ada" }));
    const http = new TsazorHttp();
    attachJwtAuth(http, provider)();
    const sent: (string | null)[] = [];
    vi.stubGlobal("fetch", async (request: Request) => {
      sent.push(request.headers.get("authorization"));
      return new Response("", { status: 401 });
    });

    await expect(http.getJson("http://localhost/orders")).rejects.toMatchObject({ status: 401 });
    expect(sent).toEqual([null]);
    expect(provider.getToken()).toBeDefined();
  });

  it("attachJwtAuth after an interceptor that throws on error statuses still sees the 401 (.NET's order)", async () => {
    const provider = new JwtAuthenticationStateProvider(makeJwt({ name: "Ada" }));
    const http = new TsazorHttp();
    // The app's client first (its envelope handling throws), then the auth — as a .NET handler chain is built.
    http.addResponseInterceptor((response) => {
      if (!response.ok) throw new Error(`envelope: ${response.status}`);
      return response;
    });
    attachJwtAuth(http, provider);
    vi.stubGlobal("fetch", async () => new Response("", { status: 401 }));

    await expect(http.getJson("http://localhost/orders")).rejects.toThrow("envelope: 401");
    expect(provider.getToken()).toBeUndefined();
  });
});

describe("JwtAuthenticationStateProvider.createUserAsync (roles the token doesn't carry)", () => {
  /** FluentCMS's case: the token names the user, a profile request says whether they're an admin. */
  class ProfileAuth extends JwtAuthenticationStateProvider {
    constructor(
      private readonly http: TsazorHttp,
      initialToken?: string,
    ) {
      super(initialToken);
    }

    protected override async createUserAsync(claims: JwtClaims, token: string): Promise<ClaimsPrincipal> {
      // Reads its field at once: during the base constructor it wouldn't be set yet.
      const profile = this.http.getJson<{ admin: boolean }>("http://localhost/profile");
      const user = await super.createUserAsync(claims, token);
      return (await profile).admin ? { ...user, roles: [...user.roles, "admin"] } : user;
    }
  }

  function signedInApp(provider: ProfileAuth): { host: HTMLElement; settle: () => Promise<void> } {
    const services = new ServiceCollection();
    services.registerValue(AuthenticationStateProvider, provider);
    const renderer = new Renderer(services.build());
    class AdminPage extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, "Admin area");
      }
    }
    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(AuthorizeRouteView));
        b.addAttribute(1, "RouteData", { route: { template: "/admin", type: AdminPage, authorize: { roles: ["admin"] } }, values: {} } as never);
        b.addAttribute(2, "NotAuthorized", () => (inner: RenderTreeBuilder) => inner.addContent(0, "Please sign in"));
        b.addAttribute(3, "Authorizing", (inner: RenderTreeBuilder) => inner.addContent(0, "Checking…"));
        b.closeComponent();
      }
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    renderer.renderInContainer(App, host);
    const settle = async () => {
      await renderer.waitUntilIdle();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await renderer.waitUntilIdle();
    };
    return { host, settle };
  }

  it("a login notifies once, with the role: Authorizing meanwhile, never a user without it", async () => {
    const http = new TsazorHttp();
    const provider = new ProfileAuth(http);
    attachJwtAuth(http, provider);
    let answerProfile!: () => void;
    vi.stubGlobal(
      "fetch",
      (request: Request) =>
        new Promise<Response>((resolve) => {
          answerProfile = () => resolve(new Response(JSON.stringify({ admin: request.headers.has("authorization") }), { status: 200 }));
        }),
    );
    const { host, settle } = signedInApp(provider);
    await settle();
    expect(host.textContent).toBe("Please sign in");
    const heard: string[] = [];
    provider.subscribe((state) => heard.push(`${state.user.name}:${state.user.roles.join()}`));

    provider.setToken(makeJwt({ nameid: "admin" }));
    await settle();
    expect(host.textContent).toBe("Checking…");

    answerProfile();
    await settle();
    expect(host.textContent).toBe("Admin area");
    expect(heard).toEqual(["admin:admin"]);
    host.remove();
  });

  it("runs after construction (a subclass's fields are set for the initial token); a 401 on the profile signs out", async () => {
    const http = new TsazorHttp();
    const provider = new ProfileAuth(http, makeJwt({ nameid: "admin" }));
    attachJwtAuth(http, provider);
    vi.stubGlobal("fetch", async () => new Response("", { status: 401 }));
    const errors = vi.spyOn(console, "error");

    const state = await provider.getAuthenticationStateAsync();

    expect(state.user.isAuthenticated).toBe(false);
    expect(provider.getToken()).toBeUndefined();
    // The 401 is handled (signed out), not an error to report.
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("answers for the current token when an override swallows the profile's 401", async () => {
    class LenientAuth extends ProfileAuth {
      protected override async createUserAsync(claims: JwtClaims, token: string): Promise<ClaimsPrincipal> {
        try {
          return await super.createUserAsync(claims, token);
        } catch {
          return principalFromJwt(claims); // signed in without the role — but attachJwtAuth logged out meanwhile
        }
      }
    }
    const http = new TsazorHttp();
    const provider = new LenientAuth(http, makeJwt({ nameid: "admin" }));
    attachJwtAuth(http, provider);
    vi.stubGlobal("fetch", async () => new Response("", { status: 401 }));

    expect((await provider.getAuthenticationStateAsync()).user.isAuthenticated).toBe(false);
  });
});

describe("CookieAuthenticationStateProvider", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queries the session endpoint and builds createUser with roles/claims", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ user: { name: "Ada", roles: "admin", claims: { tenant: ["t1"] } } }), { status: 200 })),
    );
    const provider = new CookieAuthenticationStateProvider(new TsazorHttp());
    const state = await provider.getAuthenticationStateAsync();
    expect(state.user.name).toBe("Ada");
    expect([...state.user.roles]).toEqual(["admin"]);
    expect(state.user.claims).toEqual([{ type: "tenant", value: "t1" }]);
  });

  it("refresh() asks again after a sign-in: Authorizing meanwhile, then the user, without a reload", async () => {
    let session: { name: string; roles: string } | undefined;
    let pending: (() => void) | undefined;
    vi.stubGlobal(
      "fetch",
      () =>
        new Promise<Response>((resolve) => {
          pending = () => resolve(new Response(JSON.stringify({ user: session }), { status: 200 }));
        }),
    );
    /** Answers the endpoint's request once it is on its way. */
    const answer = async () => {
      await vi.waitFor(() => expect(pending).toBeDefined());
      const respond = pending!;
      pending = undefined;
      respond();
    };
    const provider = new CookieAuthenticationStateProvider(new TsazorHttp());
    const services = new ServiceCollection();
    services.registerValue(AuthenticationStateProvider, provider);
    const renderer = new Renderer(services.build());
    class AdminPage extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, "Admin area");
      }
    }
    class App extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(AuthorizeRouteView));
        b.addAttribute(1, "RouteData", { route: { template: "/admin", type: AdminPage, authorize: { roles: ["admin"] } }, values: {} } as never);
        b.addAttribute(2, "NotAuthorized", () => (inner: RenderTreeBuilder) => inner.addContent(0, "Please sign in"));
        b.addAttribute(3, "Authorizing", (inner: RenderTreeBuilder) => inner.addContent(0, "Checking…"));
        b.closeComponent();
      }
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    const settle = async () => {
      await renderer.waitUntilIdle();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await renderer.waitUntilIdle();
    };
    renderer.renderInContainer(App, host);
    await answer();
    await settle();
    expect(host.textContent).toBe("Please sign in");

    // The login form posted to the BFF, which set the cookie: the endpoint knows the user now.
    session = { name: "Ada", roles: "admin" };
    provider.refresh();
    await settle();
    expect(host.textContent).toBe("Checking…");
    await answer();
    await settle();
    expect(host.textContent).toBe("Admin area");
    host.remove();
  });

  it("is anonymous on an empty user shape (the server's logout signal)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: undefined }), { status: 200 })));
    const provider = new CookieAuthenticationStateProvider(new TsazorHttp());
    expect((await provider.getAuthenticationStateAsync()).user.isAuthenticated).toBe(false);
  });
});