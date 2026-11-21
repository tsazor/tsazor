import { ComponentBase, NavigationManager, Parameter, inject } from "@tsazor/runtime";
import { FluentCmsClient } from "../../api/fluent-cms";
import type { PluginDetailResponse } from "../../api/models";
import { ViewState } from "../../ViewState";
import { backUrl, pluginViewUrl } from "./plugin-urls";

/**
 * The base of every plugin (FluentCMS's BasePlugin): the plugin it renders, the services it needs,
 * and the URLs of its other views (plugin-urls.ts).
 */
export abstract class BasePlugin extends ComponentBase {
    @Parameter() plugin!: PluginDetailResponse;

    protected readonly navigation = inject(NavigationManager);
    protected readonly viewState = inject(ViewState);
    protected readonly api = inject(FluentCmsClient);

    /** Back to where this view was opened from (`redirectTo`), or to the page without the view. */
    protected navigateBack(forceLoad = false): void {
        this.navigation.navigateTo(backUrl(this.navigation.uri), forceLoad);
    }

    /** The URL of one of this plugin's views; by default it returns here (`redirectTo`). */
    protected getUrl(viewName: string, parameters: Record<string, string | number | boolean> = {}, redirectToCurrentPage = true): string {
        return pluginViewUrl(this.navigation.uri, this.plugin.id, viewName, parameters, redirectToCurrentPage);
    }
}
