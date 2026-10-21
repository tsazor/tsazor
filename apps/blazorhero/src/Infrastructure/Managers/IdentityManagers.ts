import { TsazorHttp } from "@tsazor/runtime";
import type { UploadRequest } from "../../Application/Catalog";
import type {
    ChangePasswordRequest,
    ForgotPasswordRequest,
    PermissionRequest,
    PermissionResponse,
    RegisterRequest,
    ResetPasswordRequest,
    RoleRequest,
    RoleResponse,
    ToggleUserStatusRequest,
    UpdateProfileRequest,
    UpdateUserRolesRequest,
    UserResponse,
    UserRolesResponse,
} from "../../Application/Identity";
import type { Result, ResultOf } from "../../Application/Wrapper";
import { AccountEndpoints, RolesEndpoints, UserEndpoints } from "../Routes";

// Client.Infrastructure's AccountManager, UserManager and RoleManager. They call the API through the app's client,
// which attachJwtAuth signs. A failure is an answer too (`succeeded: false`).

/** Managers/Identity/Account/AccountManager.cs. */
export class AccountManager {
    constructor(private readonly http: TsazorHttp) {}

    async changePasswordAsync(request: ChangePasswordRequest): Promise<Result> {
        return this.http.putJson<Result>(AccountEndpoints.ChangePassword, request);
    }

    async updateProfileAsync(request: UpdateProfileRequest): Promise<Result> {
        return this.http.putJson<Result>(AccountEndpoints.UpdateProfile, request);
    }

    /** The profile picture as a data URL (null when there is none). */
    async getProfilePictureAsync(userId: string): Promise<ResultOf<string | null>> {
        return (await this.http.getJson<ResultOf<string | null>>(AccountEndpoints.getProfilePicture(userId)))!;
    }

    /** UpdateProfilePictureRequest is an UploadRequest; one without data removes the picture. The new data URL. */
    async updateProfilePictureAsync(request: UploadRequest, userId: string): Promise<ResultOf<string>> {
        return this.http.postJson<ResultOf<string>>(AccountEndpoints.updateProfilePicture(userId), request);
    }
}

/** Managers/Identity/Users/UserManager.cs. */
export class UserManager {
    constructor(private readonly http: TsazorHttp) {}

    async getAllAsync(): Promise<ResultOf<UserResponse[]>> {
        return this.http.getJson<ResultOf<UserResponse[]>>(UserEndpoints.GetAll);
    }

    async getAsync(userId: string): Promise<ResultOf<UserResponse | null>> {
        return (await this.http.getJson<ResultOf<UserResponse | null>>(UserEndpoints.get(userId)))!;
    }

    async registerUserAsync(request: RegisterRequest): Promise<Result> {
        return this.http.postJson<Result>(UserEndpoints.Register, request);
    }

    async toggleUserStatusAsync(request: ToggleUserStatusRequest): Promise<Result> {
        return this.http.postJson<Result>(UserEndpoints.ToggleUserStatus, request);
    }

    async getRolesAsync(userId: string): Promise<ResultOf<UserRolesResponse>> {
        return (await this.http.getJson<ResultOf<UserRolesResponse>>(UserEndpoints.getUserRoles(userId)))!;
    }

    async updateRolesAsync(request: UpdateUserRolesRequest): Promise<Result> {
        return this.http.putJson<Result>(UserEndpoints.getUserRoles(request.userId), request);
    }

    async forgotPasswordAsync(request: ForgotPasswordRequest): Promise<Result> {
        return this.http.postJson<Result>(UserEndpoints.ForgotPassword, request);
    }

    async resetPasswordAsync(request: ResetPasswordRequest): Promise<Result> {
        return this.http.postJson<Result>(UserEndpoints.ResetPassword, request);
    }

    /** The workbook in base64 — the API answers it as text, not as a Result (`ReadAsStringAsync`). */
    async exportToExcelAsync(searchString = ""): Promise<string> {
        return this.http.getString(UserEndpoints.export(searchString));
    }
}

/** Managers/Identity/Roles/RoleManager.cs. */
export class RoleManager {
    constructor(private readonly http: TsazorHttp) {}

    async getRolesAsync(): Promise<ResultOf<RoleResponse[]>> {
        return (await this.http.getJson<ResultOf<RoleResponse[]>>(RolesEndpoints.GetAll))!;
    }

    async saveAsync(role: RoleRequest): Promise<ResultOf<string>> {
        return this.http.postJson<ResultOf<string>>(RolesEndpoints.Save, role);
    }

    async deleteAsync(id: string): Promise<ResultOf<string>> {
        return this.http.deleteJson<ResultOf<string>>(RolesEndpoints.delete(id));
    }

    async getPermissionsAsync(roleId: string): Promise<ResultOf<PermissionResponse>> {
        return this.http.getJson<ResultOf<PermissionResponse>>(RolesEndpoints.getPermissions(roleId));
    }

    async updatePermissionsAsync(request: PermissionRequest): Promise<ResultOf<string>> {
        return this.http.putJson<ResultOf<string>>(RolesEndpoints.UpdatePermissions, request);
    }
}
