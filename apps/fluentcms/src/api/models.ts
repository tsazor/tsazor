// GENERATED CODE — do not edit by hand.
// Source: OpenAPI FluentCMS API v1.0.0

import { EmailAddress, MinLength, Required } from "@tsazor/runtime";

export class AccountChangePasswordRequest {
    @Required()
    @MinLength(1)
    oldPassword = "";
    @Required()
    @MinLength(1)
    newPassword = "";
    @Required()
    @MinLength(1)
    newPasswordConfirm = "";
}

export class AccountUpdateRequest {
    @Required()
    @MinLength(1)
    @EmailAddress()
    email = "";
    phoneNumber?: string | null;
    firstName?: string | null;
    lastName?: string | null;
}

export class ApiTokenCreateRequest {
    @Required()
    @MinLength(1)
    name = "";
    description?: string | null;
    expireAt?: string | null;
    enabled = false;
    policies: Policy[] = [];
}

export class ApiTokenDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    name?: string | null;
    description?: string | null;
    key?: string | null;
    secret?: string | null;
    expireAt?: string | null;
    enabled = false;
    policies?: Policy[] | null;
}

export class ApiTokenDetailResponseIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: ApiTokenDetailResponse[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class ApiTokenDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: ApiTokenDetailResponse;
}

export class ApiTokenUpdateRequest {
    @Required()
    id = "";
    @Required()
    @MinLength(1)
    name = "";
    enabled = false;
    policies: Policy[] = [];
    description?: string | null;
    expireAt?: string | null;
}

export class AppError {
    code?: string | null;
    description?: string | null;
}

export class BlockCreateRequest {
    @Required()
    siteId = "";
    @Required()
    @MinLength(1)
    name = "";
    @Required()
    @MinLength(1)
    category = "";
    description?: string | null;
    @Required()
    @MinLength(1)
    content = "";
}

export class BlockDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    siteId = "";
    name?: string | null;
    category?: string | null;
    description?: string | null;
    content?: string | null;
}

export class BlockDetailResponseIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: BlockDetailResponse[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class BlockDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: BlockDetailResponse;
}

export class BlockUpdateRequest {
    @Required()
    id = "";
    @Required()
    @MinLength(1)
    name = "";
    @Required()
    @MinLength(1)
    category = "";
    description?: string | null;
    @Required()
    @MinLength(1)
    content = "";
}

export class BooleanIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data = false;
}

export class ContentDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    siteId = "";
    @Required()
    typeId = "";
    @Required()
    data!: Record<string, unknown>;
}

export class ContentDetailResponseIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: ContentDetailResponse[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class ContentDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: ContentDetailResponse;
}

export class ContentTypeCreateRequest {
    @Required()
    siteId = "";
    @Required()
    @MinLength(1)
    slug = "";
    @Required()
    @MinLength(1)
    title = "";
    description?: string | null;
}

export class ContentTypeDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    siteId = "";
    slug?: string | null;
    title?: string | null;
    description?: string | null;
    fields?: ContentTypeField[] | null;
}

export class ContentTypeDetailResponseIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: ContentTypeDetailResponse[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class ContentTypeDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: ContentTypeDetailResponse;
}

export class ContentTypeField {
    name?: string | null;
    description?: string | null;
    type?: string | null;
    required?: boolean;
    unique?: boolean;
    label?: string | null;
    settings?: Record<string, unknown> | null;
}

export class ContentTypeUpdateRequest {
    @Required()
    id = "";
    @Required()
    @MinLength(1)
    title = "";
    description?: string | null;
}

export class FileDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    siteId = "";
    folderId = "";
    name?: string | null;
    path?: string | null;
    size = 0;
    extension?: string | null;
    contentType?: string | null;
}

export class FileDetailResponseIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: FileDetailResponse[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class FileDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: FileDetailResponse;
}

export class FileMoveRequest {
    id?: string;
    folderId?: string;
}

export class FileRenameRequest {
    id?: string;
    name?: string | null;
}

export class FileUploadConfig {
    maxSize = 0;
    maxCount = 0;
    allowedExtensions?: string | null;
}

export class FolderCreateRequest {
    @Required()
    siteId = "";
    @Required()
    @MinLength(1)
    name = "";
    @Required()
    parentId = "";
}

export class FolderDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    name?: string | null;
    parentId?: string | null;
    size = 0;
    files?: FileDetailResponse[] | null;
    folders?: FolderDetailResponse[] | null;
}

export class FolderDetailResponseIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: FolderDetailResponse[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class FolderDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: FolderDetailResponse;
}

export class FolderMoveRequest {
    @Required()
    id = "";
    @Required()
    parentId = "";
}

export class FolderRenameRequest {
    @Required()
    id = "";
    @Required()
    @MinLength(1)
    name = "";
}

export class GlobalSettingsResponse {
    superAdmins?: string[] | null;
    fileUpload?: FileUploadConfig;
}

export class GlobalSettingsResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: GlobalSettingsResponse;
}

export class GlobalSettingsUpdateRequest {
    superAdmins?: string[] | null;
}

export class LayoutCreateRequest {
    @Required()
    siteId = "";
    @Required()
    @MinLength(1)
    name = "";
    @Required()
    @MinLength(1)
    body = "";
    @Required()
    @MinLength(1)
    head = "";
}

export class LayoutDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    siteId = "";
    name?: string | null;
    body?: string | null;
    head?: string | null;
}

export class LayoutDetailResponseIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: LayoutDetailResponse[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class LayoutDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: LayoutDetailResponse;
}

export class LayoutUpdateRequest {
    @Required()
    id = "";
    @Required()
    @MinLength(1)
    name = "";
    @Required()
    @MinLength(1)
    body = "";
    @Required()
    @MinLength(1)
    head = "";
}

export class PageCreateRequest {
    @Required()
    siteId = "";
    parentId?: string | null;
    layoutId?: string | null;
    detailLayoutId?: string | null;
    editLayoutId?: string | null;
    @Required()
    @MinLength(1)
    title = "";
    @Required()
    @MinLength(1)
    path = "";
    order = 0;
    viewRoleIds: string[] = [];
    adminRoleIds: string[] = [];
}

export class PageDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    siteId = "";
    parentId?: string | null;
    title?: string | null;
    children?: PageDetailResponse[] | null;
    order = 0;
    path?: string | null;
    fullPath?: string | null;
    layoutId?: string | null;
    detailLayoutId?: string | null;
    editLayoutId?: string | null;
    locked = false;
    viewRoleIds?: string[] | null;
    adminRoleIds?: string[] | null;
}

export class PageDetailResponseIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: PageDetailResponse[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class PageDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: PageDetailResponse;
}

export class PageFullDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    siteId = "";
    parentId?: string | null;
    title?: string | null;
    order = 0;
    path?: string | null;
    fullPath?: string | null;
    layout?: LayoutDetailResponse;
    detailLayout?: LayoutDetailResponse;
    editLayout?: LayoutDetailResponse;
    site?: SiteDetailResponse;
    sections?: Record<string, PluginDetailResponse[]> | null;
    locked = false;
    user?: UserRoleDetailResponse;
    viewRoleIds?: string[] | null;
    adminRoleIds?: string[] | null;
}

export class PageParentDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    siteId = "";
    parent?: PageFullDetailResponse;
    current?: PageFullDetailResponse;
    slug?: string | null;
}

export class PageParentDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: PageParentDetailResponse;
}

export class PageUpdateRequest {
    @Required()
    siteId = "";
    parentId?: string | null;
    layoutId?: string | null;
    detailLayoutId?: string | null;
    editLayoutId?: string | null;
    @Required()
    @MinLength(1)
    title = "";
    @Required()
    @MinLength(1)
    path = "";
    order = 0;
    viewRoleIds: string[] = [];
    adminRoleIds: string[] = [];
    id?: string;
}

export class PluginContentDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    siteId = "";
    pluginId = "";
    type?: string | null;
    data?: Record<string, unknown> | null;
}

export class PluginContentDetailResponseIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: PluginContentDetailResponse[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class PluginContentDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: PluginContentDetailResponse;
}

export class PluginDefinitionCreateRequest {
    name?: string | null;
    category?: string | null;
    description?: string | null;
    type?: string | null;
    stylesheets?: string[] | null;
}

export class PluginDefinitionDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    name?: string | null;
    category?: string | null;
    icon?: string | null;
    assembly?: string | null;
    description?: string | null;
    types?: PluginDefinitionType[] | null;
    stylesheets?: string[] | null;
    locked = false;
}

export class PluginDefinitionDetailResponseIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: PluginDefinitionDetailResponse[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class PluginDefinitionDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: PluginDefinitionDetailResponse;
}

export class PluginDefinitionType {
    name?: string | null;
    type?: string | null;
    isDefault = false;
}

export class PluginDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    siteId = "";
    definitionId = "";
    pageId = "";
    order = 0;
    cols = 0;
    colsMd = 0;
    colsLg = 0;
    section?: string | null;
    definition?: PluginDefinitionDetailResponse;
    locked = false;
}

export class PluginDetailResponseIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: PluginDetailResponse[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class PluginDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: PluginDetailResponse;
}

export class PluginInitialCreateRequest {
    @Required()
    definitionId = "";
    @Required()
    pageId = "";
    @Required()
    @MinLength(1)
    section = "";
}

export class PluginOrder {
    id?: string;
    section: string | null = null;
}

export class PluginUpdateColsRequest {
    id?: string;
    cols?: number;
    colsMd?: number;
    colsLg?: number;
}

export class PluginUpdateOrdersRequest {
    pluginOrders: PluginOrder[] = [];
}

export class Policy {
    area?: string | null;
    actions?: string[] | null;
}

export class PolicyIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: Policy[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class RoleCreateRequest {
    @Required()
    siteId = "";
    @Required()
    @MinLength(1)
    name = "";
    description?: string | null;
}

export class RoleDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    siteId = "";
    name?: string | null;
    description?: string | null;
    type!: RoleTypes;
    usersCount = 0;
}

export class RoleDetailResponseIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: RoleDetailResponse[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class RoleDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: RoleDetailResponse;
}

export type RoleTypes =
    | "UserDefined"
    | "Administrators"
    | "Authenticated"
    | "Guest"
    | "AllUsers";

export class RoleUpdateRequest {
    @Required()
    id = "";
    @Required()
    @MinLength(1)
    name = "";
    description?: string | null;
}

export class SettingsDetailResponse {
    @Required()
    id = "";
    @Required()
    settings!: Record<string, string>;
}

export class SettingsDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: SettingsDetailResponse;
}

export class SettingsUpdateRequest {
    @Required()
    id = "";
    @Required()
    settings!: Record<string, string>;
}

export class SetupRequest {
    @Required()
    @MinLength(1)
    username = "";
    @Required()
    @MinLength(1)
    @EmailAddress()
    email = "";
    @Required()
    @MinLength(1)
    password = "";
    @Required()
    @MinLength(1)
    template = "";
    @Required()
    @MinLength(1)
    url = "";
}

export class SiteCreateRequest {
    @Required()
    @MinLength(1)
    name = "";
    description?: string | null;
    @Required()
    @MinLength(1)
    template = "";
    @Required()
    @MinLength(1)
    url = "";
}

export class SiteDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    name?: string | null;
    description?: string | null;
    urls?: string[] | null;
    layoutId = "";
    detailLayoutId = "";
    editLayoutId = "";
    adminRoleIds?: string[] | null;
    contributorRoleIds?: string[] | null;
    allRoles?: RoleDetailResponse[] | null;
}

export class SiteDetailResponseIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: SiteDetailResponse[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class SiteDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: SiteDetailResponse;
}

export class SiteUpdateRequest {
    @Required()
    id = "";
    @Required()
    @MinLength(1)
    name = "";
    description?: string | null;
    urls: string[] = [];
    @Required()
    layoutId = "";
    @Required()
    detailLayoutId = "";
    @Required()
    editLayoutId = "";
    contributorRoleIds: string[] = [];
    adminRoleIds: string[] = [];
}

export class StringIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: string[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class StringIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: string | null;
}

export class UserCreateRequest {
    @Required()
    @MinLength(1)
    username = "";
    @Required()
    @MinLength(1)
    @EmailAddress()
    email = "";
    @Required()
    @MinLength(1)
    password = "";
    phoneNumber?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    enabled = false;
}

export class UserDetailResponse {
    id = "";
    createdBy?: string | null;
    createdAt = "";
    modifiedBy?: string | null;
    modifiedAt?: string | null;
    settings?: Record<string, string> | null;
    username?: string | null;
    email?: string | null;
    phoneNumber?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    loginAt?: string | null;
    loginCount = 0;
    enabled = false;
    emailConfirmed = false;
    phoneConfirmed = false;
    locked = false;
    isSuperAdmin = false;
}

export class UserDetailResponseIApiPagingResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: UserDetailResponse[] | null;
    pageSize = 0;
    totalPages = 0;
    pageNumber = 0;
    totalCount = 0;
    hasPrevious = false;
    hasNext = false;
}

export class UserDetailResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: UserDetailResponse;
}

export class UserLoginRequest {
    @Required()
    @MinLength(1)
    username = "";
    @Required()
    @MinLength(1)
    password = "";
    rememberMe?: boolean;
}

export class UserLoginResponse {
    userId = "";
    token?: string | null;
    userName?: string | null;
    email?: string | null;
}

export class UserLoginResponseIApiResult {
    errors?: AppError[] | null;
    traceId?: string | null;
    sessionId?: string | null;
    uniqueId?: string | null;
    duration = 0;
    status = 0;
    isSuccess = false;
    data?: UserLoginResponse;
}

export class UserRegisterRequest {
    @Required()
    @MinLength(1)
    email = "";
    @Required()
    @MinLength(1)
    username = "";
    @Required()
    @MinLength(1)
    password = "";
    @Required()
    @MinLength(1)
    confirmPassword = "";
}

export class UserRoleDetailResponse {
    username?: string | null;
    isAuthenticated = false;
    isSuperAdmin = false;
    userId = "";
    roles?: RoleDetailResponse[] | null;
}

export class UserRoleUpdateRequest {
    @Required()
    siteId = "";
    @Required()
    userId = "";
    roleIds: string[] = [];
}

export class UserSendPasswordResetTokenRequest {
    @Required()
    @MinLength(1)
    @EmailAddress()
    email = "";
}

export class UserSetPasswordRequest {
    @Required()
    userId = "";
    @Required()
    @MinLength(1)
    password = "";
}

export class UserUpdateRequest {
    @Required()
    id = "";
    @Required()
    @MinLength(1)
    @EmailAddress()
    email = "";
    phoneNumber?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    enabled = false;
}

export class UserValidatePasswordResetTokenRequest {
    @Required()
    @MinLength(1)
    token = "";
    @Required()
    @MinLength(1)
    email = "";
    @Required()
    @MinLength(1)
    newPassword = "";
    @Required()
    @MinLength(1)
    newPasswordConfirm = "";
}
