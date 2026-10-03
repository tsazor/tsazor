import { ANONYMOUS, AuthenticationState, AuthenticationStateProvider, createUser } from "@tsazor/runtime";

/** Who is signed in. A real app asks its server; this one keeps the user in memory. */
export class BakeryAuth extends AuthenticationStateProvider {
    private current = ANONYMOUS;

    getState(): Promise<AuthenticationState> {
        return Promise.resolve(this.current);
    }

    signIn(name: string) {
        this.current = new AuthenticationState(createUser({ name }));
        this.notifyAuthenticationStateChanged(this.current);
    }

    signOut() {
        this.current = ANONYMOUS;
        this.notifyAuthenticationStateChanged(this.current);
    }
}
