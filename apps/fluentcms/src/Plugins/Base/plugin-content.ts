import { ensureOk } from "../../api/api-result";
import type { FluentCmsClient } from "../../api/fluent-cms";

/** One item of a plugin's own content: its id and its data. */
export interface PluginContentItem {
    id: string;
    data: Record<string, unknown>;
}

/**
 * A plugin's own content of one type. FluentCMS stores each item as a dictionary under its content
 * class's property names (IContent: `{ "Content": "<p>…" }`) and reads it back with ToContentList<T>.
 */
export async function pluginContents(api: FluentCmsClient, typeName: string, pluginId: string): Promise<PluginContentItem[]> {
    const items = ensureOk(await api.pluginContentGetAll(typeName, pluginId)) ?? [];
    return items.map((item) => ({ id: item.id, data: item.data ?? {} }));
}

/** A text property of a content item; "" when it has none. */
export function contentText(item: PluginContentItem | undefined, key: string): string {
    const value = item?.data[key];
    return typeof value === "string" ? value : "";
}
