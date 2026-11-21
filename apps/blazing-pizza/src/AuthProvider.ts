/**
 * AuthenticationStateProvider against the real backend's /auth endpoints
 * (cookie sessions). The original used OIDC + ASP.NET Identity via the
 * RemoteAuthenticator — the documented deviation of this port.
 *
 * The HTTP part goes through the OpenAPI-generated PizzaApiClient
 * (@tsazor/dotnet): a !ok result is a value (with body { error }), not a
 * throw — just as an unreachable backend arrives as an ok:false value.
 * The backend user is the flat RemoteAuthenticator shape ({ userId, name, email }),
 * not the cookie shape ({ user: { name, roles, claims } }) of the package provider —
 * so the provider-specific mapping stays here and only uses the bridge.
 */
import { ANONYMOUS, AuthenticationState, AuthenticationStateProvider, TsazorHttp, createUser } from "@tsazor/runtime";
import { problemMessage, type HttpResult } from "@tsazor/dotnet";
import { PizzaApiClient } from "./api/pizza-api";
import type { UserInfo } from "./api/models";

export class AuthProvider extends AuthenticationStateProvider {
  private current: AuthenticationState = ANONYMOUS;
  private user: UserInfo | null = null;
  private readonly api = new PizzaApiClient(new TsazorHttp());

  getAuthenticationStateAsync(): Promise<AuthenticationState> {
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
    // HTTP errors are values; only an unreachable backend throws.
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

  /** HTTP errors are HttpResult values; network errors end up as null. */
  private soft<T>(call: () => Promise<HttpResult<T>>): Promise<HttpResult<T> | null> {
    return call().catch(() => null);
  }
}