import { JwtAuthenticationStateProvider } from "@tsazor/dotnet";
import { StorageConstants } from "../../Application/Constants";
import type { LocalStorage } from "../LocalStorage";

/**
 * Client.Infrastructure/Authentication/BlazorHeroStateProvider.cs: the user is the JWT's claims. The original reads
 * the token from localStorage on every call and decodes it itself; here @tsazor/dotnet's JWT provider holds it and
 * maps the claims (the long Microsoft claim URIs and the array of Permission claims included), and every login,
 * logout and refresh — attachJwtAuth's too — passes `setToken`, which keeps localStorage in step.
 */
export class BlazorHeroStateProvider extends JwtAuthenticationStateProvider {
    constructor(private readonly localStorage: LocalStorage) {
        super(localStorage.getItem<string>(StorageConstants.Local.AuthToken));
    }

    override setToken(token: string | undefined): void {
        if (token === undefined) this.localStorage.removeItem(StorageConstants.Local.AuthToken);
        else this.localStorage.setItem(StorageConstants.Local.AuthToken, token);
        super.setToken(token);
    }
}
