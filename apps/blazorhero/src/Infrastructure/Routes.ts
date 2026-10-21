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

export const DashboardEndpoints = {
    GetData: "api/v1/dashboard",
} as const;

export const ChatEndpoint = {
    GetAvailableUsers: "api/chats/users",
    SaveMessage: "api/chats",
    getChatHistory: (userId: string) => `api/chats/${userId}`,
} as const;

export const DocumentTypesEndpoints = {
    GetAll: "api/documentTypes",
    Save: "api/documentTypes",
    delete: (id: number) => `api/documentTypes/${id}`,
    export: (searchString: string) => (searchString.trim() === "" ? "api/documentTypes/export" : `api/documentTypes/export?searchString=${encodeURIComponent(searchString)}`),
} as const;

export const DocumentsEndpoints = {
    getAllPaged: (pageNumber: number, pageSize: number, searchString: string) =>
        `api/documents?pageNumber=${pageNumber}&pageSize=${pageSize}&searchString=${encodeURIComponent(searchString)}`,
    Save: "api/documents",
    delete: (id: number) => `api/documents/${id}`,
} as const;

/** ExtendedAttributesEndpoints.cs: one controller per entity, `api/{entityName}ExtendedAttributes`. */
export const ExtendedAttributesEndpoints = {
    getAll: (entityName: string) => `api/${entityName}ExtendedAttributes`,
    getAllByEntityId: (entityName: string, entityId: unknown) => `api/${entityName}ExtendedAttributes/by-entity/${String(entityId)}`,
    export: (entityName: string, query: { searchString: string; entityId: unknown; includeEntity: boolean; onlyCurrentGroup: boolean; currentGroup: string }) => {
        const search = query.searchString.trim() === "" ? "" : `searchString=${encodeURIComponent(query.searchString)}&`;
        return `api/${entityName}ExtendedAttributes/export?${search}entityId=${String(query.entityId)}&includeEntity=${query.includeEntity}&onlyCurrentGroup=${query.onlyCurrentGroup}&currentGroup=${encodeURIComponent(query.currentGroup)}`;
    },
    delete: (entityName: string, id: unknown) => `api/${entityName}ExtendedAttributes/${String(id)}`,
    save: (entityName: string) => `api/${entityName}ExtendedAttributes`,
} as const;

export const AuditEndpoints = {
    GetCurrentUserTrails: "api/audits",
    downloadFile: (searchString: string, searchInOldValues: boolean, searchInNewValues: boolean) =>
        `api/audits/export?searchString=${encodeURIComponent(searchString)}&searchInOldValues=${searchInOldValues}&searchInNewValues=${searchInNewValues}`,
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
