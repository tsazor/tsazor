import type { ComponentType } from "@tsazor/runtime";

/**
 * Every plugin component, by its type name (FluentCMS's PluginLoader finds the type by name in the
 * plugin's assembly). A plugin is `src/Plugins/**\/<TypeName>.tsazor`, loaded when a page first
 * shows it — the counterpart of loading the plugin's assembly.
 */
const modules = import.meta.glob<{ default: ComponentType }>("../Plugins/**/*Plugin.tsazor");

const byTypeName = new Map(
    Object.entries(modules).map(([file, load]) => [file.slice(file.lastIndexOf("/") + 1, -".tsazor".length), load]),
);

/** The plugin component for a type name, or undefined when no such plugin exists (not ported yet). */
export async function loadPluginType(typeName: string): Promise<ComponentType | undefined> {
    const load = byTypeName.get(typeName);
    return load === undefined ? undefined : (await load()).default;
}
