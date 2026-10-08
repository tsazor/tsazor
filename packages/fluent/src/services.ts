/**
 * The services the Fluent components use, registered in one call — Blazor's
 * `builder.Services.AddFluentUIComponents()`. Exported by the package as
 * `addFluent` and named in its package.json `tsazor.setup`, so
 * `npm create tsazor` wires it: `createTsazorApp({ root, routes, services: addFluent })`.
 */
import { Toaster } from "@tsazor/ui";
import type { ServiceCollection } from "@tsazor/runtime";

/** Registers the `Toaster` (one per app, shown by a `<ToastRegion />`). */
export function addFluent(services: ServiceCollection): void {
  services.registerType(Toaster, { singleton: true });
}
