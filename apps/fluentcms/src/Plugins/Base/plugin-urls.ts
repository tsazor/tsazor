/**
 * The URLs of a plugin's views (FluentCMS's BasePlugin.GetUrl and NavigateBack). A view is the same
 * plugin under another name on the same page: `/admin/roles?pluginId=…&viewName=Update%20Role&id=…`,
 * with `redirectTo` saying where it came from.
 */

/**
 * The URL of one of a plugin's views. It keeps the current query, adds `parameters`, and by default
 * records the current page as `redirectTo`, so that `backUrl` returns there.
 */
export function pluginViewUrl(
    currentUri: string,
    pluginId: string,
    viewName: string,
    parameters: Record<string, string | number | boolean> = {},
    redirectToCurrentPage = true,
): string {
    const current = new URL(currentUri);
    const query = new URLSearchParams(current.search);
    if (redirectToCurrentPage) {
        const back = new URLSearchParams(current.search);
        back.delete("redirectTo");
        const rest = back.toString();
        query.set("redirectTo", rest ? `${current.pathname}?${rest}` : current.pathname);
    }
    query.set("pluginId", pluginId);
    query.set("viewName", viewName);
    for (const [name, value] of Object.entries(parameters)) query.set(name, String(value));
    return `${current.pathname}?${query}`;
}

/** Where a view returns to: its `redirectTo`, or the page without the view. */
export function backUrl(currentUri: string): string {
    const current = new URL(currentUri);
    return current.searchParams.get("redirectTo") ?? current.pathname;
}
