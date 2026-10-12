// The identity requests and responses the shell uses (BlazorHero.Application's Requests/Identity and
// Responses/Identity), as the API writes them: camelCase JSON.

/** Requests/Identity/TokenRequest.cs. */
export class TokenRequest {
    email = "";
    password = "";
}

/** Requests/Identity/RefreshTokenRequest.cs. */
export interface RefreshTokenRequest {
    readonly token: string;
    readonly refreshToken: string;
}

/** Responses/Identity/TokenResponse.cs. */
export interface TokenResponse {
    readonly token: string;
    readonly refreshToken: string;
    readonly userImageURL: string | null;
    readonly refreshTokenExpiryTime: string;
}

/** Responses/Identity/UserResponse.cs. */
export interface UserResponse {
    readonly id: string;
    readonly userName: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly isActive: boolean;
    readonly emailConfirmed: boolean;
    readonly phoneNumber: string | null;
    readonly profilePictureDataUrl: string | null;
}

/** Responses/Identity/UserRolesResponse.cs (with its UserRoleModel). */
export interface UserRolesResponse {
    readonly userRoles: { readonly roleName: string; readonly roleDescription: string; readonly selected: boolean }[];
}

/** Responses/Identity/RoleResponse.cs. */
export interface RoleResponse {
    readonly id: string;
    readonly name: string;
    readonly description: string;
}
