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

export const BrandsEndpoints = {
    GetAll: "api/v1/brands",
    Save: "api/v1/brands",
    delete: (id: number) => `api/v1/brands/${id}`,
    Import: "api/v1/brands/import",
    export: (searchString: string) => (searchString.trim() === "" ? "api/v1/brands/export" : `api/v1/brands/export?searchString=${encodeURIComponent(searchString)}`),
} as const;

export const ProductsEndpoints = {
    /** The original joins `orderBy` with commas: "Name,Rate descending". */
    getAllPaged: (pageNumber: number, pageSize: number, searchString: string, orderBy: readonly string[]) =>
        `api/v1/products?pageNumber=${pageNumber}&pageSize=${pageSize}&searchString=${encodeURIComponent(searchString)}&orderBy=${encodeURIComponent(orderBy.join(","))}`,
    getProductImage: (productId: number) => `api/v1/products/image/${productId}`,
    Save: "api/v1/products",
    delete: (id: number) => `api/v1/products/${id}`,
    export: (searchString: string) => (searchString.trim() === "" ? "api/v1/products/export" : `api/v1/products/export?searchString=${encodeURIComponent(searchString)}`),
} as const;
