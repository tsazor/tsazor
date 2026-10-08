import { NavigationManager, type ObserveListener } from "@tsazor/runtime";
import { problemMessage } from "@tsazor/dotnet";
import { FluentCmsClient } from "./api/fluent-cms";
import type {
    LayoutDetailResponse,
    PageFullDetailResponse,
    PluginDetailResponse,
    SiteDetailResponse,
    UserRoleDetailResponse,
} from "./api/models";

/** Which part of the page is shown: the page itself, or one plugin under a view name. */
export type ViewStateType = "default" | "pluginEdit" | "pluginDetail" | "pagePreview" | "pageEdit";

export interface SiteView extends SiteDetailResponse {
    hasAdminAccess: boolean;
    hasContributorAccess: boolean;
}

export interface PageView extends PageFullDetailResponse {
    /** The rest of the URL below the page, when the URL names no page of its own (detail pages). */
    slug: string | null;
    hasAdminAccess: boolean;
    hasViewAccess: boolean;
}

/**
 * The page the current URL resolves to, with its site, layouts, plugins and user (FluentCMS's
 * ViewState). It loads the page through `Page/GetByUrl` and again on every navigation, and tells its
 * subscribers when it has: components `this.observe(this.viewState)`.
 *
 * Blazor Server loads it synchronously per circuit; here the load is async, and the newest
 * navigation wins.
 */
export class ViewState {
    type: ViewStateType = "default";
    site!: SiteView;
    page!: PageView;
    layout?: LayoutDetailResponse;
    detailLayout?: LayoutDetailResponse;
    editLayout?: LayoutDetailResponse;
    plugins: PluginDetailResponse[] = [];
    user!: UserRoleDetailResponse;
    /** The plugin shown alone (`?pluginId=…&viewName=…`), and its view name. */
    plugin?: PluginDetailResponse;
    pluginViewName?: string;

    /** False until the first page has loaded. */
    loaded = false;
    /** Why the page could not load, if it couldn't. */
    error?: string;

    private readonly listeners = new Set<ObserveListener<void>>();
    private loads = 0;

    constructor(
        private readonly client: FluentCmsClient,
        private readonly navigation: NavigationManager,
    ) {
        navigation.addLocationChanged(() => void this.reload());
    }

    subscribe(listener: ObserveListener<void>): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Loads the page for the current URL; notifies the subscribers when the newest load is done. */
    async reload(): Promise<void> {
        const load = ++this.loads;
        const uri = this.navigation.uri;
        const result = await this.client.pageGetByUrl({ url: uri });
        if (load !== this.loads) return;

        if (!result.ok || (result.body.current === undefined && result.body.parent === undefined)) {
            this.error = result.ok ? `No page at ${new URL(uri).pathname}.` : problemMessage(result);
        } else {
            this.error = undefined;
            this.apply(result.body.current ?? result.body.parent!, result.body.slug ?? null, new URL(uri).searchParams);
        }
        this.loaded = true;
        for (const listener of this.listeners) listener();
    }

    private apply(page: PageFullDetailResponse, slug: string | null, query: URLSearchParams): void {
        const user = page.user ?? { isAuthenticated: false, isSuperAdmin: false, userId: "", roles: [] };
        const roleIds = new Set((user.roles ?? []).map((role) => role.id));
        const hasAnyRole = (ids: string[] | null | undefined) => (ids ?? []).some((id) => roleIds.has(id));

        const siteAdmin = user.isSuperAdmin || hasAnyRole(page.site?.adminRoleIds);
        const siteContributor = siteAdmin || hasAnyRole(page.site?.contributorRoleIds);
        const pageAdmin = siteContributor || hasAnyRole(page.adminRoleIds);
        const pageView = pageAdmin || hasAnyRole(page.viewRoleIds);

        this.user = user;
        this.site = { ...page.site!, hasAdminAccess: siteAdmin, hasContributorAccess: siteContributor };
        this.page = { ...page, slug, hasAdminAccess: pageAdmin, hasViewAccess: pageView };
        this.layout = page.layout;
        this.detailLayout = page.detailLayout;
        this.editLayout = page.editLayout;
        this.plugins = Object.values(page.sections ?? {}).flat();

        // A plugin under a view name: `?pluginId=…&viewName=…` (`&viewMode=detail` for its detail layout).
        const pluginId = query.get("pluginId");
        const viewName = query.get("viewName");
        this.type = "default";
        this.plugin = undefined;
        this.pluginViewName = undefined;
        if (pluginId !== null && viewName !== null) {
            this.plugin = this.plugins.find((plugin) => plugin.id === pluginId);
            if (this.plugin !== undefined) {
                this.type = query.get("viewMode") === "detail" ? "pluginDetail" : "pluginEdit";
                this.pluginViewName = viewName;
            }
        }
        if (query.has("pageEdit")) this.type = "pageEdit";
        if (query.has("pagePreview")) this.type = "pagePreview";
    }
}
