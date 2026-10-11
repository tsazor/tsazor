/**
 * Auth integration for .NET backends (roadmap 5.2) on the runtime model
 * (Blazor: AuthenticationStateProvider + ClaimsPrincipal):
 *
 *  - CookieAuthenticationStateProvider: asks a session endpoint (default
 *    `/auth/user`) for the signed-in user; every failure (401/403,
 *    network) is anonymous — the server decides per request.
 *  - JwtAuthenticationStateProvider: decodes the JWT payload locally (no
 *    dependency, no network) and maps the claims onto a ClaimsPrincipal.
 *    `name` comes from `name`, `unique_name`, the long Microsoft claim URI or
 *    `sub`; roles from `role` (also as a string or string array, Microsoft URI
 *    included). No signature check — client side it is display only; the
 *    server (JwtBearer) decides validity.
 *  - attachJwtAuth adds a request interceptor `Authorization: Bearer …`
 *    to the TsazorHttp — the client side of the middleware pipeline.
 *
 * The recommended default is the cookie provider (BFF pattern, docs/auth.md):
 * the token stays with the server in an HttpOnly cookie, no script in the
 * browser can reach it. JWT in the browser only with a named reason (such as
 * calling a third-party API directly) — and then keep it in memory only, never
 * in localStorage/sessionStorage, where any injected script (XSS) reads it.
 * Either way: AuthorizeView/@authorize only control the UI;
 * enforcement happens on the server, on every request.
 */
import { TsazorHttp, type Claim, type ClaimsPrincipal, type RequestInterceptor } from "@tsazor/runtime";
import { ANONYMOUS, AuthenticationState, createUser } from "@tsazor/runtime";
import { AuthenticationStateProvider } from "@tsazor/runtime";

/* Cookie --------------------------------------------------------------------- */

/** Response body of a session endpoint (default /auth/user: `{ user: { … } }`). */
export interface CookieUserEndpointResponse {
  user?: { name?: string; roles?: string | string[]; claims?: Record<string, string | string[]> };
}

/** Options for `CookieAuthenticationStateProvider`. */
export interface CookieAuthOptions {
  /** The endpoint to query (default `/auth/user`). */
  endpoint?: string;
}

/** Cookie-session form: getAuthenticationStateAsync() asks the server; failure ⇒ anonymous. */
export class CookieAuthenticationStateProvider extends AuthenticationStateProvider {
  private readonly endpoint: string;

  /**
   * @param http — the client the session endpoint is queried with (it must send the auth cookie).
   * @param options — the endpoint; default `/auth/user`.
   */
  constructor(
    private readonly http: TsazorHttp,
    options: CookieAuthOptions = {},
  ) {
    super();
    this.endpoint = options.endpoint ?? "/auth/user";
  }

  override async getAuthenticationStateAsync(): Promise<AuthenticationState> {
    try {
      const body = await this.http.getJson<CookieUserEndpointResponse>(this.endpoint);
      const name = body?.user?.name;
      if (name === undefined || name === null) return ANONYMOUS;
      const roles = body.user?.roles;
      const claims = body.user?.claims;
      return new AuthenticationState(
        createUser({
          name,
          ...(roles !== undefined ? { roles: toStringList(roles) } : {}),
          ...(claims !== undefined ? { claims: toClaims(claims) } : {}),
        }),
      );
    } catch {
      // Network/TLS/parse errors are anonymous — no throw in
      // getAuthenticationStateAsync (the runtime would log and fall back to
      // ANONYMOUS anyway).
      return ANONYMOUS;
    }
  }
}

/* JWT ------------------------------------------------------------------------ */

/** The decoded JWT payload: claims as ASP.NET Core writes them into the token. */
export type JwtClaims = Record<string, string | number | string[] | undefined>;

/** Microsoft's long claim URIs (Identity → JWT, without short name). */
export const NAME_ID_CLAIM = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier";
export const NAME_CLAIM = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name";
export const ROLE_CLAIM = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";

/** Decodes the JWT payload (Base64URL, UTF-8 safe). The signature is not checked. */
export function decodeJwt(token: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("[tsazor-dotnet] Not a JWT (expected: header.payload.signature).");
  }
  try {
    return JSON.parse(base64UrlDecode(parts[1]!)) as JwtClaims;
  } catch (error) {
    throw new Error(`[tsazor-dotnet] JWT payload not readable (${(error as Error).message}).`);
  }
}

function base64UrlDecode(text: string): string {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof atob === "function") {
    const binary = atob(base64);
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  }
  // Node (without atob): Buffer decodes UTF-8 directly.
  const { Buffer } = globalThis as unknown as { Buffer: { from(text: string, encoding: string): { toString(encoding: string): string } } };
  return Buffer.from(base64, "base64").toString("utf8");
}

/** Claims ⇒ ClaimsPrincipal: name, roles (Microsoft URI too), claims list. */
export function principalFromJwt(claims: JwtClaims): ClaimsPrincipal {
  const name = claimText(claims, "name") ?? claimText(claims, "unique_name") ?? claimText(claims, NAME_CLAIM) ?? claimText(claims, "sub") ?? String(claimText(claims, NAME_ID_CLAIM) ?? "");
  const roleValue = claimValue(claims, "role") ?? claimValue(claims, ROLE_CLAIM);
  const roles = roleValue === undefined ? [] : toStringList(roleValue);
  const list: Claim[] = [];
  for (const [type, value] of Object.entries(claims)) {
    if (value === undefined) continue;
    for (const single of Array.isArray(value) ? value : [value]) {
      list.push({ type, value: String(single) });
    }
  }
  return {
    name,
    isAuthenticated: name.length > 0,
    roles,
    claims: list,
  };
}

function claimValue(claims: JwtClaims, ...types: string[]): string | number | string[] | undefined {
  for (const type of types) {
    const value = claims[type];
    if (value !== undefined) return value;
  }
  return undefined;
}

function claimText(claims: JwtClaims, type: string): string | undefined {
  const value = claims[type];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? (value[0] !== undefined ? String(value[0]) : undefined) : String(value);
}

function toStringList(value: string | number | string[]): string[] {
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function toClaims(record: Record<string, string | string[]>): Claim[] {
  return Object.entries(record).flatMap(([type, values]) =>
    (Array.isArray(values) ? values : [values]).map((value) => ({ type: type, value })),
  );
}

/** The JWT-based provider: state is a local decode, notification on setToken/logout. */
export class JwtAuthenticationStateProvider extends AuthenticationStateProvider {
  private token: string | undefined;
  private state: AuthenticationState = ANONYMOUS;

  /** Initial state right away from `initialToken` (e.g. from a login flow that just finished).
   *  Keep the token in memory only — not in localStorage/sessionStorage (XSS reads it there). */
  constructor(initialToken?: string) {
    super();
    this.token = initialToken;
    this.state = initialToken ? this.decode(initialToken) : ANONYMOUS;
  }

  /** The token currently set (attachJwtAuth reads it per request). */
  getToken(): string | undefined {
    return this.token;
  }

  /** Login/expiry: set a new token (undefined = logout) and notify subscribers. */
  setToken(token: string | undefined): void {
    this.token = token;
    this.state = token ? this.decode(token) : ANONYMOUS;
    this.notifyAuthenticationStateChanged(this.state);
  }

  /** Logout — alias for setToken(undefined). */
  logout(): void {
    this.setToken(undefined);
  }

  override async getAuthenticationStateAsync(): Promise<AuthenticationState> {
    return this.state;
  }

  private decode(token: string): AuthenticationState {
    try {
      return new AuthenticationState(principalFromJwt(decodeJwt(token)));
    } catch {
      // A broken token is anonymous, no throw — getAuthenticationStateAsync() stays total.
      return ANONYMOUS;
    }
  }
}

/** Sets `Authorization: Bearer <token>` per request; returns the unsubscribe. */
export function attachJwtAuth(http: TsazorHttp, provider: JwtAuthenticationStateProvider): () => void {
  const interceptor: RequestInterceptor = (request) => {
    const token = provider.getToken();
    if (token === undefined || token.length === 0) return request;
    if (request.headers.has("authorization")) return request;
    return new Request(request, { headers: { authorization: `Bearer ${token}` } });
  };
  return http.addRequestInterceptor(interceptor);
}