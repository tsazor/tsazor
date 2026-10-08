import { ComponentBase, NavigationManager, Parameter, inject } from "@tsazor/runtime";
import { FluentCmsClient } from "../../api/fluent-cms";
import type { PluginDetailResponse } from "../../api/models";
import { ViewState } from "../../ViewState";

/**
 * The base of every plugin (FluentCMS's BasePlugin): the plugin it renders, the services it needs,
 * and the URLs of its other views. A view is the same plugin under another name on the same page:
 * `/admin/roles?pluginId=…&viewName=Update%20Role&id=…&redirectTo=%2Fadmin%2Froles`.
 */
export abstract class BasePlugin extends ComponentBase {
    @Parameter() plugin!: PluginDetailResponse;

    protected readonly navigation = inject(NavigationManager);
    protected readonly viewState = inject(ViewState);
    protected readonly api = inject(FluentCmsClient);

    /** Back to where this view was opened from (`redirectTo`), or to the page without the view. */
    protected navigateBack(forceLoad = false): void {
        const url = new URL(this.navigation.uri);
        this.navigation.navigateTo(url.searchParams.get("redirectTo") ?? url.pathname, forceLoad);
    }

    /**
     * The URL of one of this plugin's views. It keeps the current query, adds `parameters`, and by
     * default records the current page as `redirectTo`, so `navigateBack` returns here.
     */
    protected getUrl(viewName: string, parameters: Record<string, string | number | boolean> = {}, redirectToCurrentPage = true): string {
        const current = new URL(this.navigation.uri);
        const query = new URLSearchParams(current.search);
        if (redirectToCurrentPage) {
            const back = new URLSearchParams(current.search);
            back.delete("redirectTo");
            const rest = back.toString();
            query.set("redirectTo", rest ? `${current.pathname}?${rest}` : current.pathname);
        }
        query.set("pluginId", this.plugin.id);
        query.set("viewName", viewName);
        for (const [name, value] of Object.entries(parameters)) query.set(name, String(value));
        return `${current.pathname}?${query}`;
    }
}
