/**
 * Services that exist without a registration — added by the module that
 * defines them (`CultureService`, `StringLocalizer`), so an app that never uses
 * one does not bundle it. A provider that has no registration for such a token
 * creates it from the default, as a singleton of the root; an explicit
 * registration always wins.
 */
import type { ServiceProvider, Token } from "./service-collection.js";

/** Creates the default instance; `services` is the root provider. */
export type ServiceDefault<T> = (services: ServiceProvider) => T;

const defaults = new Map<Token<unknown>, ServiceDefault<unknown>>();

/** @internal Called at module level by the module that defines `token`. */
export function registerServiceDefault<T>(token: Token<T>, create: ServiceDefault<T>): void {
  defaults.set(token as Token<unknown>, create as ServiceDefault<unknown>);
}

/** @internal The default for `token`, if its module registered one. */
export function serviceDefaultFor(token: Token<unknown>): ServiceDefault<unknown> | undefined {
  return defaults.get(token);
}

/**
 * The app's localization settings (`createTsazorApp({ localization })`),
 * read by the localization defaults. Registered as a value by the app.
 */
export class LocalizationSettings {
  constructor(
    /** Culture used until something else is set (`"de-DE"`); invariant when empty. */
    readonly defaultCulture: string,
    /** String tables per culture, as in `LocalizationOptions.tables`. */
    readonly tables: Record<string, unknown> | undefined,
  ) {}
}
