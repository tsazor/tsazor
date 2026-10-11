import { ANONYMOUS, AuthenticationState, AuthenticationStateProvider } from "@tsazor/runtime";

/** Who is signed in. A real app asks its server; this one keeps the user in memory. */
export class BakeryAuth extends AuthenticationStateProvider {
    private current = ANONYMOUS;

    getAuthenticationStateAsync(): Promise<AuthenticationState> {
        return Promise.resolve(this.current);
    }

    signIn(name: string) {
    }

    signOut() {
    }
}
