import { TsazorHttp } from "@tsazor/runtime";
import { StorageConstants } from "../../Application/Constants";
import type { RefreshTokenRequest, TokenRequest, TokenResponse } from "../../Application/Identity";
import { results, type Result, type ResultOf } from "../../Application/Wrapper";
import type { BlazorHeroStateProvider } from "../Authentication/BlazorHeroStateProvider";
import type { LocalStorage } from "../LocalStorage";
import { TokenEndpoints } from "../Routes";

/**
 * Client.Infrastructure/Managers/Identity/Authentication/AuthenticationManager.cs: sign-in, sign-out and the
 * refresh token. Its requests go through a client of their own (`tokens`): the token endpoints are anonymous, and
 * the refresh must not wait for itself in the main client's attachJwtAuth.
 */
export class AuthenticationManager {
    constructor(
        private readonly tokens: TsazorHttp,
        private readonly localStorage: LocalStorage,
        private readonly stateProvider: BlazorHeroStateProvider,
    ) {}

    async login(model: TokenRequest): Promise<Result> {
        const result = await this.tokens.postJson<ResultOf<TokenResponse>>(TokenEndpoints.Get, model);
        if (!result?.succeeded) return results.fail(...(result?.messages ?? []));
        const { token, refreshToken, userImageURL } = result.data;
        this.localStorage.setItem(StorageConstants.Local.RefreshToken, refreshToken);
        if (userImageURL) this.localStorage.setItem(StorageConstants.Local.UserImageURL, userImageURL);
        this.stateProvider.setToken(token);
        return results.success();
    }

    logout(): Result {
        this.localStorage.removeItem(StorageConstants.Local.RefreshToken);
        this.localStorage.removeItem(StorageConstants.Local.UserImageURL);
        this.stateProvider.logout();
        return results.success();
    }

    /**
     * Gets a new token for `token` with the stored refresh token (RefreshToken); undefined when the server says no.
     * attachJwtAuth calls it before a request in the token's last minute (the original's TryRefreshToken), the hub
     * when it asks (TryForceRefreshToken).
     */
    async refreshToken(token = this.stateProvider.getToken()): Promise<string | undefined> {
        const refreshToken = this.localStorage.getItem<string>(StorageConstants.Local.RefreshToken);
        if (token === undefined || refreshToken === undefined) return undefined;
        const request: RefreshTokenRequest = { token, refreshToken };
        const result = await this.tokens.postJson<ResultOf<TokenResponse>>(TokenEndpoints.Refresh, request);
        if (!result?.succeeded) return undefined;
        this.localStorage.setItem(StorageConstants.Local.RefreshToken, result.data.refreshToken);
        return result.data.token;
    }
}
