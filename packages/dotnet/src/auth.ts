/**
 * Auth-Integration für .NET-Backends (Roadmap 5.2) auf dem Runtime-Modell
 * (Blazor: AuthenticationStateProvider + ClaimsPrincipal):
 *
 *  - CookieAuthenticationStateProvider: fragt einen Session-Endpunkt (Default
 *    `/auth/user`) nach dem eingeloggten Benutzer; jede Fehlerseite (401/403,
 *    Netzwerk) ist anonym — der Server entscheidet pro Anfrage.
 *  - JwtAuthenticationStateProvider: dekodiert das JWT-Payload lokal (keine
 *    Abhängigkeit, kein Netzwerk) und bildet die Claims auf ClaimsPrincipal ab.
 *    `name` kommt aus `name`, `unique_name`, dem langen Microsoft-Claim-URI bzw.
 *    `sub`; Rollen aus `role` (auch als String oder String-Array, Microsoft-URI
 *    inklusive). Keine Signaturprüfung — Client-seitig nur Anzeige; die
 *    Gültigkeit entscheidet der Server (JwtBearer).
 *  - attachJwtAuth setzt einen Request-Interceptor `Authorization: Bearer …`
 *    auf den TsazorHttp — die Client-Seite der Middleware-Pipeline.
 */
import { TsazorHttp, type Claim, type ClaimsPrincipal, type RequestInterceptor } from "@tsazor/runtime";
import { ANONYMOUS, AuthenticationState, createUser } from "@tsazor/runtime";
import { AuthenticationStateProvider } from "@tsazor/runtime";

/* Cookie --------------------------------------------------------------------- */

/** Antwortkörper eines Session-Endpunkts (Default /auth/user: `{ user: { … } }`). */
export interface CookieUserEndpointResponse {
  user?: { name?: string; roles?: string | string[]; claims?: Record<string, string | string[]> };
}

export interface CookieAuthOptions {
  /** Der zu befragende Endpunkt (Default `/auth/user`). */
  endpoint?: string;
}

/** Cookie-Session-Form: getState() fragt den Server; Fehler ⇒ anonym. */
export class CookieAuthenticationStateProvider extends AuthenticationStateProvider {
  private readonly endpoint: string;

  constructor(
    private readonly http: TsazorHttp,
    options: CookieAuthOptions = {},
  ) {
    super();
    this.endpoint = options.endpoint ?? "/auth/user";
  }

  override async getState(): Promise<AuthenticationState> {
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
      // Netz/TLS/Parse-Fehler sind anonym — kein throw in getState (die
      // Runtime loggt und fällt sonst ohnehin auf ANONYMOUS zurück).
      return ANONYMOUS;
    }
  }
}

/* JWT ------------------------------------------------------------------------ */

/** Das dekodierte JWT-Payload: Claims, wie ASP.NET Core sie in das Token schreibt. */
export type JwtClaims = Record<string, string | number | string[] | undefined>;

/** Microsofts lange Claim-URIs (Identity → JWT, ohne Shortname). */
export const NAME_ID_CLAIM = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier";
export const NAME_CLAIM = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name";
export const ROLE_CLAIM = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";

/** Dekodiert das JWT-Payload (Base64URL, UTF-8-sicher). Signatur wird nicht geprüft. */
export function decodeJwt(token: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("[tsazor-dotnet] Kein JWT (Erwartung: header.payload.signature).");
  }
  try {
    return JSON.parse(base64UrlDecode(parts[1]!)) as JwtClaims;
  } catch (error) {
    throw new Error(`[tsazor-dotnet] JWT-Payload nicht lesbar (${(error as Error).message}).`);
  }
}

function base64UrlDecode(text: string): string {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof atob === "function") {
    const binary = atob(base64);
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  }
  // Node (ohne atob): Buffer dekodiert direkt UTF-8.
  const { Buffer } = globalThis as unknown as { Buffer: { from(text: string, encoding: string): { toString(encoding: string): string } } };
  return Buffer.from(base64, "base64").toString("utf8");
}

/** Claims ⇒ ClaimsPrincipal: Name, Rollen (auch Microsoft-URI), Claims-Liste. */
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

/** Der JWT-basierte Provider: Zustand ist ein lokales Dekodieren, Benachrichtigung bei setToken/logout. */
export class JwtAuthenticationStateProvider extends AuthenticationStateProvider {
  private token: string | undefined;
  private state: AuthenticationState = ANONYMOUS;

  /** Startzustand sofort aus `initialToken` (Typischer Fall: Token aus localStorage). */
  constructor(initialToken?: string) {
    super();
    this.token = initialToken;
    this.state = initialToken ? this.decode(initialToken) : ANONYMOUS;
  }

  /** Das aktuell gesetzte Token (attachJwtAuth liest es pro Anfrage). */
  getToken(): string | undefined {
    return this.token;
  }

  /** Login/Ablauf: neues Token setzen (undefined = logout) und abonnenten melden. */
  setToken(token: string | undefined): void {
    this.token = token;
    this.state = token ? this.decode(token) : ANONYMOUS;
    this.notifyAuthenticationStateChanged(this.state);
  }

  /** Logout — Alias für setToken(undefined). */
  logout(): void {
    this.setToken(undefined);
  }

  override async getState(): Promise<AuthenticationState> {
    return this.state;
  }

  private decode(token: string): AuthenticationState {
    try {
      return new AuthenticationState(principalFromJwt(decodeJwt(token)));
    } catch {
      // Kaputtes Token ist anonym, kein throw — getState() bleibt total.
      return ANONYMOUS;
    }
  }
}

/** Setzt `Authorization: Bearer <token>` pro Anfrage; Rückgabe = Unsubscribe. */
export function attachJwtAuth(http: TsazorHttp, provider: JwtAuthenticationStateProvider): () => void {
  const interceptor: RequestInterceptor = (request) => {
    const token = provider.getToken();
    if (token === undefined || token.length === 0) return request;
    if (request.headers.has("authorization")) return request;
    return new Request(request, { headers: { authorization: `Bearer ${token}` } });
  };
  return http.addRequestInterceptor(interceptor);
}