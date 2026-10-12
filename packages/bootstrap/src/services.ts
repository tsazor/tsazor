/**
 * The services the Bootstrap components use, registered in one call — Blazor's
 * `builder.Services.AddMudServices()`. Exported by the package as `addBootstrap`
 * and named in its package.json `tsazor.setup`, so `npm create tsazor` wires it:
 * `createTsazorApp({ root, routes, services: addBootstrap })`.
 */
import { DialogService, Toaster } from "@tsazor/ui";
import type { ServiceCollection } from "@tsazor/runtime";

/** Registers the `Toaster` (shown by a `<ToastRegion />`) and the `DialogService` (shown by a `<DialogProvider />`), one each per app. */
export function addBootstrap(services: ServiceCollection): void {
  services.registerType(Toaster, { singleton: true });
  services.registerType(DialogService, { singleton: true });
}
