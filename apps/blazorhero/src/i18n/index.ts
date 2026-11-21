import { inject, StringLocalizer, type StringTableSource } from "@tsazor/runtime";
import en from "./en";

/**
 * The app's translations (scripts/resx.mjs writes the tables from BlazorHero's resx files): English always loaded —
 * the default and the fallback —, every other language when it is chosen. The tables are neutral ("fr"), the app's
 * cultures specific ("fr-FR"): the localizer walks from one to the other, as .NET's resource lookup does.
 */
export const tables: Readonly<Record<string, StringTableSource>> = {
    en,
    ar: () => import("./ar"),
    de: () => import("./de"),
    es: () => import("./es"),
    fr: () => import("./fr"),
    id: () => import("./id"),
    it: () => import("./it"),
    km: () => import("./km"),
    nl: () => import("./nl"),
    ru: () => import("./ru"),
    sv: () => import("./sv"),
};

type Key = keyof typeof en;
/** The resources that have keys: "Login", "MainLayout", … */
export type Resource = Key extends `${infer R}.${string}` ? R : never;
/** A resource's keys without its name: for "Login", "Title", "Sign In", … */
export type KeyOf<R extends Resource> = Key extends infer K ? (K extends `${R}.${infer Rest}` ? Rest : never) : never;
/** What `localizerFor(resource)` returns. */
export type Localizer<R extends Resource> = (key: KeyOf<R>, params?: Record<string, unknown>) => string;

/**
 * A component's localizer, Blazor's `IStringLocalizer<Login>`: its resource's keys, typed. Call it in a field
 * initializer — `private readonly L = localizerFor("Login")` — and write `@L("Title")` in the markup; `{0}` in a
 * message takes `{ 0: value }`, as `string.Format` took the first argument.
 */
export function localizerFor<R extends Resource>(resource: R): Localizer<R> {
    const localizer = inject(StringLocalizer);
    return (key, params) => {
        const name = `${resource}.${key}`;
        const text = localizer.get(name, params);
        // A key no table has comes back as itself; .NET's localizer shows the key without the resource's name.
        return text === name ? key : text;
    };
}
