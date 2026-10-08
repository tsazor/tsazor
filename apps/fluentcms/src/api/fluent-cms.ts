// GENERATED CODE — do not edit by hand.

import type { AccountChangePasswordRequest, AccountUpdateRequest, ApiTokenCreateRequest, ApiTokenDetailResponse, ApiTokenUpdateRequest, BlockCreateRequest, BlockDetailResponse, BlockUpdateRequest, ContentDetailResponse, ContentTypeCreateRequest, ContentTypeDetailResponse, ContentTypeField, ContentTypeUpdateRequest, FileDetailResponse, FileMoveRequest, FileRenameRequest, FolderCreateRequest, FolderDetailResponse, FolderMoveRequest, FolderRenameRequest, GlobalSettingsResponse, GlobalSettingsUpdateRequest, LayoutCreateRequest, LayoutDetailResponse, LayoutUpdateRequest, PageCreateRequest, PageDetailResponse, PageParentDetailResponse, PageUpdateRequest, PluginContentDetailResponse, PluginDefinitionCreateRequest, PluginDefinitionDetailResponse, PluginDetailResponse, PluginInitialCreateRequest, PluginUpdateColsRequest, PluginUpdateOrdersRequest, Policy, RoleCreateRequest, RoleDetailResponse, RoleUpdateRequest, SettingsDetailResponse, SettingsUpdateRequest, SetupRequest, SiteCreateRequest, SiteDetailResponse, SiteUpdateRequest, UserCreateRequest, UserDetailResponse, UserLoginRequest, UserLoginResponse, UserRegisterRequest, UserRoleUpdateRequest, UserSendPasswordResetTokenRequest, UserSetPasswordRequest, UserUpdateRequest, UserValidatePasswordResetTokenRequest } from "./models";

import { OpenApiClient, formData, queryString, type HttpResult } from "@tsazor/dotnet";
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

    accountRegister(body: UserRegisterRequest): Promise<HttpResult<UserDetailResponse>> {
        return this.call("POST", `/api/Account/Register`, body);
    }

    accountAuthenticate(body: UserLoginRequest): Promise<HttpResult<UserLoginResponse>> {
        return this.call("POST", `/api/Account/Authenticate`, body);
    }

    accountChangePassword(body: AccountChangePasswordRequest): Promise<HttpResult<boolean>> {
        return this.call("POST", `/api/Account/ChangePassword`, body);
    }

    accountSendPasswordResetToken(body: UserSendPasswordResetTokenRequest): Promise<HttpResult<boolean>> {
        return this.call("POST", `/api/Account/SendPasswordResetToken`, body);
    }

    accountValidatePasswordResetToken(body: UserValidatePasswordResetTokenRequest): Promise<HttpResult<boolean>> {
        return this.call("POST", `/api/Account/ValidatePasswordResetToken`, body);
    }

    accountGetCurrent(): Promise<HttpResult<UserDetailResponse>> {
        return this.call("GET", `/api/Account/GetCurrent`);
    }

    accountUpdate(body: AccountUpdateRequest): Promise<HttpResult<UserDetailResponse>> {
        return this.call("POST", `/api/Account/Update`, body);
    }

    apiTokenGetAll(): Promise<HttpResult<ApiTokenDetailResponse[] | null>> {
        return this.call("GET", `/api/ApiToken/GetAll`);
    }

    apiTokenGetById(id: string): Promise<HttpResult<ApiTokenDetailResponse>> {
        return this.call("GET", `/api/ApiToken/GetById/${encodeURIComponent(id)}`);
    }

    apiTokenCreate(body: ApiTokenCreateRequest): Promise<HttpResult<ApiTokenDetailResponse>> {
        return this.call("POST", `/api/ApiToken/Create`, body);
    }

    apiTokenUpdate(body: ApiTokenUpdateRequest): Promise<HttpResult<ApiTokenDetailResponse>> {
        return this.call("PUT", `/api/ApiToken/Update`, body);
    }

    apiTokenRegenerateSecret(query?: ApiTokenRegenerateSecretQuery): Promise<HttpResult<ApiTokenDetailResponse>> {
        return this.call("PUT", `/api/ApiToken/RegenerateSecret${queryString(query)}`);
    }

    apiTokenDelete(id: string): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/ApiToken/Delete/${encodeURIComponent(id)}`);
    }

    apiTokenGetPolicies(): Promise<HttpResult<Policy[] | null>> {
        return this.call("GET", `/api/ApiToken/GetPolicies`);
    }

    blockGetById(id: string): Promise<HttpResult<BlockDetailResponse>> {
        return this.call("GET", `/api/Block/GetById/${encodeURIComponent(id)}`);
    }

    blockGetAllForSite(query?: BlockGetAllForSiteQuery): Promise<HttpResult<BlockDetailResponse[] | null>> {
        return this.call("GET", `/api/Block/GetAllForSite${queryString(query)}`);
    }

    blockCreate(body: BlockCreateRequest): Promise<HttpResult<BlockDetailResponse>> {
        return this.call("POST", `/api/Block/Create`, body);
    }

    blockUpdate(body: BlockUpdateRequest): Promise<HttpResult<BlockDetailResponse>> {
        return this.call("PUT", `/api/Block/Update`, body);
    }

    blockDelete(id: string): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Block/Delete/${encodeURIComponent(id)}`);
    }

    contentGetAll(contentTypeSlug: string, query?: ContentGetAllQuery): Promise<HttpResult<ContentDetailResponse[] | null>> {
        return this.call("GET", `/api/Content/${encodeURIComponent(contentTypeSlug)}/GetAll${queryString(query)}`);
    }

    contentGetById(contentTypeSlug: string, id: string, query?: ContentGetByIdQuery): Promise<HttpResult<ContentDetailResponse>> {
        return this.call("GET", `/api/Content/${encodeURIComponent(contentTypeSlug)}/GetById/${encodeURIComponent(id)}${queryString(query)}`);
    }

    contentCreate(contentTypeSlug: string, body: Record<string, unknown>, query?: ContentCreateQuery): Promise<HttpResult<ContentDetailResponse>> {
        return this.call("POST", `/api/Content/${encodeURIComponent(contentTypeSlug)}/Create${queryString(query)}`, body);
    }

    contentUpdate(contentTypeSlug: string, id: string, body: Record<string, unknown>, query?: ContentUpdateQuery): Promise<HttpResult<ContentDetailResponse>> {
        return this.call("PUT", `/api/Content/${encodeURIComponent(contentTypeSlug)}/Update/${encodeURIComponent(id)}${queryString(query)}`, body);
    }

    contentDelete(contentTypeSlug: string, id: string): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Content/${encodeURIComponent(contentTypeSlug)}/Delete/${encodeURIComponent(id)}`);
    }

    contentTypeGetBySlug(slug: string, query?: ContentTypeGetBySlugQuery): Promise<HttpResult<ContentTypeDetailResponse>> {
        return this.call("GET", `/api/ContentType/GetBySlug/${encodeURIComponent(slug)}${queryString(query)}`);
    }

    contentTypeGetById(id: string): Promise<HttpResult<ContentTypeDetailResponse>> {
        return this.call("GET", `/api/ContentType/GetById/${encodeURIComponent(id)}`);
    }

    contentTypeGetAll(query?: ContentTypeGetAllQuery): Promise<HttpResult<ContentTypeDetailResponse[] | null>> {
        return this.call("GET", `/api/ContentType/GetAll${queryString(query)}`);
    }

    contentTypeCreate(body: ContentTypeCreateRequest): Promise<HttpResult<ContentTypeDetailResponse>> {
        return this.call("POST", `/api/ContentType/Create`, body);
    }

    contentTypeUpdate(body: ContentTypeUpdateRequest): Promise<HttpResult<ContentTypeDetailResponse>> {
        return this.call("PUT", `/api/ContentType/Update`, body);
    }

    contentTypeDelete(id: string): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/ContentType/Delete/${encodeURIComponent(id)}`);
    }

    contentTypeSetField(id: string, body: ContentTypeField): Promise<HttpResult<ContentTypeDetailResponse>> {
        return this.call("PUT", `/api/ContentType/SetField/${encodeURIComponent(id)}`, body);
    }

    contentTypeDeleteField(id: string, name: string): Promise<HttpResult<ContentTypeDetailResponse>> {
        return this.call("DELETE", `/api/ContentType/DeleteField/${encodeURIComponent(id)}/${encodeURIComponent(name)}`);
    }

    fileGetById(id: string): Promise<HttpResult<FileDetailResponse>> {
        return this.call("GET", `/api/File/GetById/${encodeURIComponent(id)}`);
    }

    fileUpload(body: FileUploadForm, query?: FileUploadQuery): Promise<HttpResult<FileDetailResponse[] | null>> {
        return this.call("POST", `/api/File/Upload${queryString(query)}`, formData(body));
    }

    fileDownloadById(id: string): Promise<HttpResult<void>> {
        return this.call("GET", `/api/File/Download/${encodeURIComponent(id)}`);
    }

    fileDownload(query?: FileDownloadQuery): Promise<HttpResult<void>> {
        return this.call("GET", `/api/File/Download${queryString(query)}`);
    }

    fileDelete(id: string): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/File/Delete/${encodeURIComponent(id)}`);
    }

    fileRename(body: FileRenameRequest): Promise<HttpResult<FileDetailResponse>> {
        return this.call("PUT", `/api/File/Rename`, body);
    }

    fileMove(body: FileMoveRequest): Promise<HttpResult<FileDetailResponse>> {
        return this.call("PUT", `/api/File/Move`, body);
    }

    robotsTxt(): Promise<HttpResult<void>> {
        return this.call("GET", `/robots.txt`);
    }

    sitemapXml(): Promise<HttpResult<void>> {
        return this.call("GET", `/sitemap.xml`);
    }

    folderGetAll(siteId: string): Promise<HttpResult<FolderDetailResponse>> {
        return this.call("GET", `/api/Folder/GetAll/${encodeURIComponent(siteId)}`);
    }

    folderGetById(id: string): Promise<HttpResult<FolderDetailResponse>> {
        return this.call("GET", `/api/Folder/GetById/${encodeURIComponent(id)}`);
    }

    folderCreate(body: FolderCreateRequest): Promise<HttpResult<FolderDetailResponse>> {
        return this.call("POST", `/api/Folder/Create`, body);
    }

    folderRename(body: FolderRenameRequest): Promise<HttpResult<FolderDetailResponse>> {
        return this.call("PUT", `/api/Folder/Rename`, body);
    }

    folderMove(body: FolderMoveRequest): Promise<HttpResult<FolderDetailResponse>> {
        return this.call("PUT", `/api/Folder/Move`, body);
    }

    folderGetParentFolders(id: string): Promise<HttpResult<FolderDetailResponse[] | null>> {
        return this.call("GET", `/api/Folder/GetParentFolders/${encodeURIComponent(id)}`);
    }

    folderDelete(id: string): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Folder/Delete/${encodeURIComponent(id)}`);
    }

    globalSettingsGet(): Promise<HttpResult<GlobalSettingsResponse>> {
        return this.call("GET", `/api/GlobalSettings/Get`);
    }

    globalSettingsUpdate(body: GlobalSettingsUpdateRequest): Promise<HttpResult<GlobalSettingsResponse>> {
        return this.call("POST", `/api/GlobalSettings/Update`, body);
    }

    layoutGetBySiteId(query?: LayoutGetBySiteIdQuery): Promise<HttpResult<LayoutDetailResponse[] | null>> {
        return this.call("GET", `/api/Layout/GetBySiteId${queryString(query)}`);
    }

    layoutGetAll(): Promise<HttpResult<LayoutDetailResponse[] | null>> {
        return this.call("GET", `/api/Layout/GetAll`);
    }

    layoutGet(id: string): Promise<HttpResult<LayoutDetailResponse>> {
        return this.call("GET", `/api/Layout/Get/${encodeURIComponent(id)}`);
    }

    layoutCreate(body: LayoutCreateRequest): Promise<HttpResult<LayoutDetailResponse>> {
        return this.call("POST", `/api/Layout/Create`, body);
    }

    layoutUpdate(body: LayoutUpdateRequest): Promise<HttpResult<LayoutDetailResponse>> {
        return this.call("PUT", `/api/Layout/Update`, body);
    }

    layoutDelete(id: string): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Layout/Delete/${encodeURIComponent(id)}`);
    }

    pageGetAll(siteId: string): Promise<HttpResult<PageDetailResponse[] | null>> {
        return this.call("GET", `/api/Page/GetAll/${encodeURIComponent(siteId)}`);
    }

    pageGetById(id: string): Promise<HttpResult<PageDetailResponse>> {
        return this.call("GET", `/api/Page/GetById/${encodeURIComponent(id)}`);
    }

    pageGetByUrl(query?: PageGetByUrlQuery): Promise<HttpResult<PageParentDetailResponse>> {
        return this.call("GET", `/api/Page/GetByUrl${queryString(query)}`);
    }

    pageCreate(body: PageCreateRequest): Promise<HttpResult<PageDetailResponse>> {
        return this.call("POST", `/api/Page/Create`, body);
    }

    pageUpdate(body: PageUpdateRequest): Promise<HttpResult<PageDetailResponse>> {
        return this.call("PUT", `/api/Page/Update`, body);
    }

    pageDelete(id: string): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Page/Delete/${encodeURIComponent(id)}`);
    }

    pluginGetById(id: string): Promise<HttpResult<PluginDetailResponse>> {
        return this.call("GET", `/api/Plugin/GetById/${encodeURIComponent(id)}`);
    }

    pluginInitialCreate(body: PluginInitialCreateRequest): Promise<HttpResult<PluginDetailResponse>> {
        return this.call("POST", `/api/Plugin/InitialCreate`, body);
    }

    pluginUpdateOrders(body: PluginUpdateOrdersRequest): Promise<HttpResult<PluginDetailResponse[] | null>> {
        return this.call("PUT", `/api/Plugin/UpdateOrders`, body);
    }

    pluginUpdateCols(body: PluginUpdateColsRequest): Promise<HttpResult<PluginDetailResponse>> {
        return this.call("PUT", `/api/Plugin/UpdateCols`, body);
    }

    pluginDelete(id: string): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Plugin/Delete/${encodeURIComponent(id)}`);
    }

    pluginContentGetAll(pluginContentTypeName: string, pluginId: string): Promise<HttpResult<PluginContentDetailResponse[] | null>> {
        return this.call("GET", `/api/PluginContent/${encodeURIComponent(pluginContentTypeName)}/GetAll/${encodeURIComponent(pluginId)}`);
    }

    pluginContentGetById(pluginContentTypeName: string, pluginId: string, id: string): Promise<HttpResult<PluginContentDetailResponse>> {
        return this.call("GET", `/api/PluginContent/${encodeURIComponent(pluginContentTypeName)}/GetById/${encodeURIComponent(pluginId)}/${encodeURIComponent(id)}`);
    }

    pluginContentCreate(pluginContentTypeName: string, pluginId: string, body: Record<string, unknown>): Promise<HttpResult<PluginContentDetailResponse>> {
        return this.call("POST", `/api/PluginContent/${encodeURIComponent(pluginContentTypeName)}/Create/${encodeURIComponent(pluginId)}`, body);
    }

    pluginContentUpdate(pluginContentTypeName: string, pluginId: string, id: string, body: Record<string, unknown>): Promise<HttpResult<PluginContentDetailResponse>> {
        return this.call("PUT", `/api/PluginContent/${encodeURIComponent(pluginContentTypeName)}/Update/${encodeURIComponent(pluginId)}/${encodeURIComponent(id)}`, body);
    }

    pluginContentDelete(pluginContentTypeName: string, pluginId: string, id: string): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/PluginContent/${encodeURIComponent(pluginContentTypeName)}/Delete/${encodeURIComponent(pluginId)}/${encodeURIComponent(id)}`);
    }

    pluginDefinitionCreate(body: PluginDefinitionCreateRequest): Promise<HttpResult<PluginDefinitionDetailResponse>> {
        return this.call("POST", `/api/PluginDefinition/Create`, body);
    }

    pluginDefinitionGetAll(): Promise<HttpResult<PluginDefinitionDetailResponse[] | null>> {
        return this.call("GET", `/api/PluginDefinition/GetAll`);
    }

    roleGetAll(query?: RoleGetAllQuery): Promise<HttpResult<RoleDetailResponse[] | null>> {
        return this.call("GET", `/api/Role/GetAll${queryString(query)}`);
    }

    roleGetById(id: string): Promise<HttpResult<RoleDetailResponse>> {
        return this.call("GET", `/api/Role/GetById/${encodeURIComponent(id)}`);
    }

    roleCreate(body: RoleCreateRequest): Promise<HttpResult<RoleDetailResponse>> {
        return this.call("POST", `/api/Role/Create`, body);
    }

    roleUpdate(body: RoleUpdateRequest): Promise<HttpResult<RoleDetailResponse>> {
        return this.call("PUT", `/api/Role/Update`, body);
    }

    roleDelete(id: string): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Role/Delete/${encodeURIComponent(id)}`);
    }

    settingsUpdate(body: SettingsUpdateRequest): Promise<HttpResult<SettingsDetailResponse>> {
        return this.call("PUT", `/api/Settings/Update`, body);
    }

    setupIsInitialized(): Promise<HttpResult<boolean>> {
        return this.call("GET", `/api/Setup/IsInitialized`);
    }

    setupStart(body: SetupRequest): Promise<HttpResult<boolean>> {
        return this.call("POST", `/api/Setup/Start`, body);
    }

    setupGetTemplates(): Promise<HttpResult<string[] | null>> {
        return this.call("GET", `/api/Setup/GetTemplates`);
    }

    siteGetAll(): Promise<HttpResult<SiteDetailResponse[] | null>> {
        return this.call("GET", `/api/Site/GetAll`);
    }

    siteGetById(id: string): Promise<HttpResult<SiteDetailResponse>> {
        return this.call("GET", `/api/Site/GetById/${encodeURIComponent(id)}`);
    }

    siteCreate(body: SiteCreateRequest): Promise<HttpResult<SiteDetailResponse>> {
        return this.call("POST", `/api/Site/Create`, body);
    }

    siteUpdate(body: SiteUpdateRequest): Promise<HttpResult<SiteDetailResponse>> {
        return this.call("PUT", `/api/Site/Update`, body);
    }

    siteDelete(siteId: string): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/Site/Delete/${encodeURIComponent(siteId)}`);
    }

    siteGetRobotsTxt(query?: SiteGetRobotsTxtQuery): Promise<HttpResult<string | null>> {
        return this.call("GET", `/api/Site/GetRobotsTxt${queryString(query)}`);
    }

    siteGetSitemapXml(query?: SiteGetSitemapXmlQuery): Promise<HttpResult<string | null>> {
        return this.call("GET", `/api/Site/GetSitemapXml${queryString(query)}`);
    }

    userGetAll(): Promise<HttpResult<UserDetailResponse[] | null>> {
        return this.call("GET", `/api/User/GetAll`);
    }

    userGet(userId: string): Promise<HttpResult<UserDetailResponse>> {
        return this.call("GET", `/api/User/Get/${encodeURIComponent(userId)}`);
    }

    userUpdate(body: UserUpdateRequest): Promise<HttpResult<UserDetailResponse>> {
        return this.call("PUT", `/api/User/Update`, body);
    }

    userSetPassword(body: UserSetPasswordRequest): Promise<HttpResult<boolean>> {
        return this.call("PUT", `/api/User/SetPassword`, body);
    }

    userCreate(body: UserCreateRequest): Promise<HttpResult<UserDetailResponse>> {
        return this.call("POST", `/api/User/Create`, body);
    }

    userDelete(id: string): Promise<HttpResult<boolean>> {
        return this.call("DELETE", `/api/User/Delete/${encodeURIComponent(id)}`);
    }

    userRoleGetUserRoles(query?: UserRoleGetUserRolesQuery): Promise<HttpResult<RoleDetailResponse[] | null>> {
        return this.call("GET", `/api/UserRole/GetUserRoles${queryString(query)}`);
    }

    userRoleUpdate(body: UserRoleUpdateRequest): Promise<HttpResult<boolean>> {
        return this.call("PUT", `/api/UserRole/Update`, body);
    }
}
