import { ANONYMOUS, AuthenticationState, AuthenticationStateProvider, createUser } from "@tsazor/runtime";

/**
 * Demo AuthenticationStateProvider: an in-memory login (no real backend).
 * Register it in Program.ts; AuthorizeView & Co. consume it via DI.
 */
export class DemoAuthProvider extends AuthenticationStateProvider {
  private current = ANONYMOUS;

  getAuthenticationStateAsync(): Promise<AuthenticationState> {
    return Promise.resolve(this.current);
  }

  signIn(name: string): void {
    this.current = new AuthenticationState(createUser({ name, roles: ["admin"] }));
    this.notifyAuthenticationStateChanged(this.current);
  }

  signOut(): void {
    this.current = ANONYMOUS;
    this.notifyAuthenticationStateChanged(this.current);
  }
}
