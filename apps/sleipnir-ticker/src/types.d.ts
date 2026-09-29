declare module "*.tazor" {
  import type { ComponentBase } from "@tasor/runtime";
  const component: abstract new (...args: never[]) => ComponentBase;
  export default component;
}

declare module "virtual:tasor-routes" {
  import type { RouteEntry } from "@tasor/runtime";
  const routes: RouteEntry[];
  export default routes;
}