import { TsazorHttp } from "@tsazor/runtime";
import type { RoleResponse, UserResponse, UserRolesResponse } from "../../Application/Identity";
import type { ResultOf } from "../../Application/Wrapper";
import { AccountEndpoints, RolesEndpoints, UserEndpoints } from "../Routes";

// The parts of Client.Infrastructure's AccountManager, UserManager and RoleManager the shell uses. They call the
// API through the app's client, which attachJwtAuth signs.

/** Managers/Identity/Account/AccountManager.cs. */
export class AccountManager {
    constructor(private readonly http: TsazorHttp) {}

    /** The profile picture as a data URL (null when there is none). */
    async getProfilePictureAsync(userId: string): Promise<ResultOf<string | null>> {
        return (await this.http.getJson<ResultOf<string | null>>(AccountEndpoints.getProfilePicture(userId)))!;
    }
}

/** Managers/Identity/Users/UserManager.cs. */
export class UserManager {
    constructor(private readonly http: TsazorHttp) {}

    async getAsync(userId: string): Promise<ResultOf<UserResponse | null>> {
        return (await this.http.getJson<ResultOf<UserResponse | null>>(UserEndpoints.get(userId)))!;
    }

    async getRolesAsync(userId: string): Promise<ResultOf<UserRolesResponse>> {
        return (await this.http.getJson<ResultOf<UserRolesResponse>>(UserEndpoints.getUserRoles(userId)))!;
    }
}

/** Managers/Identity/Roles/RoleManager.cs. */
export class RoleManager {
    constructor(private readonly http: TsazorHttp) {}

    async getRolesAsync(): Promise<ResultOf<RoleResponse[]>> {
        return (await this.http.getJson<ResultOf<RoleResponse[]>>(RolesEndpoints.GetAll))!;
    }
}
