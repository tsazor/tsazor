/**
 * The services the Bootstrap components use, registered in one call — Blazor's
 * `builder.Services.AddMudServices()`. Exported by the package as `addBootstrap`
 * and named in its package.json `tsazor.setup`, so `npm create tsazor` wires it:
 * `createTsazorApp({ root, routes, services: addBootstrap })`.
 */
import { Toaster } from "@tsazor/ui";
import type { ServiceCollection } from "@tsazor/runtime";

/** Registers the `Toaster` (one per app, shown by a `<ToastRegion />`). */
export function addBootstrap(services: ServiceCollection): void {
  services.registerType(Toaster, { singleton: true });
}
