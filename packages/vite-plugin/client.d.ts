/**
 * Ambient types for apps that use the vite plugin (2.4): the compiled
 * `.tsazor` modules (default export: the component class) and the virtual
 * routes module. Tsconfig: `types: ["vite/client", "@tsazor/vite-plugin/client"]`.
 *
 * The typed layer (editor LSP / `tsazor check`) does NOT use these — it
 * checks through the per-component shadow graph. These declarations are for
 * plain tsc over the remaining hand-written sources.
 */

declare module "*.tsazor" {
  import type { ComponentType } from "@tsazor/runtime";

  /** The component class of the compiled .tsazor module. */
  const component: ComponentType;
  export default component;
}

declare module "virtual:tsazor-routes" {
  import type { RouteManifestEntry } from "@tsazor/runtime";

  /**
   * One entry per `@page` route, as generated at build time; a lazy route (the plugin's `lazyRoutes`) loads its
   * component on the first visit and has no `type` until then.
   */
  const routes: readonly RouteManifestEntry[];
  export default routes;
}