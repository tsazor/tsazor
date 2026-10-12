// Client.Infrastructure/Routes: the API's endpoints, relative to the app's origin (Vite proxies them).

export const TokenEndpoints = {
    Get: "api/identity/token",
    Refresh: "api/identity/token/refresh",
} as const;

export const AccountEndpoints = {
    Register: "api/identity/account/register",
    ChangePassword: "api/identity/account/changepassword",
    UpdateProfile: "api/identity/account/updateprofile",
    getProfilePicture: (userId: string) => `api/identity/account/profile-picture/${userId}`,
    updateProfilePicture: (userId: string) => `api/identity/account/profile-picture/${userId}`,
} as const;

export const UserEndpoints = {
    GetAll: "api/identity/user",
    get: (userId: string) => `api/identity/user/${userId}`,
    getUserRoles: (userId: string) => `api/identity/user/roles/${userId}`,
} as const;

export const RolesEndpoints = {
    GetAll: "api/identity/role",
} as const;
