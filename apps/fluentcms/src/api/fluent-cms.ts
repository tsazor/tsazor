// GENERATED CODE — do not edit by hand.

import type { AccountChangePasswordRequest, AccountUpdateRequest, ApiTokenCreateRequest, ApiTokenDetailResponse, ApiTokenUpdateRequest, BlockCreateRequest, BlockDetailResponse, BlockUpdateRequest, ContentDetailResponse, ContentTypeCreateRequest, ContentTypeDetailResponse, ContentTypeField, ContentTypeUpdateRequest, FileDetailResponse, FileMoveRequest, FileRenameRequest, FolderCreateRequest, FolderDetailResponse, FolderMoveRequest, FolderRenameRequest, GlobalSettingsResponse, GlobalSettingsUpdateRequest, LayoutCreateRequest, LayoutDetailResponse, LayoutUpdateRequest, PageCreateRequest, PageDetailResponse, PageParentDetailResponse, PageUpdateRequest, PluginContentDetailResponse, PluginDefinitionCreateRequest, PluginDefinitionDetailResponse, PluginDetailResponse, PluginInitialCreateRequest, PluginUpdateColsRequest, PluginUpdateOrdersRequest, Policy, RoleCreateRequest, RoleDetailResponse, RoleUpdateRequest, SettingsDetailResponse, SettingsUpdateRequest, SetupRequest, SiteCreateRequest, SiteDetailResponse, SiteUpdateRequest, UserCreateRequest, UserDetailResponse, UserLoginRequest, UserLoginResponse, UserRegisterRequest, UserRoleUpdateRequest, UserSendPasswordResetTokenRequest, UserSetPasswordRequest, UserUpdateRequest, UserValidatePasswordResetTokenRequest } from "./models";

import { OpenApiClient, formData, queryString, type HttpResult, type RequestOptions } from "@tsazor/dotnet";
import { TsazorHttp } from "@tsazor/runtime";

/** Query parameters of the apiTokenRegenerateSecret operation. */
export type ApiTokenRegenerateSecretQuery = {
    id?: string;
};

/** Query parameters of the blockGetAllForSite operation. */
export type BlockGetAllForSiteQuery = {
    siteId?: string;
};

/** Query parameters of the contentGetAll operation. */
export type ContentGetAllQuery = {
    siteId?: string;
};

/** Query parameters of the contentGetById operation. */
export type ContentGetByIdQuery = {
    siteId?: string;
};

/** Query parameters of the contentCreate operation. */
export type ContentCreateQuery = {
    siteId?: string;
};

/** Query parameters of the contentUpdate operation. */
export type ContentUpdateQuery = {
    siteId?: string;
};

/** Query parameters of the contentTypeGetBySlug operation. */
export type ContentTypeGetBySlugQuery = {
    siteId?: string;
};

/** Query parameters of the contentTypeGetAll operation. */
export type ContentTypeGetAllQuery = {
    siteId?: string;
};

/** The multipart/form-data body of the fileUpload operation. */
export type FileUploadForm = {
    files?: Blob[];
};

/** Query parameters of the fileUpload operation. */
export type FileUploadQuery = {
    folderId?: string;
};

/** Query parameters of the fileDownload operation. */
export type FileDownloadQuery = {
    url?: string;
};

/** Query parameters of the layoutGetBySiteId operation. */
export type LayoutGetBySiteIdQuery = {
    siteId?: string;
};

/** Query parameters of the pageGetByUrl operation. */
export type PageGetByUrlQuery = {
    url?: string;
};

/** Query parameters of the roleGetAll operation. */
export type RoleGetAllQuery = {
    siteId?: string;
};

/** Query parameters of the siteGetRobotsTxt operation. */
export type SiteGetRobotsTxtQuery = {
    url?: string;
};

/** Query parameters of the siteGetSitemapXml operation. */
export type SiteGetSitemapXmlQuery = {
    url?: string;
};

/** Query parameters of the userRoleGetUserRoles operation. */
export type UserRoleGetUserRolesQuery = {
    userId?: string;
    siteId?: string;
};

export class FluentCmsClient extends OpenApiClient {
    constructor(http: TsazorHttp) {
        super(http, { envelope: { data: "data", errors: "errors" } });
    }

    accountRegister(body: UserRegisterRequest, options?: RequestOptions): Promise<HttpResult<UserDetailResponse>> {
        return this.call("POST", `/api/Account/Register`, body, options);
    }

    accountAuthenticate(body: UserLoginRequest, options?: RequestOptions): Promise<HttpResult<UserLoginResponse>> {
        return this.call("POST", `/api/Account/Authenticate`, body, options);
    }

    accountChangePassword(body: AccountChangePasswordRequest, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("POST", `/api/Account/ChangePassword`, body, options);
    }

    accountSendPasswordResetToken(body: UserSendPasswordResetTokenRequest, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("POST", `/api/Account/SendPasswordResetToken`, body, options);
    }

    accountValidatePasswordResetToken(body: UserValidatePasswordResetTokenRequest, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("POST", `/api/Account/ValidatePasswordResetToken`, body, options);
    }

    accountGetCurrent(options?: RequestOptions): Promise<HttpResult<UserDetailResponse>> {
        return this.call("GET", `/api/Account/GetCurrent`, undefined, options);
    }

    accountUpdate(body: AccountUpdateRequest, options?: RequestOptions): Promise<HttpResult<UserDetailResponse>> {
        return this.call("POST", `/api/Account/Update`, body, options);
    }

    apiTokenGetAll(options?: RequestOptions): Promise<HttpResult<ApiTokenDetailResponse[] | null>> {
        return this.call("GET", `/api/ApiToken/GetAll`, undefined, options);
    }

    apiTokenGetById(id: string, options?: RequestOptions): Promise<HttpResult<ApiTokenDetailResponse>> {
        return this.call("GET", `/api/ApiToken/GetById/${encodeURIComponent(id)}`, undefined, options);
    }

    apiTokenCreate(body: ApiTokenCreateRequest, options?: RequestOptions): Promise<HttpResult<ApiTokenDetailResponse>> {
        return this.call("POST", `/api/ApiToken/Create`, body, options);
    }

    apiTokenUpdate(body: ApiTokenUpdateRequest, options?: RequestOptions): Promise<HttpResult<ApiTokenDetailResponse>> {
        return this.call("PUT", `/api/ApiToken/Update`, body, options);
    }

    apiTokenRegenerateSecret(query?: ApiTokenRegenerateSecretQuery, options?: RequestOptions): Promise<HttpResult<ApiTokenDetailResponse>> {
        return this.call("PUT", `/api/ApiToken/RegenerateSecret${queryString(query)}`, undefined, options);
    }

    apiTokenDelete(id: string, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/ApiToken/Delete/${encodeURIComponent(id)}`, undefined, options);
    }

    apiTokenGetPolicies(options?: RequestOptions): Promise<HttpResult<Policy[] | null>> {
        return this.call("GET", `/api/ApiToken/GetPolicies`, undefined, options);
    }

    blockGetById(id: string, options?: RequestOptions): Promise<HttpResult<BlockDetailResponse>> {
        return this.call("GET", `/api/Block/GetById/${encodeURIComponent(id)}`, undefined, options);
    }

    blockGetAllForSite(query?: BlockGetAllForSiteQuery, options?: RequestOptions): Promise<HttpResult<BlockDetailResponse[] | null>> {
        return this.call("GET", `/api/Block/GetAllForSite${queryString(query)}`, undefined, options);
    }

    blockCreate(body: BlockCreateRequest, options?: RequestOptions): Promise<HttpResult<BlockDetailResponse>> {
        return this.call("POST", `/api/Block/Create`, body, options);
    }

    blockUpdate(body: BlockUpdateRequest, options?: RequestOptions): Promise<HttpResult<BlockDetailResponse>> {
        return this.call("PUT", `/api/Block/Update`, body, options);
    }

    blockDelete(id: string, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Block/Delete/${encodeURIComponent(id)}`, undefined, options);
    }

    contentGetAll(contentTypeSlug: string, query?: ContentGetAllQuery, options?: RequestOptions): Promise<HttpResult<ContentDetailResponse[] | null>> {
        return this.call("GET", `/api/Content/${encodeURIComponent(contentTypeSlug)}/GetAll${queryString(query)}`, undefined, options);
    }

    contentGetById(contentTypeSlug: string, id: string, query?: ContentGetByIdQuery, options?: RequestOptions): Promise<HttpResult<ContentDetailResponse>> {
        return this.call("GET", `/api/Content/${encodeURIComponent(contentTypeSlug)}/GetById/${encodeURIComponent(id)}${queryString(query)}`, undefined, options);
    }

    contentCreate(contentTypeSlug: string, body: Record<string, unknown>, query?: ContentCreateQuery, options?: RequestOptions): Promise<HttpResult<ContentDetailResponse>> {
        return this.call("POST", `/api/Content/${encodeURIComponent(contentTypeSlug)}/Create${queryString(query)}`, body, options);
    }

    contentUpdate(contentTypeSlug: string, id: string, body: Record<string, unknown>, query?: ContentUpdateQuery, options?: RequestOptions): Promise<HttpResult<ContentDetailResponse>> {
        return this.call("PUT", `/api/Content/${encodeURIComponent(contentTypeSlug)}/Update/${encodeURIComponent(id)}${queryString(query)}`, body, options);
    }

    contentDelete(contentTypeSlug: string, id: string, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Content/${encodeURIComponent(contentTypeSlug)}/Delete/${encodeURIComponent(id)}`, undefined, options);
    }

    contentTypeGetBySlug(slug: string, query?: ContentTypeGetBySlugQuery, options?: RequestOptions): Promise<HttpResult<ContentTypeDetailResponse>> {
        return this.call("GET", `/api/ContentType/GetBySlug/${encodeURIComponent(slug)}${queryString(query)}`, undefined, options);
    }

    contentTypeGetById(id: string, options?: RequestOptions): Promise<HttpResult<ContentTypeDetailResponse>> {
        return this.call("GET", `/api/ContentType/GetById/${encodeURIComponent(id)}`, undefined, options);
    }

    contentTypeGetAll(query?: ContentTypeGetAllQuery, options?: RequestOptions): Promise<HttpResult<ContentTypeDetailResponse[] | null>> {
        return this.call("GET", `/api/ContentType/GetAll${queryString(query)}`, undefined, options);
    }

    contentTypeCreate(body: ContentTypeCreateRequest, options?: RequestOptions): Promise<HttpResult<ContentTypeDetailResponse>> {
        return this.call("POST", `/api/ContentType/Create`, body, options);
    }

    contentTypeUpdate(body: ContentTypeUpdateRequest, options?: RequestOptions): Promise<HttpResult<ContentTypeDetailResponse>> {
        return this.call("PUT", `/api/ContentType/Update`, body, options);
    }

    contentTypeDelete(id: string, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/ContentType/Delete/${encodeURIComponent(id)}`, undefined, options);
    }

    contentTypeSetField(id: string, body: ContentTypeField, options?: RequestOptions): Promise<HttpResult<ContentTypeDetailResponse>> {
        return this.call("PUT", `/api/ContentType/SetField/${encodeURIComponent(id)}`, body, options);
    }

    contentTypeDeleteField(id: string, name: string, options?: RequestOptions): Promise<HttpResult<ContentTypeDetailResponse>> {
        return this.call("DELETE", `/api/ContentType/DeleteField/${encodeURIComponent(id)}/${encodeURIComponent(name)}`, undefined, options);
    }

    fileGetById(id: string, options?: RequestOptions): Promise<HttpResult<FileDetailResponse>> {
        return this.call("GET", `/api/File/GetById/${encodeURIComponent(id)}`, undefined, options);
    }

    fileUpload(body: FileUploadForm, query?: FileUploadQuery, options?: RequestOptions): Promise<HttpResult<FileDetailResponse[] | null>> {
        return this.call("POST", `/api/File/Upload${queryString(query)}`, formData(body), options);
    }

    fileDownloadById(id: string, options?: RequestOptions): Promise<HttpResult<void>> {
        return this.call("GET", `/api/File/Download/${encodeURIComponent(id)}`, undefined, options);
    }

    fileDownload(query?: FileDownloadQuery, options?: RequestOptions): Promise<HttpResult<void>> {
        return this.call("GET", `/api/File/Download${queryString(query)}`, undefined, options);
    }

    fileDelete(id: string, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/File/Delete/${encodeURIComponent(id)}`, undefined, options);
    }

    fileRename(body: FileRenameRequest, options?: RequestOptions): Promise<HttpResult<FileDetailResponse>> {
        return this.call("PUT", `/api/File/Rename`, body, options);
    }

    fileMove(body: FileMoveRequest, options?: RequestOptions): Promise<HttpResult<FileDetailResponse>> {
        return this.call("PUT", `/api/File/Move`, body, options);
    }

    robotsTxt(options?: RequestOptions): Promise<HttpResult<void>> {
        return this.call("GET", `/robots.txt`, undefined, options);
    }

    sitemapXml(options?: RequestOptions): Promise<HttpResult<void>> {
        return this.call("GET", `/sitemap.xml`, undefined, options);
    }

    folderGetAll(siteId: string, options?: RequestOptions): Promise<HttpResult<FolderDetailResponse>> {
        return this.call("GET", `/api/Folder/GetAll/${encodeURIComponent(siteId)}`, undefined, options);
    }

    folderGetById(id: string, options?: RequestOptions): Promise<HttpResult<FolderDetailResponse>> {
        return this.call("GET", `/api/Folder/GetById/${encodeURIComponent(id)}`, undefined, options);
    }

    folderCreate(body: FolderCreateRequest, options?: RequestOptions): Promise<HttpResult<FolderDetailResponse>> {
        return this.call("POST", `/api/Folder/Create`, body, options);
    }

    folderRename(body: FolderRenameRequest, options?: RequestOptions): Promise<HttpResult<FolderDetailResponse>> {
        return this.call("PUT", `/api/Folder/Rename`, body, options);
    }

    folderMove(body: FolderMoveRequest, options?: RequestOptions): Promise<HttpResult<FolderDetailResponse>> {
        return this.call("PUT", `/api/Folder/Move`, body, options);
    }

    folderGetParentFolders(id: string, options?: RequestOptions): Promise<HttpResult<FolderDetailResponse[] | null>> {
        return this.call("GET", `/api/Folder/GetParentFolders/${encodeURIComponent(id)}`, undefined, options);
    }

    folderDelete(id: string, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Folder/Delete/${encodeURIComponent(id)}`, undefined, options);
    }

    globalSettingsGet(options?: RequestOptions): Promise<HttpResult<GlobalSettingsResponse>> {
        return this.call("GET", `/api/GlobalSettings/Get`, undefined, options);
    }

    globalSettingsUpdate(body: GlobalSettingsUpdateRequest, options?: RequestOptions): Promise<HttpResult<GlobalSettingsResponse>> {
        return this.call("POST", `/api/GlobalSettings/Update`, body, options);
    }

    layoutGetBySiteId(query?: LayoutGetBySiteIdQuery, options?: RequestOptions): Promise<HttpResult<LayoutDetailResponse[] | null>> {
        return this.call("GET", `/api/Layout/GetBySiteId${queryString(query)}`, undefined, options);
    }

    layoutGetAll(options?: RequestOptions): Promise<HttpResult<LayoutDetailResponse[] | null>> {
        return this.call("GET", `/api/Layout/GetAll`, undefined, options);
    }

    layoutGet(id: string, options?: RequestOptions): Promise<HttpResult<LayoutDetailResponse>> {
        return this.call("GET", `/api/Layout/Get/${encodeURIComponent(id)}`, undefined, options);
    }

    layoutCreate(body: LayoutCreateRequest, options?: RequestOptions): Promise<HttpResult<LayoutDetailResponse>> {
        return this.call("POST", `/api/Layout/Create`, body, options);
    }

    layoutUpdate(body: LayoutUpdateRequest, options?: RequestOptions): Promise<HttpResult<LayoutDetailResponse>> {
        return this.call("PUT", `/api/Layout/Update`, body, options);
    }

    layoutDelete(id: string, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Layout/Delete/${encodeURIComponent(id)}`, undefined, options);
    }

    pageGetAll(siteId: string, options?: RequestOptions): Promise<HttpResult<PageDetailResponse[] | null>> {
        return this.call("GET", `/api/Page/GetAll/${encodeURIComponent(siteId)}`, undefined, options);
    }

    pageGetById(id: string, options?: RequestOptions): Promise<HttpResult<PageDetailResponse>> {
        return this.call("GET", `/api/Page/GetById/${encodeURIComponent(id)}`, undefined, options);
    }

    pageGetByUrl(query?: PageGetByUrlQuery, options?: RequestOptions): Promise<HttpResult<PageParentDetailResponse>> {
        return this.call("GET", `/api/Page/GetByUrl${queryString(query)}`, undefined, options);
    }

    pageCreate(body: PageCreateRequest, options?: RequestOptions): Promise<HttpResult<PageDetailResponse>> {
        return this.call("POST", `/api/Page/Create`, body, options);
    }

    pageUpdate(body: PageUpdateRequest, options?: RequestOptions): Promise<HttpResult<PageDetailResponse>> {
        return this.call("PUT", `/api/Page/Update`, body, options);
    }

    pageDelete(id: string, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Page/Delete/${encodeURIComponent(id)}`, undefined, options);
    }

    pluginGetById(id: string, options?: RequestOptions): Promise<HttpResult<PluginDetailResponse>> {
        return this.call("GET", `/api/Plugin/GetById/${encodeURIComponent(id)}`, undefined, options);
    }

    pluginInitialCreate(body: PluginInitialCreateRequest, options?: RequestOptions): Promise<HttpResult<PluginDetailResponse>> {
        return this.call("POST", `/api/Plugin/InitialCreate`, body, options);
    }

    pluginUpdateOrders(body: PluginUpdateOrdersRequest, options?: RequestOptions): Promise<HttpResult<PluginDetailResponse[] | null>> {
        return this.call("PUT", `/api/Plugin/UpdateOrders`, body, options);
    }

    pluginUpdateCols(body: PluginUpdateColsRequest, options?: RequestOptions): Promise<HttpResult<PluginDetailResponse>> {
        return this.call("PUT", `/api/Plugin/UpdateCols`, body, options);
    }

    pluginDelete(id: string, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Plugin/Delete/${encodeURIComponent(id)}`, undefined, options);
    }

    pluginContentGetAll(pluginContentTypeName: string, pluginId: string, options?: RequestOptions): Promise<HttpResult<PluginContentDetailResponse[] | null>> {
        return this.call("GET", `/api/PluginContent/${encodeURIComponent(pluginContentTypeName)}/GetAll/${encodeURIComponent(pluginId)}`, undefined, options);
    }

    pluginContentGetById(pluginContentTypeName: string, pluginId: string, id: string, options?: RequestOptions): Promise<HttpResult<PluginContentDetailResponse>> {
        return this.call("GET", `/api/PluginContent/${encodeURIComponent(pluginContentTypeName)}/GetById/${encodeURIComponent(pluginId)}/${encodeURIComponent(id)}`, undefined, options);
    }

    pluginContentCreate(pluginContentTypeName: string, pluginId: string, body: Record<string, unknown>, options?: RequestOptions): Promise<HttpResult<PluginContentDetailResponse>> {
        return this.call("POST", `/api/PluginContent/${encodeURIComponent(pluginContentTypeName)}/Create/${encodeURIComponent(pluginId)}`, body, options);
    }

    pluginContentUpdate(pluginContentTypeName: string, pluginId: string, id: string, body: Record<string, unknown>, options?: RequestOptions): Promise<HttpResult<PluginContentDetailResponse>> {
        return this.call("PUT", `/api/PluginContent/${encodeURIComponent(pluginContentTypeName)}/Update/${encodeURIComponent(pluginId)}/${encodeURIComponent(id)}`, body, options);
    }

    pluginContentDelete(pluginContentTypeName: string, pluginId: string, id: string, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/PluginContent/${encodeURIComponent(pluginContentTypeName)}/Delete/${encodeURIComponent(pluginId)}/${encodeURIComponent(id)}`, undefined, options);
    }

    pluginDefinitionCreate(body: PluginDefinitionCreateRequest, options?: RequestOptions): Promise<HttpResult<PluginDefinitionDetailResponse>> {
        return this.call("POST", `/api/PluginDefinition/Create`, body, options);
    }

    pluginDefinitionGetAll(options?: RequestOptions): Promise<HttpResult<PluginDefinitionDetailResponse[] | null>> {
        return this.call("GET", `/api/PluginDefinition/GetAll`, undefined, options);
    }

    roleGetAll(query?: RoleGetAllQuery, options?: RequestOptions): Promise<HttpResult<RoleDetailResponse[] | null>> {
        return this.call("GET", `/api/Role/GetAll${queryString(query)}`, undefined, options);
    }

    roleGetById(id: string, options?: RequestOptions): Promise<HttpResult<RoleDetailResponse>> {
        return this.call("GET", `/api/Role/GetById/${encodeURIComponent(id)}`, undefined, options);
    }

    roleCreate(body: RoleCreateRequest, options?: RequestOptions): Promise<HttpResult<RoleDetailResponse>> {
        return this.call("POST", `/api/Role/Create`, body, options);
    }

    roleUpdate(body: RoleUpdateRequest, options?: RequestOptions): Promise<HttpResult<RoleDetailResponse>> {
        return this.call("PUT", `/api/Role/Update`, body, options);
    }

    roleDelete(id: string, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Role/Delete/${encodeURIComponent(id)}`, undefined, options);
    }

    settingsUpdate(body: SettingsUpdateRequest, options?: RequestOptions): Promise<HttpResult<SettingsDetailResponse>> {
        return this.call("PUT", `/api/Settings/Update`, body, options);
    }

    setupIsInitialized(options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("GET", `/api/Setup/IsInitialized`, undefined, options);
    }

    setupStart(body: SetupRequest, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("POST", `/api/Setup/Start`, body, options);
    }

    setupGetTemplates(options?: RequestOptions): Promise<HttpResult<string[] | null>> {
        return this.call("GET", `/api/Setup/GetTemplates`, undefined, options);
    }

    siteGetAll(options?: RequestOptions): Promise<HttpResult<SiteDetailResponse[] | null>> {
        return this.call("GET", `/api/Site/GetAll`, undefined, options);
    }

    siteGetById(id: string, options?: RequestOptions): Promise<HttpResult<SiteDetailResponse>> {
        return this.call("GET", `/api/Site/GetById/${encodeURIComponent(id)}`, undefined, options);
    }

    siteCreate(body: SiteCreateRequest, options?: RequestOptions): Promise<HttpResult<SiteDetailResponse>> {
        return this.call("POST", `/api/Site/Create`, body, options);
    }

    siteUpdate(body: SiteUpdateRequest, options?: RequestOptions): Promise<HttpResult<SiteDetailResponse>> {
        return this.call("PUT", `/api/Site/Update`, body, options);
    }

    siteDelete(siteId: string, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Site/Delete/${encodeURIComponent(siteId)}`, undefined, options);
    }

    siteGetRobotsTxt(query?: SiteGetRobotsTxtQuery, options?: RequestOptions): Promise<HttpResult<string | null>> {
        return this.call("GET", `/api/Site/GetRobotsTxt${queryString(query)}`, undefined, options);
    }

    siteGetSitemapXml(query?: SiteGetSitemapXmlQuery, options?: RequestOptions): Promise<HttpResult<string | null>> {
        return this.call("GET", `/api/Site/GetSitemapXml${queryString(query)}`, undefined, options);
    }

    userGetAll(options?: RequestOptions): Promise<HttpResult<UserDetailResponse[] | null>> {
        return this.call("GET", `/api/User/GetAll`, undefined, options);
    }

    userGet(userId: string, options?: RequestOptions): Promise<HttpResult<UserDetailResponse>> {
        return this.call("GET", `/api/User/Get/${encodeURIComponent(userId)}`, undefined, options);
    }

    userUpdate(body: UserUpdateRequest, options?: RequestOptions): Promise<HttpResult<UserDetailResponse>> {
        return this.call("PUT", `/api/User/Update`, body, options);
    }

    userSetPassword(body: UserSetPasswordRequest, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("PUT", `/api/User/SetPassword`, body, options);
    }

    userCreate(body: UserCreateRequest, options?: RequestOptions): Promise<HttpResult<UserDetailResponse>> {
        return this.call("POST", `/api/User/Create`, body, options);
    }

    userDelete(id: string, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/User/Delete/${encodeURIComponent(id)}`, undefined, options);
    }

    userRoleGetUserRoles(query?: UserRoleGetUserRolesQuery, options?: RequestOptions): Promise<HttpResult<RoleDetailResponse[] | null>> {
        return this.call("GET", `/api/UserRole/GetUserRoles${queryString(query)}`, undefined, options);
    }

    userRoleUpdate(body: UserRoleUpdateRequest, options?: RequestOptions): Promise<HttpResult<boolean>> {
        return this.call("PUT", `/api/UserRole/Update`, body, options);
    }
}
