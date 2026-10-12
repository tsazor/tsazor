/**
 * Auth integration for .NET backends (roadmap 5.2) on the runtime model
 * (Blazor: AuthenticationStateProvider + ClaimsPrincipal):
 *
 *  - CookieAuthenticationStateProvider: asks a session endpoint (default
 *    `/auth/user`) for the signed-in user; every failure (401/403,
 *    network) is anonymous — the server decides per request. `refresh()`
 *    asks again after a sign-in or sign-out within the app.
 *  - JwtAuthenticationStateProvider: decodes the JWT payload locally (no
 *    dependency, no network) and maps the claims onto a ClaimsPrincipal.
 *    `name` comes from `name`, `unique_name`, the long Microsoft claim URI,
 *    `sub` or the name identifier (`nameid` or its URI); roles from `role`
 *    (also as a string or string array, Microsoft URI included). No signature check — client side it is display only; the
 *    server (JwtBearer) decides validity.
 *  - attachJwtAuth adds a request interceptor `Authorization: Bearer …`
 *    to the TsazorHttp — the client side of the middleware pipeline — and
 *    logs out when the server answers that token with a 401.
 *
 * The recommended default is the cookie provider (BFF pattern, docs/auth.md):
 * the token stays with the server in an HttpOnly cookie, no script in the
 * browser can reach it. JWT in the browser only with a named reason (such as
 * calling a third-party API directly) — and then keep it in memory only, never
 * in localStorage/sessionStorage, where any injected script (XSS) reads it.
 * Either way: AuthorizeView/@authorize only control the UI;
 * enforcement happens on the server, on every request.
 */
import { TsazorHttp, type Claim, type ClaimsPrincipal, type RequestInterceptor, type ResponseInterceptor } from "@tsazor/runtime";
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

  /**
   * Asks the session endpoint again and tells the auth components — after a sign-in or sign-out that changed the
   * cookie without leaving the app (a login form posting to the BFF). Until the answer is there, AuthorizeView
   * shows Authorizing. Blazor Server needs a full page load at that point (a circuit keeps the user it started
   * with); a full navigation (an OIDC redirect) doesn't need this either: the app starts with the new cookie.
   */
  refresh(): void {
    this.notifyAuthenticationStateChanged(this.getAuthenticationStateAsync());
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
  // `nameid` is ClaimTypes.NameIdentifier as .NET's JwtSecurityTokenHandler writes it (FluentCMS's tokens name the
  // user only there); without it such a token decoded as anonymous.
  const name =
    claimText(claims, "name") ??
    claimText(claims, "unique_name") ??
    claimText(claims, NAME_CLAIM) ??
    claimText(claims, "sub") ??
    claimText(claims, "nameid") ??
    claimText(claims, NAME_ID_CLAIM) ??
    "";
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
  /** The state for `token`; undefined until first asked (a subclass's fields aren't set during the constructor). */
  private state: AuthenticationState | Promise<AuthenticationState> | undefined;

  /** Starts with `initialToken` (e.g. from a login flow that just finished).
   *  Keep the token in memory only — not in localStorage/sessionStorage (XSS reads it there). */
  constructor(initialToken?: string) {
    super();
    this.token = initialToken;
  }

  /** The token currently set (attachJwtAuth reads it per request). */
  getToken(): string | undefined {
    return this.token;
  }

  /** Login/expiry: set a new token (undefined = logout) and notify subscribers. */
  setToken(token: string | undefined): void {
    this.token = token;
    this.state = this.stateFor(token);
    this.notifyAuthenticationStateChanged(this.state);
  }

  /** Logout — alias for setToken(undefined). */
  logout(): void {
    this.setToken(undefined);
  }

  override async getAuthenticationStateAsync(): Promise<AuthenticationState> {
    this.state ??= this.stateFor(this.token);
    const token = this.token;
    const state = await this.state;
    // The token changed meanwhile (attachJwtAuth's logout on the profile request's 401, a new login): answer for
    // the current one, not for the token this request started with.
    return this.token === token ? state : this.getAuthenticationStateAsync();
  }

  /**
   * The user a token stands for: by default its claims (`principalFromJwt`). Override it to add what the token
   * doesn't carry, such as roles from a profile endpoint (Blazor WebAssembly's
   * `AccountClaimsPrincipalFactory.CreateUserAsync`; like its `ValueTask`, the result may be ready at once). A
   * promise makes a login notify a promise: AuthorizeView shows Authorizing until it resolves, with no in-between
   * user. A rejected one counts as signed out.
   */
  protected createUserAsync(claims: JwtClaims, token: string): ClaimsPrincipal | Promise<ClaimsPrincipal> {
    return principalFromJwt(claims);
  }

  private stateFor(token: string | undefined): AuthenticationState | Promise<AuthenticationState> {
    if (token === undefined || token.length === 0) return ANONYMOUS;
    let claims: JwtClaims;
    try {
      claims = decodeJwt(token);
    } catch {
      // A broken token is anonymous, no throw — getAuthenticationStateAsync() stays total.
      return ANONYMOUS;
    }
    const user = this.createUserAsync(claims, token);
    if (typeof (user as Partial<Promise<ClaimsPrincipal>>).then !== "function") return new AuthenticationState(user as ClaimsPrincipal);
    return Promise.resolve(user).then(
      (resolved) => new AuthenticationState(resolved),
      (error: unknown) => {
        // After a logout (attachJwtAuth's, on the profile request's 401) the failure answers an old token: no news.
        // eslint-disable-next-line no-console
        if (this.token === token) console.error("[tsazor-dotnet] createUserAsync() failed:", error);
        return ANONYMOUS;
      },
    );
  }
}

/**
 * Sets `Authorization: Bearer <token>` per request, and logs out when the server rejects the token: a 401 to a
 * request that carried the current token (expired, revoked). `AuthorizeView` and `AuthorizeRouteView` then show
 * `NotAuthorized` — the redirect to the login. Blazor leaves this to a `DelegatingHandler` of the app's own
 * (Tsazor extension). A 401 to an older token, after a new login, changes nothing. Returns the unsubscribe.
 *
 * Attach it after a response interceptor that throws on an error status (an envelope mapping, say): as in .NET's
 * handler chain, the interceptor added last sees the response first, so the 401 gets here before the other one throws.
 */
export function attachJwtAuth(http: TsazorHttp, provider: JwtAuthenticationStateProvider): () => void {
  const bearer = (): string | undefined => {
    const token = provider.getToken();
    return token === undefined || token.length === 0 ? undefined : `Bearer ${token}`;
  };
  const sign: RequestInterceptor = (request) => {
    const authorization = bearer();
    if (authorization === undefined || request.headers.has("authorization")) return request;
    // `headers` in a Request's init replaces all of them: without the copy, a POST lost its JSON content type and
    // ASP.NET Core's [FromBody] answered 415.
    const headers = new Headers(request.headers);
    headers.set("authorization", authorization);
    return new Request(request, { headers });
  };
  const rejected: ResponseInterceptor = (response, request) => {
    const authorization = bearer();
    if (response.status === 401 && authorization !== undefined && request.headers.get("authorization") === authorization) {
      provider.logout();
    }
    return response;
  };
  const removeSign = http.addRequestInterceptor(sign);
  const removeRejected = http.addResponseInterceptor(rejected);
  return () => {
    removeSign();
    removeRejected();
  };
}