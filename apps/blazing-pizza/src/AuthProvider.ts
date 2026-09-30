/**
 * AuthenticationStateProvider against the real backend's /auth endpoints
 * (cookie sessions). The original used OIDC + ASP.NET Identity via the
 * RemoteAuthenticator — the documented deviation of this port.
 */
import { ANONYMOUS, AuthenticationState, AuthenticationStateProvider, TsazorHttp, createUser } from "@tsazor/runtime";

export interface UserInfo {
  userId: string;
  name: string;
  email: string;
}

export class AuthProvider extends AuthenticationStateProvider {
  private current: AuthenticationState = ANONYMOUS;
  private user: UserInfo | null = null;
  private readonly http = new TsazorHttp();

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
    try {
      const result = await this.http.getJson<{ user: UserInfo | null }>("/auth/user");
      this.user = result.user;
      this.current = this.user
        ? new AuthenticationState(
            createUser({
              name: this.user.name,
              claims: [{ type: "userId", value: this.user.userId }],
            }),
          )
        : ANONYMOUS;
    } catch {
      this.user = null;
      this.current = ANONYMOUS;
    }
    this.notifyAuthenticationStateChanged(this.current);
    return this.current;
  }

  get currentUser(): UserInfo | null {
    return this.user;
  }

  async login(email: string, password: string): Promise<boolean> {
    try {
      await this.http.postJson("/auth/login", { email, password });
    } catch {
      return false;
    }
    await this.reload();
    return true;
  }

  async register(name: string, email: string, password: string): Promise<boolean | string> {
    try {
      await this.http.postJson("/auth/register", { name, email, password });
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
    await this.reload();
    return true;
  }

  async logout(): Promise<void> {
    try {
      await this.http.postJson("/auth/logout", {});
    } catch {
      // Signing out must succeed even if the backend is unreachable.
    }
    this.user = null;
    this.current = ANONYMOUS;
    this.notifyAuthenticationStateChanged(this.current);
  }
}

// @inject services are imported as default (codegen convention).
export default AuthProvider;