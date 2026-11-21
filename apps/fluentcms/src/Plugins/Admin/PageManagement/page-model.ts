import type { PageCreateRequest, PageDetailResponse, PageUpdateRequest, SettingsUpdateRequest } from "../../../api/models";

/** The page form's model (FluentCMS's PageSettingsModel): the page and the settings it keeps as strings. "" is "(default)" / "(none)". */
export interface PageModel {
    title: string;
    path: string;
    parentId: string;
    layoutId: string;
    editLayoutId: string;
    detailLayoutId: string;
    order: number;
    viewRoleIds: string[];
    adminRoleIds: string[];
    metaTitle: string;
    metaDescription: string;
    index: boolean;
    follow: boolean;
    ogType: string;
    head: string;
}

/** A page's form model; an empty one without a page. */
export function pageModel(page?: PageDetailResponse): PageModel {
    const settings = page?.settings ?? {};
    return {
        title: page?.title ?? "",
        path: page?.path ?? "",
        parentId: page?.parentId ?? "",
        layoutId: page?.layoutId ?? "",
        editLayoutId: page?.editLayoutId ?? "",
        detailLayoutId: page?.detailLayoutId ?? "",
        order: page?.order ?? 0,
        viewRoleIds: page?.viewRoleIds ?? [],
        adminRoleIds: page?.adminRoleIds ?? [],
        metaTitle: settings["MetaTitle"] ?? "",
        metaDescription: settings["MetaDescription"] ?? "",
        index: settings["Index"] === "true",
        follow: settings["Follow"] === "true",
        ogType: settings["OgType"] ?? "",
        head: settings["Head"] ?? "",
    };
}

/** The page request's fields (FluentCMS's ToCreateRequest): "(default)" and "(none)" become null. */
export function pageRequest(model: PageModel, siteId: string): PageCreateRequest & PageUpdateRequest {
    const orNull = (id: string): string | null => (id === "" ? null : id);
    return {
        siteId,
        title: model.title,
        path: model.path,
        parentId: orNull(model.parentId),
        layoutId: orNull(model.layoutId),
        editLayoutId: orNull(model.editLayoutId),
        detailLayoutId: orNull(model.detailLayoutId),
        order: model.order,
        viewRoleIds: model.viewRoleIds,
        adminRoleIds: model.adminRoleIds,
    };
}

/** The page's settings (FluentCMS's ToSettingsRequest). */
export function pageSettings(model: PageModel, pageId: string): SettingsUpdateRequest {
    return {
        id: pageId,
        settings: {
            MetaTitle: model.metaTitle,
            MetaDescription: model.metaDescription,
            Index: model.index ? "true" : "false",
            Follow: model.follow ? "true" : "false",
            OgType: model.ogType,
            Head: model.head,
        },
    };
}
