/**
 * Auth integration (5.2): local JWT decoding (Microsoft claim URIs,
 * string/array roles, UTF-8 safety), provider notifications and the
 * stateful cookie-route path via a stubbed fetch (401 ⇒ anonymous).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANONYMOUS, TsazorHttp } from "@tsazor/runtime";
import { CookieAuthenticationStateProvider, JwtAuthenticationStateProvider, attachJwtAuth, decodeJwt, principalFromJwt } from "../src/auth.js";

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

  it("is anonymous on an empty user shape (the server's logout signal)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: undefined }), { status: 200 })));
    const provider = new CookieAuthenticationStateProvider(new TsazorHttp());
    expect((await provider.getAuthenticationStateAsync()).user.isAuthenticated).toBe(false);
  });
});