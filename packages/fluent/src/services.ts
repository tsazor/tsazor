/**
 * The services the Fluent components use, registered in one call — Blazor's
 * `builder.Services.AddFluentUIComponents()`. Exported by the package as
 * `addFluent` and named in its package.json `tsazor.setup`, so
 * `npm create tsazor` wires it: `createTsazorApp({ root, routes, services: addFluent })`.
 */
import { DialogService, Toaster } from "@tsazor/ui";
import type { ServiceCollection } from "@tsazor/runtime";

/** Registers the `Toaster` (shown by a `<ToastRegion />`) and the `DialogService` (shown by a `<DialogProvider />`), one each per app. */
export function addFluent(services: ServiceCollection): void {
  services.registerType(Toaster, { lifetime: "singleton" });
  services.registerType(DialogService, { lifetime: "singleton" });
}
