import type { SiteDetailResponse } from "../../../api/models";

/**
 * The site update form's model (FluentCMS's SiteUpdateModel): the site, the settings it keeps as
 * strings, and the urls as one comma-separated text.
 */
export function siteModel(site: SiteDetailResponse) {
    const settings = site.settings ?? {};
    return {
        id: site.id,
        name: site.name ?? "",
        description: site.description ?? "",
        urls: (site.urls ?? []).join(","),
        layoutId: site.layoutId,
        detailLayoutId: site.detailLayoutId,
        editLayoutId: site.editLayoutId,
        adminRoleIds: site.adminRoleIds ?? [],
        contributorRoleIds: site.contributorRoleIds ?? [],
        metaTitle: settings["MetaTitle"] ?? "",
        metaDescription: settings["MetaDescription"] ?? "",
        googleTagsId: settings["GoogleTagsId"] ?? "",
        index: settings["Index"] === "true",
        follow: settings["Follow"] === "true",
        robotsTxt: settings["RobotsTxt"] ?? "",
        theme: settings["Theme"] ?? "",
        ogType: settings["OgType"] ?? "",
        head: settings["Head"] ?? "",
    };
}
