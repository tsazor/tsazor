/**
 * AuthenticationStateProvider against the real backend's /auth endpoints
 * (cookie sessions). The original used OIDC + ASP.NET Identity via the
 * RemoteAuthenticator — the documented deviation of this port.
 *
 * Der HTTP-Teil läuft über den OpenAPI-generierten PizzaApiClient
 * (@tsazor/dotnet): ein !ok-Resultat ist ein Wert (mit body { error }), kein
 * throw — genau wie ein nicht erreichbares Backend als ok:false-Wert ankommt.
 * Der Backend-User ist das RemoteAuthenticator-Flat-Shape ({ userId, name, email }),
 * nicht das Cookie-Shape ({ user: { name, roles, claims } }) des Paket-Providers —
 * deshalb bleibt der provider-spezifische Mapping hier und nutzt nur die Brücke.
 */
import { ANONYMOUS, AuthenticationState, AuthenticationStateProvider, TsazorHttp, createUser } from "@tsazor/runtime";
import { problemMessage, type HttpResult } from "@tsazor/dotnet";
import { PizzaApiClient } from "./api/pizza-api";
import type { UserInfo } from "./api/models";

export class AuthProvider extends AuthenticationStateProvider {
  private current: AuthenticationState = ANONYMOUS;
  private user: UserInfo | null = null;
  private readonly api = new PizzaApiClient(new TsazorHttp());

  getState(): Promise<AuthenticationState> {
    // First call (app start / reload): re-hydrate from the session cookie.
    if (this.user === null && !this.probed) return this.probe();
    return Promise.resolve(this.current);
  }

  private probed = false;

  private async probe(): Promise<AuthenticationState> {
    if (this.probing) return this.probing;
    return (this.probing = this.reload().finally(() => {
      this.probing = null;
      this.probed = true;
    }));
  }

  private probing: Promise<AuthenticationState> | null = null;

  /** Fetches /auth/user and publishes the resulting auth state. */
  async reload(): Promise<AuthenticationState> {
    // HTTP-Fehler sind Werte; nur ein nicht erreichbares Backend wirft.
    const result = await this.soft(() => this.api.getCurrentUser());
    const user = result !== null && result.ok ? result.body.user : null;
    this.user = user;
    this.current = user
      ? new AuthenticationState(
          createUser({
            name: user.name,
            claims: [{ type: "userId", value: user.userId }],
          }),
        )
      : ANONYMOUS;
    this.notifyAuthenticationStateChanged(this.current);
    return this.current;
  }

  get currentUser(): UserInfo | null {
    return this.user;
  }

  async login(email: string, password: string): Promise<boolean> {
    const result = await this.soft(() => this.api.login({ email, password }));
    if (result === null || !result.ok) return false;
    await this.reload();
    return true;
  }

  async register(name: string, email: string, password: string): Promise<boolean | string> {
    const result = await this.soft(() => this.api.register({ name, email, password }));
    if (result === null || !result.ok) {
      const body = result !== null ? (result.body as { error?: unknown } | null) : null;
      return typeof body?.error === "string" ? body.error : "Registration failed.";
    }
    await this.reload();
    return true;
  }

  async logout(): Promise<void> {
    await this.soft(() => this.api.logout());
    this.user = null;
    this.current = ANONYMOUS;
    this.notifyAuthenticationStateChanged(this.current);
  }

  /** HTTP-Fehler sind HttpResult-Werte; Netzwerkfehler landen als null. */
  private soft<T>(call: () => Promise<HttpResult<T>>): Promise<HttpResult<T> | null> {
    return call().catch(() => null);
  }
}