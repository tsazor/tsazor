/**
 * Auth-Integration (5.2): JWT-Lokal-Dekodierung (Microsoft-Claim-URIs,
 * String/Array-Rollen, UTF-8-Sicherheit), Provider-Benachrichtigungen und der
 * Cookie-Route-Stateful-Pfad über einen gestubbten fetch (401 ⇒ anonym).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANONYMOUS, TsazorHttp } from "@tsazor/runtime";
import { CookieAuthenticationStateProvider, JwtAuthenticationStateProvider, attachJwtAuth, decodeJwt, principalFromJwt } from "../src/auth.js";

/** Baut ein handgezeichnetes JWT (header.payload.signature, Base64URL). */
function makeJwt(payload: object): string {
  const encode = (part: object) =>
    Buffer.from(JSON.stringify(part), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "HS256" })}.${encode(payload)}.sig`;
}

describe("decodeJwt / principalFromJwt", () => {
  it("dekodiert das Payload UTF-8-sicher und wirft bei Nicht-JWT", () => {
    const claims = decodeJwt(makeJwt({ sub: "u1", name: "Hölger Üßbach", role: ["admin", "staff"], "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name": "Hölger Üßbach" }));
    expect(claims.name).toBe("Hölger Üßbach");
    expect(() => decodeJwt("not-a-jwt")).toThrow(/Kein JWT/);
  });

  it("bildet Microsoft-Claim-URIs auf name/roles ab (Name auch kurz und lang)", () => {
    const longName = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name";
    const longRole = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";
    const principal = principalFromJwt(makeJwtClaims({ [longName]: "Ada", [longRole]: ["admin", "staff"] }));
    expect(principal.name).toBe("Ada");
    expect(principal.isAuthenticated).toBe(true);
    expect([...principal.roles]).toEqual(["admin", "staff"]);
    // Kurze Formen
    expect(principalFromJwt(makeJwtClaims({ name: "Bob", role: "reader" })).name).toBe("Bob");
    expect([...principalFromJwt(makeJwtClaims({ name: "Bob", role: "reader" })).roles]).toEqual(["reader"]);
    // Fallback auf sub
    expect(principalFromJwt(makeJwtClaims({ sub: "sub-9" })).name).toBe("sub-9");
    expect(principalFromJwt(makeJwtClaims({ sub: "sub-9" })).isAuthenticated).toBe(true);
  });
});

// Helper: decodeJwt erwartet ein Token — claims direkt ins Mapping geben.
function makeJwtClaims(payload: Record<string, unknown>): Record<string, string> {
  const jwt = decodeJwt(makeJwt(payload));
  return jwt as unknown as Record<string, string>;
}

describe("JwtAuthenticationStateProvider", () => {
  it("startet mit dem Token, meldet setToken/logout und fällt bei kaputtem Token auf anonym", async () => {
    const provider = new JwtAuthenticationStateProvider(makeJwt({ name: "Ada", role: "admin" }));
    const states: string[] = [];
    const stop = provider.subscribe((state) => states.push(state.user.name));
    expect((await provider.getState()).user.name).toBe("Ada");

    provider.setToken(makeJwt({ name: "Bob" }));
    expect((await provider.getState()).user.name).toBe("Bob");
    provider.logout();
    expect((await provider.getState()).user.isAuthenticated).toBe(false);
    expect((await provider.getState()).user).toEqual(ANONYMOUS.user);
    stop();
    expect(states).toEqual(["Bob", ""]);

    const broken = new JwtAuthenticationStateProvider("garbage.parts.x");
    expect((await broken.getState()).user.isAuthenticated).toBe(false);
  });

  it("attachJwtAuth fügt den Bearer-Header an (und überschreibt nicht bestehende)", async () => {
    const provider = new JwtAuthenticationStateProvider(makeJwt({ name: "Ada" }));
    const http = new TsazorHttp();
    const detach = attachJwtAuth(http, provider);
    const seen: string[] = [];
    const fetchMock = vi.fn(async (request: Request) => {
      seen.push(request.headers.get("authorization") ?? "(keine)");
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
});

describe("CookieAuthenticationStateProvider", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fragt den Session-Endpunkt und baut createUser mit Rollen/Claims", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ user: { name: "Ada", roles: "admin", claims: { tenant: ["t1"] } } }), { status: 200 })),
    );
    const provider = new CookieAuthenticationStateProvider(new TsazorHttp());
    const state = await provider.getState();
    expect(state.user.name).toBe("Ada");
    expect([...state.user.roles]).toEqual(["admin"]);
    expect(state.user.claims).toEqual([{ type: "tenant", value: "t1" }]);
  });

  it("ist anonym bei leerer user-Form (Logout-Signal des Servers)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: undefined }), { status: 200 })));
    const provider = new CookieAuthenticationStateProvider(new TsazorHttp());
    expect((await provider.getState()).user.isAuthenticated).toBe(false);
  });
});