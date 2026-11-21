// The identity requests and responses (BlazorHero.Application's Requests/Identity and Responses/Identity), as the
// API writes them: camelCase JSON. A form's model is a class with the C# defaults; what only comes back is an
// interface — writable where a page edits it in place (a role's claims, a user's roles), as the original does.

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

/** Requests/Identity/RegisterRequest.cs: the sign-up page's and the admin's "Register New User" dialog's form. */
export class RegisterRequest {
    firstName = "";
    lastName = "";
    email = "";
    userName = "";
    password = "";
    confirmPassword = "";
    phoneNumber = "";
    activateUser = false;
    autoConfirmEmail = false;
}

/** Requests/Identity/ChangePasswordRequest.cs. */
export class ChangePasswordRequest {
    password = "";
    newPassword = "";
    confirmNewPassword = "";
}

/** Requests/Identity/ForgotPasswordRequest.cs. */
export class ForgotPasswordRequest {
    email = "";
}

/** Requests/Identity/ResetPasswordRequest.cs: `token` comes from the link in the mail, not from a field. */
export class ResetPasswordRequest {
    email = "";
    password = "";
    confirmPassword = "";
    token = "";
}

/** Requests/Identity/UpdateProfileRequest.cs: the email is shown, not changed. */
export class UpdateProfileRequest {
    firstName = "";
    lastName = "";
    phoneNumber = "";
    email = "";
}

/** Requests/Identity/RoleRequest.cs: `id` is null for a new role. */
export class RoleRequest {
    id: string | null = null;
    name = "";
    description = "";
}

/** Requests/Identity/ToggleUserStatusRequest.cs. */
export interface ToggleUserStatusRequest {
    readonly activateUser: boolean;
    readonly userId: string;
}

/** Requests/Identity/UpdateUserRolesRequest.cs. */
export interface UpdateUserRolesRequest {
    readonly userId: string;
    readonly userRoles: readonly UserRoleModel[];
}

/** Requests/Identity/PermissionRequest.cs (RoleClaimRequest has RoleClaimResponse's fields). */
export interface PermissionRequest {
    readonly roleId: string;
    readonly roleClaims: readonly RoleClaimResponse[];
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

/** Responses/Identity/UserRolesResponse.cs' UserRoleModel: the user roles page ticks `selected`. */
export interface UserRoleModel {
    readonly roleName: string;
    readonly roleDescription: string;
    selected: boolean;
}

/** Responses/Identity/UserRolesResponse.cs. */
export interface UserRolesResponse {
    readonly userRoles: UserRoleModel[];
}

/** Responses/Identity/RoleResponse.cs. */
export interface RoleResponse {
    readonly id: string;
    readonly name: string;
    readonly description: string;
}

/** Responses/Identity/RoleClaimResponse.cs: the permissions page ticks `selected` and edits `description`. */
export interface RoleClaimResponse {
    readonly id: number;
    readonly roleId: string;
    readonly type: string;
    readonly value: string;
    description: string;
    readonly group: string;
    selected: boolean;
}

/** Responses/Identity/PermissionResponse.cs: every permission there is, those of the role selected. */
export interface PermissionResponse {
    readonly roleId: string;
    readonly roleName: string;
    readonly roleClaims: RoleClaimResponse[];
}
